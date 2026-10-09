// Modèle de scène 3D PUR (docs/design/render-3d.md §4.3) : état(s) du jeu ⇒ description de ce qu'il
// faut afficher, en mètres (axe Y vers le haut, z3d = y du core). Aucun import de three, aucune
// horloge, aucun Math.random : testable sous Vitest/node. Ne mute jamais ses entrées.

import {
  chebyshev,
  doorOf,
  feedZone,
  fireRatio,
  harvestTarget,
  isFeedingFire,
  isFireLit,
  isFireLow,
  isPlayerOn,
  playerTile,
  sameTile,
  slotRemaining,
  welcomeBlockReason,
  type DropResource,
  type GameState,
  type MapState,
  type Survivor,
  type TentStatus,
  type TilePos,
  type Vec,
} from "../../core";
import { MAP_LAYOUT, SURVIVOR, TENT, WELCOME } from "../../data/balance";
import { lightingAt, type Lighting } from "../daylight";
import type { WelcomeBlock } from "../welcome-block";
import { interpolate } from "../interpolate";
import type { FramingInput } from "./framing";
import { prevNodeOf, shownFeedRatio, shownHarvestRatio, shownRegrowRatio } from "../ratios";
import {
  DECOR,
  ENTRANCE_PATH_TILES,
  FOREST_MARGIN_TILES,
  FOREST_NEAR_ROWS,
  FOREST_NEAR_SIDE_TILES,
  MODEL_IDS,
  PLAYER_TINT,
  SHARED_DROP_OFFSET_TILES,
  SURVIVOR_TINTS,
  SURVIVOR_VARIANTS,
  TILE_METERS,
  U,
  toMeters,
  type CharacterModel,
} from "./config";
import { hash32, hashUnit } from "./hash";

/** "player" | `survivor:${id}` | `node:${id}` | `tent:${id}` | `slot:${id}` | `drop:${id}` */
export type SceneKey = string;

export interface CharacterItem {
  key: SceneKey;
  type: "character";
  role: "player" | "survivor";
  model: CharacterModel;
  /** Multiplicateur de couleur (hex) ; survivant : f(hash32(id)), joueur : fixe. */
  tint: number;
  /** Position interpolée (m). */
  x: number;
  z: number;
  /** atan2(dx, dz) du déplacement prev→curr ; null = garder l'orientation actuelle. */
  heading: number | null;
  /** La position a changé entre prev et curr (hors téléportation > 1 tuile). */
  moving: boolean;
  /** false si le survivant est « resting » ou « sleeping » (il est dans la tente). */
  visible: boolean;
}

export interface NodeItem {
  key: SceneKey;
  type: "tree" | "bush";
  x: number;
  z: number;
  /** Rotation (rad) dérivée de hash32(id). */
  yaw: number;
  ready: boolean;
  /** Repousse affichée [0, 1] (1 si prêt). */
  regrow: number;
  /** Récolte affichée [0, 1[. */
  harvest: number;
  /** = harvestTarget(curr). */
  targeted: boolean;
}

export interface TentItem {
  key: SceneKey;
  type: "tent";
  x: number;
  z: number;
  status: TentStatus;
  /** cleanProgress / TENT.cleanTicks. */
  clean: number;
  /** 1 - restTicksLeft/restTicks de l'occupant au repos (interpolé), sinon null. */
  rest: number | null;
  /** Occupée par un dormeur (nuit) : bulle « Zz » au lieu de la barre de repos (`rest` = null). */
  sleeping: boolean;
  playerOn: boolean;
}

export interface FireItem {
  key: "fire";
  type: "fire";
  /** Centre de la tuile du feu (m). */
  x: number;
  z: number;
  /** Bois / capacité, interpolé entre prev et curr, dans [0, 1]. */
  ratio: number;
  /** = isFireLit(curr). */
  lit: boolean;
  /** = isFireLow(curr) (nuit, feu qui faiblit). */
  low: boolean;
  /** = isFeedingFire(curr) (le joueur verse du bois). */
  feeding: boolean;
  /** Joueur dans la zone d'alimentation (feedZone) : barre du feu affichée. */
  playerNear: boolean;
  /** Jauge d'arrêt avant alimentation [0, 1], interpolée ; null = cachée (cf. shownFeedRatio). */
  feed: number | null;
}

