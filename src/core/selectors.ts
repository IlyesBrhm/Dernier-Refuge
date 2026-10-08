// Sélecteurs en lecture seule pour render/ui.

import { NODES, RESOURCES } from "../data/balance";
import { findHarvestTarget, maxRegrowDelay } from "./harvest-rules";
import { sameTile, tileOf } from "./map";
import type { BuildSlot, Drop, GameState, ResourceId, ResourceNode, TilePos } from "./state";

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
