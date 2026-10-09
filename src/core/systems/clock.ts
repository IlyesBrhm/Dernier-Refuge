// Horloge (docs/design/day-night.md §1.6) : au pas du crépuscule, le bilan de la nuit repart à 0.

import { emptyNightStats, type GameState } from "../state";
import { isDuskTick } from "../time";
import { pure } from "./helpers";

export function mutateClock(draft: GameState): void {
  if (isDuskTick(draft.tick)) draft.night = emptyNightStats();
}

export const clockSystem = pure(mutateClock);
