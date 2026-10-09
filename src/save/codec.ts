// Encodage / décodage d'une sauvegarde (docs/design/save.md §3.1).
// Format : texte JSON canonique de { version, savedAt, seed, checksum, state }.
// `decodeSave` NE LÈVE JAMAIS : il renvoie un résultat typé ok / raison, et ne répare rien.

import { checkInvariants, referenceMap, type GameState } from "../core/index";
import { CanonicalError, canonicalStringify } from "./canonical";
import { CURRENT_VERSION, SAVE_CONFIG } from "./config";
import { hash64 } from "./hash";
import { migrate, type MigrationRegistry } from "./migrations";
import { validateSavedState, type SavedState } from "./schema";

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  seed: number;
  checksum: string;
  state: SavedState;
}

export type DecodeError =
  | "too_large"
  | "empty"
  | "not_json"
  | "bad_envelope"
  | "unsupported_version"
  | "future_version"
  | "bad_checksum"
  | "migration_failed"
  | "bad_shape"
  | "invariants";

export interface DecodeOk {
  ok: true;
  state: GameState;
  seed: number;
  savedAt: number;
  /** Version lue dans le fichier (avant migration). */
  version: number;
}
export interface DecodeFail {
  ok: false;
  error: DecodeError;
  details: string[];
  version?: number;
}
export type DecodeResult = DecodeOk | DecodeFail;

export type EncodeResult =
  | { ok: true; text: string }
  | { ok: false; error: "serialize_error" | "too_large"; details: string[] };

export interface SaveMeta {
  /** Seed de la partie (métadonnée : la vérité du RNG est `state.rng`). Entier [0, 2^32-1]. */
  seed: number;
  /** Horodatage ms epoch fourni par src/app. Informatif, jamais lu par le gameplay. */
  savedAt: number;
}

export interface DecodeOptions {
  /** Taille max du texte (défaut SAVE_CONFIG.maxSaveChars). */
  maxBytes?: number;
  /** Pour les tests du pipeline uniquement : registre de migrations et version courante simulée. */
  registry?: MigrationRegistry;
  currentVersion?: number;
}

const MAX_SEED = 0xffffffff;
const ENVELOPE_KEYS = ["checksum", "savedAt", "seed", "state", "version"] as const;

