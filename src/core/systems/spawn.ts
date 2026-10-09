// Arrivées de survivants : minuteur, file plafonnée, intervalle tiré au RNG seedé.

import { QUEUE, SURVIVOR } from "../../data/balance";
import { tileCenter } from "../map";
import { findPath } from "../path";
import { nextInt } from "../rng";
import type { GameState } from "../state";
import { isNight } from "../time";
import { pure } from "./helpers";

export function mutateSpawn(draft: GameState): void {
  if (draft.spawnTimer > 0) draft.spawnTimer -= 1;
  if (draft.spawnTimer > 0) return;
  // Nuit ⇒ aucune arrivée : minuteur gelé à 0, aucun RNG consommé (docs/design/day-night.md §1.2).
  if (isNight(draft.tick)) return;
  // File pleine ⇒ minuteur gelé à 0, aucun RNG consommé.
  if (draft.queue.length >= QUEUE.maxLength) return;
  const slot = draft.map.queueTiles[draft.queue.length];
  if (!slot) return;
  const path = findPath(draft.map, draft.map.entrance, slot);
  if (path === null) return;
  const id = draft.nextId++;
  draft.survivors.push({
    id,
    pos: tileCenter(draft.map.entrance),
    status: path.length === 0 ? "queued" : "toQueue",
    path,
    tentId: null,
    restTicksLeft: 0,
  });
  draft.queue.push(id);
  const [interval, rng] = nextInt(draft.rng, SURVIVOR.spawnIntervalMin, SURVIVOR.spawnIntervalMax);
  draft.spawnTimer = interval;
  draft.rng = rng;
}

export const spawnSystem = pure(mutateSpawn);
