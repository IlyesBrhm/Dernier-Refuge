// Double slot A/B, chargement, quarantaine (docs/design/save.md §3.3, §3.4).
// Aucune fonction ne lève : tout échec est un résultat typé.

import type { GameState } from "../core/index";
import { decodeSave, encodeSave, type DecodeError, type DecodeOk, type SaveMeta } from "./codec";
import { SAVE_CONFIG, SAVE_KEYS, type SlotId } from "./config";
import { classifyStorageError, type StorageAdapter, type StorageError, type StorageResult } from "./storage";

// --- Types publics ----------------------------------------------------------------------------

export type EmptySlotReport = { slot: SlotId; kind: "empty" };
export type ValidSlotReport = { slot: SlotId; kind: "valid"; decoded: DecodeOk; raw: string };
export type InvalidSlotReport = {
  slot: SlotId;
  kind: "invalid";
  error: DecodeError;
  details: string[];
  version?: number;
  raw: string;
};
export type SlotReport = EmptySlotReport | ValidSlotReport | InvalidSlotReport;

export type LoadResult =
  /** Partie chargée. `damaged` : l'autre slot, abîmé (à mettre en quarantaine avant toute écriture). */
  | { kind: "loaded"; state: GameState; seed: number; savedAt: number; slot: SlotId; damaged: InvalidSlotReport[] }
  /** Aucun slot : nouvelle partie silencieuse. */
  | { kind: "fresh" }
  /** Aucun slot valide (au moins un non vide) : quarantaine, nouvelle partie, message. */
  | { kind: "corrupt"; damaged: InvalidSlotReport[] }
  /** Au moins un slot d'une version future : partie temporaire, AUCUNE écriture. */
  | { kind: "future"; version: number }
  /** Stockage illisible : jeu sans sauvegarde. */
  | { kind: "unavailable"; error: StorageError };

export type WriteError =
  | "not_owner"
  | "unavailable"
  | "quota"
  | "too_large"
  | "serialize_error"
  /** L'état à écrire ne passe pas la validation (forme / invariants) : rien n'est écrit. */
  | "invalid_state"
  /** La relecture diffère de ce qui a été écrit : le pointeur n'a pas bougé. */
  | "readback_mismatch"
  /** Un slot contient une version future : on n'écrit jamais par-dessus. */
  | "future_version"
  /** Le slot cible est abîmé et n'a pas pu être mis en quarantaine : on ne l'écrase pas. */
  | "quarantine_failed";

export type WriteResult =
  | { ok: true; slot: SlotId; chars: number }
  | { ok: false; error: WriteError; details: string[] };

/** Ce dont `writeSave` a besoin du verrou multi-onglets. */
export interface SaveOwner {
  isOwner(): boolean;
}

// --- Accès protégés (un adaptateur tiers pourrait lever) -------------------------------------------

function guard<T>(fn: () => StorageResult<T>): StorageResult<T> {
  try {
    return fn();
  } catch (e) {
    return { ok: false, error: classifyStorageError(e), message: e instanceof Error ? e.message : String(e) };
  }
}
const get = (s: StorageAdapter, k: string): StorageResult<string | null> => guard(() => s.getItem(k));
const set = (s: StorageAdapter, k: string, v: string): StorageResult<void> => guard(() => s.setItem(k, v));
const remove = (s: StorageAdapter, k: string): StorageResult<void> => guard(() => s.removeItem(k));
const listKeys = (s: StorageAdapter): StorageResult<string[]> => guard(() => s.keys());

function other(slot: SlotId): SlotId {
  return slot === "A" ? "B" : "A";
}

function writeError(e: StorageError): WriteError {
  return e === "quota" ? "quota" : "unavailable";
}

// --- Inspection -------------------------------------------------------------------------------

interface Inspection {
  pointer: SlotId | null;
  reports: Record<SlotId, SlotReport>;
}

function inspectSlot(slot: SlotId, raw: string | null): SlotReport {
  if (raw === null || raw === "") return { slot, kind: "empty" };
  const decoded = decodeSave(raw);
  if (decoded.ok) return { slot, kind: "valid", decoded, raw };
  const report: InvalidSlotReport = { slot, kind: "invalid", error: decoded.error, details: decoded.details, raw };
  if (decoded.version !== undefined) report.version = decoded.version;
  return report;
}

function inspect(storage: StorageAdapter): { ok: true; value: Inspection } | { ok: false; error: StorageError } {
  const a = get(storage, SAVE_KEYS.A);
  if (!a.ok) return a;
  const b = get(storage, SAVE_KEYS.B);
  if (!b.ok) return b;
  const p = get(storage, SAVE_KEYS.current);
  if (!p.ok) return p;
  const pointer = p.value === "A" || p.value === "B" ? p.value : null;
  return { ok: true, value: { pointer, reports: { A: inspectSlot("A", a.value), B: inspectSlot("B", b.value) } } };
}

