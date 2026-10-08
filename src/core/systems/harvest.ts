// Récolte : la cible (findHarvestTarget) gagne +1/tick ; barre pleine ⇒ nœud épuisé et drop posé
// sur la tuile du joueur. Le stock n'est jamais crédité ici (le ramassage s'en charge, en dernier).
// Les autres nœuds gardent leur progression (pause), y compris quand le joueur s'éloigne.

import { NODES } from "../../data/balance";
import { findHarvestTarget, regrowDelay } from "../harvest-rules";
import { tileOf } from "../map";
import type { GameState } from "../state";
import { addDrop, pure } from "./helpers";

export function mutateHarvest(draft: GameState): void {
  const target = findHarvestTarget(draft);
  if (!target) return;
  const spec = NODES[target.kind];
  target.progress += 1;
  if (target.progress < spec.harvestTicks) return;
  target.status = "depleted";
  target.progress = 0;
  target.regrowTicksLeft = regrowDelay(draft, target.kind);
  addDrop(draft, tileOf(draft.player.pos), spec.resource, spec.yield);
}

export const harvestSystem = pure(mutateHarvest);
