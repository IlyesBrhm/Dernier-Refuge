// Interpolation d'affichage entre l'état précédent et l'état courant (lecture seule).
// Le résultat est en unités monde flottantes, uniquement pour le dessin : jamais réinjecté dans l'état.

import { chebyshev, type GameState, type Vec } from "../core";
import { WORLD } from "../data/balance";

/** Au-delà de ce saut (en unités) entre deux ticks, on n'interpole pas (téléportation / réapparition). */
const MAX_INTERP_JUMP = WORLD.unitsPerTile;

export function lerpVec(prev: Readonly<Vec> | undefined, curr: Readonly<Vec>, alpha: number): Vec {
  if (!prev || chebyshev(prev, curr) > MAX_INTERP_JUMP) return { x: curr.x, y: curr.y };
  return { x: prev.x + (curr.x - prev.x) * alpha, y: prev.y + (curr.y - prev.y) * alpha };
}

function indexById(list: ReadonlyArray<{ id: number; pos: Vec }>): Map<number, Vec> {
  const m = new Map<number, Vec>();
  for (const e of list) m.set(e.id, e.pos);
  return m;
}

export interface InterpolatedPositions {
  player: Vec;
  survivors: Map<number, Vec>;
  drops: Map<number, Vec>;
}

/** Positions à afficher : lerp(prev, curr, alpha), appariement par id. Nouvelle entité ⇒ position courante. */
export function interpolate(
  prev: Readonly<GameState>,
  curr: Readonly<GameState>,
  alpha: number,
): InterpolatedPositions {
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  const prevSurvivors = indexById(prev.survivors);
  const prevDrops = indexById(prev.drops);
  const survivors = new Map<number, Vec>();
  for (const s of curr.survivors) survivors.set(s.id, lerpVec(prevSurvivors.get(s.id), s.pos, a));
  const drops = new Map<number, Vec>();
  for (const d of curr.drops) drops.set(d.id, lerpVec(prevDrops.get(d.id), d.pos, a));
  return { player: lerpVec(prev.player.pos, curr.player.pos, a), survivors, drops };
}
