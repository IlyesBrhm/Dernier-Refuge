// Forme de l'état de jeu (docs/design/core-loop.md §2) et état initial.
// Tout est sérialisable JSON : pas de classes, Map, Set ni Date.

import { BUILD, MAP_LAYOUT, STARTING_RESOURCES, SURVIVOR } from "../data/balance";
import { parseMap, tileCenter } from "./map";
import { seedRng, type RngState } from "./rng";

export type ResourceId = "wood" | "food" | "stone" | "water" | "coins";
export type Resources = Record<ResourceId, number>; // entiers, 0..RESOURCES.cap
export interface Vec {
  x: number;
  y: number;
} // unités entières (1 tuile = WORLD.unitsPerTile)
export interface TilePos {
  tx: number;
  ty: number;
}
export type Tile = "grass" | "tree" | "rock";
export type Axis = -1 | 0 | 1;

export interface MapState {
  width: number;
  height: number;
  tiles: Tile[]; // index = ty * width + tx (statique, jamais muté)
  entrance: TilePos;
  welcome: TilePos;
  queueTiles: TilePos[]; // queueTiles[0] = tête
}

export interface PlayerState {
  pos: Vec;
  input: { dx: Axis; dy: Axis };
}

export type SurvivorStatus = "toQueue" | "queued" | "walkingToTent" | "resting" | "leaving";
export interface Survivor {
  id: number;
  pos: Vec;
  status: SurvivorStatus;
  path: TilePos[]; // tuiles restantes à parcourir (vide si arrivé)
  tentId: number | null; // non-null ssi walkingToTent | resting
  restTicksLeft: number; // > 0 seulement si resting
}

export type TentStatus = "free" | "assigned" | "occupied" | "messy";
export interface Tent {
  id: number;
  tile: TilePos;
  status: TentStatus;
  occupantId: number | null; // non-null ssi assigned | occupied
  cleanProgress: number; // 0..TENT.cleanTicks, significatif si messy
}

export interface Drop {
  id: number;
  pos: Vec;
  resource: "wood";
  amount: number;
}

export interface BuildSlot {
  id: number;
  tile: TilePos;
  cost: number;
  paid: number; // 0 <= paid <= cost
  builtTentId: number | null; // non-null ssi paid === cost
  payCooldown: number; // ticks avant le prochain versement
}

export interface GameState {
  tick: number;
  rng: RngState;
  nextId: number;
  map: MapState;
  player: PlayerState;
  resources: Resources;
  queue: number[]; // ids des survivants en file, ordre = position
  survivors: Survivor[]; // triés par id
  tents: Tent[]; // triés par id
  drops: Drop[];
  buildSlots: BuildSlot[];
  spawnTimer: number;
  welcomeProgress: number; // 0..WELCOME.ticks
  commandsThisTick: number; // anti-spam, remis à 0 par tick()
}

export function createInitialState(seed: number): GameState {
  const parsed = parseMap(MAP_LAYOUT);
  if (parsed.slotTiles.length !== BUILD.slotCosts.length) {
    throw new Error(
      `MAP_LAYOUT a ${parsed.slotTiles.length} emplacements B mais BUILD.slotCosts en a ${BUILD.slotCosts.length}`,
    );
  }
  let nextId = 1;
  const tents: Tent[] = parsed.tentTiles.map((tile) => ({
    id: nextId++,
    tile: { ...tile },
    status: "free",
    occupantId: null,
    cleanProgress: 0,
  }));
  const buildSlots: BuildSlot[] = parsed.slotTiles.map((tile, i) => ({
    id: nextId++,
    tile: { ...tile },
    cost: BUILD.slotCosts[i] ?? 0,
    paid: 0,
    builtTentId: null,
    payCooldown: 0,
  }));
  return {
    tick: 0,
    rng: seedRng(seed),
    nextId,
    map: parsed.map,
    player: { pos: tileCenter(parsed.playerStart), input: { dx: 0, dy: 0 } },
    resources: { ...STARTING_RESOURCES },
    queue: [],
    survivors: [],
    tents,
    drops: [],
    buildSlots,
    spawnTimer: SURVIVOR.firstSpawnTicks,
    welcomeProgress: 0,
    commandsThisTick: 0,
  };
}

/** Copie profonde de l'état (la carte, statique, est partagée). */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    map: s.map,
    player: { pos: { ...s.player.pos }, input: { ...s.player.input } },
    resources: { ...s.resources },
    queue: [...s.queue],
    survivors: s.survivors.map((v) => ({ ...v, pos: { ...v.pos }, path: v.path.map((p) => ({ ...p })) })),
    tents: s.tents.map((t) => ({ ...t, tile: { ...t.tile } })),
    drops: s.drops.map((d) => ({ ...d, pos: { ...d.pos } })),
    buildSlots: s.buildSlots.map((b) => ({ ...b, tile: { ...b.tile } })),
  };
}
