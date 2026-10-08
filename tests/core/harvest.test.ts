// Récolte des nœuds (docs/design/harvest.md §1) : portée, cible unique, progression conservée,
// épuisement, repousse, drops typés, stock plein, déterminisme.

import { HARVEST, NODES, RESOURCES, type NodeKind } from "../../src/data/balance";
import {
  findHarvestTarget,
  isNodeInRange,
  maxRegrowDelay,
  nodesInRange,
  regrowDelay,
} from "../../src/core/harvest-rules";
import { checkInvariants } from "../../src/core/invariants";
import { isWalkable, sameTile, tileCenter, tileOf } from "../../src/core/map";
import { dropsAt, harvestTarget, nodeHarvestRatio, nodeRegrowRatio } from "../../src/core/selectors";
import type { GameState, ResourceNode, TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { harvestSystem } from "../../src/core/systems/harvest";
import { nodeRegrowSystem } from "../../src/core/systems/nodeRegrow";
import {
  accumulate,
  conservationErrors,
  deepFreeze,
  edit,
  emptyProduced,
  expectValid,
  fresh,
  move,
  place,
  run,
  walkTo,
} from "./helpers";

const TREE_TILE: TilePos = { tx: 14, ty: 1 }; // A (14,1)
const BUSH_TILE: TilePos = { tx: 14, ty: 7 }; // M (14,7)
const WEST_A: TilePos = { tx: 2, ty: 9 }; // A (2,9)
const EAST_A: TilePos = { tx: 4, ty: 9 }; // A (4,9)
const BETWEEN: TilePos = { tx: 3, ty: 9 }; // à portée de (2,9) et (4,9), à égale distance

const TREE = NODES.tree;
const BUSH = NODES.bush;

function nodeAt(s: GameState, tile: TilePos): ResourceNode {
  const n = s.nodes.find((x) => sameTile(x.tile, tile));
  if (!n) throw new Error(`pas de nœud en (${tile.tx},${tile.ty})`);
  return n;
}

/** Joueur à gauche de l'arbre (14,1), immobile. */
function besideTree(fn?: (d: GameState) => void): GameState {
  const s = place(fresh(), { tx: 13, ty: 1 });
  return fn ? edit(s, fn) : s;
}

/** Avance tick par tick en vérifiant invariants ET conservation bois + nourriture. */
function runConserved(state: GameState, n: number, produced = emptyProduced()) {
  let s = state;
  let p = produced;
  for (let i = 0; i < n; i++) {
    const next = tick(s);
    expectValid(next);
    p = accumulate(p, s, next);
    expect(conservationErrors(next, p)).toEqual([]);
    s = next;
  }
  return { s, produced: p };
}

describe("récolte — cas nominal", () => {
  it("arbre : +1/tick, épuisé à harvestTicks, bois +yield dans le même tick, aucun drop restant", () => {
    const s0 = besideTree();
    const before = s0.resources.wood;
    let s = s0;
    for (let k = 1; k < TREE.harvestTicks; k++) {
      s = run(s, 1);
      expect(nodeAt(s, TREE_TILE)).toMatchObject({ status: "ready", progress: k, regrowTicksLeft: 0 });
      expect(s.resources.wood).toBe(before);
    }
    s = run(s, 1);
    expect(nodeAt(s, TREE_TILE)).toMatchObject({ status: "depleted", progress: 0, regrowTicksLeft: TREE.regrowTicks });
    expect(s.resources.wood).toBe(before + TREE.yield);
    expect(s.drops).toEqual([]);
  });

  it("buisson : nourriture +yield, bois inchangé", () => {
    const s0 = place(fresh(), { tx: 13, ty: 7 });
    const { s } = runConserved(s0, BUSH.harvestTicks);
    expect(nodeAt(s, BUSH_TILE)).toMatchObject({ status: "depleted", regrowTicksLeft: BUSH.regrowTicks });
    expect(s.resources.food).toBe(s0.resources.food + BUSH.yield);
    expect(s.resources.wood).toBe(s0.resources.wood);
  });

  it("conservation sur une récolte complète (bois)", () => {
    const { s } = runConserved(besideTree(), TREE.harvestTicks + 5);
    expect(nodeAt(s, TREE_TILE).status).toBe("depleted");
  });

  it("ne consomme pas le RNG du jeu", () => {
    const a = run(besideTree(), 100);
    const b = run(place(fresh(), { tx: 11, ty: 1 }), 100); // hors de portée
    expect(nodeAt(a, TREE_TILE).status).toBe("depleted");
    expect(a.rng).toBe(b.rng);
    expect(a.spawnTimer).toBe(b.spawnTimer);
  });

  it("ne mute pas l'état d'entrée (tick et systèmes isolés)", () => {
    const s = deepFreeze(besideTree((d) => void (nodeAt(d, TREE_TILE).progress = TREE.harvestTicks - 1)));
    const snap = JSON.stringify(s);
    const next = tick(s);
    expect(nodeAt(next, TREE_TILE).status).toBe("depleted");
    expect(harvestSystem(s)).not.toBe(s);
    expect(nodeRegrowSystem(s)).not.toBe(s);
    expect(JSON.stringify(s)).toBe(snap);
  });

  it("déterministe : même état + mêmes ticks ⇒ même état", () => {
    expect(run(besideTree(), 400)).toEqual(run(besideTree(), 400));
  });
});

describe("récolte — portée (Chebyshev en tuiles)", () => {
  it(`HARVEST.rangeTiles = ${HARVEST.rangeTiles} : les 8 voisines sont à portée, pas la tuile à 2`, () => {
    const s = fresh();
    const tree = nodeAt(s, TREE_TILE);
    expect(isNodeInRange(place(s, { tx: 13, ty: 2 }), tree)).toBe(true); // diagonale
    expect(isNodeInRange(place(s, { tx: 14, ty: 2 }), tree)).toBe(true); // sud
    expect(isNodeInRange(place(s, { tx: 12, ty: 1 }), tree)).toBe(false); // à 2
    expect(isNodeInRange(place(s, { tx: 12, ty: 3 }), tree)).toBe(false);
  });

  it("voisine diagonale ⇒ progresse", () => {
    const s = run(place(fresh(), { tx: 13, ty: 2 }), 4);
    expect(nodeAt(s, TREE_TILE).progress).toBe(4);
  });

  it("à 2 tuiles ⇒ rien", () => {
    const s = run(place(fresh(), { tx: 12, ty: 1 }), TREE.harvestTicks * 3);
    expect(nodeAt(s, TREE_TILE)).toMatchObject({ status: "ready", progress: 0 });
    expect(s.nodes.every((n) => n.progress === 0 && n.status === "ready")).toBe(true);
  });

  it("pousser contre le nœud 1000 ticks : le joueur n'entre jamais dans sa tuile (obstacle permanent)", () => {
    let s = move(besideTree(), 1, 0);
    for (let i = 0; i < 1000; i++) {
      s = tick(s);
      expect(sameTile(tileOf(s.player.pos), TREE_TILE)).toBe(false);
      expect(isWalkable(s.map, TREE_TILE)).toBe(false);
    }
    expectValid(s);
    expect(tileOf(s.player.pos)).toEqual({ tx: 13, ty: 1 });
  });

  it("les nœuds (prêts ou épuisés) ne sont pas praticables", () => {
    const s = run(besideTree(), TREE.harvestTicks);
    for (const n of s.nodes) expect(isWalkable(s.map, n.tile)).toBe(false);
    expect(nodeAt(s, TREE_TILE).status).toBe("depleted");
  });
});

describe("récolte — progression conservée", () => {
  it("le joueur s'éloigne en pleine récolte (commandes uniquement) : progression conservée, un seul yield au retour", () => {
    const s0 = besideTree();
    let s = run(s0, 7);
    s = walkTo(s, { tx: 10, ty: 1 });
    const kept = nodeAt(s, TREE_TILE).progress;
    expect(kept).toBeGreaterThanOrEqual(7);
    expect(kept).toBeLessThan(TREE.harvestTicks);
    s = run(s, 100);
    expect(nodeAt(s, TREE_TILE)).toMatchObject({ status: "ready", progress: kept });

    s = walkTo(s, { tx: 13, ty: 1 });
    const back = nodeAt(s, TREE_TILE).progress;
    expect(back).toBeGreaterThanOrEqual(kept);
    expect(back).toBeLessThan(TREE.harvestTicks);
    s = run(s, TREE.harvestTicks - back - 1);
    expect(nodeAt(s, TREE_TILE).status).toBe("ready");
    expect(s.resources.wood).toBe(s0.resources.wood);
    s = run(s, 1);
    expect(nodeAt(s, TREE_TILE).status).toBe("depleted");
    expect(s.resources.wood).toBe(s0.resources.wood + TREE.yield);
  });

  it("aller-retour à chaque tick entre portée et hors portée : progress = ticks passés à portée", () => {
    let s = fresh();
    let inRange = 0;
    for (let i = 0; i < 2 * (TREE.harvestTicks - 1); i++) {
      const near = i % 2 === 0;
      s = run(place(s, near ? { tx: 13, ty: 1 } : { tx: 11, ty: 1 }), 1);
      if (near) inRange++;
      expect(nodeAt(s, TREE_TILE).progress).toBe(inRange);
    }
  });
});

describe("récolte — stock plein (rien n'est détruit)", () => {
  it("bois = cap : récolte terminée, drop de yield sur la tuile du joueur, rien de crédité", () => {
    const s0 = place(fresh(), { tx: 13, ty: 2 });
    const full = edit(s0, (d) => void (d.resources.wood = RESOURCES.cap));
    let s = full;
    let produced = emptyProduced();
    // Le registre part du stock modifié : on compare par différence.
    for (let i = 0; i < TREE.harvestTicks; i++) {
      const next = tick(s);
      expectValid(next);
      produced = accumulate(produced, s, next);
      s = next;
    }
    expect(nodeAt(s, TREE_TILE).status).toBe("depleted");
    expect(produced.wood).toBe(TREE.yield);
    expect(s.resources.wood).toBe(RESOURCES.cap);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]).toMatchObject({ resource: "wood", amount: TREE.yield, pos: tileCenter({ tx: 13, ty: 2 }) });
  });

  it("bois = cap - 1 : 1 crédité, yield - 1 au sol", () => {
    const s0 = edit(besideTree(), (d) => void (d.resources.wood = RESOURCES.cap - 1));
    const s = run(s0, TREE.harvestTicks);
    expect(s.resources.wood).toBe(RESOURCES.cap);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]!.amount).toBe(TREE.yield - 1);
  });

  it("deux récoltes stock plein sur la même tuile ⇒ un seul drop de 2 × yield", () => {
    const s0 = edit(besideTree(), (d) => void (d.resources.wood = RESOURCES.cap));
    const s = run(s0, TREE.harvestTicks + regrowDelay(s0, "tree") + TREE.harvestTicks - 1);
    expect(nodeAt(s, TREE_TILE).status).toBe("depleted");
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]).toMatchObject({ resource: "wood", amount: 2 * TREE.yield });
  });

  it("nourriture pleine : le drop de baies reste au sol, le bois n'est pas affecté", () => {
    const s0 = edit(place(fresh(), { tx: 13, ty: 7 }), (d) => void (d.resources.food = RESOURCES.cap));
    const s = run(s0, BUSH.harvestTicks);
    expect(s.resources.food).toBe(RESOURCES.cap);
    expect(s.drops).toEqual([expect.objectContaining({ resource: "food", amount: BUSH.yield })]);
    expect(s.resources.wood).toBe(s0.resources.wood);
  });
});