function isUint32(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_SEED;
}
function isTimestamp(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Checksum salé : hash64(SALT \0 version \0 savedAt \0 seed \0 canonical(state)). Peut lever (CanonicalError). */
export function computeChecksum(version: number, savedAt: number, seed: number, state: unknown): string {
  return hash64(
    `${SAVE_CONFIG.salt}\0${version}\0${savedAt}\0${seed}\0${canonicalStringify(state, SAVE_CONFIG.maxDepth)}`,
  );
}

/** Retire la carte (non sérialisée) de l'état. */
export function toSavedState(state: GameState): SavedState {
  const { map: _map, ...saved } = state;
  return saved;
}

/** Sérialise un état en texte de sauvegarde (le même texte sert au stockage et à l'export). Ne lève pas. */
export function encodeSave(state: GameState, meta: SaveMeta): EncodeResult {
  if (!isUint32(meta.seed)) return { ok: false, error: "serialize_error", details: [`seed invalide: ${meta.seed}`] };
  if (!isTimestamp(meta.savedAt)) {
    return { ok: false, error: "serialize_error", details: [`savedAt invalide: ${meta.savedAt}`] };
  }
  let text: string;
  try {
    const saved = toSavedState(state);
    const checksum = computeChecksum(CURRENT_VERSION, meta.savedAt, meta.seed, saved);
    const envelope: SaveEnvelope = { version: CURRENT_VERSION, savedAt: meta.savedAt, seed: meta.seed, checksum, state: saved };
    text = canonicalStringify(envelope, SAVE_CONFIG.maxDepth);
  } catch (e) {
    return { ok: false, error: "serialize_error", details: [e instanceof Error ? e.message : String(e)] };
  }
  if (text.length > SAVE_CONFIG.maxSaveChars) {
    return { ok: false, error: "too_large", details: [`${text.length} caractères > ${SAVE_CONFIG.maxSaveChars}`] };
  }
  return { ok: true, text };
}

function fail(error: DecodeError, details: string[], version?: number): DecodeFail {
  return version === undefined ? { ok: false, error, details } : { ok: false, error, details, version };
}

/**
 * Pipeline : taille → JSON → enveloppe → version → checksum → migrations → forme stricte →
 * reconstruction de la carte → invariants du core. NE LÈVE JAMAIS. Ne répare rien.
 */
export function decodeSave(text: unknown, opts: DecodeOptions = {}): DecodeResult {
  try {
    return decodeUnsafe(text, opts);
  } catch (e) {
    // Filet de sécurité : aucune étape ne devrait lever, mais une exception ne doit jamais remonter.
    return fail("bad_shape", [`exception inattendue : ${e instanceof Error ? e.message : String(e)}`]);
  }
}

function decodeUnsafe(text: unknown, opts: DecodeOptions): DecodeResult {
  const maxBytes = opts.maxBytes ?? SAVE_CONFIG.maxSaveChars;
  const current = opts.currentVersion ?? CURRENT_VERSION;

  // 1. Taille (avant tout parsing : un texte énorme n'est jamais parsé).
  if (typeof text !== "string") return fail("not_json", [`texte attendu, reçu ${text === null ? "null" : typeof text}`]);
  if (text.length === 0) return fail("empty", ["texte vide"]);
  if (text.length > maxBytes) return fail("too_large", [`${text.length} caractères > ${maxBytes}`]);

  // 2. JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (e) {
    return fail("not_json", [e instanceof Error ? e.message : String(e)]);
  }

  // 3. Enveloppe stricte.
  if (!isPlainObject(parsed)) return fail("bad_envelope", ["l'enveloppe n'est pas un objet"]);
  const keys = Object.keys(parsed).sort();
  if (keys.length !== ENVELOPE_KEYS.length || keys.some((k, i) => k !== ENVELOPE_KEYS[i])) {
    return fail("bad_envelope", [`clés attendues ${ENVELOPE_KEYS.join(",")}, reçues ${keys.join(",")}`]);
  }
  const { version, savedAt, seed, checksum, state: rawState } = parsed;
  const envErrors: string[] = [];
  if (typeof version !== "number" || !Number.isSafeInteger(version)) envErrors.push("version non entière");
  if (!isTimestamp(savedAt)) envErrors.push("savedAt invalide");
  if (!isUint32(seed)) envErrors.push("seed invalide");
  if (typeof checksum !== "string" || !/^[0-9a-f]{16}$/.test(checksum)) envErrors.push("checksum mal formé");
  if (!isPlainObject(rawState)) envErrors.push("state n'est pas un objet");
  if (envErrors.length > 0) return fail("bad_envelope", envErrors);
  const v = version as number;

  // 4. Version.
  if (v > current) return fail("future_version", [`version ${v} > ${current} (jeu à mettre à jour)`], v);
  if (v < 1) return fail("unsupported_version", [`version ${v} non prise en charge`], v);

  // 5. Checksum sur l'état TEL QUE STOCKÉ (avant migration).
  let expected: string;
  try {
    expected = computeChecksum(v, savedAt as number, seed as number, rawState);
  } catch (e) {
    const msg = e instanceof CanonicalError ? e.message : String(e);
    return fail("bad_checksum", [`état non sérialisable canoniquement : ${msg}`], v);
  }
  if (expected !== checksum) return fail("bad_checksum", ["checksum incorrect (donnée modifiée ou abîmée)"], v);

  // 6. Migrations jusqu'à la version courante.
  const migrated = migrate(rawState, v, {
    target: current,
    ...(opts.registry ? { registry: opts.registry } : {}),
  });
  if (!migrated.ok) return fail("migration_failed", migrated.details, v);

  // 7. Forme stricte (forme COURANTE : le résultat de la migration est validé comme une save native).
  const shapeErrors = validateSavedState(migrated.raw);
  if (shapeErrors.length > 0) return fail("bad_shape", shapeErrors, v);

  // 8. Carte reconstruite (jamais lue depuis le fichier) puis invariants du core.
  const state: GameState = { ...(migrated.raw as SavedState), map: referenceMap() };
  let violations: string[];
  try {
    violations = checkInvariants(state);
  } catch (e) {
    violations = [`exception dans checkInvariants : ${String(e)}`];
  }
  if (violations.length > 0) return fail("invariants", violations, v);

  return { ok: true, state, seed: seed as number, savedAt: savedAt as number, version: v };
}
