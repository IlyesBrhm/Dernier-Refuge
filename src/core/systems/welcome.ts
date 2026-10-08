// Accueil : joueur sur W + tête de file arrivée + tente libre ⇒ progression ; à WELCOME.ticks,
// la tente libre d'id le plus petit est attribuée. Une condition fausse ⇒ progression à 0.

import { WELCOME } from "../../data/balance";
import { sameTile, tileOf } from "../map";
import { findPath } from "../path";
import type { GameState } from "../state";
import { isAtCenterOf, pure, retargetQueue } from "./helpers";

export function mutateWelcome(draft: GameState): void {
  const onWelcome = sameTile(tileOf(draft.player.pos), draft.map.welcome);
  const headId = draft.queue[0];
  const head = draft.survivors.find((s) => s.id === headId);
  const slot0 = draft.map.queueTiles[0];
  const headArrived = !!head && !!slot0 && head.status === "queued" && isAtCenterOf(head.pos, slot0);
  // tents triées par id ⇒ la première libre a le plus petit id.
  const tent = draft.tents.find((t) => t.status === "free");
  if (!onWelcome || !headArrived || !tent || !head || !slot0) {
    draft.welcomeProgress = 0;
    return;
  }
  draft.welcomeProgress = Math.min(WELCOME.ticks, draft.welcomeProgress + 1);
  if (draft.welcomeProgress < WELCOME.ticks) return;
  draft.welcomeProgress = 0;
  const path = findPath(draft.map, slot0, tent.tile);
  if (path === null) return;
  tent.status = "assigned";
  tent.occupantId = head.id;
  head.status = "walkingToTent";
  head.tentId = tent.id;
  head.path = path;
  draft.queue.shift();
  retargetQueue(draft);
}

export const welcomeSystem = pure(mutateWelcome);
