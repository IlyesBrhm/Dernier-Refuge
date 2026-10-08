import { BUILD, HARVEST, MAP_LAYOUT, QUEUE, STARTING_RESOURCES, SURVIVOR, WORLD } from "../../src/data/balance";
import { doorOf, isWalkable, manhattan, parseMap, tileAt, tileCenter } from "../../src/core/map";
import { findPath } from "../../src/core/path";
import { cloneState, createInitialState, type TilePos } from "../../src/core/state";
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

  it("contient les 5 nœuds de la carte, prêts, ids attribués après tente et emplacements", () => {
    const s = fresh();
    expect(s.nodes).toEqual([
      { id: 5, kind: "tree", tile: { tx: 14, ty: 1 }, status: "ready", progress: 0, regrowTicksLeft: 0 },
      { id: 6, kind: "bush", tile: { tx: 14, ty: 7 }, status: "ready", progress: 0, regrowTicksLeft: 0 },
      { id: 7, kind: "tree", tile: { tx: 2, ty: 9 }, status: "ready", progress: 0, regrowTicksLeft: 0 },
      { id: 8, kind: "tree", tile: { tx: 4, ty: 9 }, status: "ready", progress: 0, regrowTicksLeft: 0 },
      { id: 9, kind: "bush", tile: { tx: 14, ty: 9 }, status: "ready", progress: 0, regrowTicksLeft: 0 },
    ]);
    expect(s.tents.map((t) => t.id)).toEqual([1]);
    expect(s.buildSlots.map((b) => b.id)).toEqual([2, 3, 4]);
    expect(s.nextId).toBe(10);
  });

  it("cloneState copie les nœuds en profondeur", () => {
    const s = fresh();
    const c = cloneState(s);
    c.nodes[0]!.progress = 3;
    c.nodes[0]!.tile.tx = 0;
    expect(s.nodes[0]!.progress).toBe(0);
    expect(s.nodes[0]!.tile.tx).toBe(14);
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

  it("parse A ⇒ nœud tree, M ⇒ nœud bush, tuile \"node\" non praticable, ordre de lecture", () => {
    const p = parseMap(["#######", "#PAWM.#", "#QE####"]);
    expect(p.nodes).toEqual([
      { kind: "tree", tile: { tx: 2, ty: 1 } },
      { kind: "bush", tile: { tx: 4, ty: 1 } },
    ]);
    expect(tileAt(p.map, 2, 1)).toBe("node");
    expect(tileAt(p.map, 4, 1)).toBe("node");
    expect(isWalkable(p.map, { tx: 2, ty: 1 })).toBe(false);
    expect(isWalkable(p.map, { tx: 4, ty: 1 })).toBe(false);
    expect(findPath(p.map, { tx: 1, ty: 1 }, { tx: 2, ty: 1 })).toBeNull();
  });

  it("chaque nœud a une voisine 4-connexe praticable, atteignable depuis E (et retour)", () => {
    for (const n of parsed.nodes) {
      const { tx, ty } = n.tile;
      const spots = [
        { tx, ty: ty - 1 },
        { tx: tx + 1, ty },
        { tx, ty: ty + 1 },
        { tx: tx - 1, ty },
      ].filter((t) => isWalkable(map, t) && findPath(map, map.entrance, t) !== null);
      expect(spots.length, `nœud (${tx},${ty})`).toBeGreaterThan(0);
    }
  });

  it("aucun nœud n'est à portée de T, B, des portes, de W, P, Q ou E", () => {
    const actionTiles = [
      ...parsed.tentTiles,
      ...parsed.slotTiles,
      ...parsed.tentTiles.map(doorOf),
      ...parsed.slotTiles.map(doorOf),
      ...map.queueTiles,
      map.welcome,
      map.entrance,
      parsed.playerStart,
    ];
    for (const n of parsed.nodes) {
      for (const t of actionTiles) {
        const d = Math.max(Math.abs(n.tile.tx - t.tx), Math.abs(n.tile.ty - t.ty));
        expect(d, `nœud (${n.tile.tx},${n.tile.ty}) ↔ (${t.tx},${t.ty})`).toBeGreaterThan(HARVEST.rangeTiles);
      }
    }
  });

  it("chemins des survivants valides avec les nœuds : E → file → W, file → tentes/emplacements, tentes → E, sans traverser de nœud", () => {
    const isNode = (t: TilePos) => parsed.nodes.some((n) => n.tile.tx === t.tx && n.tile.ty === t.ty);
    const routes: [TilePos, TilePos][] = [
      [map.entrance, map.queueTiles[map.queueTiles.length - 1]!],
      ...map.queueTiles.map((q): [TilePos, TilePos] => [map.entrance, q]),
      [map.queueTiles[0]!, map.welcome],
      ...[...parsed.tentTiles, ...parsed.slotTiles].map((t): [TilePos, TilePos] => [map.queueTiles[0]!, t]),
      ...[...parsed.tentTiles, ...parsed.slotTiles].map((t): [TilePos, TilePos] => [t, map.entrance]),
      ...[...parsed.tentTiles, ...parsed.slotTiles].map((t): [TilePos, TilePos] => [map.entrance, doorOf(t)]),
      [map.entrance, parsed.playerStart],
    ];
    for (const [from, to] of routes) {
      const p = findPath(map, from, to);
      expect(p, `(${from.tx},${from.ty}) → (${to.tx},${to.ty})`).not.toBeNull();
      for (const t of p!) expect(isNode(t)).toBe(false);
    }
  });

  it("rejette un layout malformé", () => {
    expect(() => parseMap(["###", "##"])).toThrow();
    expect(() => parseMap(["#PWQ#", "#####"])).toThrow(); // pas de E
    expect(() => parseMap(["#PWQEX"])).toThrow(); // caractère inconnu
    expect(() => parseMap([])).toThrow();
  });
});
