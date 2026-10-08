// Choix des messages utilisateur selon les erreurs (docs/design/save.md §4). Fonctions pures.

import type { DecodeError } from "./codec";
import { SAVE_MESSAGES } from "./config";
import type { WriteError } from "./slots";

/** Message utilisateur pour un import refusé. */
export function importErrorMessage(error: DecodeError): string {
  switch (error) {
    case "too_large":
      return SAVE_MESSAGES.importTooLarge;
    case "empty":
    case "not_json":
      return SAVE_MESSAGES.importUnreadable;
    case "future_version":
      return SAVE_MESSAGES.importFuture;
    default:
      return SAVE_MESSAGES.importInvalid;
  }
}

/** Message du bandeau pour un échec d'écriture. */
export function writeErrorMessage(error: WriteError): string {
  switch (error) {
    case "quota":
      return SAVE_MESSAGES.quota;
    case "unavailable":
    case "readback_mismatch":
    case "too_large":
    case "serialize_error":
      return SAVE_MESSAGES.unavailable;
    case "invalid_state":
      // L'état en mémoire viole un invariant : c'est un bug (ou une modification console), pas un
      // problème de stockage. On refuse d'écrire plutôt que d'écraser une sauvegarde valide.
      return SAVE_MESSAGES.invalidState;
    case "quarantine_failed":
      return SAVE_MESSAGES.corruptQuarantineFailed;
    case "future_version":
      return SAVE_MESSAGES.future;
    case "not_owner":
      return SAVE_MESSAGES.notOwner;
  }
}
