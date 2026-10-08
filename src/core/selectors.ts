// Sélecteurs en lecture seule pour render/ui.

import { sameTile, tileOf } from "./map";
import type { BuildSlot, GameState, TilePos } from "./state";

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
