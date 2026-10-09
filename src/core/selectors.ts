// Sélecteurs en lecture seule pour render/ui.

import { FIRE, NODES, RESOURCES } from "../data/balance";
import { findHarvestTarget, maxRegrowDelay } from "./harvest-rules";
import { isWalkable, sameTile, tileOf } from "./map";
import type { BuildSlot, Drop, GameState, MapState, ResourceId, ResourceNode, TilePos } from "./state";
import { isInFeedZone, isStoppedInFeedZone } from "./systems/fire";
import {
  isWelcomeBlockedByCold,
  welcomeBlockReason as welcomeBlockReasonOf,
  type WelcomeBlockReason,
} from "./systems/welcome";
import { cyclePos, dayIndex, isNight, lightPhase, phase, type DayPhase, type LightPhase } from "./time";

export * from "./time";
export { DAWN_REWARD } from "./systems/survivorLifecycle";
export { COLD_REWARD } from "./systems/cold";
export type { WelcomeBlockReason } from "./systems/welcome";

export function playerTile(state: GameState): TilePos {
  return tileOf(state.player.pos);
}

export function freeTentCount(state: GameState): number {
  return state.tents.filter((t) => t.status === "free").length;
}

export function queueLength(state: GameState): number {
  return state.queue.length;
}

export function slotRemaining(slot: BuildSlot): number {
  return Math.max(0, slot.cost - slot.paid);
}

export function isPlayerOn(state: GameState, tile: TilePos): boolean {
  return sameTile(playerTile(state), tile);
}

/** Nœud que le joueur récolte en ce moment (celui qui progressera au prochain tick), ou null. */
export function harvestTarget(state: GameState): ResourceNode | null {
  return findHarvestTarget(state);
}

/** Avancement de la récolte d'un nœud, dans [0, 1[. */
export function nodeHarvestRatio(node: ResourceNode): number {
  return node.progress / NODES[node.kind].harvestTicks;
}

/** Avancement de la repousse : 0 juste après épuisement (délai max), 1 si prêt. */
export function nodeRegrowRatio(node: ResourceNode): number {
  if (node.status === "ready") return 1;
  return Math.min(1, Math.max(0, 1 - node.regrowTicksLeft / maxRegrowDelay(node.kind)));
}

/**
 * Stock de `resource` plein (≥ RESOURCES.cap) : les drops de cette ressource ne sont plus aimantés
 * ni ramassés (cf. systems/pickup.ts). Le rendu doit s'en servir au lieu de le déduire des drops.
 */
export function isStockFull(state: GameState, resource: ResourceId): boolean {
  return state.resources[resource] >= RESOURCES.cap;
}

/** Drops posés sur une tuile (au plus un par ressource). */
export function dropsAt(state: GameState, tile: TilePos): Drop[] {
  return state.drops.filter((d) => sameTile(tileOf(d.pos), tile));
}

// ---------------------------------------------------------------------------
// Jour/nuit, feu de camp, sommeil (docs/design/day-night.md §3.3).
// ---------------------------------------------------------------------------

/** Horloge pour le HUD et le rendu (tout est dérivé du tick). */
export interface ClockInfo {
  /** Numéro de jour affiché, base 1 (« Jour N »). */
  day: number;
  /** Position dans le cycle, [0, CYCLE_TICKS). */
  cyclePos: number;
  /** Phase de jeu (règles). */
  phase: DayPhase;
  /** Sous-phase visuelle et son avancement dans [0, 1). */
  light: LightPhase;
  lightProgress: number;
}

export function clockInfo(state: GameState): ClockInfo {
  const lp = lightPhase(state.tick);
  return {
    day: dayIndex(state.tick) + 1,
    cyclePos: cyclePos(state.tick),
    phase: phase(state.tick),
    light: lp.phase,
    lightProgress: lp.progress,
  };
}

/** Remplissage du feu dans [0, 1]. */
export function fireRatio(state: GameState): number {
  return Math.min(1, Math.max(0, state.fire.wood / FIRE.capacity));
}

