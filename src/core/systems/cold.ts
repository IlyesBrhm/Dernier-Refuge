// Froid (docs/design/day-night.md §1.5) : la nuit, feu à 0 après combustion et alimentation ⇒
// tous les dormeurs partent immédiatement avec une récompense réduite.

import { COLD, SURVIVOR } from "../../data/balance";
import type { GameState } from "../state";
import { isNight } from "../time";
import { departSurvivor, pure } from "./helpers";

/** Récompense d'un dormeur chassé par le froid. */
export const COLD_REWARD: number = Math.floor(SURVIVOR.woodReward / COLD.rewardDivisor);

export function mutateCold(draft: GameState): void {
  if (!isNight(draft.tick) || draft.fire.wood !== 0) return;
  for (const s of draft.survivors) {
    if (s.status !== "sleeping") continue;
    departSurvivor(draft, s, COLD_REWARD);
    draft.night.coldLeavers += 1;
    draft.night.woodEarned += COLD_REWARD;
  }
}

export const coldSystem = pure(mutateCold);
