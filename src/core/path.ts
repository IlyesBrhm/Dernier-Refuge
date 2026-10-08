// BFS 4-voisins déterministe (ordre fixe N, E, S, W) sur les tuiles non-obstacles.

import { isWalkable, sameTile } from "./map";
import type { MapState, TilePos } from "./state";

const DIRS: readonly (readonly [number, number])[] = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

/**
 * Chemin le plus court de `from` vers `to`, sans la tuile de départ, avec la tuile d'arrivée.
 * `from === to` ⇒ []. Inatteignable, hors carte ou obstacle ⇒ null.
 */
export function findPath(map: MapState, from: TilePos, to: TilePos): TilePos[] | null {
  if (!isWalkable(map, from) || !isWalkable(map, to)) return null;
  if (sameTile(from, to)) return [];
  const w = map.width;
  const prev = new Array<number>(w * map.height).fill(-1);
  const start = from.ty * w + from.tx;
  const goal = to.ty * w + to.tx;
  prev[start] = start;
  const queue: number[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    if (cur === goal) break;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy] of DIRS) {
      const n = { tx: cx + dx, ty: cy + dy };
      if (!isWalkable(map, n)) continue;
      const ni = n.ty * w + n.tx;
      if (prev[ni] !== -1) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -1) return null;
  const path: TilePos[] = [];
  for (let i = goal; i !== start; i = prev[i]!) {
    const tx = i % w;
    path.push({ tx, ty: (i - tx) / w });
  }
  return path.reverse();
}
