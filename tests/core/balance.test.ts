// Contrôle des constantes d'équilibrage (src/data/balance.ts) : entiers, bornes, cohérences
// entre constantes, et forme de MAP_LAYOUT. Aucune logique ici, uniquement des données.

import * as balance from "../../src/data/balance";
import {
  BUILD,
  HARVEST,
  LIMITS,
  LOOP,
  MAP_LAYOUT,
  NODES,
  OFFLINE,
  PICKUP,
  PLAYER,
  QUEUE,
  RESOURCES,
  SEASONS,
  STARTING_RESOURCES,
  SURVIVOR,
  TENT,
  TIME,
  WELCOME,
  WORLD,
  type MapChar,
  type NodeKind,
} from "../../src/data/balance";

const isPosInt = (v: unknown): boolean => typeof v === "number" && Number.isSafeInteger(v) && v >= 1;

/** Toutes les feuilles numériques d'une valeur, avec leur chemin. */
function numericLeaves(v: unknown, path: string, out: [string, number][] = []): [string, number][] {
  if (typeof v === "number") out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => numericLeaves(x, `${path}[${i}]`, out));
  else if (v !== null && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) numericLeaves(x, `${path}.${k}`, out);
  }
  return out;
}

/** Feuilles autorisées à valoir 0 (stock de départ nul). Toutes les autres doivent être ≥ 1. */
const ZERO_ALLOWED = new Set(
  Object.entries(STARTING_RESOURCES)
    .filter(([, v]) => v === 0)
    .map(([k]) => `STARTING_RESOURCES.${k}`),
);