/** Plus grande version future trouvée, ou null. */
function futureVersion(ins: Inspection): number | null {
  let v: number | null = null;
  for (const r of [ins.reports.A, ins.reports.B]) {
    if (r.kind === "invalid" && r.error === "future_version") v = Math.max(v ?? 0, r.version ?? 0);
  }
  return v;
}

/**
 * Slot courant = slot valide pointé par `current`, sinon l'autre s'il est valide. Sans pointeur lisible :
 * le plus grand `savedAt` (égalité ⇒ A). Le pointeur prime sur `savedAt` (robuste aux changements d'horloge).
 */
function chooseSlot(ins: Inspection): ValidSlotReport | null {
  const { A, B } = ins.reports;
  const order: SlotReport[] =
    ins.pointer !== null
      ? [ins.reports[ins.pointer], ins.reports[other(ins.pointer)]]
      : A.kind === "valid" && B.kind === "valid" && B.decoded.savedAt > A.decoded.savedAt
        ? [B, A]
        : [A, B];
  for (const r of order) if (r.kind === "valid") return r;
  return null;
}

function damagedOf(ins: Inspection): InvalidSlotReport[] {
  return [ins.reports.A, ins.reports.B].filter((r): r is InvalidSlotReport => r.kind === "invalid");
}

// --- Chargement -------------------------------------------------------------------------------

/** Lecture seule, ne lève jamais, n'écrit rien (la quarantaine est une décision de l'appelant). */
export function loadGame(storage: StorageAdapter): LoadResult {
  const r = inspect(storage);
  if (!r.ok) return { kind: "unavailable", error: r.error };
  const ins = r.value;
  const future = futureVersion(ins);
  // Version future : on ne retombe pas sur un slot plus ancien (il écraserait ensuite les données récentes).
  if (future !== null) return { kind: "future", version: future };
  const chosen = chooseSlot(ins);
  const damaged = damagedOf(ins);
  if (chosen) {
    return {
      kind: "loaded",
      state: chosen.decoded.state,
      seed: chosen.decoded.seed,
      savedAt: chosen.decoded.savedAt,
      slot: chosen.slot,
      damaged,
    };
  }
  return damaged.length > 0 ? { kind: "corrupt", damaged } : { kind: "fresh" };
}

// --- Écriture ---------------------------------------------------------------------------------

type Failure = { ok: false; error: WriteError; details: string[] };

/** Propriétaire + encodage + validation complète + inspection + refus d'une version future. */
function prepareWrite(
  storage: StorageAdapter,
  state: GameState,
  meta: SaveMeta,
  owner: SaveOwner,
): Failure | { ok: true; text: string; ins: Inspection } {
  let isOwner = false;
  try {
    isOwner = owner.isOwner();
  } catch {
    isOwner = false;
  }
  if (!isOwner) return { ok: false, error: "not_owner", details: ["cet onglet ne détient pas le verrou"] };

  const enc = encodeSave(state, meta);
  if (!enc.ok) return { ok: false, error: enc.error, details: enc.details };
  // Validation complète AVANT d'écrire : un état invalide ne doit pas détruire la copie de secours.
  const check = decodeSave(enc.text);
  if (!check.ok) return { ok: false, error: "invalid_state", details: [check.error, ...check.details] };

  const r = inspect(storage);
  if (!r.ok) return { ok: false, error: writeError(r.error), details: [`lecture des slots : ${r.error}`] };
  const future = futureVersion(r.value);
  if (future !== null) return { ok: false, error: "future_version", details: [`un slot est en version ${future}`] };
  return { ok: true, text: enc.text, ins: r.value };
}

/** Écrit `text` dans `slot` puis relit : le texte relu doit être identique à l'écrit. */
function writeSlot(storage: StorageAdapter, slot: SlotId, text: string): Failure | null {
  const key = SAVE_KEYS[slot];
  const w = set(storage, key, text);
  if (!w.ok) return { ok: false, error: writeError(w.error), details: [w.message ?? w.error] };
  const back = get(storage, key);
  if (!back.ok) return { ok: false, error: writeError(back.error), details: [`relecture : ${back.error}`] };
  // Texte relu identique au texte déjà décodé avec succès (decodeSave est une fonction pure) :
  // la relecture est donc entièrement validée.
  if (back.value !== text) {
    return { ok: false, error: "readback_mismatch", details: [`slot ${slot} relu différent de l'écrit`] };
  }
  return null;
}

/** Écrit puis relit le pointeur `current`. */
function writePointer(storage: StorageAdapter, slot: SlotId): Failure | null {
  const wp = set(storage, SAVE_KEYS.current, slot);
  if (!wp.ok) return { ok: false, error: writeError(wp.error), details: [`pointeur : ${wp.message ?? wp.error}`] };
  const bp = get(storage, SAVE_KEYS.current);
  if (!bp.ok || bp.value !== slot) {
    return { ok: false, error: "readback_mismatch", details: ["pointeur relu différent de l'écrit"] };
  }
  return null;
}