export function isFireLit(state: GameState): boolean {
  return state.fire.wood > 0;
}

/** « Le feu faiblit » : nuit ∧ 0 < wood ≤ FIRE.lowWood (feu éteint : voir isFireOutAtNight). */
export function isFireLow(state: GameState): boolean {
  return isNight(state.tick) && state.fire.wood > 0 && state.fire.wood <= FIRE.lowWood;
}

/** « Le feu est éteint » : nuit ∧ wood = 0 (les dormeurs partent, l'accueil est suspendu). */
export function isFireOutAtNight(state: GameState): boolean {
  return isNight(state.tick) && state.fire.wood === 0;
}

/** Tuiles praticables depuis lesquelles le joueur alimente le feu (Chebyshev ≤ feedRangeTiles). */
export function feedZone(map: MapState): TilePos[] {
  const out: TilePos[] = [];
  const f = map.fire;
  for (let ty = f.ty - FIRE.feedRangeTiles; ty <= f.ty + FIRE.feedRangeTiles; ty++) {
    for (let tx = f.tx - FIRE.feedRangeTiles; tx <= f.tx + FIRE.feedRangeTiles; tx++) {
      const t = { tx, ty };
      if (isInFeedZone(f, t) && isWalkable(map, t)) out.push(t);
    }
  }
  return out;
}

/**
 * Le joueur verse du bois : arrêté dans la zone d'alimentation depuis FIRE.feedDelayTicks ticks,
 * feu non plein et bois en stock. Passer devant le feu sans s'arrêter ⇒ false.
 */
export function isFeedingFire(state: GameState): boolean {
  return (
    state.fire.feedProgress >= FIRE.feedDelayTicks &&
    isStoppedInFeedZone(state) &&
    state.fire.wood < FIRE.capacity &&
    state.resources.wood > 0
  );
}

/**
 * Avancée du délai d'arrêt avant alimentation, 0..1 (jauge UI, comme l'accueil). 0 si le joueur
 * bouge ou est hors zone (y compris juste après une commande de déplacement, avant le tick).
 */
export function feedProgressRatio(state: GameState): number {
  if (!isStoppedInFeedZone(state) || FIRE.feedDelayTicks <= 0) return 0;
  return Math.min(1, state.fire.feedProgress / FIRE.feedDelayTicks);
}

/**
 * Sélecteur unique pour l'UI : pourquoi l'accueil est fermé, ou null s'il est ouvert.
 * - "coldLeavers" (prioritaire) : nuit ∧ au moins un départ au froid cette nuit ; reste fermé
 *   jusqu'à l'aube même si le feu est rallumé ;
 * - "fireOut" : nuit ∧ feu à 0 (rouvre dès qu'on rallume, s'il n'y a eu aucun départ au froid) ;
 * - null : accueil ouvert (jour, ou nuit avec feu allumé sans départ au froid).
 */
export function welcomeBlockReason(state: GameState): WelcomeBlockReason | null {
  return welcomeBlockReasonOf(state);
}

/** Accueil suspendu la nuit (= welcomeBlockReason(state) !== null). Conservé pour le rendu/HUD. */
export function welcomeBlockedByCold(state: GameState): boolean {
  return isWelcomeBlockedByCold(state);
}

/** Nombre de survivants endormis. */
export function sleepersCount(state: GameState): number {
  return state.survivors.filter((s) => s.status === "sleeping").length;
}

export interface NightReport {
  /** Numéro de la nuit terminée (1 = première nuit). */
  night: number;
  sleepersPaid: number;
  coldLeavers: number;
  woodEarned: number;
  woodBurned: number;
}

/** Bilan de la dernière nuit terminée : le jour, à partir du jour 2 ; sinon null. */
export function nightReport(state: GameState): NightReport | null {
  if (isNight(state.tick)) return null;
  const night = dayIndex(state.tick);
  if (night < 1) return null;
  const n = state.night;
  return {
    night,
    sleepersPaid: n.sleepersPaid,
    coldLeavers: n.coldLeavers,
    woodEarned: n.woodEarned,
    woodBurned: n.woodBurned,
  };
}
