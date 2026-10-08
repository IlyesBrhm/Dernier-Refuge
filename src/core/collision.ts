// Collision d'une hitbox carrée contre les tuiles obstacles et les bords de carte.
// Hitbox = [x - half, x + half] ; toucher un bord de tuile n'est pas un chevauchement.

import { WORLD } from "../data/balance";
import { isObstacleAt } from "./map";
import type { MapState, Vec } from "./state";

const U = WORLD.unitsPerTile;

/** Indices des tuiles couvertes (chevauchement strict) par [c - half, c + half]. */
function span(c: number, half: number): [number, number] {
  return [Math.floor((c - half) / U), Math.ceil((c + half) / U) - 1];
}

/** La hitbox centrée en (x, y) chevauche-t-elle un obstacle ou sort-elle de la carte ? */
export function hitboxBlocked(map: MapState, x: number, y: number, half: number): boolean {
  if (x - half < 0 || y - half < 0 || x + half > map.width * U || y + half > map.height * U) return true;
  const [tx0, tx1] = span(x, half);
  const [ty0, ty1] = span(y, half);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isObstacleAt(map, tx, ty)) return true;
    }
  }
  return false;
}

/**
 * Déplace sur un axe. Si une rangée de tuiles bloquante est rencontrée, la hitbox se colle
 * contre son bord (les obstacles sont alignés sur la grille, le pas est < 1 tuile).
 */
function moveAxis(map: MapState, pos: Vec, axis: "x" | "y", delta: number, half: number): void {
  if (delta === 0) return;
  const old = pos[axis];
  const other = axis === "x" ? pos.y : pos.x;
  const [o0, o1] = span(other, half);
  // Rangée t (colonne si axis = x, ligne si axis = y) bloquante dans l'étendue de l'autre axe ?
  const lineBlocked = (t: number): boolean => {
    for (let o = o0; o <= o1; o++) {
      if (axis === "x" ? isObstacleAt(map, t, o) : isObstacleAt(map, o, t)) return true;
    }
    return false;
  };
  let next = old + delta;
  if (delta > 0) {
    // Première rangée entièrement devant la hitbox actuelle.
    for (let t = Math.ceil((old + half) / U); t * U < next + half; t++) {
      if (lineBlocked(t)) {
        next = Math.min(next, t * U - half);
        break;
      }
    }
  } else {
    for (let t = Math.floor((old - half) / U) - 1; (t + 1) * U > next - half; t--) {
      if (lineBlocked(t)) {
        next = Math.max(next, (t + 1) * U + half);
        break;
      }
    }
  }
  pos[axis] = next;
}

/** Nouvelle position après déplacement (vx, vy), axe X puis axe Y. Ne mute pas `pos`. */
export function moveWithCollision(map: MapState, pos: Vec, vx: number, vy: number, half: number): Vec {
  const p = { ...pos };
  moveAxis(map, p, "x", vx, half);
  moveAxis(map, p, "y", vy, half);
  return p;
}
