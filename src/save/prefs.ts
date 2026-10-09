// Préférences du joueur (docs/design/ui-polish.md §2.2) : clé SÉPARÉE des sauvegardes.
//
// - Clé `dernier-refuge.prefs` (PREFS_KEY), hors SAVE_KEYS : jamais lue ni écrite par loadGame, writeSave,
//   commitFresh (nouvelle partie / import), la quarantaine (préfixe `dernier-refuge.quarantine.`) ou le
//   verrou multi-onglets (`dernier-refuge.lock`). Réciproquement, ce module ne touche QUE PREFS_KEY.
// - Non signée (décision validée) : aucune préférence n'influence le gameplay (qualité, sons, animations,
//   tutoriel = présentation). Une clé forgée ne peut au pire que masquer le tutoriel. Elle est néanmoins
//   validée à chaque lecture, champ par champ.
// - Ne lève JAMAIS : préférences abîmées ⇒ défauts (champ par champ quand l'enveloppe est lisible),
//   stockage indisponible / plein ⇒ défauts en mémoire, le jeu reste jouable.
//
// Mouvement réduit : la préférence stocke l'intention (`system` | `on` | `off`), pas le résultat. Le
// contrôleur (src/app/prefs-controller.ts) calcule l'effectif avec `effectiveReducedMotion(pref, mq)` où
// `mq = matchMedia("(prefers-reduced-motion: reduce)").matches`, et réécoute `change` sur ce media query :
// en `system`, un changement du réglage de l'OS s'applique en direct sans rien écrire.
//
// Qualité : `null` = « automatique » : défaut de l'appareil (`defaultQuality(coarsePointer)` : Moyen si
// pointeur grossier, sinon Haut) ET dégradation adaptative autorisée (ui-polish.md §4.5).

import { canonicalStringify } from "./canonical";
import { SAVE_CONFIG } from "./config";
import type { StorageAdapter, StorageError } from "./storage";

export const PREFS_KEY = `${SAVE_CONFIG.keyPrefix}prefs`; // "dernier-refuge.prefs"
export const PREFS_VERSION = 1;
/** Au-delà, le texte stocké est rejeté en bloc (anti-DoS ; une préférence valide fait ~200 caractères). */
export const PREFS_MAX_CHARS = 4096;

export type Quality = "low" | "medium" | "high";
export type ReducedMotionPref = "system" | "on" | "off";
export type TutorialStatus = "pending" | "active" | "done" | "skipped";

export const QUALITIES: readonly Quality[] = ["low", "medium", "high"];
export const REDUCED_MOTION_PREFS: readonly ReducedMotionPref[] = ["system", "on", "off"];
export const TUTORIAL_STATUSES: readonly TutorialStatus[] = ["pending", "active", "done", "skipped"];

/** Bornes des volumes (entiers, en %). Le pas de 5 est une affaire d'UI : tout entier 0..100 est accepté. */
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 100;
/** Masque des objectifs du tutoriel : 6 bits (TUTORIAL_STEPS, src/app/tutorial.ts). */
export const TUTORIAL_DONE_MAX = 63;

export interface TutorialPrefs {
  status: TutorialStatus;
  /** Masque d'objectifs accomplis, entier 0..63. */
  done: number;
}

export interface Prefs {
  version: 1;
  /** null = défaut de l'appareil + dégradation adaptative autorisée. */
  quality: Quality | null;
  fullscreen: boolean;
  muted: boolean;
  /** Entier 0..100. */
  sfxVolume: number;
  /** Entier 0..100. */
  ambienceVolume: number;
  reducedMotion: ReducedMotionPref;
  tutorial: TutorialPrefs;
}

/**
 * - `ok` : lu, tous les champs valides (des clés inconnues éventuelles sont ignorées) ;
 * - `missing` : rien de stocké (ou stockage illisible : voir `storageError`) ⇒ défauts ;
 * - `invalid` : enveloppe illisible (trop long, JSON invalide, non-objet, version ≠ 1) ⇒ TOUS les défauts ;
 * - `repaired` : au moins un champ absent ou invalide remplacé par SON défaut, les autres conservés.
 */
