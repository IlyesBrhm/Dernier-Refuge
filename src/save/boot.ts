// Table de décision de l'orchestration de la sauvegarde (docs/design/save.md §1, §4, §10).
//
// Fonctions PURES : ni DOM, ni horloge, ni stockage, ni verrou. Elles décident ce que l'app doit faire
// (src/app/save-controller.ts) à partir de résultats déjà obtenus (LoadResult, propriété du verrou,
// résultat de quarantaine / d'écriture) et d'une « session » immuable ; l'app exécute les effets.
// Seul `runStorageSteps` appelle quelque chose : les fonctions d'E/S qu'on lui injecte.
//
// Démarrage :
//   - `?seed=<entier>` : partie TEMPORAIRE rejouable ; ni verrou, ni lecture, ni écriture (bootUsesStorage).
//   - sinon (après tentative de verrou puis `loadGame`) :
//       fresh       ⇒ nouvelle partie (seed aléatoire) + commitFresh (si propriétaire)
//       corrupt     ⇒ quarantaine (si propriétaire) ; OK ⇒ nouvelle partie + commitFresh + bandeau fermable ;
//                     KO ⇒ nouvelle partie NON écrite, autosave suspendue, export de la donnée abîmée proposé
//       loaded      ⇒ partie chargée ; slot abîmé ⇒ quarantaine (si propriétaire ; KO ⇒ autosave suspendue)
//       future      ⇒ partie temporaire, aucune écriture, verrou rendu, bandeau
//       unavailable ⇒ jouable sans sauvegarde, verrou rendu, bandeau
//   Onglet non propriétaire : bandeau, rien n'est écrit (la quarantaine est l'affaire du propriétaire).
// Autosave : sautée si non attachée, quarantaine échouée, partie temporaire, stockage indisponible,
//   non propriétaire ou état inchangé (même référence). Elle n'est PAS bloquée pendant une confirmation
//   d'import / nouvelle partie (l'état courant reste valide tant que l'action n'est pas confirmée).
// Verrou obtenu après coup (l'autre onglet s'est fermé) ⇒ la sauvegarde est RECHARGÉE (partie locale
//   abandonnée) + toast « Partie reprise » ; verrou perdu ⇒ bandeau.

import { createInitialState, type GameState } from "../core/index";
import { APP_MESSAGES, SAVE_MESSAGES } from "./config";
import { writeErrorMessage } from "./messages";
import type { InvalidSlotReport, LoadResult, WriteError, WriteResult } from "./slots";

// --- Types ------------------------------------------------------------------------------------

/** Messages d'état persistants (mêmes clés que `BannerKey` de src/ui/notices.ts). */
export type SaveBannerKey = "temporary" | "quarantine" | "notOwner" | "unavailable" | "corrupt";

/** Effet à exécuter par l'app, dans l'ordre. */
export type SaveEffect =
  /** Pose (texte) ou retire (null) un bandeau. */
  | { kind: "banner"; key: SaveBannerKey; text: string | null; dismissible: boolean }
  | { kind: "toast"; text: string }
  /** Rendre le verrou multi-onglets (et ne plus l'utiliser). */
  | { kind: "releaseLock" }
  /** Prévenir le menu que `replaceBlockedReason` a pu changer. */
  | { kind: "notifyPersistence" };

/** Partie temporaire (jamais écrite) : lien `?seed=` ou sauvegarde d'une version future. */
export type TemporaryMode = "seed" | "future" | null;

/** État de l'orchestration (immuable : chaque décision renvoie une nouvelle session). */
export interface SaveSession {
  readonly temporary: TemporaryMode;
  /** false si le stockage était illisible : plus aucune lecture/écriture. */
  readonly storageOk: boolean;
  /** Quarantaine échouée : on n'écrase pas les slots (autosave suspendue). */
  readonly suspended: boolean;
  /** Données abîmées non mises en quarantaine (proposées à l'export). */
  readonly pendingDamaged: readonly InvalidSlotReport[];
  /** Seed de la partie courante (métadonnée de l'enveloppe). */
  readonly seed: number;
  /** Dernier état écrit avec succès (ou chargé) : l'autosave saute si l'état courant est cette référence. */
  readonly lastSaved: GameState | null;
  /** Dernière erreur d'écriture (pour ne journaliser qu'une fois une erreur répétée). */
  readonly lastWriteError: WriteError | null;
}

