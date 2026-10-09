// Câblage de la sauvegarde (docs/design/save.md §1, §4). Toutes les décisions (démarrage, autosave,
// import / nouvelle partie, reprise du verrou) sont des fonctions pures de src/save/boot.ts : ici on ne
// fait que brancher le navigateur autour (localStorage, verrou multi-onglets, horloge réelle, timers,
// événements de page, fichiers) et exécuter les effets renvoyés (bandeaux, toasts, verrou rendu).
//
// Autosave : toutes les `autosaveIntervalMs`, à `visibilitychange` (hidden) et à `pagehide` (puis le verrou
// est rendu). Pas de `beforeunload` (casse le bfcache ; plan §1.1). JS étant mono-thread et les ticks
// exécutés dans onFrame, chaque gestionnaire lit un état ENTRE DEUX TICKS. `busy` ne sert qu'à ignorer un
// double-clic sur import / nouvelle partie : il n'empêche pas l'autosave.

import { clockInfo, type GameState } from "../core/index";
import {
  APP_MESSAGES,
  bootUsesStorage,
  commitFresh,
  createLeaseLock,
  createLocalStorageAdapter,
  createWebLock,
  damagedExportFileName,
  exportFileName,
  exportSave,
  importErrorMessage,
  importSave,
  initialSession,
  isPersistent,
  listQuarantine,
  loadGame,
  newGame as createNewGame,
  ownerChangeNeedsLoad,
  planAutosave,
  planBoot,
  planOwnerChange,
  planReplaceResult,
  planWriteResult,
  quarantine,
  replaceBlockedReason as blockedReason,
  runStorageSteps,
  SAVE_CONFIG,
  SAVE_KEYS,
  SAVE_MESSAGES,
  writeSave,
  type LoadResult,
  type LockManagerLike,
  type ReplaceKind,
  type SaveEffect,
  type SaveLock,
  type SaveSession,
  type StorageAdapter,
  type StorageIo,
  type StorageSteps,
  type WriteOutcome,
  type WriteResult,
} from "../save/index";
import { downloadText } from "../ui/download";
import type { Notices } from "../ui/notify";
import type { Game } from "./game";
import { randomSeed, readSeedParam } from "./seed";

/** Origine d'un remplacement d'état fait par la sauvegarde (hors démarrage). */
export type ReplaceOrigin = "import" | "newGame" | "ownerResume";

export interface SaveControllerUi {
  game: Game;
  /** Confirmation affichée par l'interface (src/ui/dialog). */
  confirm(message: string, confirmLabel: string): Promise<boolean>;
  /** La possibilité de remplacer la partie (import / nouvelle partie) a pu changer : relire `replaceBlockedReason`. */
  onPersistenceChange(): void;
  /** L'état de la partie vient d'être remplacé (import, nouvelle partie, reprise du verrou). */
  onReplaced?(origin: ReplaceOrigin): void;
}

/** « Continuer » de l'écran titre (ui-polish.md §1.3). */
export interface ContinueInfo {
  day: number;
  night: boolean;
  /** Onglet non propriétaire de la sauvegarde : la partie ne sera pas sauvegardée. */
  readOnly: boolean;
}

export interface SaveController {
  /** État de départ choisi au démarrage (chargé ou nouvelle partie). */
  readonly initialState: GameState;
  /** Branche la partie démarrée : autosave, événements de page, reprise du verrou. */
  attach(ui: SaveControllerUi): void;
  exportCurrent(): void;
  /** true ⇔ partie remplacée. */
  importFile(file: File): Promise<boolean>;
  /** true ⇔ partie remplacée (confirmation acceptée et écriture réussie, ou partie temporaire). */
  newGame(): Promise<boolean>;
  exportDamaged(): void;
  hasDamaged(): boolean;
  /** Raison pour laquelle import / nouvelle partie sont désactivés (null = autorisés), cf. src/save/boot.ts. */
  replaceBlockedReason(): string | null;
  /** Autosave immédiate (retour à l'écran titre). Sautée si l'état n'a pas changé ou si non propriétaire. */
  flush(): void;
  /** La partie a été jouée dans cette session (premier `play`) : « Continuer » devient possible. */
  markPlayed(): void;
  /** null ⇔ pas de « Continuer » (partie jamais jouée : sauvegarde au tick 0, absente, abîmée, temporaire). */
  continueInfo(): ContinueInfo | null;
  bootKind(): "load" | "new" | "temporary";
}