export type PrefsStatus = "ok" | "missing" | "invalid" | "repaired";

export interface PrefsParseResult {
  prefs: Prefs;
  status: PrefsStatus;
}

export interface PrefsLoadResult extends PrefsParseResult {
  /** Présent si la lecture du stockage a échoué (prefs = défauts, status = "missing"). */
  storageError?: StorageError;
}

export const DEFAULT_PREFS: Readonly<Prefs> = Object.freeze({
  version: 1,
  quality: null,
  fullscreen: false,
  muted: false,
  sfxVolume: 80,
  ambienceVolume: 60,
  reducedMotion: "system",
  tutorial: Object.freeze({ status: "pending", done: 0 }) as TutorialPrefs,
});

/** Copie neuve et modifiable des défauts. */
export function defaultPrefs(): Prefs {
  return { ...DEFAULT_PREFS, tutorial: { ...DEFAULT_PREFS.tutorial } };
}

// --- Validation champ par champ ---------------------------------------------------------------

type Rec = Record<string, unknown>;

function isPlainRecord(v: unknown): v is Rec {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Valeur PROPRE de l'objet (jamais héritée : `__proto__` injecté ne fournit rien). */
function own(o: Rec, k: string): { present: boolean; value: unknown } {
  if (!Object.prototype.hasOwnProperty.call(o, k)) return { present: false, value: undefined };
  const d = Object.getOwnPropertyDescriptor(o, k);
  return d && "value" in d ? { present: true, value: d.value } : { present: false, value: undefined };
}

const DANGEROUS_KEYS = ["__proto__", "constructor", "prototype"];
function hasDangerousKey(o: Rec): boolean {
  return DANGEROUS_KEYS.some((k) => Object.prototype.hasOwnProperty.call(o, k));
}

function isBoundedInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

/** Lit un champ ; absent ou invalide ⇒ défaut + `repaired`. */
function field<T>(o: Rec, k: string, ok: (v: unknown) => v is T, fallback: T, flag: { repaired: boolean }): T {
  const { present, value } = own(o, k);
  if (present && ok(value)) return value;
  flag.repaired = true;
  return fallback;
}

const isQuality = (v: unknown): v is Quality | null => v === null || oneOf(v, QUALITIES);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isVolume = (v: unknown): v is number => isBoundedInt(v, VOLUME_MIN, VOLUME_MAX);
const isMotion = (v: unknown): v is ReducedMotionPref => oneOf(v, REDUCED_MOTION_PREFS);
const isTutStatus = (v: unknown): v is TutorialStatus => oneOf(v, TUTORIAL_STATUSES);
const isTutDone = (v: unknown): v is number => isBoundedInt(v, 0, TUTORIAL_DONE_MAX);

/** Valide un objet déjà décodé (version déjà vérifiée). Ne lève pas. */
function sanitize(o: Rec, flag: { repaired: boolean }): Prefs {
  const d = DEFAULT_PREFS;
  if (hasDangerousKey(o)) flag.repaired = true;

  const tutRaw = own(o, "tutorial");
  let tutorial: TutorialPrefs;
  if (tutRaw.present && isPlainRecord(tutRaw.value)) {
    const t = tutRaw.value;
    if (hasDangerousKey(t)) flag.repaired = true;
    tutorial = {
      status: field(t, "status", isTutStatus, d.tutorial.status, flag),
      done: field(t, "done", isTutDone, d.tutorial.done, flag),
    };
  } else {
    flag.repaired = true;
    tutorial = { ...d.tutorial };
  }

  return {
    version: 1,
    quality: field(o, "quality", isQuality, d.quality, flag),
    fullscreen: field(o, "fullscreen", isBool, d.fullscreen, flag),
    muted: field(o, "muted", isBool, d.muted, flag),
    sfxVolume: field(o, "sfxVolume", isVolume, d.sfxVolume, flag),
    ambienceVolume: field(o, "ambienceVolume", isVolume, d.ambienceVolume, flag),
    reducedMotion: field(o, "reducedMotion", isMotion, d.reducedMotion, flag),
    tutorial,
  };
}

/**
 * Lit le texte stocké sous PREFS_KEY. Pur, NE LÈVE JAMAIS.
 * Non-chaîne ou chaîne vide ⇒ `missing` ; > PREFS_MAX_CHARS, JSON invalide, non-objet, `version` ≠ 1
 * (ancienne comme future) ⇒ tous les défauts (`invalid`) ; champ absent / invalide ⇒ défaut de ce champ
 * seul (`repaired`) ; clés inconnues ignorées (et donc supprimées à la prochaine écriture).
 */
export function parsePrefs(raw: unknown): PrefsParseResult {
  try {
    if (typeof raw !== "string" || raw === "") return { prefs: defaultPrefs(), status: "missing" };
    if (raw.length > PREFS_MAX_CHARS) return { prefs: defaultPrefs(), status: "invalid" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { prefs: defaultPrefs(), status: "invalid" };
    }
    if (!isPlainRecord(parsed)) return { prefs: defaultPrefs(), status: "invalid" };
    const v = own(parsed, "version");
    if (!v.present || v.value !== PREFS_VERSION) return { prefs: defaultPrefs(), status: "invalid" };
    const flag = { repaired: false };
    const prefs = sanitize(parsed, flag);
    return { prefs, status: flag.repaired ? "repaired" : "ok" };
  } catch {
    // Filet de sécurité (ne devrait pas arriver) : jamais d'exception vers l'appelant.
    return { prefs: defaultPrefs(), status: "invalid" };
  }
}

/**
 * JSON canonique (clés triées) des préférences. Les champs sont d'abord revalidés : un objet en mémoire
 * abîmé (NaN, volume 150, champ en trop…) est normalisé champ par champ, jamais écrit tel quel. Ne lève pas.
 */
export function serializePrefs(p: Prefs): string {
  let clean: Prefs;
  try {
    clean = isPlainRecord(p) ? sanitize(p as unknown as Rec, { repaired: false }) : defaultPrefs();
  } catch {
    clean = defaultPrefs();
  }
  return canonicalStringify(clean);
}

/** Lecture depuis le stockage. Échec de lecture (ou adaptateur qui lève) ⇒ défauts, jeu jouable. */
export function loadPrefs(storage: StorageAdapter): PrefsLoadResult {
  try {
    const r = storage.getItem(PREFS_KEY);
    if (!r.ok) return { prefs: defaultPrefs(), status: "missing", storageError: r.error };
    return parsePrefs(r.value);
  } catch {
    return { prefs: defaultPrefs(), status: "missing", storageError: "unavailable" };
  }
}

/**
 * Écrit les préférences (normalisées) sous PREFS_KEY. Stockage plein / indisponible / adaptateur qui lève
 * ⇒ `false`, sans exception : l'app garde les préférences en mémoire et le jeu continue.
 */
export function savePrefs(storage: StorageAdapter, p: Prefs): boolean {
  try {
    return storage.setItem(PREFS_KEY, serializePrefs(p)).ok;
  } catch {
    return false;
  }
}

// --- Aides pures pour le contrôleur de préférences (src/app) ----------------------------------

/** Mouvement réduit effectif : `on` ∨ (`system` ∧ prefers-reduced-motion du système). */
export function effectiveReducedMotion(pref: ReducedMotionPref, systemPrefersReduce: boolean): boolean {
  return pref === "on" || (pref === "system" && systemPrefersReduce);
}

/** Qualité par défaut de l'appareil (ui-polish.md §1.5) : Moyen si pointeur grossier, sinon Haut. */
export function defaultQuality(coarsePointer: boolean): Quality {
  return coarsePointer ? "medium" : "high";
}

/** Qualité effective au démarrage : choix explicite, sinon défaut de l'appareil. */
export function resolveQuality(q: Quality | null, coarsePointer: boolean): Quality {
  return q ?? defaultQuality(coarsePointer);
}
