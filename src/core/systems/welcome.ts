// Accueil : joueur sur W + tête de file arrivée + tente libre ⇒ progression ; à WELCOME.ticks,
// la tente libre d'id le plus petit est attribuée. Une condition fausse ⇒ progression à 0.
// La nuit, l'accueil est suspendu (docs/design/day-night.md §9 Q1, décisions utilisateur) :
// - feu éteint (wood = 0) ;
// - OU au moins un survivant parti à cause du froid cette nuit (night.coldLeavers > 0), même si le
//   feu a été rallumé depuis : l'accueil reste fermé jusqu'à l'aube.
//
// Rien n'est stocké : c'est dérivé de isNight(tick) et de night.coldLeavers. Le bilan `night` est
// remis à 0 au pas du crépuscule (clock, premier système du pas), et coldLeavers n'augmente que
// pendant des ticks de nuit (cold). La nuit, coldLeavers ne compte donc QUE les départs de la nuit
// en cours ; le jour, il garde le bilan de la nuit précédente mais isNight est faux ⇒ accueil
// rouvert exactement au pas de l'aube, et jamais fermé par le bilan d'une nuit passée.

import { WELCOME } from "../../data/balance";
import { sameTile, tileOf } from "../map";
import { findPath } from "../path";
import type { GameState } from "../state";
import { isNight } from "../time";
import { isAtCenterOf, pure, retargetQueue } from "./helpers";

/** Raison de la fermeture de l'accueil : départs au froid cette nuit (prioritaire), feu éteint la nuit. */
export type WelcomeBlockReason = "fireOut" | "coldLeavers";

/**
 * Pourquoi l'accueil est fermé, ou null s'il est ouvert :
 * nuit ∧ coldLeavers > 0 ⇒ "coldLeavers" ; nuit ∧ feu à 0 ⇒ "fireOut" ; sinon null.
 */
export function welcomeBlockReason(state: GameState): WelcomeBlockReason | null {
  if (!isNight(state.tick)) return null;
  if (state.night.coldLeavers > 0) return "coldLeavers";
  if (state.fire.wood === 0) return "fireOut";
  return null;
}

/** Accueil fermé la nuit (feu éteint ou départs au froid) : = welcomeBlockReason(state) !== null. */
export function isWelcomeBlockedByCold(state: GameState): boolean {
  return welcomeBlockReason(state) !== null;
}

export function mutateWelcome(draft: GameState): void {
  const onWelcome = sameTile(tileOf(draft.player.pos), draft.map.welcome);
  const headId = draft.queue[0];
  const head = draft.survivors.find((s) => s.id === headId);
  const slot0 = draft.map.queueTiles[0];
  const headArrived = !!head && !!slot0 && head.status === "queued" && isAtCenterOf(head.pos, slot0);
  // tents triées par id ⇒ la première libre a le plus petit id.
  const tent = draft.tents.find((t) => t.status === "free");
  // Nuit ∧ (feu éteint ∨ départ au froid cette nuit) ⇒ accueil suspendu, la file attend (Q1).
  const blockedByCold = isWelcomeBlockedByCold(draft);
  if (blockedByCold || !onWelcome || !headArrived || !tent || !head || !slot0) {
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
