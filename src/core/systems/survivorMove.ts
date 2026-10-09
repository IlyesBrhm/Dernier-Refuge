// Avance chaque survivant le long de son chemin (pas axiaux entre centres de tuiles, entiers exacts).

import { SURVIVOR } from "../../data/balance";
import { tileCenter } from "../map";
import type { GameState, Survivor } from "../state";
import { pure } from "./helpers";

function advance(s: Survivor, speed: number): void {
  let budget = speed;
  while (budget > 0) {
    const next = s.path[0];
    if (!next) return;
    const c = tileCenter(next);
    const dx = c.x - s.pos.x;
    const dy = c.y - s.pos.y;
    if (dx !== 0) {
      const step = Math.min(Math.abs(dx), budget);
      s.pos.x += Math.sign(dx) * step;
      budget -= step;
    } else if (dy !== 0) {
      const step = Math.min(Math.abs(dy), budget);
      s.pos.y += Math.sign(dy) * step;
      budget -= step;
    }
    if (s.pos.x === c.x && s.pos.y === c.y) s.path.shift();
  }
}

export function mutateSurvivorMove(draft: GameState): void {
  for (const s of draft.survivors) {
    if (s.status === "resting" || s.status === "sleeping") continue;
    advance(s, SURVIVOR.speed);
    if (s.status === "toQueue" && s.path.length === 0) s.status = "queued";
  }
}

export const survivorMoveSystem = pure(mutateSurvivorMove);
