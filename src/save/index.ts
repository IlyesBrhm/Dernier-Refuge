// API publique de la sauvegarde (docs/design/save.md §3). À importer depuis src/app.
//
// LIMITES ASSUMÉES (jeu 100 % client, sans serveur) :
// - Le sel du checksum et le code de hash sont dans le bundle : le checksum n'arrête que l'édition naïve
//   (éditeur de texte, DevTools sur la clé). Quiconque lit le code peut re-signer une sauvegarde.
// - Ce qu'une sauvegarde re-signée peut contenir est borné par la validation de forme (schema.ts) et par
//   les invariants du core, dont la PLAUSIBILITÉ (bois/nourriture détenus ≤ départ + tick × borne). Une
//   triche plausible (un peu plus de bois que ce qu'on aurait pu récolter au tick courant) passe.
// - La plausibilité est relative à `tick`, qui fait lui-même partie de l'état signé : gonfler `tick`
//   dans une sauvegarde re-signée relève la borne et NEUTRALISE cette règle (des ressources quelconques,
//   dans la limite de la capacité, deviennent « plausibles »). Comme le sel est dans le code client,
//   re-signer est possible : c'est une limite assumée de l'anti-triche côté client, pas un bug.
// - L'état en mémoire peut être modifié depuis la console : la sauvegarde ne protège que le stockage.
// - Pas de progression hors ligne ni de détection d'horloge (hors périmètre v1) : `savedAt` est
//   informatif, le chargement n'appelle jamais tick(). Changer l'horloge ne rapporte donc rien.
// - v2 (jour/nuit) : la phase jour/nuit se déduit de `tick` (aucune horloge réelle) ; le feu et le bilan
//   de nuit sont bornés par les invariants (feu ≤ capacité, burnedTotal ≤ combustions possibles, bilan
//   cohérent avec l'heure). Gonfler `tick` reste la limite principale : ces bornes croissent aussi avec lui.
// - Migration v1 → v2 : n'ajoute que le feu plein + bilan à 0, endort les `resting` d'une v1 tombant la
//   nuit et écarte joueur/survivants de la nouvelle tuile F ; une v1 mal formée ou incohérente est refusée.
// - Seule une vérification serveur (rejouer le journal des commandes sur le core déterministe) rendrait
//   la triche réellement impossible ; l'architecture le permet, hors périmètre v1.

import type { GameState } from "../core/index";
import { decodeSave, encodeSave, type DecodeResult, type EncodeResult, type SaveMeta } from "./codec";
import { SAVE_CONFIG } from "./config";

export {
  APP_MESSAGES,
  CURRENT_VERSION,
  SAVE_CONFIG,
  SAVE_KEYS,
  SAVE_MESSAGES,
  SLOT_IDS,
  type SlotId,
} from "./config";
export { importErrorMessage, writeErrorMessage } from "./messages";
export {
  autosaveEnabled,
  bootUsesStorage,
  initialSession,
  isPersistent,
  newGame,
  ownerChangeNeedsLoad,
  planAutosave,
  planBoot,
  planOwnerChange,
  planQuarantineResult,
  planReplaceResult,
  planWriteResult,
  replaceBlockedReason,
  replaceSuccessMessage,
  runStorageSteps,
  type AutosaveContext,
  type AutosaveDecision,
  type AutosaveSkipReason,
  type BootContext,
  type BootGame,
  type BootPlan,
  type OwnerChangeContext,
  type OwnerChangePlan,
  type QuarantineOutcome,
  type ReplaceKind,
  type ReplaceOutcome,
  type SaveBannerKey,
  type SaveEffect,
  type SaveSession,
  type StepsOutcome,
  type StorageIo,
  type StorageSteps,
  type TemporaryMode,
  type WriteOutcome,
} from "./boot";
export { canonicalStringify, CanonicalError } from "./canonical";
export { hash64 } from "./hash";
export { validateSavedState, validateSavedStateV1, type SavedState, type SavedStateV1 } from "./schema";
export { migrateV1toV2 } from "./migrate-v1";
export {
  computeChecksum,
  decodeSave,
  encodeSave,
  toSavedState,
  type DecodeError,
  type DecodeFail,
  type DecodeOk,
  type DecodeOptions,
  type DecodeResult,
  type EncodeResult,
  type SaveEnvelope,
  type SaveMeta,
} from "./codec";
export { migrate, migrations, type Migration, type MigrationRegistry, type MigrateResult } from "./migrations";
export {
  classifyStorageError,
  createLocalStorageAdapter,
  createMemoryStorage,
  type MemoryStorage,
  type MemoryStorageOptions,
  type StorageAdapter,
  type StorageError,
  type StorageResult,
} from "./storage";
export {
  commitFresh,
  listQuarantine,
  loadGame,
  quarantine,
  writeSave,
  type EmptySlotReport,
  type InvalidSlotReport,
  type LoadResult,
  type QuarantineEntry,
  type SaveOwner,
  type SlotReport,
  type ValidSlotReport,
  type WriteError,
  type WriteResult,
} from "./slots";
export {
  createLeaseLock,
  createWebLock,
  type LeaseLock,
  type LockManagerLike,
  type SaveLock,
  type WebLock,
} from "./lock";

/** Texte d'export : identique au texte stocké (JSON canonique, non indenté). */
export function exportSave(state: GameState, meta: SaveMeta): EncodeResult {
  return encodeSave(state, meta);
}

/** Nom de fichier proposé à l'export. */
export function exportFileName(state: GameState): string {
  return `dernier-refuge-tick${state.tick}.json`;
}

/**
 * Import : même pipeline que le chargement (checksum, migrations, forme, invariants), taille limitée à
 * `maxImportBytes`, texte vide refusé. Ne lève jamais. N'écrit rien : en cas de succès, l'app demande
 * confirmation puis appelle `commitFresh`.
 */
export function importSave(text: unknown): DecodeResult {
  return decodeSave(text, { maxBytes: SAVE_CONFIG.maxImportBytes });
}

/**
 * Nom de fichier proposé pour l'export d'une sauvegarde endommagée. `quarantinedAt` : horodatage de la
 * copie en quarantaine (null = clé mal formée ⇒ « inconnue ») ; omis pour des données abîmées non mises en
 * quarantaine (quarantaine échouée).
 */
export function damagedExportFileName(quarantinedAt?: number | null): string {
  if (quarantinedAt === undefined) return "dernier-refuge-endommagee.json";
  return `dernier-refuge-endommagee-${quarantinedAt ?? "inconnue"}.json`;
}