/** Slot à écrire en premier : le NON courant (le slot courant reste intact jusqu'à la bascule). */
function nonCurrent(ins: Inspection): SlotId {
  const current = chooseSlot(ins)?.slot ?? null;
  return current !== null ? other(current) : ins.pointer !== null ? other(ins.pointer) : "A";
}

/**
 * Écrit l'état dans le slot NON courant, relit, vérifie, puis seulement bascule le pointeur `current`.
 * En cas d'échec, le pointeur vise toujours l'ancien slot, intact. Un slot cible abîmé est d'abord mis en
 * quarantaine (jamais écrasé sans trace) ; un slot de version future n'est jamais écrasé.
 */
export function writeSave(storage: StorageAdapter, state: GameState, meta: SaveMeta, owner: SaveOwner): WriteResult {
  const prep = prepareWrite(storage, state, meta, owner);
  if (!prep.ok) return prep;
  const { text, ins } = prep;

  const target = nonCurrent(ins);
  const targetReport = ins.reports[target];
  if (targetReport.kind === "invalid" && !quarantine(storage, [targetReport], meta.savedAt)) {
    return { ok: false, error: "quarantine_failed", details: [`slot ${target} abîmé non mis de côté`] };
  }

  const ws = writeSlot(storage, target, text);
  if (ws) return ws;
  const wp = writePointer(storage, target);
  if (wp) return wp;
  return { ok: true, slot: target, chars: text.length };
}

/**
 * Nouvelle partie / import : écrit le nouvel état dans LES DEUX slots, pour que le repli « autre slot »
 * ne ressuscite jamais l'ancienne partie. À n'appeler qu'après confirmation de l'utilisateur.
 *
 * Les deux slots sont écrits EXPLICITEMENT (pas « writeSave deux fois », dont le second passage
 * dépend d'une nouvelle inspection qu'une lecture faussée peut tromper) :
 *  1. données abîmées des deux slots mises en quarantaine ; version future ⇒ refus, rien n'est écrit ;
 *  2. slot non courant écrit + relu, puis pointeur basculé dessus (l'ancien slot courant reste intact
 *     tant que le nouvel état n'est pas en place : un échec ici ne laisse jamais pire qu'un writeSave) ;
 *  3. ancien slot courant écrit + relu ;
 *  4. relecture finale de A, B et du pointeur : ok seulement si A = B = texte attendu et pointeur sur
 *     le slot du 2. ; sinon `readback_mismatch` (le pointeur vise alors un slot contenant le nouvel état).
 */
export function commitFresh(storage: StorageAdapter, state: GameState, meta: SaveMeta, owner: SaveOwner): WriteResult {
  const prep = prepareWrite(storage, state, meta, owner);
  if (!prep.ok) return prep;
  const { text, ins } = prep;

  // Les deux slots vont être écrasés : toute donnée abîmée est d'abord mise de côté.
  const damaged = damagedOf(ins);
  if (damaged.length > 0 && !quarantine(storage, damaged, meta.savedAt)) {
    const slots = damaged.map((d) => d.slot).join(", ");
    return { ok: false, error: "quarantine_failed", details: [`slot(s) ${slots} abîmé(s) non mis de côté`] };
  }

  const first = nonCurrent(ins);
  const second = other(first);

  const w1 = writeSlot(storage, first, text);
  if (w1) return w1;
  const p1 = writePointer(storage, first);
  if (p1) return p1;
  const w2 = writeSlot(storage, second, text);
  if (w2) return { ok: false, error: w2.error, details: [`second slot (${second})`, ...w2.details] };

  // Vérification finale indépendante : les DEUX slots et le pointeur.
  const r = inspectRaw(storage);
  if (!r.ok) return { ok: false, error: writeError(r.error), details: [`vérification finale : ${r.error}`] };
  const mismatched: string[] = [];
  if (r.value.A !== text) mismatched.push("slot A différent du texte attendu");
  if (r.value.B !== text) mismatched.push("slot B différent du texte attendu");
  if (r.value.current !== first) mismatched.push(`pointeur ${String(r.value.current)} au lieu de ${first}`);
  if (mismatched.length > 0) return { ok: false, error: "readback_mismatch", details: mismatched };
  return { ok: true, slot: first, chars: text.length };
}

/** Lecture brute des deux slots et du pointeur (sans décodage). */
function inspectRaw(
  storage: StorageAdapter,
): { ok: true; value: { A: string | null; B: string | null; current: string | null } } | { ok: false; error: StorageError } {
  const a = get(storage, SAVE_KEYS.A);
  if (!a.ok) return a;
  const b = get(storage, SAVE_KEYS.B);
  if (!b.ok) return b;
  const p = get(storage, SAVE_KEYS.current);
  if (!p.ok) return p;
  return { ok: true, value: { A: a.value, B: b.value, current: p.value } };
}

