// Contrôle des constantes d'équilibrage (src/data/balance.ts) : entiers, bornes, cohérences
// entre constantes, et forme de MAP_LAYOUT. Aucune logique ici, uniquement des données.

import * as balance from "../../src/data/balance";
import {
  BUILD,
  COLD,
  FIRE,
  HARVEST,
  LIMITS,
  LOOP,
  MAP_LAYOUT,
  NODES,
  OFFLINE,
  PICKUP,
  PLAUSIBILITY,
  PLAYER,
  QUEUE,
  RESOURCES,
  SEASONS,
  SLEEP,
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

/** Ressources qu'aucun système ne produit encore (ni nœud, ni récompense de survivant). */
const UNPRODUCED = ["stone", "water", "coins"] as const;

/**
 * Feuilles autorisées à valoir 0 : stocks de départ nuls, et plausibilité des ressources que rien
 * ne produit. Toutes les autres doivent être ≥ 1.
 */
const ZERO_ALLOWED = new Set([
  ...Object.entries(STARTING_RESOURCES)
    .filter(([, v]) => v === 0)
    .map(([k]) => `STARTING_RESOURCES.${k}`),
  ...UNPRODUCED.map((r) => `PLAUSIBILITY.${r}PerTick`),
]);

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

describe("balance — plausibilité (anti-triche, docs/design/save.md §5)", () => {
  // Borne théorique du rythme de production honnête, en unités par tick (asymptotique) :
  // - récolte : un seul joueur, une seule cible par tick (+1 de progression) ⇒ au plus
  //   max(yield / harvestTicks) sur les nœuds qui produisent la ressource ;
  // - récompense des survivants (bois) : un départ par survivant arrivé, donc au plus
  //   woodReward / spawnIntervalMin, et au plus (nombre de tentes) × woodReward / restTicks.
  const harvestRate = (res: "wood" | "food"): number =>
    Math.max(0, ...Object.values(NODES).filter((n) => n.resource === res).map((n) => n.yield / n.harvestTicks));
  const tentCount = (MAP_LAYOUT.join("").split("T").length - 1) + BUILD.slotCosts.length;
  // Récompense maximale d'un départ : paiement de l'aube (woodReward + dawnBonus) ≥ fin de repos ≥ froid.
  const maxReward = SURVIVOR.woodReward + SLEEP.dawnBonus;
  const survivorRate = Math.min(
    maxReward / SURVIVOR.spawnIntervalMin,
    (tentCount * maxReward) / SURVIVOR.restTicks,
  );
  const MARGIN = 2;

  it(`PLAUSIBILITY.woodPerTick ≥ ${MARGIN} × borne théorique (récolte + survivants)`, () => {
    const bound = harvestRate("wood") + survivorRate;
    expect(bound).toBeGreaterThan(0);
    expect(
      PLAUSIBILITY.woodPerTick,
      `borne bois ${bound.toFixed(3)}/tick : une feature a rendu le jeu plus rapide, relever PLAUSIBILITY.woodPerTick`,
    ).toBeGreaterThanOrEqual(MARGIN * bound);
  });

  it(`PLAUSIBILITY.foodPerTick ≥ ${MARGIN} × borne théorique (récolte)`, () => {
    const bound = harvestRate("food");
    expect(bound).toBeGreaterThan(0);
    expect(
      PLAUSIBILITY.foodPerTick,
      `borne nourriture ${bound.toFixed(3)}/tick : une feature a rendu le jeu plus rapide, relever PLAUSIBILITY.foodPerTick`,
    ).toBeGreaterThanOrEqual(MARGIN * bound);
  });

  it("une entrée <res>PerTick par ressource du stock, et rien d'autre", () => {
    expect(Object.keys(PLAUSIBILITY).sort()).toEqual(Object.keys(STARTING_RESOURCES).map((r) => `${r}PerTick`).sort());
  });

  it("pierre, eau, pièces : aucun système ne les produit encore ⇒ PerTick vaut exactement 0", () => {
    // Producteurs actuels : nœuds (NODES.*.resource) et récompense des survivants (bois).
    const produced = new Set<string>(["wood", ...Object.values(NODES).map((n) => n.resource)]);
    for (const r of UNPRODUCED) {
      expect(produced.has(r), `${r} est maintenant produit : relever PLAUSIBILITY.${r}PerTick et adapter ce test`).toBe(false);
      expect(PLAUSIBILITY[`${r}PerTick`], `PLAUSIBILITY.${r}PerTick`).toBe(0);
    }
    // Et les ressources produites ont bien une borne non nulle.
    for (const r of produced) {
      expect(PLAUSIBILITY[`${r}PerTick` as keyof typeof PLAUSIBILITY], `PLAUSIBILITY.${r}PerTick`).toBeGreaterThan(0);
    }
  });
});

describe("balance — MAP_LAYOUT", () => {
  const KNOWN: readonly MapChar[] = ["#", "R", ".", "T", "B", "W", "Q", "E", "P", "A", "M", "F"];

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

  it("exactement un feu de camp F, en (9,5)", () => {
    expect(MAP_LAYOUT.join("").split("F").length - 1).toBe(1);
    expect(MAP_LAYOUT[5]![9]).toBe("F");
  });
});

describe("balance — jour/nuit, feu, sommeil (docs/design/day-night.md §6.2)", () => {
  const CYCLE = TIME.dayTicks + TIME.nightTicks;
  /** Combustions par boucle naïve sur [from, to] (référence indépendante de src/core/time.ts). */
  const naiveBurns = (from: number, to: number): number => {
    let n = 0;
    for (let t = from; t <= to; t++) {
      const night = t % CYCLE >= TIME.dayTicks;
      if (t % (night ? FIRE.nightBurnIntervalTicks : FIRE.dayBurnIntervalTicks) === 0) n++;
    }
    return n;
  };

  it("divisibilités : dayBurn divise dayTicks et le cycle ; nightBurn divise dayTicks, nightTicks et le cycle", () => {
    expect(TIME.dayTicks % FIRE.dayBurnIntervalTicks).toBe(0);
    expect(CYCLE % FIRE.dayBurnIntervalTicks).toBe(0);
    expect(TIME.dayTicks % FIRE.nightBurnIntervalTicks).toBe(0);
    expect(TIME.nightTicks % FIRE.nightBurnIntervalTicks).toBe(0);
    expect(CYCLE % FIRE.nightBurnIntervalTicks).toBe(0);
  });

  it("feu : initialWood ≤ capacity, lowWood < capacity, pas entiers ≥ 1", () => {
    expect(FIRE.initialWood).toBeLessThanOrEqual(FIRE.capacity);
    expect(FIRE.lowWood).toBeLessThan(FIRE.capacity);
    for (const v of [FIRE.burnPerStep, FIRE.feedIntervalTicks, FIRE.feedPerStep, FIRE.feedRangeTiles, FIRE.feedDelayTicks]) {
      expect(isPosInt(v)).toBe(true);
    }
  });

  it("feu : délai d'arrêt avant alimentation plus court que la traversée de la zone", () => {
    // Traverser une tuile de la zone prend unitsPerTile / speed ticks : un passage sans arrêt dure
    // plus longtemps que le délai (c'est donc bien l'immobilité, pas la durée, qui déclenche).
    expect(FIRE.feedDelayTicks).toBeLessThan((3 * WORLD.unitsPerTile) / PLAYER.speed);
  });

  it("froid : rewardDivisor ≥ 1 ; sommeil : dawnBonus entier ≥ 0", () => {
    expect(isPosInt(COLD.rewardDivisor)).toBe(true);
    expect(Number.isSafeInteger(SLEEP.dawnBonus) && SLEEP.dawnBonus >= 0).toBe(true);
  });

  it("feu ignoré : extinction exactement au milieu de la nuit 1 (initialWood − burns(jour 1) = burns([2400, 3000]))", () => {
    const mid = TIME.dayTicks + TIME.nightTicks / 2;
    expect(FIRE.burnPerStep * (naiveBurns(1, TIME.dayTicks - 1) + naiveBurns(TIME.dayTicks, mid))).toBe(FIRE.initialWood);
  });

  it("feu plein au crépuscule ⇒ tient toute la nuit (capacity > combustions d'une nuit)", () => {
    expect(FIRE.capacity).toBeGreaterThan(FIRE.burnPerStep * naiveBurns(TIME.dayTicks, CYCLE - 1));
  });

  it("présentation : aube + crépuscule tiennent dans le jour", () => {
    expect(TIME.dawnTicks + TIME.duskTicks).toBeLessThan(TIME.dayTicks);
  });
});
