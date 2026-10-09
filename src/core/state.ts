// Forme de l'état de jeu (docs/design/core-loop.md §2) et état initial.
// Tout est sérialisable JSON : pas de classes, Map, Set ni Date.

import {
  BUILD,
  FIRE,
  MAP_LAYOUT,
  STARTING_RESOURCES,
  SURVIVOR,
  type DropResource,
  type NodeKind,
} from "../data/balance";
import { parseMap, referenceMap, tileCenter } from "./map";
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
/**
 * `node` : tuile d'un nœud récoltable, obstacle statique (prêt ou épuisé).
 * `fire` : tuile du feu de camp, obstacle permanent (docs/design/day-night.md §1.4).
 */
export type Tile = "grass" | "tree" | "rock" | "node" | "fire";
export type { DropResource, NodeKind };
export type Axis = -1 | 0 | 1;

export interface MapState {
  width: number;
  height: number;
  tiles: Tile[]; // index = ty * width + tx (statique, jamais muté)
  entrance: TilePos;
  welcome: TilePos;
  queueTiles: TilePos[]; // queueTiles[0] = tête
  fire: TilePos; // tuile du feu de camp (statique, non sérialisée)
}

export interface PlayerState {
  pos: Vec;
  input: { dx: Axis; dy: Axis };
}

/**
 * `sleeping` : couché la nuit dans sa tente (centre de la tuile, chemin vide, restTicksLeft = 0) ;
 * n'existe que la nuit, feu allumé (docs/design/day-night.md §1.3).
 */
export type SurvivorStatus = "toQueue" | "queued" | "walkingToTent" | "resting" | "sleeping" | "leaving";
export interface Survivor {
  id: number;
  pos: Vec;
  status: SurvivorStatus;
  path: TilePos[]; // tuiles restantes à parcourir (vide si arrivé)
  tentId: number | null; // non-null ssi walkingToTent | resting | sleeping
  restTicksLeft: number; // > 0 seulement si resting
}

export type TentStatus = "free" | "assigned" | "occupied" | "messy";
export interface Tent {
  id: number;
  tile: TilePos;
  status: TentStatus; // occupied ⇔ occupant resting | sleeping
  occupantId: number | null; // non-null ssi assigned | occupied
  cleanProgress: number; // 0..TENT.cleanTicks, significatif si messy
}

export interface Drop {
  id: number;
  pos: Vec;
  resource: DropResource;
  amount: number;
}

export type NodeStatus = "ready" | "depleted";
/** Nœud récoltable (docs/design/harvest.md §2). */
export interface ResourceNode {
  id: number;
  kind: NodeKind;
  tile: TilePos; // statique, = position dans MAP_LAYOUT
  status: NodeStatus;
  progress: number; // ready : 0..harvestTicks-1 ; depleted : 0
  regrowTicksLeft: number; // depleted : 1..maxRegrowDelay(kind) ; ready : 0
}

export interface BuildSlot {
  id: number;
  tile: TilePos;
  cost: number;
  paid: number; // 0 <= paid <= cost
  builtTentId: number | null; // non-null ssi paid === cost
  payCooldown: number; // ticks avant le prochain versement
}

/** Feu de camp (docs/design/day-night.md §1.4). Allumé ⇔ wood > 0. */
export interface FireState {
  wood: number; // 0..FIRE.capacity
  burnedTotal: number; // bois brûlé depuis le début de la partie
  /**
   * Ticks consécutifs où le joueur est arrêté (input 0,0) dans la zone d'alimentation,
   * 0..FIRE.feedDelayTicks ; l'alimentation n'a lieu qu'à FIRE.feedDelayTicks. > 0 ⇒ joueur dans la zone.
   */
  feedProgress: number;
}

/**
 * Bilan de la nuit : nuit en cours (la nuit) ou dernière nuit terminée (le jour).
 * Remis à 0 au pas du crépuscule (docs/design/day-night.md §1.6).
 */
export interface NightStats {
  coldLeavers: number; // dormeurs partis à cause du froid (récompense réduite)
  sleepersPaid: number; // dormeurs payés en entier au pas de l'aube
  woodEarned: number; // bois déposé par ces départs
  woodBurned: number; // combustions des ticks de nuit
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
  nodes: ResourceNode[]; // triés par id, ordre de lecture de la carte
  fire: FireState;
  night: NightStats;
}

export function emptyNightStats(): NightStats {
  return { coldLeavers: 0, sleepersPaid: 0, woodEarned: 0, woodBurned: 0 };
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
  // Ids des nœuds attribués après tentes et emplacements (ordre de lecture).
  const nodes: ResourceNode[] = parsed.nodes.map((n) => ({
    id: nextId++,
    kind: n.kind,
    tile: { ...n.tile },
    status: "ready",
    progress: 0,
    regrowTicksLeft: 0,
  }));
  return {
    tick: 0,
    rng: seedRng(seed),
    nextId,
    map: referenceMap(), // instance unique, gelée, partagée (identique à parsed.map)
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
    nodes,
    fire: { wood: FIRE.initialWood, burnedTotal: 0, feedProgress: 0 },
    night: emptyNightStats(),
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
    nodes: s.nodes.map((n) => ({ ...n, tile: { ...n.tile } })),
    fire: { ...s.fire },
    night: { ...s.night },
  };
}