export interface SlotItem {
  key: SceneKey;
  type: "slot";
  x: number;
  z: number;
  paid: number;
  remaining: number;
  /** paid / cost (0 si coût nul). */
  ratio: number;
  playerOn: boolean;
}

export interface DropItem {
  key: SceneKey;
  type: "drop";
  resource: DropResource;
  amount: number;
  /** Position interpolée (m), décalage « tuile partagée » déjà appliqué. */
  x: number;
  z: number;
}

export type SceneItem = CharacterItem | NodeItem | TentItem | SlotItem | DropItem | FireItem;

export interface SceneFrame {
  /** Cible caméra = joueur interpolé (m). */
  focus: { x: number; z: number };
  /**
   * `blockReason` : cause de fermeture de l'accueil (`welcomeBlockReason` du core) ⇒ libellé sur le
   * tapis (« Feu éteint » / « Fermé jusqu'à l'aube »). `blockedByCold` = accueil fermé (raison non nulle).
   */
  welcome: { active: boolean; ratio: number; blockedByCold: boolean; blockReason: WelcomeBlock };
  /** Ordre stable : player, survivants (id), nœuds, tentes, slots, drops, feu. */
  items: SceneItem[];
  /** Éclairage au temps interpolé prev.tick + alpha. */
  lighting: Lighting;
  /** Entrées du cadrage portrait (file d'attente). */
  framing: FramingInput;
}

