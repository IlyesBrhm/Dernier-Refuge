// Arrivée à la tente ⇒ repos ; fin de repos ⇒ départ + drop de bois + tente en désordre ;
// arrivée à l'entrée ⇒ suppression.

import { SURVIVOR } from "../../data/balance";
import { doorOf } from "../map";
import { findPath } from "../path";
import type { GameState } from "../state";
import { addDrop, pure } from "./helpers";

export function mutateSurvivorLifecycle(draft: GameState): void {
  const removed = new Set<number>();
  for (const s of draft.survivors) {
    if (s.status === "resting") {
      s.restTicksLeft -= 1;
      if (s.restTicksLeft > 0) continue;
      const tent = draft.tents.find((t) => t.id === s.tentId);
      s.restTicksLeft = 0;
      s.tentId = null;
      s.status = "leaving";
      if (!tent) {
        s.path = [];
        continue;
      }
      tent.status = "messy";
      tent.occupantId = null;
      tent.cleanProgress = 0;
      s.path = findPath(draft.map, tent.tile, draft.map.entrance) ?? [];
      addDrop(draft, doorOf(tent.tile), SURVIVOR.woodReward);
    } else if (s.status === "walkingToTent" && s.path.length === 0) {
      const tent = draft.tents.find((t) => t.id === s.tentId);
      if (!tent) continue;
      tent.status = "occupied";
      s.status = "resting";
      s.restTicksLeft = SURVIVOR.restTicks;
    } else if (s.status === "leaving" && s.path.length === 0) {
      removed.add(s.id);
    }
  }
  if (removed.size > 0) draft.survivors = draft.survivors.filter((s) => !removed.has(s.id));
}

export const survivorLifecycleSystem = pure(mutateSurvivorLifecycle);
