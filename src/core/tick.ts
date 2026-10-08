// Avance le temps de jeu. Systèmes dans un ordre FIXE (docs/design/core-loop.md §3).

import { OFFLINE } from "../data/balance";
import { cloneState, type GameState } from "./state";
import { mutateBuild } from "./systems/build";
import { mutateCleaning } from "./systems/cleaning";
import { mutateHarvest } from "./systems/harvest";
import { mutateNodeRegrow } from "./systems/nodeRegrow";
import { mutateMovePlayer } from "./systems/movePlayer";
import { mutatePickup } from "./systems/pickup";
import { mutateSpawn } from "./systems/spawn";
import { mutateSurvivorLifecycle } from "./systems/survivorLifecycle";
import { mutateSurvivorMove } from "./systems/survivorMove";
import { mutateWelcome } from "./systems/welcome";

function stepOnce(draft: GameState): void {
  draft.tick += 1;
  draft.commandsThisTick = 0;
  mutateMovePlayer(draft);
  mutateSpawn(draft);
  mutateSurvivorMove(draft);
  mutateSurvivorLifecycle(draft);
  mutateWelcome(draft);
  mutateCleaning(draft);
  mutateBuild(draft);
  mutateNodeRegrow(draft); // avant la récolte (docs/design/harvest.md §1.8)
  mutateHarvest(draft); // avant le ramassage : le butin est ramassé dans le même tick
  mutatePickup(draft);
}

/**
 * Avance de `dtTicks` ticks (défaut 1). Ne mute jamais `state`.
 * `dtTicks` non entier, négatif, NaN ou nul ⇒ état renvoyé tel quel.
 * `dtTicks` est borné à OFFLINE.maxTicks (aucun appel ne peut geler l'onglet).
 */
export function tick(state: GameState, dtTicks = 1): GameState {
  if (!Number.isSafeInteger(dtTicks) || dtTicks <= 0) return state;
  const steps = Math.min(dtTicks, OFFLINE.maxTicks);
  const draft = cloneState(state);
  for (let i = 0; i < steps; i++) stepOnce(draft);
  return draft;
}