/** Zone d'alimentation du feu, mise en cache par carte (la carte ne change pas en jeu). */
const feedZoneCache = new WeakMap<object, readonly TilePos[]>();
function cachedFeedZone(map: Readonly<MapState>): readonly TilePos[] {
  let z = feedZoneCache.get(map);
  if (!z) {
    z = feedZone(map as MapState);
    feedZoneCache.set(map, z);
  }
  return z;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Centre de tuile (m). */
function tileMeters(t: TilePos): { x: number; z: number } {
  return { x: (t.tx + 0.5) * TILE_METERS, z: (t.ty + 0.5) * TILE_METERS };
}

/** Variante visuelle d'un survivant : `hash32(id) % 20` ⇒ (modèle, teinte). */
export function survivorVariant(id: number): { model: CharacterModel; tint: number } {
  const v = hash32(id) % SURVIVOR_VARIANTS;
  const models = MODEL_IDS.survivors;
  return {
    model: models[v % models.length] as CharacterModel,
    tint: SURVIVOR_TINTS[Math.floor(v / models.length)] as number,
  };
}

/** Déplacement prev→curr : (moving, heading). Téléportation (> 1 tuile) ⇒ immobile. */
function motion(prev: Readonly<Vec> | undefined, curr: Readonly<Vec>): { moving: boolean; heading: number | null } {
  if (!prev) return { moving: false, heading: null };
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  if ((dx === 0 && dy === 0) || chebyshev(prev, curr) > U) return { moving: false, heading: null };
  return { moving: true, heading: Math.atan2(dx, dy) };
}

function restRatio(s: Readonly<Survivor> | undefined): number | null {
  if (!s || s.status !== "resting") return null;
  return clamp01(1 - s.restTicksLeft / SURVIVOR.restTicks);
}

/**
 * Description de la scène à afficher entre `prev` et `curr` (alpha ∈ [0, 1], borné ; NaN ⇒ 1).
 * Pure et déterministe : deux appels identiques donnent des résultats égaux (`toEqual`).
 */
export function buildScene(prev: Readonly<GameState>, curr: Readonly<GameState>, alpha: number): SceneFrame {
  const a = Number.isFinite(alpha) ? clamp01(alpha) : 1;
  const pos = interpolate(prev, curr, a);
  const items: SceneItem[] = [];

  // Joueur.
  const pm = motion(prev.player.pos, curr.player.pos);
  const focus = { x: toMeters(pos.player.x), z: toMeters(pos.player.y) };
  items.push({
    key: "player",
    type: "character",
    role: "player",
    model: MODEL_IDS.player,
    tint: PLAYER_TINT,
    x: focus.x,
    z: focus.z,
    heading: pm.heading,
    moving: pm.moving,
    visible: true,
  });

  // Survivants (état trié par id).
  const prevSurvivors = new Map<number, Readonly<Survivor>>();
  for (const s of prev.survivors) prevSurvivors.set(s.id, s);
  const currSurvivors = new Map<number, Readonly<Survivor>>();
  for (const s of curr.survivors) {
    currSurvivors.set(s.id, s);
    const p = pos.survivors.get(s.id) ?? s.pos;
    const m = motion(prevSurvivors.get(s.id)?.pos, s.pos);
    const v = survivorVariant(s.id);
    items.push({
      key: `survivor:${s.id}`,
      type: "character",
      role: "survivor",
      model: v.model,
      tint: v.tint,
      x: toMeters(p.x),
      z: toMeters(p.y),
      heading: m.heading,
      moving: m.moving,
      visible: s.status !== "resting" && s.status !== "sleeping",
    });
  }

  // Nœuds récoltables.
  const target = harvestTarget(curr);
  for (let i = 0; i < curr.nodes.length; i++) {
    const n = curr.nodes[i];
    if (!n) continue;
    const p = prevNodeOf(prev, i, n.id);
    const c = tileMeters(n.tile);
    items.push({
      key: `node:${n.id}`,
      type: n.kind,
      x: c.x,
      z: c.z,
      yaw: hashUnit(hash32(n.id, 0x6e6f6465)) * Math.PI * 2,
      ready: n.status === "ready",
      regrow: clamp01(shownRegrowRatio(p, n, a)),
      harvest: clamp01(shownHarvestRatio(p, n, a)),
      targeted: target !== null && target.id === n.id,
    });
  }

  // Tentes.
  for (const t of curr.tents) {
    const c = tileMeters(t.tile);
    let rest: number | null = null;
    let sleeping = false;
    if (t.status === "occupied" && t.occupantId !== null) {
      const occupant = currSurvivors.get(t.occupantId);
      sleeping = occupant?.status === "sleeping";
      const r1 = restRatio(occupant);
      const r0 = restRatio(prevSurvivors.get(t.occupantId));
      rest = r1 === null ? null : r0 === null || r0 > r1 ? r1 : r0 + (r1 - r0) * a;
    }
    items.push({
      key: `tent:${t.id}`,
      type: "tent",
      x: c.x,
      z: c.z,
      status: t.status,
      clean: clamp01(t.cleanProgress / TENT.cleanTicks),
      rest,
      sleeping,
      playerOn: isPlayerOn(curr, t.tile),
    });
  }

  // Emplacements de construction non construits.
  for (const slot of curr.buildSlots) {
    if (slot.builtTentId !== null) continue;
    const c = tileMeters(slot.tile);
    items.push({
      key: `slot:${slot.id}`,
      type: "slot",
      x: c.x,
      z: c.z,
      paid: slot.paid,
      remaining: slotRemaining(slot),
      ratio: slot.cost > 0 ? clamp01(slot.paid / slot.cost) : 0,
      playerOn: isPlayerOn(curr, slot.tile),
    });
  }

  // Drops (décalage visuel si une autre ressource partage la tuile, comme en 2D).
  const drops = curr.drops;
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    if (!d) continue;
    const tx = Math.floor(d.pos.x / U);
    const ty = Math.floor(d.pos.y / U);
    let shared = false;
    for (let j = 0; j < drops.length; j++) {
      const o = drops[j];
      if (j === i || !o || o.resource === d.resource) continue;
      if (Math.floor(o.pos.x / U) === tx && Math.floor(o.pos.y / U) === ty) {
        shared = true;
        break;
      }
    }
    const p = pos.drops.get(d.id) ?? d.pos;
    const dx = shared ? (d.resource === "food" ? 1 : -1) * SHARED_DROP_OFFSET_TILES * TILE_METERS : 0;
    items.push({
      key: `drop:${d.id}`,
      type: "drop",
      resource: d.resource,
      amount: d.amount,
      x: toMeters(p.x) + dx,
      z: toMeters(p.y),
    });
  }

  // Feu de camp (un seul, tuile fixe de la carte).
  const fc = tileMeters(curr.map.fire);
  const r1 = fireRatio(curr);
  const r0 = fireRatio(prev);
  const pt = playerTile(curr);
  const feedShown = shownFeedRatio(prev, curr, a);
  items.push({
    key: "fire",
    type: "fire",
    x: fc.x,
    z: fc.z,
    ratio: clamp01(r0 + (r1 - r0) * a),
    lit: isFireLit(curr),
    low: isFireLow(curr),
    feeding: isFeedingFire(curr),
    playerNear: cachedFeedZone(curr.map).some((t) => sameTile(t, pt)),
    feed: feedShown === null ? null : clamp01(feedShown),
  });

  // Cadrage portrait : places de file occupées (tête en premier).
  const queue: { x: number; z: number }[] = [];
  const n = Math.min(curr.queue.length, curr.map.queueTiles.length);
  for (let i = 0; i < n; i++) {
    const q = curr.map.queueTiles[i];
    if (q) queue.push(tileMeters(q));
  }

  const tickF = prev.tick + (curr.tick > prev.tick ? (curr.tick - prev.tick) * a : a);
  const blockReason = welcomeBlockReason(curr);
  return {
    focus,
    welcome: {
      active: isPlayerOn(curr, curr.map.welcome),
      ratio: clamp01(curr.welcomeProgress / WELCOME.ticks),
      blockedByCold: blockReason !== null,
      blockReason,
    },
    items,
    lighting: lightingAt(tickF),
    framing: { player: { x: focus.x, z: focus.z }, welcome: tileMeters(curr.map.welcome), queue },
  };
}

