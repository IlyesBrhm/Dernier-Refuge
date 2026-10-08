// Remise en état : joueur sur une tente en désordre ⇒ +1/tick. Progression conservée si le joueur part.

import { TENT } from "../../data/balance";
import { sameTile, tileOf } from "../map";
import type { GameState } from "../state";
import { pure } from "./helpers";

export function mutateCleaning(draft: GameState): void {
  const here = tileOf(draft.player.pos);
  for (const tent of draft.tents) {
    if (tent.status !== "messy" || !sameTile(tent.tile, here)) continue;
    tent.cleanProgress = Math.min(TENT.cleanTicks, tent.cleanProgress + 1);
    if (tent.cleanProgress >= TENT.cleanTicks) {
      tent.status = "free";
      tent.cleanProgress = 0;
    }
  }
}

export const cleaningSystem = pure(mutateCleaning);