// --- Quarantaine ------------------------------------------------------------------------------

export interface QuarantineEntry {
  key: string;
  /** Horodatage de mise en quarantaine, ou null si la clé est mal formée. */
  quarantinedAt: number | null;
  /** Texte brut stocké (JSON `{ quarantinedAt, reports: [{ slot, error, raw }] }`), à proposer à l'export. */
  text: string;
}

function parseQuarantineKey(key: string): [number, number] {
  const m = /^(\d+)-(\d+)$/.exec(key.slice(SAVE_KEYS.quarantinePrefix.length));
  if (!m) return [-1, -1];
  return [Number(m[1]), Number(m[2])];
}

function quarantineKeys(storage: StorageAdapter): string[] | null {
  const k = listKeys(storage);
  if (!k.ok) return null;
  return k.value
    .filter((x) => x.startsWith(SAVE_KEYS.quarantinePrefix))
    .sort((a, b) => {
      const [ta, na] = parseQuarantineKey(a);
      const [tb, nb] = parseQuarantineKey(b);
      return ta - tb || na - nb || (a < b ? -1 : a > b ? 1 : 0);
    });
}

/** Copies en quarantaine, de la plus récente à la plus ancienne. Stockage illisible ⇒ []. */
export function listQuarantine(storage: StorageAdapter): QuarantineEntry[] {
  const keys = quarantineKeys(storage);
  if (!keys) return [];
  const out: QuarantineEntry[] = [];
  for (const key of keys.reverse()) {
    const v = get(storage, key);
    if (!v.ok || v.value === null) continue;
    const [t] = parseQuarantineKey(key);
    out.push({ key, quarantinedAt: t >= 0 ? t : null, text: v.value });
  }
  return out;
}

function alreadyQuarantined(storage: StorageAdapter, keys: string[], report: InvalidSlotReport, raw: string): boolean {
  for (const key of keys) {
    const v = get(storage, key);
    if (!v.ok || v.value === null) continue;
    try {
      const parsed = JSON.parse(v.value) as { reports?: { slot?: unknown; raw?: unknown }[] };
      if (parsed.reports?.some((r) => r.slot === report.slot && r.raw === raw)) return true;
    } catch {
      // entrée illisible : ignorée
    }
  }
  return false;
}

/**
 * Met de côté les données abîmées AVANT qu'elles puissent être écrasées. Écrit
 * `{ quarantinedAt, reports: [{ slot, error, raw }] }` sous une nouvelle clé, relit, puis supprime les
 * copies les plus anciennes au-delà de `maxQuarantine`. Une donnée déjà en quarantaine (même slot, même
 * contenu) n'est pas dupliquée. Les slots de version future ne sont pas « abîmés » et sont ignorés.
 * Renvoie false si la copie n'a pas pu être écrite : l'appelant NE DOIT PAS écraser les slots.
 * À n'appeler que depuis l'onglet propriétaire.
 */
export function quarantine(storage: StorageAdapter, damaged: readonly SlotReport[], now: number): boolean {
  const keys = quarantineKeys(storage);
  if (!keys) return false;
  const reports = damaged
    .filter((r): r is InvalidSlotReport => r.kind === "invalid" && r.error !== "future_version" && r.raw !== "")
    .map((r) => ({ report: r, raw: r.raw.slice(0, SAVE_CONFIG.maxSaveChars) }))
    .filter(({ report, raw }) => !alreadyQuarantined(storage, keys, report, raw));
  if (reports.length === 0) return true;

  const ts = Number.isSafeInteger(now) && now >= 0 ? now : 0;
  let n = 0;
  while (keys.includes(`${SAVE_KEYS.quarantinePrefix}${ts}-${n}`)) n++;
  const key = `${SAVE_KEYS.quarantinePrefix}${ts}-${n}`;
  const text = JSON.stringify({
    quarantinedAt: ts,
    reports: reports.map(({ report, raw }) => ({ slot: report.slot, error: report.error, raw })),
  });
  const w = set(storage, key, text);
  if (!w.ok) return false;
  const back = get(storage, key);
  if (!back.ok || back.value !== text) {
    remove(storage, key);
    return false;
  }
  // Rotation : on ne supprime jamais la copie qu'on vient d'écrire (même si l'horloge a reculé).
  const older = keys.filter((k) => k !== key);
  const excess = older.length + 1 - SAVE_CONFIG.maxQuarantine;
  for (let i = 0; i < excess; i++) {
    const k = older[i];
    if (k !== undefined) remove(storage, k);
  }
  return true;
}