// =============================================================================================
// Décor statique
// =============================================================================================

/** Placement d'une instance de décor : `model` = index dans la liste de modèles du type. */
export interface Placement {
  model: number;
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface StaticLayout {
  /** Carte + marge de forêt (m). */
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  /** Herbe A (0) / herbe B (1) / sous-bois (2), carte + marge. */
  groundTiles: { tx: number; ty: number; shade: 0 | 1 | 2 }[];
  /** Une par tuile "#" + anneau de FOREST_MARGIN_TILES tuiles hors carte (sauf chemin d'entrée). */
  borderTrees: Placement[];
  /**
   * Forêt au-delà de l'anneau, côté caméra (+Z, bas de l'écran) uniquement : FOREST_NEAR_ROWS rangées,
   * élargies de FOREST_NEAR_SIDE_TILES de chaque côté, sauf dans l'axe du chemin d'entrée (sentier).
   * Hors `bounds` (sur le sol lointain). Sans ombre, instanciée avec l'anneau (aucun draw call en plus).
   */
  nearForest: Placement[];
  /** Une par tuile "R". */
  rocks: Placement[];
  /** Herbe décorative : jamais sur W/Q/E/T/B/portes ni sur les nœuds. */
  tufts: Placement[];
  decals: { kind: "welcome" | "queue" | "entrance"; x: number; z: number; w: number; d: number }[];
  /** Tuile du feu de camp (sol en terre battue, aucune touffe), ou null si la carte n'en a pas. */
  fireTile: TilePos | null;
}

/** Direction « vers l'extérieur » de l'entrée (bord de carte), ou null si l'entrée n'est pas au bord. */
function entranceOutward(map: Readonly<MapState>): { dx: number; dy: number } | null {
  const e = map.entrance;
  if (e.ty === map.height - 1) return { dx: 0, dy: 1 };
  if (e.ty === 0) return { dx: 0, dy: -1 };
  if (e.tx === 0) return { dx: -1, dy: 0 };
  if (e.tx === map.width - 1) return { dx: 1, dy: 0 };
  return null;
}

/** Tuiles hors carte occupées par le chemin d'entrée (ENTRANCE_PATH_TILES tuiles). */
export function entrancePathTiles(map: Readonly<MapState>): TilePos[] {
  const dir = entranceOutward(map);
  if (!dir) return [];
  const out: TilePos[] = [];
  for (let k = 1; k <= ENTRANCE_PATH_TILES; k++) {
    out.push({ tx: map.entrance.tx + dir.dx * k, ty: map.entrance.ty + dir.dy * k });
  }
  return out;
}

/** Tuiles où aucune touffe d'herbe ne pousse (W, Q, E, T, B, portes de T/B). */
function noTuftTiles(map: Readonly<MapState>): Set<string> {
  const out = new Set<string>();
  const add = (t: TilePos): void => {
    out.add(`${t.tx},${t.ty}`);
  };
  add(map.welcome);
  add(map.entrance);
  for (const q of map.queueTiles) add(q);
  // Tentes et emplacements ne sont pas dans MapState : relus dans le layout de référence s'il
  // correspond à la carte (c'est toujours le cas en jeu : carte unique).
  if (MAP_LAYOUT.length === map.height && MAP_LAYOUT[0]?.length === map.width) {
    MAP_LAYOUT.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const ch = row[tx];
        if (ch === "T" || ch === "B") {
          add({ tx, ty });
          add(doorOf({ tx, ty }));
        }
      }
    });
  }
  return out;
}