/** Étapes de stockage à exécuter, dans l'ordre (cf. `runStorageSteps`). */
export interface StorageSteps {
  /** 1. Données abîmées à mettre en quarantaine (vide ⇒ rien à faire, considéré réussi). */
  readonly quarantine: readonly InvalidSlotReport[];
  /** Bandeau « quarantaine » si elle échoue (les étapes suivantes sont alors abandonnées). */
  readonly quarantineFailMessage: string;
  /** 2. Si la quarantaine a réussi : état à écrire dans les deux slots (`commitFresh`), sinon null. */
  readonly commitFresh: GameState | null;
  /** 3. Si la quarantaine a réussi : effets à appliquer après l'écriture (quel qu'en soit le résultat). */
  readonly effectsAfter: readonly SaveEffect[];
}

export interface BootContext {
  /** `?seed=` lu dans l'URL (null si absent / invalide). */
  seedParam: number | null;
  /** Propriété du verrou après la première tentative (ignorée en mode `?seed=`). */
  isOwner: boolean;
  /** Seed aléatoire à utiliser si une nouvelle partie est nécessaire. */
  randomSeed: number;
}

/** Partie à démarrer. */
export type BootGame =
  /** Sauvegarde chargée. */
  | { kind: "load"; state: GameState; seed: number }
  /** Nouvelle partie destinée à être sauvegardée (fresh / corrupt). */
  | { kind: "new"; state: GameState; seed: number }
  /** Partie jamais sauvegardée : `?seed=`, version future ou stockage indisponible. */
  | { kind: "temporary"; reason: "seed" | "future" | "unavailable"; state: GameState; seed: number };

export interface BootPlan {
  game: BootGame;
  /** Session après les effets ci-dessous, AVANT les étapes de stockage. */
  session: SaveSession;
  /** Effets à appliquer immédiatement (bandeaux, verrou rendu). */
  effects: SaveEffect[];
  /** Étapes de stockage (propriétaire seulement), à passer à `runStorageSteps`. null = rien. */
  storage: StorageSteps | null;
  /** La partie est-elle destinée à être sauvegardée (ni temporaire ni stockage indisponible) ? */
  persistent: boolean;
  /** Autosave active avec cette session (à réévaluer avec `autosaveEnabled` après les étapes de stockage). */
  autosave: boolean;
  /** Message de diagnostic (console en dev), ou null. */
  devWarning: string | null;
}

// --- Session ----------------------------------------------------------------------------------

export function initialSession(seed = 0): SaveSession {
  return {
    temporary: null,
    storageOk: true,
    suspended: false,
    pendingDamaged: [],
    seed,
    lastSaved: null,
    lastWriteError: null,
  };
}

/** Partie destinée à être sauvegardée : ni temporaire, ni stockage indisponible. */
export function isPersistent(session: SaveSession): boolean {
  return session.temporary === null && session.storageOk;
}

/** Autosave possible (hors « état inchangé ») : propriétaire, partie persistante, pas de quarantaine échouée. */
export function autosaveEnabled(session: SaveSession, isOwner: boolean): boolean {
  return !session.suspended && isPersistent(session) && isOwner;
}

/** Nouvelle partie (état initial du core). `seed` : entier [0, 2^32-1] (choisi par src/app). */
export function newGame(seed: number): { state: GameState; seed: number } {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`seed invalide : ${seed} (entier [0, 2^32-1] attendu)`);
  }
  return { state: createInitialState(seed), seed };
}

const banner = (key: SaveBannerKey, text: string | null, dismissible = false): SaveEffect => ({
  kind: "banner",
  key,
  text,
  dismissible,
});

