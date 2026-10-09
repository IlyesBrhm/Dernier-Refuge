// Carte avec le feu de camp F (docs/design/day-night.md §1.7) : obstacle, voisines en herbe hors
// des tuiles d'action, trajets BFS identiques à la carte précédente.

import { HARVEST, MAP_LAYOUT } from "../../src/data/balance";
import { doorOf, isWalkable, parseMap, tileAt } from "../../src/core/map";
import { findPath } from "../../src/core/path";
import { feedZone } from "../../src/core/selectors";
import type { MapState, TilePos } from "../../src/core/state";
import { FIRE_NEIGHBOURS, FIRE_TILE } from "./day-night-fixtures";
import { fresh } from "./helpers";

const parsed = parseMap(MAP_LAYOUT);
const { map } = parsed;
const cheb = (a: TilePos, b: TilePos): number => Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty));

/** Carte précédente : identique, (9,5) en herbe. */
const oldMap: MapState = {
  ...map,
  tiles: map.tiles.map((t, i) => (i === FIRE_TILE.ty * map.width + FIRE_TILE.tx ? "grass" : t)),
};

describe("carte — feu de camp", () => {
  it("un seul F, en (9,5), tuile \"fire\" obstacle ; ParsedMap.fire = MapState.fire", () => {
    expect(parsed.fire).toEqual(FIRE_TILE);
    expect(map.fire).toEqual(FIRE_TILE);
    expect(tileAt(map, 9, 5)).toBe("fire");
    expect(isWalkable(map, FIRE_TILE)).toBe(false);
    expect(findPath(map, map.entrance, FIRE_TILE)).toBeNull();
  });

  it("le parseur exige exactement un F", () => {
    expect(() => parseMap(["######", "#PW#.#", "#QE###", "######"])).toThrow(/F/);
    expect(() => parseMap(["######", "#PWFF#", "#QE###", "######"])).toThrow(/F/);
    expect(() => parseMap(["######", "#PWF.#", "#QE###", "######"])).not.toThrow();
  });

  it("lignes 3 et 6 entièrement en herbe", () => {
    for (const ty of [3, 6]) {
      for (let tx = 1; tx < map.width - 1; tx++) expect(isWalkable(map, { tx, ty }), `(${tx},${ty})`).toBe(true);
    }
  });

  it("les 8 voisines sont en herbe, hors tuiles d'action, et = feedZone", () => {
    const action = [
      ...parsed.tentTiles,
      ...parsed.slotTiles,
      ...parsed.tentTiles.map(doorOf),
      ...parsed.slotTiles.map(doorOf),
      ...map.queueTiles,
      map.welcome,
      map.entrance,
      parsed.playerStart,
    ];
    for (const t of FIRE_NEIGHBOURS) {
      expect(tileAt(map, t.tx, t.ty), `(${t.tx},${t.ty})`).toBe("grass");
      for (const a of action) expect(a.tx === t.tx && a.ty === t.ty, `(${t.tx},${t.ty}) est une tuile d'action`).toBe(false);
      // Hors de portée de récolte de tout nœud (Chebyshev ≥ 4).
      for (const n of parsed.nodes) {
        expect(cheb(n.tile, t)).toBeGreaterThanOrEqual(4);
        expect(cheb(n.tile, t)).toBeGreaterThan(HARVEST.rangeTiles);
      }
    }
    expect(feedZone(map)).toEqual(FIRE_NEIGHBOURS);
  });

  it("les tuiles fixes des tests existants ne sont pas voisines du feu", () => {
    const fixed = [
      { tx: 1, ty: 1 },
      { tx: 4, ty: 3 },
      { tx: 4, ty: 4 },
      { tx: 4, ty: 6 },
      { tx: 3, ty: 6 },
      { tx: 6, ty: 3 },
      { tx: 7, ty: 6 },
      { tx: 7, ty: 7 },
      ...Array.from({ length: 10 }, (_, ty) => ({ tx: 4, ty: ty + 1 })),
    ];
    for (const t of fixed) expect(cheb(t, FIRE_TILE), `(${t.tx},${t.ty})`).toBeGreaterThan(1);
  });

  it("longueurs BFS des trajets de référence identiques à l'ancienne carte", () => {
    const targets = [
      ...map.queueTiles,
      map.welcome,
      ...parsed.tentTiles,
      ...parsed.slotTiles,
      ...parsed.tentTiles.map(doorOf),
      ...parsed.slotTiles.map(doorOf),
    ];
    const routes: [TilePos, TilePos][] = [
      ...targets.map((t): [TilePos, TilePos] => [map.entrance, t]),
      ...targets.map((t): [TilePos, TilePos] => [t, map.entrance]),
      ...[...parsed.tentTiles, ...parsed.slotTiles].map((t): [TilePos, TilePos] => [map.queueTiles[0]!, t]),
    ];
    for (const [a, b] of routes) {
      const now = findPath(map, a, b);
      const before = findPath(oldMap, a, b);
      expect(now, `(${a.tx},${a.ty}) → (${b.tx},${b.ty})`).not.toBeNull();
      expect(now!.length, `(${a.tx},${a.ty}) → (${b.tx},${b.ty})`).toBe(before!.length);
    }
  });

  it("nextId initial inchangé (le feu n'a pas d'id)", () => {
    expect(fresh().nextId).toBe(10);
  });
});
