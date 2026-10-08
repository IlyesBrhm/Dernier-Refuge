// Constantes techniques de la sauvegarde (docs/design/save.md §7). Pas de gameplay ici : ces valeurs
// ne changent rien au jeu, seulement au stockage. Elles restent donc hors de src/data.

/**
 * Version du format de sauvegarde. Toute modification de forme de `GameState` (ou de MAP_LAYOUT,
 * BUILD.slotCosts, des nœuds : la carte n'est pas sérialisée) ⇒ CURRENT_VERSION++, une migration
 * `migrations[N-1]`, un nouveau schéma et une nouvelle fixture `vN` (les anciennes restent testées).
 */
export const CURRENT_VERSION = 1;

export const SAVE_CONFIG = {
  keyPrefix: "dernier-refuge.",
  /**
   * Sel du checksum. GELÉ POUR TOUJOURS : le changer invalide toutes les sauvegardes existantes.
   * Il est dans le bundle client : il n'arrête que l'édition naïve (cf. limites dans index.ts).
   */
  salt: "ms1:Qe7#vR2m!9xKpL4wZt0sB8nYc6Hd",
  /** Taille max d'une sauvegarde stockée (caractères ; l'état est 100 % ASCII ⇒ = octets). */
  maxSaveChars: 256 * 1024,
  /** Taille max d'un fichier importé (octets). */
  maxImportBytes: 256 * 1024,
  /** Profondeur max d'imbrication acceptée par la sérialisation canonique. */
  maxDepth: 16,
  /** Nombre max de copies de données abîmées conservées (rotation). */
  maxQuarantine: 3,
  /** Bornes de taille des tableaux (anti-DoS, vérifiées avant les invariants). */
  limits: { survivors: 64, path: 192, queue: 16, tents: 16, buildSlots: 16, nodes: 64, drops: 512 },
  /** Nombre max d'erreurs de forme rapportées (le reste est tronqué). */
  maxShapeErrors: 50,
  autosaveIntervalMs: 10_000,
  lockTtlMs: 6_000,
  lockHeartbeatMs: 2_000,
  /** Nom du verrou Web Locks (multi-onglets). */
  webLockName: "dernier-refuge-save",
} as const;

const P = SAVE_CONFIG.keyPrefix;

/** Clés de stockage (préfixe `dernier-refuge.`). */
export const SAVE_KEYS = {
  A: `${P}save.A`,
  B: `${P}save.B`,
  current: `${P}save.current`,
  /** Préfixe des copies en quarantaine : `<préfixe><horodatage ms>-<n>`. */
  quarantinePrefix: `${P}quarantine.`,
  lock: `${P}lock`,
} as const;

export type SlotId = "A" | "B";
export const SLOT_IDS: readonly SlotId[] = ["A", "B"];

/** Textes affichés par l'UI (docs/design/save.md §4). */
export const SAVE_MESSAGES = {
  corrupt: "Sauvegarde endommagée, nouvelle partie lancée. L'ancienne a été mise de côté.",
  corruptQuarantineFailed:
    "Sauvegarde endommagée, nouvelle partie lancée. Sauvegarde automatique suspendue : exportez l'ancienne depuis le menu.",
  future:
    "Sauvegarde d'une version plus récente du jeu. Mettez le jeu à jour. Partie temporaire, non sauvegardée.",
  unavailable: "Sauvegarde indisponible",
  quota: "Sauvegarde indisponible (stockage plein)",
  invalidState: "Sauvegarde refusée : état de jeu invalide (bug)",
  notOwner: "Le jeu est ouvert dans un autre onglet : cette partie n'est pas sauvegardée.",
  resumed: "Partie reprise depuis la sauvegarde.",
  importTooLarge: `Fichier trop volumineux (max ${SAVE_CONFIG.maxImportBytes / 1024} Ko)`,
  importUnreadable: "Fichier vide ou illisible",
  importFuture: "Sauvegarde d'une version plus récente du jeu",
  importInvalid: "Fichier de sauvegarde invalide ou modifié",
  imported: "Sauvegarde importée",
  newGame: "Nouvelle partie",
  confirmImport: "Remplacer la partie en cours ?",
  confirmNewGame: "La partie actuelle sera perdue. Pensez à l'exporter.",
} as const;

/**
 * Textes propres à l'orchestration de l'app (démarrage, verrou, menu), utilisés par les décisions de
 * `boot.ts`. Déplacés ici depuis src/app/save-controller.ts pour que ces décisions soient testables.
 */
export const APP_MESSAGES = {
  seedMode:
    "Partie de test (lien avec ?seed=) : non sauvegardée. Retirez ?seed= de l'adresse pour retrouver votre partie.",
  damagedNotQuarantined:
    "Une copie de sauvegarde est endommagée et n'a pas pu être mise de côté. Sauvegarde automatique suspendue : exportez-la depuis le menu.",
  exportFailed: "Export impossible",
  nothingDamaged: "Aucune sauvegarde endommagée à exporter",
  newGameConfirmLabel: "Nouvelle partie",
  importConfirmLabel: "Remplacer",
  importedSeedMode: "Sauvegarde importée (partie de test, non sauvegardée)",
  newGameSeedMode: "Nouvelle partie (partie de test, non sauvegardée)",
  blockedNotOwner:
    "Jeu ouvert dans un autre onglet : import et nouvelle partie sont désactivés ici (export possible).",
  blockedFuture:
    "Sauvegarde d'une version plus récente : import et nouvelle partie sont désactivés (export possible).",
  blockedUnavailable:
    "Sauvegarde indisponible : import et nouvelle partie sont désactivés (export possible).",
} as const;