/** Passage en partie temporaire « version future » : verrou rendu, aucune écriture. */
function enterFuture(session: SaveSession): { session: SaveSession; effects: SaveEffect[] } {
  return {
    session: { ...session, temporary: "future" },
    effects: [
      { kind: "releaseLock" },
      banner("notOwner", null),
      banner("temporary", SAVE_MESSAGES.future),
      { kind: "notifyPersistence" },
    ],
  };
}

/** Stockage illisible : plus aucune lecture/écriture, verrou rendu. */
function enterUnavailable(session: SaveSession): { session: SaveSession; effects: SaveEffect[] } {
  return {
    session: { ...session, storageOk: false },
    effects: [
      { kind: "releaseLock" },
      banner("notOwner", null),
      banner("unavailable", SAVE_MESSAGES.unavailable),
      { kind: "notifyPersistence" },
    ],
  };
}

// --- Démarrage --------------------------------------------------------------------------------

/**
 * false en mode `?seed=` : l'app ne doit NI acquérir de verrou NI lire le stockage avant `planBoot`
 * (une URL de test n'écrase jamais la partie du joueur).
 */
export function bootUsesStorage(seedParam: number | null): boolean {
  return seedParam === null;
}

/**
 * Décision de démarrage. `load` : résultat de `loadGame` (lu APRÈS la tentative de verrou) ; ignoré en mode
 * `?seed=` (passer null). Hors `?seed=`, null est traité comme un stockage indisponible.
 */
export function planBoot(load: LoadResult | null, ctx: BootContext): BootPlan {
  if (ctx.seedParam !== null) {
    const session: SaveSession = { ...initialSession(ctx.seedParam), temporary: "seed" };
    return {
      game: { kind: "temporary", reason: "seed", state: newGame(ctx.seedParam).state, seed: ctx.seedParam },
      session,
      effects: [banner("temporary", APP_MESSAGES.seedMode)],
      storage: null,
      persistent: false,
      autosave: false,
      devWarning: null,
    };
  }

  const owner = ctx.isOwner;
  const res: LoadResult = load ?? { kind: "unavailable", error: "unavailable" };
  // Résultat de la tentative de verrou (la partie est encore supposée persistante à ce stade).
  const effects: SaveEffect[] = owner ? [] : [banner("notOwner", SAVE_MESSAGES.notOwner)];
  const base = initialSession();

  const finish = (
    game: BootGame,
    session: SaveSession,
    storage: StorageSteps | null,
    devWarning: string | null = null,
  ): BootPlan => ({
    game,
    session,
    effects,
    storage,
    persistent: isPersistent(session),
    autosave: autosaveEnabled(session, owner),
    devWarning,
  });

  switch (res.kind) {
    case "loaded": {
      const session: SaveSession = { ...base, seed: res.seed, lastSaved: res.state };
      const storage: StorageSteps | null =
        owner && res.damaged.length > 0
          ? {
              quarantine: res.damaged,
              quarantineFailMessage: APP_MESSAGES.damagedNotQuarantined,
              commitFresh: null,
              effectsAfter: [],
            }
          : null;
      return finish({ kind: "load", state: res.state, seed: res.seed }, session, storage);
    }
    case "fresh": {
      const { state } = newGame(ctx.randomSeed);
      const session: SaveSession = { ...base, seed: ctx.randomSeed };
      const storage: StorageSteps | null = owner
        ? { quarantine: [], quarantineFailMessage: "", commitFresh: state, effectsAfter: [] }
        : null;
      return finish({ kind: "new", state, seed: ctx.randomSeed }, session, storage);
    }
    case "corrupt": {
      const { state } = newGame(ctx.randomSeed);
      const session: SaveSession = { ...base, seed: ctx.randomSeed };
      // Non propriétaire : l'onglet propriétaire s'en charge ; ici, rien n'est écrit.
      const storage: StorageSteps | null = owner
        ? {
            quarantine: res.damaged,
            quarantineFailMessage: SAVE_MESSAGES.corruptQuarantineFailed,
            commitFresh: state,
            effectsAfter: [banner("corrupt", SAVE_MESSAGES.corrupt, true)],
          }
        : null;
      return finish({ kind: "new", state, seed: ctx.randomSeed }, session, storage);
    }
    case "future": {
      const f = enterFuture({ ...base, seed: ctx.randomSeed });
      effects.push(...f.effects);
      const game: BootGame = {
        kind: "temporary",
        reason: "future",
        state: newGame(ctx.randomSeed).state,
        seed: ctx.randomSeed,
      };
      return finish(game, f.session, null);
    }
    case "unavailable": {
      const u = enterUnavailable({ ...base, seed: ctx.randomSeed });
      effects.push(...u.effects);
      const game: BootGame = {
        kind: "temporary",
        reason: "unavailable",
        state: newGame(ctx.randomSeed).state,
        seed: ctx.randomSeed,
      };
      return finish(game, u.session, null, `stockage indisponible : ${res.error}`);
    }
  }
}

