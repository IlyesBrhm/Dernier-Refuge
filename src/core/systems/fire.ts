// Feu de camp (docs/design/day-night.md §1.4) : combustion sur calendrier fixe, puis
// alimentation depuis le stock quand le joueur s'est ARRÊTÉ sur une des voisines du feu.
//
// Arrêt (comme l'accueil) : `fire.feedProgress` compte les ticks consécutifs où le joueur est
// dans la zone d'alimentation ET immobile (`player.input` = (0,0) : movePlayer, exécuté avant ce
// système, ne l'a donc pas déplacé pendant ce pas). Il repart à 0 dès que le joueur a une
// direction ou sort de la zone. Une fois à FIRE.feedDelayTicks, l'alimentation s'applique :
// premier versement au pas où le délai est atteint, puis 1 bois tous les feedIntervalTicks
// (ticks multiples de feedIntervalTicks) tant qu'il reste arrêté dans la zone.
// Passer devant le feu sans s'arrêter ne verse donc jamais rien.

import { FIRE } from "../../data/balance";
import { tileOf } from "../map";
import type { GameState, TilePos } from "../state";
import { isBurnTick, isNight } from "../time";
import { pure } from "./helpers";

/** La tuile `t` est-elle dans la zone d'alimentation (Chebyshev ≤ feedRangeTiles du feu, hors feu) ? */
export function isInFeedZone(fire: TilePos, t: TilePos): boolean {
  const d = Math.max(Math.abs(t.tx - fire.tx), Math.abs(t.ty - fire.ty));
  return d >= 1 && d <= FIRE.feedRangeTiles;
}

/** Joueur arrêté (aucune direction) dans la zone d'alimentation : condition d'avancée du délai. */
export function isStoppedInFeedZone(state: GameState): boolean {
  const { dx, dy } = state.player.input;
  return dx === 0 && dy === 0 && isInFeedZone(state.map.fire, tileOf(state.player.pos));
}

export function mutateFire(draft: GameState): void {
  const fire = draft.fire;
  // 1. Combustion (avant l'alimentation : un joueur posté au feu ne le laisse jamais à 0).
  if (fire.wood > 0 && isBurnTick(draft.tick)) {
    const burned = Math.min(FIRE.burnPerStep, fire.wood);
    fire.wood -= burned;
    fire.burnedTotal += burned;
    if (isNight(draft.tick)) draft.night.woodBurned += burned;
  }
  // 2. Délai d'arrêt : position + immobilité du joueur, aucune commande.
  if (!isStoppedInFeedZone(draft)) {
    fire.feedProgress = 0;
    return;
  }
  const justReached = fire.feedProgress === FIRE.feedDelayTicks - 1;
  fire.feedProgress = Math.min(FIRE.feedDelayTicks, fire.feedProgress + 1);
  if (fire.feedProgress < FIRE.feedDelayTicks) return;
  // 3. Alimentation.
  if (!justReached && draft.tick % FIRE.feedIntervalTicks !== 0) return;
  if (fire.wood >= FIRE.capacity || draft.resources.wood <= 0) return;
  const amount = Math.min(FIRE.feedPerStep, draft.resources.wood, FIRE.capacity - fire.wood);
  draft.resources.wood -= amount;
  fire.wood += amount;
}

export const fireSystem = pure(mutateFire);
