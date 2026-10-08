import { MAP_LAYOUT } from "../../src/data/balance";
import { isWalkable, manhattan, parseMap } from "../../src/core/map";
import { findPath } from "../../src/core/path";
import type { TilePos } from "../../src/core/state";

const { map } = parseMap(MAP_LAYOUT);

function expectContiguous(from: TilePos, path: TilePos[]): void {
  let prev = from;
  for (const t of path) {
    expect(isWalkable(map, t)).toBe(true);
    expect(manhattan(prev, t)).toBe(1);
    prev = t;
  }
}

describe("findPath (BFS)", () => {
  it("trouve le plus court chemin (entrée → tête de file)", () => {
    const head = map.queueTiles[0]!;
    const p = findPath(map, map.entrance, head)!;
    expect(p).toHaveLength(manhattan(map.entrance, head));
    expect(p[p.length - 1]).toEqual(head);
    expectContiguous(map.entrance, p);
  });

  it("renvoie [] si départ = arrivée", () => {
    expect(findPath(map, map.welcome, map.welcome)).toEqual([]);
  });

  it("contourne le bloc ## (11..12, 4)", () => {
    const from = { tx: 12, ty: 5 };
    const to = { tx: 12, ty: 3 };
    const p = findPath(map, from, to)!;
    expect(p).toHaveLength(4);
    expectContiguous(from, p);
    expect(p).not.toContainEqual({ tx: 12, ty: 4 });
  });

  it("contourne les rochers et le ## de gauche (file → tente)", () => {
    const from = map.queueTiles[0]!;
    const to = { tx: 2, ty: 2 };
    const p = findPath(map, from, to)!;
    expectContiguous(from, p);
    expect(p).toHaveLength(manhattan(from, to)); // un plus court chemin manhattan existe ici
  });

  it("renvoie null si la cible est inatteignable ou un obstacle", () => {
    expect(findPath(map, map.entrance, { tx: 5, ty: 4 })).toBeNull(); // rocher
    expect(findPath(map, map.entrance, { tx: -1, ty: 0 })).toBeNull(); // hors carte
    const island = parseMap(["######", "#PW#.#", "#QE###", "######"]).map;
    expect(findPath(island, { tx: 1, ty: 1 }, { tx: 4, ty: 1 })).toBeNull();
  });

  it("est déterministe", () => {
    const a = findPath(map, map.entrance, { tx: 2, ty: 2 });
    const b = findPath(map, map.entrance, { tx: 2, ty: 2 });
    expect(a).toEqual(b);
  });
});