describe("récolte — épuisement et repousse", () => {
  it("un nœud épuisé ne donne rien (à portée pendant regrowTicks - 1 ticks)", () => {
    const depleted = run(besideTree(), TREE.harvestTicks);
    const s = run(depleted, TREE.regrowTicks - 1);
    expect(nodeAt(s, TREE_TILE)).toMatchObject({ status: "depleted", progress: 0, regrowTicksLeft: 1 });
    expect(s.drops).toEqual([]);
    expect(s.resources.wood).toBe(depleted.resources.wood);
    expect(nodesInRange(s)).toEqual([]);
    expect(findHarvestTarget(s)).toBeNull();
  });

  it("repousse pendant que le joueur est à portée : prêt au tick t0 + R avec progress 1, ré-épuisé à t0 + R + H - 1", () => {
    let s = besideTree();
    s = run(s, TREE.harvestTicks);
    const t0 = s.tick;
    const R = regrowDelay(s, "tree");
    const H = TREE.harvestTicks;
    while (s.tick < t0 + R + H - 1) {
      s = run(s, 1);
      expect(isWalkable(s.map, TREE_TILE)).toBe(false);
      const n = nodeAt(s, TREE_TILE);
      if (s.tick < t0 + R) expect(n.status).toBe("depleted");
      else if (s.tick === t0 + R) expect(n).toMatchObject({ status: "ready", progress: 1, regrowTicksLeft: 0 });
      else if (s.tick < t0 + R + H - 1) expect(n.status).toBe("ready");
    }
    expect(nodeAt(s, TREE_TILE)).toMatchObject({ status: "depleted", regrowTicksLeft: R });
  });

  it("repousse sans joueur : timing exact", () => {
    const depleted = run(place(fresh(), { tx: 13, ty: 7 }), BUSH.harvestTicks);
    const away = place(depleted, { tx: 7, ty: 8 });
    const almost = run(away, BUSH.regrowTicks - 1);
    expect(nodeAt(almost, BUSH_TILE)).toMatchObject({ status: "depleted", regrowTicksLeft: 1 });
    const ready = run(almost, 1);
    expect(nodeAt(ready, BUSH_TILE)).toMatchObject({ status: "ready", progress: 0, regrowTicksLeft: 0 });
  });

  it("regrowDelay lit les données et reste ≤ maxRegrowDelay", () => {
    const s = fresh();
    for (const kind of ["tree", "bush"] as NodeKind[]) {
      expect(regrowDelay(s, kind)).toBe(NODES[kind].regrowTicks);
      expect(regrowDelay(s, kind)).toBeLessThanOrEqual(maxRegrowDelay(kind));
      expect(Number.isSafeInteger(regrowDelay(s, kind))).toBe(true);
      expect(regrowDelay(s, kind)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("récolte — cible unique", () => {
  it("deux nœuds à portée à égale distance : plus petit id, l'autre reste à 0", () => {
    const s0 = place(fresh(), BETWEEN);
    const west = nodeAt(s0, WEST_A);
    const east = nodeAt(s0, EAST_A);
    expect(west.id).toBeLessThan(east.id);
    expect(nodesInRange(s0).map((n) => n.id)).toEqual([west.id, east.id]);
    expect(findHarvestTarget(s0)?.id).toBe(west.id);
    const s = run(s0, 5);
    expect(nodeAt(s, WEST_A).progress).toBe(5);
    expect(nodeAt(s, EAST_A).progress).toBe(0);
  });

  it("joueur décalé vers l'est dans la même tuile ⇒ le nœud le plus proche (est)", () => {
    const s0 = edit(fresh(), (d) => {
      d.player.pos = { x: tileCenter(BETWEEN).x + 100, y: tileCenter(BETWEEN).y };
    });
    expectValid(s0);
    expect(findHarvestTarget(s0)?.id).toBe(nodeAt(s0, EAST_A).id);
    const s = run(s0, 3);
    expect(nodeAt(s, EAST_A).progress).toBe(3);
    expect(nodeAt(s, WEST_A).progress).toBe(0);
  });

  it("cible épuisée ⇒ bascule sur l'autre nœud prêt à portée, qui reprend sa progression", () => {
    const s0 = edit(place(fresh(), BETWEEN), (d) => void (nodeAt(d, EAST_A).progress = 4));
    let s = run(s0, TREE.harvestTicks);
    expect(nodeAt(s, WEST_A).status).toBe("depleted");
    expect(nodeAt(s, EAST_A).progress).toBe(4);
    s = run(s, 1);
    expect(nodeAt(s, EAST_A).progress).toBe(5);
  });

  it("un nœud épuisé plus proche n'empêche pas de récolter un nœud prêt à portée", () => {
    const s0 = edit(fresh(), (d) => {
      d.player.pos = { x: tileCenter(BETWEEN).x - 100, y: tileCenter(BETWEEN).y };
      const w = nodeAt(d, WEST_A);
      w.status = "depleted";
      w.regrowTicksLeft = TREE.regrowTicks;
    });
    expectValid(s0);
    const s = run(s0, 2);
    expect(nodeAt(s, EAST_A).progress).toBe(2);
  });
});

describe("drops typés", () => {
  it("bois et nourriture sur la même tuile ⇒ 2 drops, invariants OK", () => {
    const s = edit(fresh(), (d) => {
      const at = tileCenter({ tx: 3, ty: 3 });
      d.drops.push({ id: d.nextId++, pos: { ...at }, resource: "wood", amount: 4 });
      d.drops.push({ id: d.nextId++, pos: { ...at }, resource: "food", amount: 2 });
    });
    expect(checkInvariants(s)).toEqual([]);
    expect(dropsAt(s, { tx: 3, ty: 3 })).toHaveLength(2);
  });

  it("une récolte de baies sur une tuile portant du bois (stocks pleins) ne fusionne pas", () => {
    const s0 = edit(place(fresh(), { tx: 13, ty: 7 }), (d) => {
      d.resources.food = RESOURCES.cap;
      d.resources.wood = RESOURCES.cap;
      d.drops.push({ id: d.nextId++, pos: tileCenter({ tx: 13, ty: 7 }), resource: "wood", amount: 5 });
    });
    const s = run(s0, BUSH.harvestTicks);
    expect(dropsAt(s, { tx: 13, ty: 7 })).toEqual([
      expect.objectContaining({ resource: "wood", amount: 5 }),
      expect.objectContaining({ resource: "food", amount: BUSH.yield }),
    ]);
  });

  it("aimantation d'un drop de bois sur une tuile contenant de la nourriture ⇒ pas de fusion", () => {
    // Joueur au centre de (4,3) ; nourriture au centre de (5,3) ; bois au bord ouest de (6,3), dans le rayon.
    const s0 = edit(place(fresh(), { tx: 4, ty: 3 }), (d) => {
      d.resources.food = RESOURCES.cap; // la nourriture ne bouge pas
      d.resources.wood = 0;
      d.drops.push({ id: d.nextId++, pos: tileCenter({ tx: 5, ty: 3 }), resource: "food", amount: 3 });
      d.drops.push({ id: d.nextId++, pos: { x: 6000, y: 3500 }, resource: "wood", amount: 4 });
    });
    const s1 = run(s0, 1); // le bois entre sur la tuile (5,3)
    const here = dropsAt(s1, { tx: 5, ty: 3 });
    expect(here.map((d) => d.resource).sort()).toEqual(["food", "wood"]);
    expect(here.find((d) => d.resource === "food")!.amount).toBe(3);
    const later = run(s1, 5);
    expect(later.resources.wood).toBe(4);
    expect(later.drops).toEqual([expect.objectContaining({ resource: "food", amount: 3 })]);
  });
});

describe("sélecteurs de récolte", () => {
  it("harvestTarget, nodeHarvestRatio, nodeRegrowRatio, sans muter l'état", () => {
    const s = deepFreeze(run(besideTree(), 5));
    const tree = nodeAt(s, TREE_TILE);
    expect(harvestTarget(s)?.id).toBe(tree.id);
    expect(nodeHarvestRatio(tree)).toBe(5 / TREE.harvestTicks);
    expect(nodeRegrowRatio(tree)).toBe(1);
    expect(harvestTarget(place(s, { tx: 7, ty: 8 }))).toBeNull();

    const depleted = run(s, TREE.harvestTicks - 5);
    const d = nodeAt(depleted, TREE_TILE);
    expect(nodeRegrowRatio(d)).toBe(0);
    const half = nodeAt(run(depleted, TREE.regrowTicks / 2), TREE_TILE);
    expect(nodeRegrowRatio(half)).toBeCloseTo(0.5);
  });
});
