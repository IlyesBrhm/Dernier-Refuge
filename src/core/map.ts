// Parseur de carte et utilitaires de tuiles (purs).

import { WORLD } from "../data/balance";
import type { MapState, Tile, TilePos, Vec } from "./state";

export interface ParsedMap {
  map: MapState;
  tentTiles: TilePos[]; // ordre de lecture
  slotTiles: TilePos[]; // ordre de lecture = index dans BUILD.slotCosts
  playerStart: TilePos;
}

const U = WORLD.unitsPerTile;

/** Lit le layout texte. Lève une erreur si le layout est malformé. */
export function parseMap(layout: readonly string[]): ParsedMap {
  const height = layout.length;
  const width = layout[0]?.length ?? 0;
  if (height === 0 || width === 0) throw new Error("carte vide");
  const tiles: Tile[] = [];
  const tentTiles: TilePos[] = [];
  const slotTiles: TilePos[] = [];
  const queue: TilePos[] = [];
  const welcome: TilePos[] = [];
  const entrance: TilePos[] = [];
  const start: TilePos[] = [];
  layout.forEach((row, ty) => {
    if (row.length !== width) throw new Error(`ligne ${ty} de longueur ${row.length} au lieu de ${width}`);
    for (let tx = 0; tx < width; tx++) {
      const c = row[tx];
      const pos = { tx, ty };
      switch (c) {
        case "#":
          tiles.push("tree");
          break;
        case "R":
          tiles.push("rock");
          break;
        case ".":
          tiles.push("grass");
          break;
        case "T":
          tiles.push("grass");
          tentTiles.push(pos);
          break;
        case "B":
          tiles.push("grass");
          slotTiles.push(pos);
          break;
        case "W":
          tiles.push("grass");
          welcome.push(pos);
          break;
        case "Q":
          tiles.push("grass");
          queue.push(pos);
          break;
        case "E":
          tiles.push("grass");
          entrance.push(pos);
          break;
        case "P":
          tiles.push("grass");
          start.push(pos);
          break;
        default:
          throw new Error(`caractère inconnu '${String(c)}' en (${tx},${ty})`);
      }
    }
  });
  const w = welcome[0];
  const e = entrance[0];
  const p = start[0];
  if (welcome.length !== 1 || !w) throw new Error("il faut exactement une tuile W");
  if (entrance.length !== 1 || !e) throw new Error("il faut exactement une tuile E");
  if (start.length !== 1 || !p) throw new Error("il faut exactement une tuile P");
  if (queue.length === 0) throw new Error("il faut au moins une tuile Q");
  // Tête de file = la plus proche de W, puis gauche, puis haut.
  queue.sort((a, b) => manhattan(a, w) - manhattan(b, w) || a.tx - b.tx || a.ty - b.ty);
  return {
    map: { width, height, tiles, entrance: e, welcome: w, queueTiles: queue },
    tentTiles,
    slotTiles,
    playerStart: p,
  };
}

export function manhattan(a: TilePos, b: TilePos): number {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
}

export function inBounds(map: MapState, t: TilePos): boolean {
  return t.tx >= 0 && t.ty >= 0 && t.tx < map.width && t.ty < map.height;
}

/** Tuile à (tx, ty) ; hors carte ⇒ undefined. */
export function tileAt(map: MapState, tx: number, ty: number): Tile | undefined {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return undefined;
  return map.tiles[ty * map.width + tx];
}

/** Hors carte = obstacle. */
export function isObstacleAt(map: MapState, tx: number, ty: number): boolean {
  const t = tileAt(map, tx, ty);
  return t === undefined || t === "tree" || t === "rock";
}

export function isWalkable(map: MapState, t: TilePos): boolean {
  return !isObstacleAt(map, t.tx, t.ty);
}

export function tileCenter(t: TilePos): Vec {
  return { x: t.tx * U + U / 2, y: t.ty * U + U / 2 };
}

/** Tuile contenant un point. */
export function tileOf(p: Vec): TilePos {
  return { tx: Math.floor(p.x / U), ty: Math.floor(p.y / U) };
}

export function sameTile(a: TilePos, b: TilePos): boolean {
  return a.tx === b.tx && a.ty === b.ty;
}

/** Porte d'une tente / d'un emplacement : tuile juste en dessous. */
export function doorOf(t: TilePos): TilePos {
  return { tx: t.tx, ty: t.ty + 1 };
}

export function chebyshev(a: Vec, b: Vec): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
