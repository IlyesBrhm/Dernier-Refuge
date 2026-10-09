// Temps de jeu dérivé du tick (docs/design/day-night.md §1.1, §3.1). Fonctions pures, O(1).
// Aucun champ « heure » dans l'état : tout se déduit de `state.tick`.

import { FIRE, TIME } from "../data/balance";

/** Durée d'un cycle complet jour + nuit, en ticks. */
export const CYCLE_TICKS: number = TIME.dayTicks + TIME.nightTicks;

function validTime(t: number): boolean {
  return typeof t === "number" && Number.isFinite(t) && t >= 0;
}

/**
 * Position dans le cycle, dans [0, CYCLE_TICKS). Accepte un temps réel (interpolation du rendu) ;
 * NaN, infini ou négatif ⇒ 0.
 */
export function cyclePos(tick: number): number {
  if (!validTime(tick)) return 0;
  return tick % CYCLE_TICKS;
}

/** Index du jour, base 0 (le HUD affiche « Jour dayIndex + 1 »). Temps invalide ⇒ 0. */
export function dayIndex(tick: number): number {
  if (!validTime(tick)) return 0;
  return Math.floor(tick / CYCLE_TICKS);
}

export type DayPhase = "day" | "night";

/** Jour ⇔ cyclePos ∈ [0, dayTicks) ; nuit ⇔ cyclePos ∈ [dayTicks, cycle). */
export function isNight(tick: number): boolean {
  return cyclePos(tick) >= TIME.dayTicks;
}

export function phase(tick: number): DayPhase {
  return isNight(tick) ? "night" : "day";
}

/** Pas de l'aube : premier tick d'un jour, hors début de partie (tick > 0, cyclePos = 0). */
export function isDawnTick(tick: number): boolean {
  return validTime(tick) && tick > 0 && cyclePos(tick) === 0;
}

/** Pas du crépuscule : premier tick de la nuit (cyclePos = dayTicks). */
export function isDuskTick(tick: number): boolean {
  return validTime(tick) && cyclePos(tick) === TIME.dayTicks;
}

/** Premier tick de la nuit en cours (à n'appeler que si isNight(tick)). */
export function nightStartTick(tick: number): number {
  return tick - (cyclePos(tick) - TIME.dayTicks);
}

/** Sous-phases visuelles (rendu, HUD) ; aucune règle de jeu ne les lit. */
export type LightPhase = "dawn" | "day" | "dusk" | "night";

/**
 * Sous-phase visuelle et avancement dans [0, 1) : dawn [0, dawnTicks) · day [dawnTicks,
 * dayTicks − duskTicks) · dusk [dayTicks − duskTicks, dayTicks) · night [dayTicks, cycle).
 */
export function lightPhase(tick: number): { phase: LightPhase; progress: number } {
  const p = cyclePos(tick);
  const duskStart = TIME.dayTicks - TIME.duskTicks;
  if (p < TIME.dawnTicks) return { phase: "dawn", progress: p / TIME.dawnTicks };
  if (p < duskStart) return { phase: "day", progress: (p - TIME.dawnTicks) / (duskStart - TIME.dawnTicks) };
  if (p < TIME.dayTicks) return { phase: "dusk", progress: (p - duskStart) / TIME.duskTicks };
  return { phase: "night", progress: (p - TIME.dayTicks) / TIME.nightTicks };
}

/**
 * Le pas qui produit le tick `tick` brûle-t-il du bois (si le feu est allumé) ?
 * Calendrier fixe : jour ∧ tick multiple de dayBurnIntervalTicks, ou nuit ∧ multiple de
 * nightBurnIntervalTicks. Tick non entier ou négatif ⇒ false.
 */
export function isBurnTick(tick: number): boolean {
  if (!Number.isSafeInteger(tick) || tick < 0) return false;
  return isNight(tick) ? tick % FIRE.nightBurnIntervalTicks === 0 : tick % FIRE.dayBurnIntervalTicks === 0;
}

/** Nombre de multiples de `step` dans [0, n) (n ≥ 0). */
function multiplesBelow(n: number, step: number): number {
  return Math.ceil(n / step);
}

/**
 * Ticks de combustion dans [0, r) pour 0 ≤ r ≤ CYCLE_TICKS, en position de cycle. Valable car les
 * intervalles divisent le cycle (et nightBurnIntervalTicks divise dayTicks) : tick mod intervalle
 * = cyclePos mod intervalle (vérifié par tests/core/balance.test.ts).
 */
function burnsInCycleBelow(r: number): number {
  const dayPart = multiplesBelow(Math.min(r, TIME.dayTicks), FIRE.dayBurnIntervalTicks);
  if (r <= TIME.dayTicks) return dayPart;
  const nightPart =
    multiplesBelow(r, FIRE.nightBurnIntervalTicks) - multiplesBelow(TIME.dayTicks, FIRE.nightBurnIntervalTicks);
  return dayPart + nightPart;
}

const BURNS_PER_CYCLE = burnsInCycleBelow(CYCLE_TICKS);

/** Ticks de combustion dans [0, n). */
function burnsBelow(n: number): number {
  if (n <= 0) return 0;
  const q = Math.floor(n / CYCLE_TICKS);
  return q * BURNS_PER_CYCLE + burnsInCycleBelow(n - q * CYCLE_TICKS);
}

/**
 * Nombre de ticks de combustion dans [from, to] (bornes incluses), en O(1).
 * Bornes non entières ⇒ 0 ; from < 0 ramené à 0 ; from > to ⇒ 0.
 */
export function countBurnTicks(from: number, to: number): number {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return 0;
  const a = Math.max(0, from);
  if (to < a) return 0;
  return burnsBelow(to + 1) - burnsBelow(a);
}