// --- Quarantaine / écriture -------------------------------------------------------------------

export interface QuarantineOutcome {
  session: SaveSession;
  effects: SaveEffect[];
  /** true ⇒ on peut écrire (quarantaine réussie ou inutile) ; false ⇒ NE RIEN ÉCRIRE. */
  proceed: boolean;
}

/**
 * Résultat de `quarantine(...)`. `ok` est ignoré si `damaged` est vide (quarantaine non appelée).
 * Échec ⇒ autosave suspendue, données gardées pour l'export, bandeau `failMessage`.
 */
export function planQuarantineResult(
  session: SaveSession,
  damaged: readonly InvalidSlotReport[],
  ok: boolean,
  failMessage: string,
): QuarantineOutcome {
  if (damaged.length === 0 || ok) return { session, effects: [], proceed: true };
  return {
    session: { ...session, suspended: true, pendingDamaged: damaged.slice() },
    effects: [banner("quarantine", failMessage)],
    proceed: false,
  };
}

export interface WriteOutcome {
  session: SaveSession;
  effects: SaveEffect[];
  /** Échec à journaliser (console en dev) : seulement si l'erreur diffère de la précédente. */
  warn: { error: WriteError; details: string[] } | null;
}

/**
 * Résultat d'une écriture (`writeSave` / `commitFresh`) de l'état `state`.
 * Succès ⇒ `lastSaved`, bandeau « indisponible » retiré, suspension levée (writeSave a mis de côté les
 * slots abîmés avant de les écraser). Échec ⇒ selon l'erreur (cf. switch).
 */
export function planWriteResult(session: SaveSession, result: WriteResult, state: GameState): WriteOutcome {
  if (result.ok) {
    const effects: SaveEffect[] = [banner("unavailable", null)];
    let next: SaveSession = { ...session, lastSaved: state, lastWriteError: null };
    if (session.suspended) {
      next = { ...next, suspended: false, pendingDamaged: [] };
      effects.push(banner("quarantine", null));
    }
    return { session: next, effects, warn: null };
  }

  const { error, details } = result;
  const warn = error !== session.lastWriteError ? { error, details } : null;
  const s: SaveSession = { ...session, lastWriteError: error };
  switch (error) {
    case "not_owner":
      // Le bandeau est géré par l'événement du verrou.
      return { session: s, effects: [], warn };
    case "future_version": {
      const f = enterFuture(s);
      return { session: f.session, effects: f.effects, warn };
    }
    case "quarantine_failed":
      return {
        session: { ...s, suspended: true },
        effects: [banner("quarantine", APP_MESSAGES.damagedNotQuarantined)],
        warn,
      };
    default:
      // Non bloquant : on réessaie à l'intervalle suivant, le bandeau disparaît au premier succès.
      return { session: s, effects: [banner("unavailable", writeErrorMessage(error))], warn };
  }
}

