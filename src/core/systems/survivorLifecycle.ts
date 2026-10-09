// Cycle de vie d'un survivant installé (docs/design/core-loop.md, docs/design/day-night.md §1.3) :
// - arrivée à la tente ⇒ repos (jour) ou sommeil (nuit) ;
// - repos : la nuit ⇒ s'endort sans décompter ni payer ; le jour ⇒ décompte, départ payé à 0 ;
// - sommeil : au pas de l'aube (premier tick de jour) ⇒ départ payé R + dawnBonus ;
// - arrivée à l'entrée ⇒ suppression.

import { SLEEP, SURVIVOR } from "../../data/balance";
import type { GameState } from "../state";
import { isNight } from "../time";
import { departSurvivor, pure } from "./helpers";

/** Récompense d'un dormeur payé à l'aube (« nuit au chaud »). */
export const DAWN_REWARD: number = SURVIVOR.woodReward + SLEEP.dawnBonus;

export function mutateSurvivorLifecycle(draft: GameState): void {
  const night = isNight(draft.tick);
  const removed = new Set<number>();
  // survivors triés par id ⇒ paiements de l'aube dans l'ordre des ids.
  for (const s of draft.survivors) {
    if (s.status === "resting") {
      if (night) {
        s.status = "sleeping";
        s.restTicksLeft = 0;
        continue;
      }
      s.restTicksLeft -= 1;
      if (s.restTicksLeft > 0) continue;
      departSurvivor(draft, s, SURVIVOR.woodReward);
    } else if (s.status === "sleeping") {
      if (night) continue;
      // Un dormeur n'existe que la nuit : le premier tick de jour est le pas de l'aube.
      departSurvivor(draft, s, DAWN_REWARD);
      draft.night.sleepersPaid += 1;
      draft.night.woodEarned += DAWN_REWARD;
    } else if (s.status === "walkingToTent" && s.path.length === 0) {
      const tent = draft.tents.find((t) => t.id === s.tentId);
      if (!tent) continue;
      tent.status = "occupied";
      if (night) {
        s.status = "sleeping";
        s.restTicksLeft = 0;
      } else {
        s.status = "resting";
        s.restTicksLeft = SURVIVOR.restTicks;
      }
    } else if (s.status === "leaving" && s.path.length === 0) {
      removed.add(s.id);
    }
  }
  if (removed.size > 0) draft.survivors = draft.survivors.filter((s) => !removed.has(s.id));
}

export const survivorLifecycleSystem = pure(mutateSurvivorLifecycle);
