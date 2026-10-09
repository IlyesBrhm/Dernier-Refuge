// Préférences du joueur côté app (docs/design/ui-polish.md §1.5, §2.2). La validation et le format sont
// dans src/save/prefs.ts ; ici : lecture au démarrage (avant le rendu, pour la qualité), écritures
// regroupées (au plus toutes les 300 ms, + flush à pagehide / onglet caché), synchronisation multi-onglets
// (`storage` sur PREFS_KEY : dernier écrit gagne), mouvement réduit effectif écouté en direct et posé sur
// <html data-motion="reduce|full">. Aucune préférence n'influence le gameplay.

import {
  createLocalStorageAdapter,
  defaultQuality,
  effectiveReducedMotion,
  loadPrefs,
  parsePrefs,
  PREFS_KEY,
  savePrefs,
  type Prefs,
  type Quality,
  type StorageAdapter,
} from "../save/index";

export type { Prefs, Quality };

export type PrefsPatch = Partial<Omit<Prefs, "version">>;

export interface PrefsController {
  get(): Readonly<Prefs>;
  /** Applique un patch (valeurs revalidées) et programme l'écriture. Aucun effet si rien ne change. */
  update(patch: PrefsPatch): void;
  /** Appelé à chaque changement (local, autre onglet, réglage système du mouvement réduit). */
  subscribe(fn: (p: Readonly<Prefs>) => void): () => void;
  /** Mouvement réduit effectif : `on` ∨ (`system` ∧ prefers-reduced-motion). */
  reducedMotion(): boolean;
  /** Qualité effective : choix explicite, sinon défaut de l'appareil. */
  quality(): Quality;
  /** Écrit tout de suite une écriture en attente. */
  flush(): void;
}

const WRITE_DELAY_MS = 300;

function samePrefs(a: Prefs, b: Prefs): boolean {
  return (
    a.quality === b.quality &&
    a.fullscreen === b.fullscreen &&
    a.muted === b.muted &&
    a.sfxVolume === b.sfxVolume &&
    a.ambienceVolume === b.ambienceVolume &&
    a.reducedMotion === b.reducedMotion &&
    a.tutorial.status === b.tutorial.status &&
    a.tutorial.done === b.tutorial.done
  );
}

/** Revalide un objet (mêmes règles que la lecture du stockage) : jamais de valeur hors bornes en mémoire. */
function sanitize(p: Prefs): Prefs {
  return parsePrefs(JSON.stringify(p)).prefs;
}

export function createPrefsController(win: Window, coarsePointer: boolean): PrefsController {
  const storage: StorageAdapter = createLocalStorageAdapter(win);
  const loaded = loadPrefs(storage);
  if (import.meta.env.DEV && loaded.status !== "ok" && loaded.status !== "missing") {
    console.warn(`[prefs] préférences ${loaded.status === "invalid" ? "illisibles : défauts" : "réparées"}`);
  }
  let prefs: Prefs = loaded.prefs;
  const listeners = new Set<(p: Readonly<Prefs>) => void>();
  let timer: number | null = null;
  let lastWriteAt = -Infinity;

  const mq = typeof win.matchMedia === "function" ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduced = (): boolean => effectiveReducedMotion(prefs.reducedMotion, mq?.matches ?? false);

  function applyMotionAttr(): void {
    const value = reduced() ? "reduce" : "full";
    const root = win.document.documentElement;
    if (root.dataset.motion !== value) root.dataset.motion = value;
  }

  function emit(): void {
    applyMotionAttr();
    for (const fn of Array.from(listeners)) {
      try {
        fn(prefs);
      } catch (e) {
        console.error("[prefs] abonné en échec", e);
      }
    }
  }

  function write(): void {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    lastWriteAt = win.performance.now();
    if (!savePrefs(storage, prefs) && import.meta.env.DEV) console.warn("[prefs] écriture refusée (ignorée)");
  }

  function schedule(): void {
    if (timer !== null) return;
    const wait = Math.max(0, WRITE_DELAY_MS - (win.performance.now() - lastWriteAt));
    timer = win.setTimeout(write, wait);
  }

  win.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== PREFS_KEY && e.key !== null) return;
    const next = loadPrefs(storage).prefs;
    if (samePrefs(next, prefs)) return;
    prefs = next;
    emit();
  });
  mq?.addEventListener?.("change", () => emit());
  win.addEventListener("pagehide", () => {
    if (timer !== null) write();
  });
  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "hidden" && timer !== null) write();
  });

  applyMotionAttr();

  return {
    get: () => prefs,
    update(patch): void {
      const next = sanitize({
        ...prefs,
        ...patch,
        version: 1,
        tutorial: patch.tutorial ? { ...patch.tutorial } : { ...prefs.tutorial },
      });
      if (samePrefs(next, prefs)) return;
      prefs = next;
      schedule();
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reducedMotion: reduced,
    quality: () => prefs.quality ?? defaultQuality(coarsePointer),
    flush(): void {
      if (timer !== null) write();
    },
  };
}