/** E/S injectées dans `runStorageSteps` (l'app y branche `quarantine` / `commitFresh` réels). */
export interface StorageIo {
  quarantine(damaged: readonly InvalidSlotReport[]): boolean;
  /** Écrit les deux slots ; `seed` = seed de la session (métadonnée), `savedAt` fourni par l'app. */
  commitFresh(state: GameState, seed: number): WriteResult;
}

export interface StepsOutcome {
  session: SaveSession;
  effects: SaveEffect[];
  /** Résultat de la quarantaine (null si rien à mettre de côté). */
  quarantined: boolean | null;
  /** Résultat de l'écriture (null si non tentée). */
  write: WriteResult | null;
  warn: WriteOutcome["warn"];
}

/** Exécute des `StorageSteps` avec des E/S injectées et enchaîne les décisions. Ne lève pas si `io` ne lève pas. */
export function runStorageSteps(session: SaveSession, steps: StorageSteps, io: StorageIo): StepsOutcome {
  const quarantined = steps.quarantine.length > 0 ? io.quarantine(steps.quarantine) : null;
  const q = planQuarantineResult(session, steps.quarantine, quarantined ?? true, steps.quarantineFailMessage);
  const out: StepsOutcome = { session: q.session, effects: [...q.effects], quarantined, write: null, warn: null };
  if (!q.proceed) return out;
  if (steps.commitFresh !== null) {
    const write = io.commitFresh(steps.commitFresh, out.session.seed);
    const w = planWriteResult(out.session, write, steps.commitFresh);
    out.session = w.session;
    out.effects.push(...w.effects);
    out.write = write;
    out.warn = w.warn;
  }
  out.effects.push(...steps.effectsAfter);
  return out;
}

// --- Autosave ---------------------------------------------------------------------------------

export interface AutosaveContext {
  /** Partie attachée (UI branchée) ? */
  attached: boolean;
  /** Propriétaire du verrou en ce moment (false si aucun verrou). */
  isOwner: boolean;
  /** État courant du jeu. */
  state: GameState;
}

export type AutosaveSkipReason = "not_attached" | "suspended" | "temporary" | "unavailable" | "not_owner" | "unchanged";

export type AutosaveDecision = { kind: "write" } | { kind: "skip"; reason: AutosaveSkipReason };

/**
 * Faut-il écrire maintenant (`writeSave`, puis `planWriteResult`) ? Pas de critère « occupé » : une
 * confirmation d'import / nouvelle partie en cours n'empêche pas l'autosave (état courant toujours valide).
 */
export function planAutosave(session: SaveSession, ctx: AutosaveContext): AutosaveDecision {
  if (!ctx.attached) return { kind: "skip", reason: "not_attached" };
  if (session.suspended) return { kind: "skip", reason: "suspended" };
  if (session.temporary !== null) return { kind: "skip", reason: "temporary" };
  if (!session.storageOk) return { kind: "skip", reason: "unavailable" };
  if (!ctx.isOwner) return { kind: "skip", reason: "not_owner" };
  if (ctx.state === session.lastSaved) return { kind: "skip", reason: "unchanged" };
  return { kind: "write" };
}

// --- Import / nouvelle partie -----------------------------------------------------------------

/**
 * Raison pour laquelle import / nouvelle partie sont désactivés (null = autorisés). Désactivés quand le
 * résultat ne pourrait pas être écrit (version future, stockage indisponible, onglet non propriétaire) :
 * sinon la partie remplacée disparaîtrait au rechargement / à la reprise du verrou. Exception : `?seed=`
 * (partie de test assumée) où ils restent possibles, explicitement « non sauvegardée ».
 */
export function replaceBlockedReason(session: SaveSession, isOwner: boolean): string | null {
  if (session.temporary === "seed") return null;
  if (session.temporary === "future") return APP_MESSAGES.blockedFuture;
  if (!session.storageOk) return APP_MESSAGES.blockedUnavailable;
  if (!isOwner) return APP_MESSAGES.blockedNotOwner;
  return null;
}

