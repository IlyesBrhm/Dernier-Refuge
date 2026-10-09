// Fixtures jour/nuit (pas un fichier de test) : états construits à la main, cohérents avec les
// invariants (docs/design/day-night.md §5), pour placer un scénario à un tick précis.

import { FIRE, SURVIVOR } from "../../src/data/balance";
import { tileCenter } from "../../src/core/map";
import type { GameState, Survivor, TilePos } from "../../src/core/state";
import { countBurnTicks } from "../../src/core/time";
import { edit, fresh } from "./helpers";

/** Feu de camp (9,5) et une de ses voisines (sud), d'où le joueur l'alimente. */
export const FIRE_TILE: TilePos = { tx: 9, ty: 5 };
export const FEED_SPOT: TilePos = { tx: 9, ty: 6 };
/** Tuile neutre loin du feu, des portes, de W et des nœuds. */
export const AWAY: TilePos = { tx: 3, ty: 6 };
/** Les 8 voisines du feu. */
export const FIRE_NEIGHBOURS: TilePos[] = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].filter((dx) => dx !== 0 || dy !== 0).map((dx) => ({ tx: 9 + dx, ty: 5 + dy })),
);

/** Construit les `n` premiers emplacements (tentes libres, ids croissants). */
export function buildSlots(d: GameState, n: number): void {
  for (const slot of d.buildSlots.slice(0, n)) {
    if (slot.builtTentId !== null) continue;
    const id = d.nextId++;
    slot.paid = slot.cost;
    slot.builtTentId = id;
    slot.payCooldown = 0;
    d.tents.push({ id, tile: { ...slot.tile }, status: "free", occupantId: null, cleanProgress: 0 });
  }
}

/** Installe un survivant au repos ou endormi au centre de la tente d'index `tentIndex`. */
export function install(
  d: GameState,
  tentIndex: number,
  status: "resting" | "sleeping",
  restTicksLeft: number = SURVIVOR.restTicks,
): Survivor {
  const tent = d.tents[tentIndex]!;
  const s: Survivor = {
    id: d.nextId++,
    pos: tileCenter(tent.tile),
    status,
    path: [],
    tentId: tent.id,
    restTicksLeft: status === "resting" ? restTicksLeft : 0,
  };
  tent.status = "occupied";
  tent.occupantId = s.id;
  d.survivors.push(s);
  return s;
}

export interface ScenarioOptions {
  tick: number;
  /** Nombre total de tentes (T + emplacements construits), 1 à 4. */
  tents?: number;
  /** Survivants au repos dans les premières tentes. */
  resting?: number;
  /** Survivants endormis dans les tentes suivantes. */
  sleeping?: number;
  restTicksLeft?: number;
  fireWood?: number;
  /** Bois brûlé cumulé (défaut : toutes les combustions de [1, tick], feu jamais éteint). */
  burned?: number;
  player?: TilePos;
  wood?: number;
  /**
   * fire.feedProgress (défaut 0). `"ready"` = FIRE.feedDelayTicks : le joueur (qui doit être dans la
   * zone d'alimentation, input 0,0) est déjà arrêté depuis assez longtemps pour verser.
   */
  feedProgress?: number | "ready";
}

/** État cohérent au tick demandé (bilan de nuit à 0, tentes construites, survivants installés). */
export function scenario(o: ScenarioOptions): GameState {
  return edit(fresh(), (d) => {
    d.tick = o.tick;
    buildSlots(d, (o.tents ?? 1) - 1);
    let i = 0;
    for (let k = 0; k < (o.resting ?? 0); k++) install(d, i++, "resting", o.restTicksLeft);
    for (let k = 0; k < (o.sleeping ?? 0); k++) install(d, i++, "sleeping");
    if (o.fireWood !== undefined) d.fire.wood = o.fireWood;
    d.fire.burnedTotal = o.burned ?? countBurnTicks(1, o.tick);
    if (o.player) d.player.pos = tileCenter(o.player);
    if (o.wood !== undefined) d.resources.wood = o.wood;
    if (o.feedProgress !== undefined) {
      d.fire.feedProgress = o.feedProgress === "ready" ? FIRE.feedDelayTicks : o.feedProgress;
    }
  });
}

export function tentDoorDrop(s: GameState, tentIndex: number): number {
  const t = s.tents[tentIndex]!;
  const door = tileCenter({ tx: t.tile.tx, ty: t.tile.ty + 1 });
  return s.drops.find((d) => d.resource === "wood" && d.pos.x === door.x && d.pos.y === door.y)?.amount ?? 0;
}
