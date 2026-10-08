// Règles pures de la récolte (docs/design/harvest.md §1, §3). Aucun RNG, aucune mutation.

import { HARVEST, NODES, WORLD, type NodeKind } from "../data/balance";
import { tileOf } from "./map";
import type { GameState, ResourceNode } from "./state";

const U = WORLD.unitsPerTile;

/** Distance de Chebyshev en tuiles entre la tuile du joueur et celle du nœud ≤ HARVEST.rangeTiles. */
export function isNodeInRange(state: Readonly<GameState>, node: Readonly<ResourceNode>): boolean {
  const here = tileOf(state.player.pos);
  const d = Math.max(Math.abs(here.tx - node.tile.tx), Math.abs(here.ty - node.tile.ty));
  return d <= HARVEST.rangeTiles;
}

/** Nœuds prêts (`ready`) à portée du joueur, dans l'ordre de `state.nodes` (ids croissants). */
export function nodesInRange(state: Readonly<GameState>): ResourceNode[] {
  return state.nodes.filter((n) => n.status === "ready" && isNodeInRange(state, n));
}

/**
 * Cible unique de récolte : nœud prêt à portée dont le centre est le plus proche du centre du joueur
 * (distance euclidienne au carré, entière) ; égalité ⇒ plus petit id. Aucun ⇒ null.
 */
export function findHarvestTarget(state: Readonly<GameState>): ResourceNode | null {
  // Appelé à chaque tick (et par le rendu) : aucune allocation (ni filter, ni objet temporaire).
  const px = state.player.pos.x;
  const py = state.player.pos.y;
  const ptx = Math.floor(px / U);
  const pty = Math.floor(py / U);
  const range = HARVEST.rangeTiles;
  const nodes = state.nodes;
  let best: ResourceNode | null = null;
  let bestD = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n === undefined || n.status !== "ready") continue;
    const tx = n.tile.tx;
    const ty = n.tile.ty;
    if (Math.max(Math.abs(ptx - tx), Math.abs(pty - ty)) > range) continue; // = isNodeInRange
    // Centre ×2 pour rester entier quel que soit U : 2·(tx·U + U/2) − 2·px. L'ordre des distances
    // (×4) est identique à celui calculé avec tileCenter.
    const dx = 2 * tx * U + U - 2 * px;
    const dy = 2 * ty * U + U - 2 * py;
    const d = dx * dx + dy * dy;
    if (best === null || d < bestD || (d === bestD && n.id < best.id)) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/**
 * Délai de repousse (ticks, entier ≥ 1) d'un nœud qui vient d'être épuisé.
 * Point d'extension saisons : dérivera plus tard la saison de `state.tick`.
 */
export function regrowDelay(_state: Readonly<GameState>, kind: NodeKind): number {
  return NODES[kind].regrowTicks;
}

/** Borne supérieure de `regrowDelay` sur toutes les situations (sert aux invariants). */
export function maxRegrowDelay(kind: NodeKind): number {
  return NODES[kind].regrowTicks;
}