// --- Verrou multi-onglets ------------------------------------------------------------------------

interface TabLock {
  lock: SaveLock;
  /** Première tentative ; true = propriétaire. */
  start(): Promise<boolean>;
  dispose(): void;
}

function newTabId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `tab-${randomSeed().toString(16)}-${randomSeed().toString(16)}`;
}

function createTabLock(win: Window, storage: StorageAdapter, onChange: (owner: boolean) => void): TabLock {
  const locks = (win.navigator as unknown as { locks?: LockManagerLike }).locks;
  if (locks && typeof locks.request === "function") {
    try {
      const web = createWebLock(locks);
      web.onChange(onChange);
      return { lock: web, start: () => web.ready, dispose: () => web.release() };
    } catch {
      // Web Locks présent mais refusé (contexte non sécurisé…) : bail en stockage.
    }
  }

  const lease = createLeaseLock({ storage, tabId: newTabId(), now: () => Date.now() });
  lease.onChange(onChange);
  let timer: number | null = null;
  // Un autre onglet a modifié / rendu le bail : on réagit tout de suite (sans attendre le heartbeat).
  const onStorage = (e: StorageEvent): void => {
    if (e.key === SAVE_KEYS.lock || e.key === null) lease.heartbeat();
  };
  return {
    lock: lease,
    start(): Promise<boolean> {
      win.addEventListener("storage", onStorage);
      timer = win.setInterval(() => lease.heartbeat(), SAVE_CONFIG.lockHeartbeatMs);
      return Promise.resolve(lease.tryAcquire());
    },
    dispose(): void {
      if (timer !== null) win.clearInterval(timer);
      timer = null;
      win.removeEventListener("storage", onStorage);
      lease.release();
    },
  };
}

// --- Contrôleur -------------------------------------------------------------------------------