export type ReplaceKind = "import" | "newGame";

/** Toast de succès d'un remplacement de partie. */
export function replaceSuccessMessage(session: SaveSession, kind: ReplaceKind): string {
  const seedMode = session.temporary === "seed";
  if (kind === "import") return seedMode ? APP_MESSAGES.importedSeedMode : SAVE_MESSAGES.imported;
  return seedMode ? APP_MESSAGES.newGameSeedMode : SAVE_MESSAGES.newGame;
}

export type ReplaceOutcome =
  /** Refusé (verrou perdu, version future… pendant la confirmation) : toast, rien ne change. */
  | { kind: "blocked"; session: SaveSession; effects: SaveEffect[] }
  /** Partie temporaire `?seed=` : remplacer l'état sans rien écrire. */
  | { kind: "replace_without_write"; session: SaveSession; effects: SaveEffect[] }
  /** Écrire d'abord les deux slots (`commitFresh(state, newSeed)`), puis `planReplaceResult(..., write)`. */
  | { kind: "commit_then_replace"; session: SaveSession; effects: SaveEffect[] }
  /** Écriture réussie : remplacer l'état, puis effets (bandeau corrupt retiré, toast de succès). */
  | { kind: "replaced"; session: SaveSession; effects: SaveEffect[] }
  /** Écriture échouée : l'état N'est PAS remplacé, seed inchangé. */
  | { kind: "write_failed"; session: SaveSession; effects: SaveEffect[]; warn: WriteOutcome["warn"] };

/**
 * Remplacement de partie (import / nouvelle partie), APRÈS confirmation. Appel en deux temps :
 * `planReplaceResult(session, isOwner, kind, state, seed, null)` ⇒ blocked | replace_without_write |
 * commit_then_replace ; dans ce dernier cas, l'app appelle `commitFresh` puis rappelle avec le résultat
 * (`write`) ⇒ replaced | write_failed. Hors `?seed=`, l'état n'est remplacé qu'après écriture réussie.
 */
export function planReplaceResult(
  session: SaveSession,
  isOwner: boolean,
  kind: ReplaceKind,
  state: GameState,
  newSeed: number,
  write: WriteResult | null,
): ReplaceOutcome {
  if (write === null) {
    const blocked = replaceBlockedReason(session, isOwner);
    if (blocked !== null) return { kind: "blocked", session, effects: [{ kind: "toast", text: blocked }] };
    if (session.temporary !== null) {
      const next = { ...session, seed: newSeed };
      return {
        kind: "replace_without_write",
        session: next,
        effects: [banner("corrupt", null), { kind: "toast", text: replaceSuccessMessage(next, kind) }],
      };
    }
    return { kind: "commit_then_replace", session, effects: [] };
  }

  const w = planWriteResult({ ...session, seed: newSeed }, write, state);
  if (write.ok) {
    return {
      kind: "replaced",
      session: w.session,
      effects: [...w.effects, banner("corrupt", null), { kind: "toast", text: replaceSuccessMessage(w.session, kind) }],
    };
  }
  // writeErrorMessage("quarantine_failed") parle d'une « nouvelle partie lancée » : faux ici.
  const text = write.error === "quarantine_failed" ? APP_MESSAGES.damagedNotQuarantined : writeErrorMessage(write.error);
  return {
    kind: "write_failed",
    session: { ...w.session, seed: session.seed },
    effects: [...w.effects, { kind: "toast", text }],
    warn: w.warn,
  };
}

// --- Changement de propriétaire du verrou ------------------------------------------------------

export interface OwnerChangeContext {
  session: SaveSession;
  /** État du jeu en cours (écrit tel quel si la sauvegarde est absente ou abîmée à la reprise). */
  state: GameState;
  /** Le bandeau « non propriétaire » est-il affiché (⇒ toast « Partie reprise » à la reprise) ? */
  notOwnerBanner: boolean;
}