describe("balance — règle générale", () => {
  const leaves = Object.entries(balance).flatMap(([name, v]) => numericLeaves(v, name));

  it("il y a bien des constantes numériques à contrôler", () => {
    expect(leaves.length).toBeGreaterThan(30);
  });

  it("toutes les constantes numériques sont des entiers sûrs ≥ 0", () => {
    for (const [path, v] of leaves) {
      expect(Number.isSafeInteger(v), `${path} = ${v} non entier`).toBe(true);
      expect(v, path).toBeGreaterThanOrEqual(0);
    }
  });

  it("toutes sont strictement positives, sauf les stocks de départ nuls", () => {
    for (const [path, v] of leaves) {
      if (ZERO_ALLOWED.has(path)) continue;
      expect(v, path).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("balance — récolte", () => {
  const kinds = Object.keys(NODES) as NodeKind[];

  it("NODES contient exactement tree et bush", () => {
    expect(kinds.sort()).toEqual(["bush", "tree"]);
  });

  it.each(["tree", "bush"] as NodeKind[])("NODES.%s : yield, harvestTicks, regrowTicks entiers ≥ 1", (kind) => {
    const n = NODES[kind];
    expect(isPosInt(n.yield)).toBe(true);
    expect(isPosInt(n.harvestTicks)).toBe(true);
    expect(isPosInt(n.regrowTicks)).toBe(true);
  });

  it("chaque nœud produit une ressource valide (drop wood/food, existant dans le stock)", () => {
    for (const kind of kinds) {
      const r = NODES[kind].resource;
      expect(["wood", "food"]).toContain(r);
      expect(Object.keys(STARTING_RESOURCES)).toContain(r);
    }
    expect(NODES.tree.resource).toBe("wood");
    expect(NODES.bush.resource).toBe("food");
  });

  it("un rendement tient dans le stock (yield ≤ cap)", () => {
    for (const kind of kinds) expect(NODES[kind].yield).toBeLessThanOrEqual(RESOURCES.cap);
  });

  it("HARVEST.rangeTiles est un entier ≥ 1 et ne couvre pas toute la carte", () => {
    expect(isPosInt(HARVEST.rangeTiles)).toBe(true);
    expect(HARVEST.rangeTiles).toBeLessThan(Math.min(MAP_LAYOUT.length, MAP_LAYOUT[0].length));
  });
});

describe("balance — cohérences entre constantes", () => {
  it("temps : ticks entiers, LOOP.tickMs = 1000 / ticksPerSecond", () => {
    expect(isPosInt(TIME.ticksPerSecond)).toBe(true);
    expect(LOOP.tickMs * TIME.ticksPerSecond).toBe(1000);
    expect(isPosInt(TIME.dayTicks) && isPosInt(TIME.nightTicks) && isPosInt(TIME.daysPerSeason)).toBe(true);
    expect(LOOP.maxFrameDeltaMs).toBeGreaterThanOrEqual(LOOP.tickMs);
    expect(isPosInt(OFFLINE.maxTicks)).toBe(true);
  });

  it("4 saisons distinctes", () => {
    expect(SEASONS).toHaveLength(4);
    expect(new Set(SEASONS).size).toBe(4);
  });

  it("stocks de départ entiers dans [0, cap], 5 ressources", () => {
    expect(Object.keys(STARTING_RESOURCES).sort()).toEqual(["coins", "food", "stone", "water", "wood"]);
    for (const v of Object.values(STARTING_RESOURCES)) {
      expect(Number.isSafeInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(RESOURCES.cap);
    }
  });

  it("monde : tuile paire (centres entiers), hitbox du joueur plus petite qu'une tuile", () => {
    expect(WORLD.unitsPerTile % 2).toBe(0);
    expect(2 * PLAYER.halfSize).toBeLessThan(WORLD.unitsPerTile);
    expect(PLAYER.diagonalSpeed).toBe(Math.round(PLAYER.speed / Math.SQRT2));
    expect(PLAYER.speed).toBeLessThan(WORLD.unitsPerTile);
  });

  it("survivants : intervalle d'arrivée ordonné, vitesse < 1 tuile/tick", () => {
    expect(SURVIVOR.spawnIntervalMin).toBeLessThanOrEqual(SURVIVOR.spawnIntervalMax);
    expect(SURVIVOR.speed).toBeLessThan(WORLD.unitsPerTile);
  });

  it("file, accueil, nettoyage, commandes : entiers ≥ 1", () => {
    for (const v of [QUEUE.maxLength, WELCOME.ticks, TENT.cleanTicks, LIMITS.maxCommandsPerTick]) {
      expect(isPosInt(v)).toBe(true);
    }
  });

  it("ramassage : rayon de collecte < rayon d'aimantation", () => {
    expect(PICKUP.collectRadius).toBeLessThan(PICKUP.magnetRadius);
  });

  it("construction : coûts croissants, autant que d'emplacements B sur la carte", () => {
    expect(BUILD.slotCosts.length).toBe(MAP_LAYOUT.join("").split("B").length - 1);
    for (let i = 1; i < BUILD.slotCosts.length; i++) {
      expect(BUILD.slotCosts[i]!).toBeGreaterThan(BUILD.slotCosts[i - 1]!);
    }
    for (const c of BUILD.slotCosts) expect(c).toBeLessThanOrEqual(RESOURCES.cap);
  });
});

describe("balance — MAP_LAYOUT", () => {
  const KNOWN: readonly MapChar[] = ["#", "R", ".", "T", "B", "W", "Q", "E", "P", "A", "M"];

  it("12 lignes × 16 colonnes", () => {
    expect(MAP_LAYOUT).toHaveLength(12);
    for (const row of MAP_LAYOUT) expect(row).toHaveLength(16);
  });

  it("uniquement des caractères connus", () => {
    for (const [ty, row] of MAP_LAYOUT.entries()) {
      for (const [tx, c] of [...row].entries()) {
        expect(KNOWN as readonly string[], `'${c}' en (${tx},${ty})`).toContain(c);
      }
    }
  });

  it("bordure fermée : uniquement des # sauf l'entrée E", () => {
    const h = MAP_LAYOUT.length;
    const w = MAP_LAYOUT[0].length;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        if (tx !== 0 && ty !== 0 && tx !== w - 1 && ty !== h - 1) continue;
        expect(["#", "E"], `(${tx},${ty})`).toContain(MAP_LAYOUT[ty]![tx]);
      }
    }
  });

  it("nœuds : 3 arbres A et 2 buissons M", () => {
    const flat = MAP_LAYOUT.join("");
    expect(flat.split("A").length - 1).toBe(3);
    expect(flat.split("M").length - 1).toBe(2);
  });
});
