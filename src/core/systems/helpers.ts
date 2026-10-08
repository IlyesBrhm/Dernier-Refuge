// Utilitaires internes aux systèmes. Les fonctions `mutate*` modifient un brouillon déjà cloné.

import { sameTile, tileCenter, tileOf } from "../map";
import { findPath } from "../path";
import { cloneState, type GameState, type Survivor, type TilePos } from "../state";

/** Enveloppe pure : clone l'état puis applique la mutation sur le clone. */
export function pure(mutate: (draft: GameState) => void): (state: GameState) => GameState {
  return (state) => {
    const draft = cloneState(state);
    mutate(draft);
    return draft;
  };
}

export function isAtCenterOf(pos: { x: number; y: number }, tile: TilePos): boolean {
  const c = tileCenter(tile);
  return c.x === pos.x && c.y === pos.y;
}

/**
 * Chemin depuis la position courante d'un survivant : s'il est entre deux tuiles, il termine
 * d'abord son pas en cours (vers path[0]) pour rester sur des trajets axiaux.
 */
export function pathFromSurvivor(state: GameState, s: Survivor, target: TilePos): TilePos[] | null {
  const waypoint = s.path[0];
  if (waypoint && !isAtCenterOf(s.pos, tileOf(s.pos))) {
    const rest = findPath(state.map, waypoint, target);
    return rest === null ? null : [{ ...waypoint }, ...rest];
  }
  return findPath(state.map, tileOf(s.pos), target);
}

/** Recalcule la cible de chaque survivant en file (index i ⇒ queueTiles[i]). */
export function retargetQueue(draft: GameState): void {
  draft.queue.forEach((id, i) => {
    const s = draft.survivors.find((v) => v.id === id);
    const slot = draft.map.queueTiles[i];
    if (!s || !slot) return;
    const path = pathFromSurvivor(draft, s, slot);
    if (path === null) return;
    s.path = path;
    s.status = path.length === 0 ? "queued" : "toQueue";
  });
}

/**
 * Pose `amount` bois au centre de `tile`, fusionné avec un drop existant sur la tuile.
 * Pas de plafond : RESOURCES.cap est une règle de stock, pas de tas au sol (conservation du bois).
 */
export function addDrop(draft: GameState, tile: TilePos, amount: number): void {
  if (amount <= 0) return;
  const existing = draft.drops.find((d) => sameTile(tileOf(d.pos), tile));
  if (existing) {
    existing.amount += amount;
    return;
  }
  draft.drops.push({ id: draft.nextId++, pos: tileCenter(tile), resource: "wood", amount });
}