export type OwnerChangePlan =
  /** Verrou perdu : bandeau si la partie est persistante ; l'autosave s'arrête d'elle-même (not_owner). */
  | { kind: "lost"; session: SaveSession; effects: SaveEffect[] }
  /** Verrou obtenu mais partie temporaire / stockage indisponible : bandeau retiré, rien d'autre. */
  | { kind: "acquired_not_persistent"; session: SaveSession; effects: SaveEffect[] }
  /**
   * Reprise : sauvegarde rechargée ⇒ `replaceState(state)` (partie locale abandonnée). `storage` : slots
   * abîmés à mettre en quarantaine (l'échec n'empêche pas la reprise, il suspend l'autosave).
   */
  | {
      kind: "resume";
      state: GameState;
      seed: number;
      session: SaveSession;
      effects: SaveEffect[];
      storage: StorageSteps | null;
    }
  /** Aucune sauvegarde (ou toutes abîmées) : on garde la partie en cours et on l'écrit (après quarantaine). */
  | { kind: "commit_current"; session: SaveSession; effects: SaveEffect[]; storage: StorageSteps }
  /** Une sauvegarde de version future est apparue : partie temporaire, verrou rendu. */
  | { kind: "enter_future"; session: SaveSession; effects: SaveEffect[] }
  /** Stockage devenu illisible : plus de sauvegarde, verrou rendu. */
  | { kind: "enter_unavailable"; session: SaveSession; effects: SaveEffect[] };

/** Faut-il appeler `loadGame` avant `planOwnerChange` ? (sinon passer null). */
export function ownerChangeNeedsLoad(isOwner: boolean, session: SaveSession): boolean {
  return isOwner && isPersistent(session);
}

/**
 * Décision quand le verrou change de propriétaire APRÈS le démarrage (`lock.onChange`). `load` : résultat
 * de `loadGame` si `ownerChangeNeedsLoad` (null sinon ; null quand il le fallait ⇒ stockage indisponible).
 */
export function planOwnerChange(isOwner: boolean, load: LoadResult | null, current: OwnerChangeContext): OwnerChangePlan {
  const { session } = current;
  const effects: SaveEffect[] = [{ kind: "notifyPersistence" }];
  if (!isOwner) {
    if (isPersistent(session)) effects.push(banner("notOwner", SAVE_MESSAGES.notOwner));
    return { kind: "lost", session, effects };
  }

  effects.push(banner("notOwner", null));
  if (!isPersistent(session)) return { kind: "acquired_not_persistent", session, effects };

  const res: LoadResult = load ?? { kind: "unavailable", error: "unavailable" };
  switch (res.kind) {
    case "loaded": {
      if (current.notOwnerBanner) effects.push({ kind: "toast", text: SAVE_MESSAGES.resumed });
      return {
        kind: "resume",
        state: res.state,
        seed: res.seed,
        session: { ...session, seed: res.seed, lastSaved: res.state },
        effects,
        storage:
          res.damaged.length > 0
            ? {
                quarantine: res.damaged,
                quarantineFailMessage: APP_MESSAGES.damagedNotQuarantined,
                commitFresh: null,
                effectsAfter: [],
              }
            : null,
      };
    }
    case "fresh":
      return {
        kind: "commit_current",
        session,
        effects,
        storage: { quarantine: [], quarantineFailMessage: "", commitFresh: current.state, effectsAfter: [] },
      };
    case "corrupt":
      return {
        kind: "commit_current",
        session,
        effects,
        storage: {
          quarantine: res.damaged,
          quarantineFailMessage: SAVE_MESSAGES.corruptQuarantineFailed,
          commitFresh: current.state,
          effectsAfter: [],
        },
      };
    case "future": {
      const f = enterFuture(session);
      return { kind: "enter_future", session: f.session, effects: [...effects, ...f.effects] };
    }
    case "unavailable": {
      const u = enterUnavailable(session);
      return { kind: "enter_unavailable", session: u.session, effects: [...effects, ...u.effects] };
    }
  }
}