/** Suite de hachages pour une tuile (graine différente par usage). */
function tileRand(tx: number, ty: number, salt: number): () => number {
  let h = hash32(hash32(tx, ty), salt);
  return () => {
    h = hash32(h, 0x2545f491);
    return hashUnit(h);
  };
}

/** Tuile du feu (cartes de test anciennes sans `fire` : null). */
function fireTileOf(map: Readonly<MapState>): TilePos | null {
  const f = (map as { fire?: TilePos }).fire;
  return f ? { tx: f.tx, ty: f.ty } : null;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Décor statique, calculé une fois par carte (ne dépend que de `map`). Pur et déterministe. */
export function buildStaticLayout(map: Readonly<MapState>): StaticLayout {
  const M = FOREST_MARGIN_TILES;
  const T = TILE_METERS;
  const path = new Set(entrancePathTiles(map).map((t) => `${t.tx},${t.ty}`));
  const blocked = noTuftTiles(map);

  const groundTiles: StaticLayout["groundTiles"] = [];
  const borderTrees: Placement[] = [];
  const rocks: Placement[] = [];
  const tufts: Placement[] = [];

  const treeAt = (tx: number, ty: number): Placement => {
    const r = tileRand(tx, ty, 1);
    const j = DECOR.borderJitterTiles;
    return {
      model: Math.floor(r() * MODEL_IDS.borderTrees.length) % MODEL_IDS.borderTrees.length,
      x: (tx + 0.5 + (r() * 2 - 1) * j) * T,
      z: (ty + 0.5 + (r() * 2 - 1) * j) * T,
      yaw: r() * Math.PI * 2,
      scale: lerp(DECOR.borderScaleMin, DECOR.borderScaleMax, r()),
    };
  };

  for (let ty = -M; ty < map.height + M; ty++) {
    for (let tx = -M; tx < map.width + M; tx++) {
      const inMap = tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
      const tile = inMap ? map.tiles[ty * map.width + tx] : undefined;
      const isTree = inMap ? tile === "tree" : !path.has(`${tx},${ty}`);
      const shade: 0 | 1 | 2 = !inMap || tile === "tree" ? 2 : (((tx + ty) & 1) as 0 | 1);
      groundTiles.push({ tx, ty, shade });

      if (isTree) {
        borderTrees.push(treeAt(tx, ty));
      } else if (tile === "rock") {
        const r = tileRand(tx, ty, 2);
        const j = DECOR.rockJitterTiles;
        rocks.push({
          model: Math.floor(r() * MODEL_IDS.rocks.length) % MODEL_IDS.rocks.length,
          x: (tx + 0.5 + (r() * 2 - 1) * j) * T,
          z: (ty + 0.5 + (r() * 2 - 1) * j) * T,
          yaw: r() * Math.PI * 2,
          scale: DECOR.rockScale,
        });
      } else if (inMap && tile === "grass" && !blocked.has(`${tx},${ty}`)) {
        const r = tileRand(tx, ty, 3);
        const count = Math.floor(r() * (DECOR.tuftsMaxPerTile + 1)) % (DECOR.tuftsMaxPerTile + 1);
        for (let k = 0; k < count; k++) {
          const j = DECOR.tuftJitterTiles;
          tufts.push({
            model: Math.floor(r() * MODEL_IDS.tufts.length) % MODEL_IDS.tufts.length,
            x: (tx + 0.5 + (r() * 2 - 1) * j) * T,
            z: (ty + 0.5 + (r() * 2 - 1) * j) * T,
            yaw: r() * Math.PI * 2,
            scale: lerp(DECOR.tuftScaleMin, DECOR.tuftScaleMax, r()),
          });
        }
      }
    }
  }

  // Forêt côté caméra au-delà de l'anneau : comble le bas de l'écran (portrait : caméra lointaine).
  const nearForest: Placement[] = [];
  const outward = entranceOutward(map);
  const trailTx = outward && outward.dy === 1 ? map.entrance.tx : null;
  for (let ty = map.height + M; ty < map.height + M + FOREST_NEAR_ROWS; ty++) {
    for (let tx = -M - FOREST_NEAR_SIDE_TILES; tx < map.width + M + FOREST_NEAR_SIDE_TILES; tx++) {
      if (tx === trailTx || path.has(`${tx},${ty}`)) continue;
      nearForest.push(treeAt(tx, ty));
    }
  }

  // Décalques au sol.
  const decals: StaticLayout["decals"] = [];
  const w = tileMeters(map.welcome);
  decals.push({ kind: "welcome", x: w.x, z: w.z, w: T, d: T });
  if (map.queueTiles.length > 0) {
    let minTx = Infinity;
    let maxTx = -Infinity;
    let minTy = Infinity;
    let maxTy = -Infinity;
    for (const q of map.queueTiles) {
      minTx = Math.min(minTx, q.tx);
      maxTx = Math.max(maxTx, q.tx);
      minTy = Math.min(minTy, q.ty);
      maxTy = Math.max(maxTy, q.ty);
    }
    decals.push({
      kind: "queue",
      x: ((minTx + maxTx + 1) / 2) * T,
      z: ((minTy + maxTy + 1) / 2) * T,
      w: (maxTx - minTx + 1) * T,
      d: (maxTy - minTy + 1) * T,
    });
  }
  {
    const e = map.entrance;
    const dir = entranceOutward(map) ?? { dx: 0, dy: 0 };
    const len = 1 + (dir.dx !== 0 || dir.dy !== 0 ? ENTRANCE_PATH_TILES : 0);
    const endTx = e.tx + dir.dx * (len - 1);
    const endTy = e.ty + dir.dy * (len - 1);
    const minTx = Math.min(e.tx, endTx);
    const maxTx = Math.max(e.tx, endTx);
    const minTy = Math.min(e.ty, endTy);
    const maxTy = Math.max(e.ty, endTy);
    decals.push({
      kind: "entrance",
      x: ((minTx + maxTx + 1) / 2) * T,
      z: ((minTy + maxTy + 1) / 2) * T,
      w: (maxTx - minTx + 1) * T,
      d: (maxTy - minTy + 1) * T,
    });
  }

  return {
    bounds: { minX: -M * T, minZ: -M * T, maxX: (map.width + M) * T, maxZ: (map.height + M) * T },
    groundTiles,
    borderTrees,
    nearForest,
    rocks,
    tufts,
    decals,
    fireTile: fireTileOf(map),
  };
}
