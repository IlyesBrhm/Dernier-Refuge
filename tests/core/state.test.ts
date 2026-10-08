import { BUILD, MAP_LAYOUT, QUEUE, STARTING_RESOURCES, SURVIVOR, WORLD } from "../../src/data/balance";
import { doorOf, isWalkable, manhattan, parseMap, tileCenter } from "../../src/core/map";
import { findPath } from "../../src/core/path";
import { createInitialState } from "../../src/core/state";
import { expectValid, fresh } from "./helpers";

describe("état initial", () => {
  it("contient 1 tente libre, 3 emplacements aux coûts des données, ressources de départ", () => {
    const s = fresh();
    expect(s.tick).toBe(0);
    expect(s.tents).toHaveLength(1);
    expect(s.tents[0]).toMatchObject({ status: "free", occupantId: null, tile: { tx: 2, ty: 2 } });
    expect(s.buildSlots.map((b) => b.cost)).toEqual([...BUILD.slotCosts]);
    expect(s.buildSlots.every((b) => b.paid === 0 && b.builtTentId === null)).toBe(true);
    expect(s.resources).toEqual(STARTING_RESOURCES);
    expect(s.spawnTimer).toBe(SURVIVOR.firstSpawnTicks);
    expect(s.queue).toEqual([]);
    expect(s.survivors).toEqual([]);
    expect(s.drops).toEqual([]);
    expectValid(s);
  });

  it("place le joueur au centre de P", () => {
    const parsed = parseMap(MAP_LAYOUT);
    expect(fresh().player.pos).toEqual(tileCenter(parsed.playerStart));
  });

  it("est déterministe et sérialisable JSON", () => {
    const a = createInitialState(7);
    expect(createInitialState(7)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});

describe("carte", () => {
  const parsed = parseMap(MAP_LAYOUT);
  const { map } = parsed;

  it("a les dimensions du layout (lignes de même longueur)", () => {
    expect(map.height).toBe(MAP_LAYOUT.length);
    for (const row of MAP_LAYOUT) expect(row.length).toBe(map.width);
    expect(map.tiles).toHaveLength(map.width * map.height);
  });

  it("a exactement un P, un W, un E", () => {
    const count = (c: string) => MAP_LAYOUT.join("").split(c).length - 1;
    expect(count("P")).toBe(1);
    expect(count("W")).toBe(1);
    expect(count("E")).toBe(1);
  });

  it("a QUEUE.maxLength places de file contiguës, la tête adjacente à W", () => {
    expect(map.queueTiles).toHaveLength(QUEUE.maxLength);
    expect(manhattan(map.queueTiles[0]!, map.welcome)).toBe(1);
    for (let i = 1; i < map.queueTiles.length; i++) {
      expect(manhattan(map.queueTiles[i]!, map.queueTiles[i - 1]!)).toBe(1);
    }
  });

  it("a des portes en herbe pour la tente et chaque emplacement", () => {
    for (const t of [...parsed.tentTiles, ...parsed.slotTiles]) {
      const door = doorOf(t);
      expect(isWalkable(map, door)).toBe(true);
    }
  });

  it("rend tout atteignable depuis l'entrée par BFS", () => {
    const targets = [
      ...parsed.tentTiles,
      ...parsed.slotTiles,
      ...parsed.tentTiles.map(doorOf),
      ...parsed.slotTiles.map(doorOf),
      ...map.queueTiles,
      map.welcome,
      parsed.playerStart,
    ];
    for (const t of targets) {
      expect(findPath(map, map.entrance, t), `(${t.tx},${t.ty})`).not.toBeNull();
      // et retour vers la sortie
      expect(findPath(map, t, map.entrance)).not.toBeNull();
    }
    // De la tête de file vers chaque tente possible.
    for (const t of [...parsed.tentTiles, ...parsed.slotTiles]) {
      expect(findPath(map, map.queueTiles[0]!, t)).not.toBeNull();
    }
  });

  it("autorise le joueur au départ (pas d'obstacle sous P)", () => {
    expect(WORLD.unitsPerTile).toBeGreaterThan(0);
    expectValid(fresh());
  });

  it("rejette un layout malformé", () => {
    expect(() => parseMap(["###", "##"])).toThrow();
    expect(() => parseMap(["#PWQ#", "#####"])).toThrow(); // pas de E
    expect(() => parseMap(["#PWQEX"])).toThrow(); // caractère inconnu
    expect(() => parseMap([])).toThrow();
  });
});
