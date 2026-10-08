// Ramassage : aimantation des drops proches puis collecte, plafonnée à RESOURCES.cap.
// Aucune ressource n'est détruite : ce qui ne rentre pas reste au sol.

import { PICKUP, RESOURCES } from "../../data/balance";
import { chebyshev, sameTile, tileOf } from "../map";
import type { GameState } from "../state";
import { pure } from "./helpers";

function approach(from: number, to: number, speed: number): number {
  const d = to - from;
  return from + Math.sign(d) * Math.min(Math.abs(d), speed);
}

export function mutatePickup(draft: GameState): void {
  const player = draft.player.pos;
  const removed = new Set<number>();
  for (const drop of draft.drops) {
    if (removed.has(drop.id)) continue;
    if (draft.resources.wood >= RESOURCES.cap) continue; // stock plein : le drop ne bouge plus
    if (chebyshev(drop.pos, player) <= PICKUP.magnetRadius) {
      const next = {
        x: approach(drop.pos.x, player.x, PICKUP.magnetSpeed),
        y: approach(drop.pos.y, player.y, PICKUP.magnetSpeed),
      };
      const nextTile = tileOf(next);
      // Au plus un drop par tuile : un drop qui entre sur la tuile d'un autre fusionne avec lui.
      const other = sameTile(nextTile, tileOf(drop.pos))
        ? undefined
        : draft.drops.find((o) => o.id !== drop.id && !removed.has(o.id) && sameTile(tileOf(o.pos), nextTile));
      if (!other) {
        drop.pos = next;
      } else {
        other.amount += drop.amount;
        removed.add(drop.id);
        continue;
      }
    }
    if (chebyshev(drop.pos, player) <= PICKUP.collectRadius) {
      const take = Math.min(drop.amount, RESOURCES.cap - draft.resources.wood);
      draft.resources.wood += take;
      drop.amount -= take;
      if (drop.amount <= 0) removed.add(drop.id);
    }
  }
  if (removed.size > 0) draft.drops = draft.drops.filter((d) => !removed.has(d.id));
}

export const pickupSystem = pure(mutatePickup);