export async function bootSave(win: Window, notices: Notices): Promise<SaveController> {
  const storage: StorageAdapter = createLocalStorageAdapter(win);
  let session: SaveSession = initialSession();
  /** Import / nouvelle partie en cours : garde anti double-clic uniquement (n'empêche pas l'autosave). */
  let busy = false;
  let attached = false;
  let tabLock: TabLock | null = null;
  let lockGen = 0;
  let booted = false;
  let ui: SaveControllerUi | null = null;
  /** La partie a été lancée au moins une fois (bouton Continuer / Nouvelle partie) dans cette session. */
  let played = false;
  /** L'état courant vient d'une sauvegarde lue (démarrage ou reprise du verrou). */
  let loadedFromSave = false;

  const isOwner = (): boolean => tabLock?.lock.isOwner() ?? false;
  const now = (): number => Math.max(0, Math.floor(Date.now()));
  const notOwnerResult: WriteResult = { ok: false, error: "not_owner", details: ["aucun verrou"] };

  function notifyPersistence(): void {
    ui?.onPersistenceChange();
  }

  function apply(effects: readonly SaveEffect[]): void {
    for (const e of effects) {
      switch (e.kind) {
        case "banner":
          notices.setBanner(e.key, e.text, { dismissible: e.dismissible });
          break;
        case "toast":
          notices.toast(e.text);
          break;
        case "releaseLock":
          releaseLock();
          break;
        case "notifyPersistence":
          notifyPersistence();
          break;
      }
    }
  }

  function warnWrite(warn: WriteOutcome["warn"]): void {
    if (import.meta.env.DEV && warn) console.warn(`[save] écriture refusée : ${warn.error}`, warn.details);
  }

  function writeBoth(state: GameState, seed: number): WriteResult {
    if (!tabLock) return notOwnerResult;
    return commitFresh(storage, state, { seed, savedAt: now() }, tabLock.lock);
  }

  const io: StorageIo = {
    quarantine: (damaged) => quarantine(storage, damaged, now()),
    commitFresh: writeBoth,
  };

  function runSteps(steps: StorageSteps): void {
    const out = runStorageSteps(session, steps, io);
    session = out.session;
    warnWrite(out.warn);
    apply(out.effects);
  }

  // --- Verrou ---

  function releaseLock(): void {
    lockGen++;
    tabLock?.dispose();
    tabLock = null;
    notifyPersistence();
  }

  async function acquireLock(): Promise<boolean> {
    releaseLock();
    const gen = ++lockGen;
    const handle = createTabLock(win, storage, (owner) => {
      if (gen === lockGen) onOwnerChange(owner);
    });
    tabLock = handle;
    let owner = false;
    try {
      owner = await handle.start();
    } catch {
      owner = false;
    }
    if (gen !== lockGen) return false;
    // Au démarrage, le bandeau « non propriétaire » vient de planBoot ; ensuite (retour du bfcache), du plan
    // « verrou perdu ».
    if (!owner) onOwnerChange(false);
    notifyPersistence();
    return owner;
  }

  function onOwnerChange(owner: boolean): void {
    if (!booted || !ui) return;
    const load = ownerChangeNeedsLoad(owner, session) ? loadGame(storage) : null;
    const plan = planOwnerChange(owner, load, {
      session,
      state: ui.game.state,
      notOwnerBanner: notices.hasBanner("notOwner"),
    });
    session = plan.session;
    apply(plan.effects);
    if (plan.kind === "resume") {
      ui.game.replaceState(plan.state);
      loadedFromSave = true;
    }
    if ((plan.kind === "resume" || plan.kind === "commit_current") && plan.storage) runSteps(plan.storage);
    if (plan.kind === "resume") ui.onReplaced?.("ownerResume");
  }

  // --- Écriture ---

  function autosave(): void {
    if (!ui) return;
    const state = ui.game.state;
    const decision = planAutosave(session, { attached, isOwner: isOwner(), state });
    if (decision.kind !== "write" || !tabLock) return;
    const r = writeSave(storage, state, { seed: session.seed, savedAt: now() }, tabLock.lock);
    const w = planWriteResult(session, r, state);
    session = w.session;
    warnWrite(w.warn);
    apply(w.effects);
  }

  /** Remplace la partie (import / nouvelle partie confirmés) ; hors `?seed=`, seulement après écriture réussie. */
  function replaceGame(kind: ReplaceKind, state: GameState, newSeed: number): boolean {
    if (!ui) return false;
    let out = planReplaceResult(session, isOwner(), kind, state, newSeed, null);
    if (out.kind === "commit_then_replace") {
      out = planReplaceResult(session, isOwner(), kind, state, newSeed, writeBoth(state, newSeed));
    }
    session = out.session;
    if (out.kind === "write_failed") warnWrite(out.warn);
    const replaced = out.kind === "replaced" || out.kind === "replace_without_write";
    if (replaced) ui.game.replaceState(state);
    apply(out.effects);
    if (replaced) ui.onReplaced?.(kind);
    return replaced;
  }

  /** Vérifications communes avant import / nouvelle partie. false ⇒ ne rien faire. */
  function canStartReplace(): boolean {
    if (!ui || busy) return false;
    const blocked = blockedReason(session, isOwner());
    if (blocked !== null) notices.toast(blocked, { kind: "warning", key: "blocked" });
    return blocked === null;
  }

  // --- Démarrage ---

  const seedParam = readSeedParam(win.location.search);
  let bootOwner = false;
  let load: LoadResult | null = null;
  if (bootUsesStorage(seedParam)) {
    bootOwner = await acquireLock();
    load = loadGame(storage);
  }
  const plan = planBoot(load, { seedParam, isOwner: bootOwner, randomSeed: randomSeed() });
  session = plan.session;
  if (import.meta.env.DEV && plan.devWarning !== null) console.warn(`[save] ${plan.devWarning}`);
  apply(plan.effects);
  if (plan.storage) runSteps(plan.storage);
  loadedFromSave = plan.game.kind === "load";
  booted = true;

  return {
    initialState: plan.game.state,

    attach(next): void {
      ui = next;
      notifyPersistence();
      // Idempotent : un second appel ne fait que changer d'UI, sans doubler timers ni écouteurs.
      if (attached) return;
      attached = true;
      win.setInterval(autosave, SAVE_CONFIG.autosaveIntervalMs);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") autosave();
      });
      win.addEventListener("pagehide", () => {
        autosave();
        if (tabLock) releaseLock();
      });
      // Retour depuis le bfcache : le verrou a été rendu à pagehide ⇒ on le redemande. S'il est obtenu,
      // onOwnerChange(true) recharge la sauvegarde (un autre onglet a pu jouer entre-temps).
      win.addEventListener("pageshow", (e) => {
        if (e.persisted && isPersistent(session) && tabLock === null) void acquireLock();
      });
    },

    exportCurrent(): void {
      if (!ui) return;
      const state = ui.game.state;
      const r = exportSave(state, { seed: session.seed, savedAt: now() });
      if (!r.ok) {
        if (import.meta.env.DEV) console.warn(`[save] export refusé : ${r.error}`, r.details);
        notices.toast(APP_MESSAGES.exportFailed, { kind: "warning", key: "export" });
        return;
      }
      if (!downloadText(exportFileName(state), r.text)) notices.toast(APP_MESSAGES.exportFailed, { kind: "warning", key: "export" });
    },

    async importFile(file): Promise<boolean> {
      if (!canStartReplace() || !ui) return false;
      // Taille vérifiée AVANT toute lecture du fichier.
      if (file.size > SAVE_CONFIG.maxImportBytes) {
        notices.toast(SAVE_MESSAGES.importTooLarge, { kind: "warning", key: "import" });
        return false;
      }
      busy = true;
      try {
        let text: string;
        try {
          text = await file.text();
        } catch {
          notices.toast(SAVE_MESSAGES.importUnreadable, { kind: "warning", key: "import" });
          return false;
        }
        const res = importSave(text);
        if (!res.ok) {
          if (import.meta.env.DEV) console.warn(`[save] import refusé : ${res.error}`, res.details);
          notices.toast(importErrorMessage(res.error), { kind: "warning", key: "import" });
          return false;
        }
        if (!(await ui.confirm(SAVE_MESSAGES.confirmImport, APP_MESSAGES.importConfirmLabel))) return false;
        return replaceGame("import", res.state, res.seed);
      } finally {
        busy = false;
      }
    },

    async newGame(): Promise<boolean> {
      if (!canStartReplace() || !ui) return false;
      busy = true;
      try {
        if (!(await ui.confirm(SAVE_MESSAGES.confirmNewGame, APP_MESSAGES.newGameConfirmLabel))) return false;
        const s = randomSeed();
        return replaceGame("newGame", createNewGame(s).state, s);
      } finally {
        busy = false;
      }
    },

    flush(): void {
      autosave();
    },

    markPlayed(): void {
      played = true;
    },

    continueInfo(): ContinueInfo | null {
      const state = ui?.game.state ?? plan.game.state;
      if (!(played || (loadedFromSave && state.tick > 0))) return null;
      const c = clockInfo(state);
      return { day: c.day, night: c.phase === "night", readOnly: isPersistent(session) && !isOwner() };
    },

    bootKind: () => plan.game.kind,

    exportDamaged(): void {
      if (session.pendingDamaged.length > 0) {
        const text = JSON.stringify({
          quarantinedAt: null,
          reports: session.pendingDamaged.map((r) => ({ slot: r.slot, error: r.error, raw: r.raw })),
        });
        if (!downloadText(damagedExportFileName(), text)) notices.toast(APP_MESSAGES.exportFailed, { kind: "warning", key: "export" });
        return;
      }
      const latest = session.storageOk ? listQuarantine(storage)[0] : undefined;
      if (!latest) {
        notices.toast(APP_MESSAGES.nothingDamaged);
        return;
      }
      if (!downloadText(damagedExportFileName(latest.quarantinedAt), latest.text)) {
        notices.toast(APP_MESSAGES.exportFailed, { kind: "warning", key: "export" });
      }
    },

    hasDamaged(): boolean {
      return session.pendingDamaged.length > 0 || (session.storageOk && listQuarantine(storage).length > 0);
    },

    replaceBlockedReason: () => blockedReason(session, isOwner()),
  };
}
