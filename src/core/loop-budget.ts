// Budget de ticks d'une frame pour la boucle à pas fixe (utilisé par src/app/loop.ts).
// Pur : l'horloge réelle reste dans src/app, qui ne fait que passer le delta mesuré.

import { LOOP } from "../data/balance";

export interface StepBudget {
  steps: number; // nombre de tick() à exécuter cette frame, 0..LOOP.maxTicksPerFrame
  acc: number; // accumulateur restant, 0 <= acc < LOOP.tickMs
}

function sanitize(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Ajoute le delta de frame (borné à LOOP.maxFrameDeltaMs ; négatif/NaN/Infinity ⇒ 0)
 * à l'accumulateur et calcule le nombre de ticks à jouer. Si le plafond de ticks par frame
 * est atteint, l'excédent est jeté (pas de rattrapage).
 */
export function stepBudget(acc: number, frameDeltaMs: number): StepBudget {
  const delta = Math.min(sanitize(frameDeltaMs), LOOP.maxFrameDeltaMs);
  let a = Math.min(sanitize(acc), LOOP.tickMs * LOOP.maxTicksPerFrame) + delta;
  let steps = Math.floor(a / LOOP.tickMs);
  if (steps >= LOOP.maxTicksPerFrame) {
    steps = LOOP.maxTicksPerFrame;
    a = a % LOOP.tickMs;
  } else {
    a -= steps * LOOP.tickMs;
  }
  return { steps, acc: a };
}
