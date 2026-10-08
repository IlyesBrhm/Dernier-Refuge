// Pilote requestAnimationFrame : mesure le delta brut entre deux images et le passe à `onFrame`.
// Aucune règle ici : le découpage en ticks (accumulateur, plafonds) est fait par `stepBudget` (core).
// Onglet caché ⇒ pause (plus d'images) ; au retour, le temps de référence est réinitialisé
// pour ne PAS rattraper le temps passé en arrière-plan.

export interface LoopHandle {
  stop(): void;
}

export interface LoopCallbacks {
  /** Appelé à chaque image avec le delta brut mesuré (ms) depuis l'image précédente. */
  onFrame(rawDeltaMs: number): void;
  /** Appelé quand la boucle se met en pause (onglet caché). */
  onPause?(): void;
}

export function startLoop(cb: LoopCallbacks): LoopHandle {
  let rafId: number | null = null;
  let last: number | null = null;
  let stopped = false;

  const frame = (now: number): void => {
    rafId = requestAnimationFrame(frame);
    // Première image après démarrage / reprise : delta nul (pas de rattrapage).
    const delta = last === null ? 0 : now - last;
    last = now;
    cb.onFrame(delta);
  };

  const resume = (): void => {
    if (stopped || rafId !== null) return;
    last = null;
    rafId = requestAnimationFrame(frame);
  };

  const pause = (): void => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    last = null;
    cb.onPause?.();
  };

  const onVisibility = (): void => {
    if (document.hidden) pause();
    else resume();
  };

  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) resume();

  return {
    stop(): void {
      stopped = true;
      pause();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
