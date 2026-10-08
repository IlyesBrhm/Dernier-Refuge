// Repousse : chaque nœud épuisé décompte ; à 0 il redevient prêt (progression 0).
// Passe AVANT la récolte : un nœud qui repousse à portée du joueur est récolté dans le même tick.

import type { GameState } from "../state";
import { pure } from "./helpers";

export function mutateNodeRegrow(draft: GameState): void {
  for (const node of draft.nodes) {
    if (node.status !== "depleted") continue;
    node.regrowTicksLeft = Math.max(0, node.regrowTicksLeft - 1);
    if (node.regrowTicksLeft === 0) {
      node.status = "ready";
      node.progress = 0;
    }
  }
}

export const nodeRegrowSystem = pure(mutateNodeRegrow);
