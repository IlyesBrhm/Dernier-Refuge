// Input ⇒ position du joueur, collisions axe par axe, bornes de carte.

import { PLAYER } from "../../data/balance";
import { moveWithCollision } from "../collision";
import type { GameState } from "../state";
import { pure } from "./helpers";

export function mutateMovePlayer(draft: GameState): void {
  const { dx, dy } = draft.player.input;
  if (dx === 0 && dy === 0) return;
  const speed = dx !== 0 && dy !== 0 ? PLAYER.diagonalSpeed : PLAYER.speed;
  draft.player.pos = moveWithCollision(draft.map, draft.player.pos, dx * speed, dy * speed, PLAYER.halfSize);
}

export const movePlayerSystem = pure(mutateMovePlayer);
