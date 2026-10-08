// Cas limites de la récolte (docs/design/harvest.md §1), joués autant que possible par commandes
// (setMoveInput + tick). Chaque tick est contrôlé : invariants, conservation par tick (variation du
// registre = production), propriétés récolte (≤ 1 drop par (tuile, ressource), nœuds jamais praticables).

import { NODES, RESOURCES, SURVIVOR, TENT, WELCOME } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { findHarvestTarget, isNodeInRange, regrowDelay } from "../../src/core/harvest-rules";
import { checkInvariants } from "../../src/core/invariants";
import { isWalkable, sameTile, tileCenter, tileOf } from "../../src/core/map";
import { dropsAt } from "../../src/core/selectors";
import type { GameState, ResourceNode, TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import {
  edit,
  fresh,
  harvestPropertyErrors,
  justDepleted,
  ledgerDeltaErrors,
  place,
  steer,
  withHeadQueued,
} from "./helpers";

const TREE = NODES.tree;
const BUSH = NODES.bush;
const TREE_NE: TilePos = { tx: 14, ty: 1 }; // A, id 5
const BUSH_N: TilePos = { tx: 14, ty: 7 }; // M, id 6
const WEST_A: TilePos = { tx: 2, ty: 9 }; // A, id 7
const EAST_A: TilePos = { tx: 4, ty: 9 }; // A, id 8
const BUSH_S: TilePos = { tx: 14, ty: 9 }; // M, id 9
const BETWEEN_TREES: TilePos = { tx: 3, ty: 9 };
const BETWEEN_BUSHES: TilePos = { tx: 13, ty: 8 };

function nodeAt(s: GameState, tile: TilePos): ResourceNode {
  const n = s.nodes.find((x) => sameTile(x.tile, tile));
  if (!n) throw new Error(`pas de nœud en (${tile.tx},${tile.ty})`);
  return n;
}

// ---------------------------------------------------------------------------
// Traceur : avance tick par tick avec tous les contrôles et note chaque épuisement.
// ---------------------------------------------------------------------------

interface Trace {
  s: GameState;
  depletions: { tick: number; id: number }[];
}

function trace(s: GameState): Trace {
  return { s, depletions: [] };
}

function check(prev: GameState, next: GameState): void {
  const errors = [...checkInvariants(next), ...ledgerDeltaErrors(prev, next), ...harvestPropertyErrors(next)];
  if (errors.length > 0) throw new Error(`tick ${next.tick}: ${errors.join("; ")}`);
}

function step(t: Trace, n = 1, each?: (prev: GameState, next: GameState) => void): void {
  for (let i = 0; i < n; i++) {
    const next = tick(t.s);
    check(t.s, next);
    for (const d of justDepleted(t.s, next)) t.depletions.push({ tick: next.tick, id: d.id });
    each?.(t.s, next);
    t.s = next;
  }
}

function command(t: Trace, dx: number, dy: number): void {
  const r = applyCommand(t.s, { type: "setMoveInput", dx, dy });
  expect(r.ok).toBe(true);
  t.s = r.state;
}

/** Marche par commandes jusqu'à `target` puis s'arrête (même logique que walkTo, mais tracée). */
function walk(t: Trace, target: TilePos, each?: (prev: GameState, next: GameState) => void, max = 500): void {
  for (let i = 0; i < max; i++) {
    const want = steer(t.s, target);
    if (want.dx !== t.s.player.input.dx || want.dy !== t.s.player.input.dy) command(t, want.dx, want.dy);
    if (sameTile(tileOf(t.s.player.pos), target)) {
      if (t.s.player.input.dx !== 0 || t.s.player.input.dy !== 0) command(t, 0, 0);
      return;
    }
    step(t, 1, each);
  }
  throw new Error(`(${target.tx},${target.ty}) non atteinte`);
}

// ---------------------------------------------------------------------------

describe("limites — le joueur s'éloigne en pleine récolte", () => {
  it("3 allers-retours : progression = ticks passés à portée, jamais perdue, un seul yield, aucune récolte double", () => {
    const t = trace(place(fresh(), { tx: 13, ty: 1 }));
    const wood0 = t.s.resources.wood;
    let inRangeTicks = 0;
    const watch = (prev: GameState, next: GameState): void => {
      const before = nodeAt(prev, TREE_NE);
      const after = nodeAt(next, TREE_NE);
      if (before.status === "ready" && after.status === "ready") {
        // progression monotone, +1 exactement quand le joueur est à portée en fin de mouvement
        const near = isNodeInRange(next, after);
        if (near) inRangeTicks++;
        expect(after.progress).toBe(before.progress + (near ? 1 : 0));
        expect(after.progress).toBe(inRangeTicks);
      }
    };
    for (let lap = 0; lap < 3; lap++) {
      step(t, 2, watch);
      walk(t, { tx: 10, ty: 1 }, watch);
      step(t, 60, watch); // longue pause hors de portée
      walk(t, { tx: 13, ty: 1 }, watch);
    }
    expect(nodeAt(t.s, TREE_NE).status).toBe("ready");
    expect(t.depletions).toEqual([]);
    expect(t.s.resources.wood).toBe(wood0);

    const left = TREE.harvestTicks - nodeAt(t.s, TREE_NE).progress;
    expect(left).toBeGreaterThan(0);
    step(t, left - 1, watch);
    expect(t.depletions).toEqual([]);
    step(t, 1);
    expect(t.depletions).toEqual([{ tick: t.s.tick, id: nodeAt(t.s, TREE_NE).id }]);
    expect(t.s.resources.wood).toBe(wood0 + TREE.yield);
    // Rester ensuite à côté pendant presque toute la repousse : aucun second yield.
    step(t, regrowDelay(t.s, "tree") - 1);
    expect(t.depletions).toHaveLength(1);
    expect(t.s.resources.wood).toBe(wood0 + TREE.yield);
  });

  it("partir pile au tick où la barre serait pleine : rien n'est produit hors de portée", () => {
    const s0 = edit(place(fresh(), { tx: 12, ty: 1 }), (d) => void (nodeAt(d, TREE_NE).progress = TREE.harvestTicks - 1));
    const t = trace(s0);
    step(t, 200);
    expect(nodeAt(t.s, TREE_NE)).toMatchObject({ status: "ready", progress: TREE.harvestTicks - 1 });
    expect(t.depletions).toEqual([]);
    expect(t.s.drops).toEqual([]);
  });
});

describe("limites — stocks de bois ET de nourriture pleins simultanément", () => {
  it("tout reste au sol, rien n'est détruit ; ramassage dès que de la place se libère", () => {
    const full = edit(place(fresh(), { tx: 13, ty: 2 }), (d) => {
      d.resources.wood = RESOURCES.cap;
      d.resources.food = RESOURCES.cap;
    });
    const t = trace(full);

    // 1. Arbre récolté stock plein : drop de bois sur la tuile du joueur.
    step(t, TREE.harvestTicks);
    expect(t.depletions.map((d) => d.id)).toEqual([nodeAt(t.s, TREE_NE).id]);
    const woodDrop = dropsAt(t.s, { tx: 13, ty: 2 });
    expect(woodDrop).toEqual([expect.objectContaining({ resource: "wood", amount: TREE.yield })]);
    const woodPos = { ...woodDrop[0]!.pos };

    // 2. Les deux buissons depuis (13,8), stock plein : un seul drop de nourriture fusionné.
    walk(t, BETWEEN_BUSHES);
    step(t, 2 * BUSH.harvestTicks + 5);
    expect(nodeAt(t.s, BUSH_N).status).toBe("depleted");
    expect(nodeAt(t.s, BUSH_S).status).toBe("depleted");
    expect(t.s.resources).toMatchObject({ wood: RESOURCES.cap, food: RESOURCES.cap });
    const here = dropsAt(t.s, tileOf(t.s.player.pos));
    expect(here).toEqual([expect.objectContaining({ resource: "food", amount: 2 * BUSH.yield })]);
    // Le bois n'a pas bougé d'une unité (stock plein ⇒ drop immobile).
    expect(t.s.drops.find((d) => d.resource === "wood")).toMatchObject({ pos: woodPos, amount: TREE.yield });

    // 3. Libérer du bois par la construction (commandes uniquement) : marcher sur B1 (12,2).
    const foodDropBefore = t.s.drops.find((d) => d.resource === "food")!;
    let firstPayTick = -1;
    walk(t, { tx: 12, ty: 2 }, (prev, next) => {
      // Tant que le bois est plein (et qu'aucun versement ne libère de place dans le tick : la construction
      // passe avant le ramassage), le drop de bois ne bouge pas, même en passant dessus.
      const paid = (s: GameState): number => s.buildSlots.reduce((a, b) => a + b.paid, 0);
      if (prev.resources.wood === RESOURCES.cap && paid(next) === paid(prev)) {
        expect(next.drops.find((d) => d.resource === "wood")).toMatchObject({ pos: woodPos, amount: TREE.yield });
      }
    });
    const slot = t.s.buildSlots.find((b) => sameTile(b.tile, { tx: 12, ty: 2 }))!;
    step(t, 10, (prev, next) => {
      const paid = next.buildSlots.find((b) => b.id === slot.id)!.paid;
      if (firstPayTick < 0 && paid > prev.buildSlots.find((b) => b.id === slot.id)!.paid) firstPayTick = next.tick;
    });
    expect(firstPayTick).toBeGreaterThan(0);
    // Le bois au sol a été entièrement ramassé ; la nourriture n'a pas bougé.
    expect(t.s.drops.filter((d) => d.resource === "wood")).toEqual([]);
    expect(t.s.drops.filter((d) => d.resource === "food")).toEqual([foodDropBefore]);

    // 4. Libérer de la nourriture (aucune consommation n'existe encore : fixture), retourner au drop.
    t.s = edit(t.s, (d) => void (d.resources.food = RESOURCES.cap - 1));
    walk(t, BETWEEN_BUSHES);
    step(t, 3);
    expect(t.s.resources.food).toBe(RESOURCES.cap);
    expect(t.s.drops).toEqual([expect.objectContaining({ resource: "food", amount: 2 * BUSH.yield - 1 })]);
    t.s = edit(t.s, (d) => void (d.resources.food = 0));
    step(t, 3);
    expect(t.s.resources.food).toBe(2 * BUSH.yield - 1);
    expect(t.s.drops).toEqual([]);
  });
});

describe("limites — fusion à l'aimantation entre drops de même ressource", () => {
  // Joueur au centre de (4,3) ; drop A au centre de (5,3) ; drop B au bord ouest de (6,3). Au premier tick,
  // A avance dans sa tuile et B entre sur (5,3) : il doit fusionner avec A (au plus un drop par (tuile, ressource)).
  for (const resource of ["wood", "food"] as const) {
    for (const order of ["A puis B", "B puis A"] as const) {
      it(`${resource}, ordre ${order} : un seul drop de 7 sur (5,3), puis tout est ramassé`, () => {
        const s0 = edit(place(fresh(), { tx: 4, ty: 3 }), (d) => {
          d.resources[resource] = 0;
          const a = { id: d.nextId++, pos: tileCenter({ tx: 5, ty: 3 }), resource, amount: 3 };
          const b = { id: d.nextId++, pos: { x: 6000, y: 3500 }, resource, amount: 4 };
          d.drops.push(...(order === "A puis B" ? [a, b] : [b, a]));
        });
        const t = trace(s0);
        step(t, 1);
        expect(t.s.drops).toHaveLength(1);
        expect(t.s.drops[0]).toMatchObject({ resource, amount: 7 });
        expect(tileOf(t.s.drops[0]!.pos)).toEqual({ tx: 5, ty: 3 });
        step(t, 5);
        expect(t.s.drops).toEqual([]);
        expect(t.s.resources[resource]).toBe(7);
      });
    }
  }
});

describe("limites — nœud épuisé collé au joueur", () => {
  for (const spot of [
    { tile: { tx: 13, ty: 1 }, dx: 1, dy: 0 },
    { tile: { tx: 13, ty: 2 }, dx: 1, dy: -1 },
    { tile: { tx: 14, ty: 2 }, dx: 0, dy: -1 },
  ]) {
    it(`depuis (${spot.tile.tx},${spot.tile.ty}) en poussant vers l'arbre pendant toute la repousse : rien`, () => {
      const t = trace(place(fresh(), spot.tile));
      command(t, spot.dx, spot.dy);
      step(t, TREE.harvestTicks);
      const tree = nodeAt(t.s, TREE_NE);
      expect(tree.status).toBe("depleted");
      const wood = t.s.resources.wood;
      const R = tree.regrowTicksLeft;
      expect(R).toBe(regrowDelay(t.s, "tree"));
      step(t, R - 1, (prev, next) => {
        const a = nodeAt(prev, TREE_NE);
        const b = nodeAt(next, TREE_NE);
        expect(b).toMatchObject({ status: "depleted", progress: 0, regrowTicksLeft: a.regrowTicksLeft - 1 });
        expect(findHarvestTarget(next)).toBeNull();
        expect(next.drops).toEqual([]);
        expect(next.resources.wood).toBe(wood);
        // En poussée diagonale le joueur peut glisser, mais reste toujours à portée.
        expect(isNodeInRange(next, b)).toBe(true);
      });
      expect(t.depletions).toHaveLength(1);
      // Tick suivant : repousse puis récolte immédiate (joueur à portée).
      step(t, 1);
      expect(nodeAt(t.s, TREE_NE)).toMatchObject({ status: "ready", progress: 1 });
    });
  }
});

describe("limites — deux nœuds à portée sur la vraie carte : (2,9) et (4,9)", () => {
  it("ids 7 et 8 ; (3,9) est à portée des deux et d'aucun autre nœud", () => {
    const s = place(fresh(), BETWEEN_TREES);
    expect(nodeAt(s, WEST_A).id).toBe(7);
    expect(nodeAt(s, EAST_A).id).toBe(8);
    expect(s.nodes.filter((n) => isNodeInRange(s, n)).map((n) => n.id)).toEqual([7, 8]);
  });

  it("balayage des positions valides dans (3,9) : le plus proche, égalité ⇒ id 7", () => {
    const cx = tileCenter(BETWEEN_TREES).x;
    let west = 0;
    let east = 0;
    let tie = 0;
    for (let x = 3000; x < 4000; x += 10) {
      for (let y = 9000; y < 10000; y += 100) {
        const s = edit(fresh(), (d) => void (d.player.pos = { x, y }));
        if (checkInvariants(s).length > 0) continue; // hitbox dans un obstacle
        const target = findHarvestTarget(s)?.id;
        if (x < cx) {
          expect(target, `x=${x}`).toBe(7);
          west++;
        } else if (x > cx) {
          expect(target, `x=${x}`).toBe(8);
          east++;
        } else {
          expect(target, `x=${x}`).toBe(7);
          tie++;
        }
      }
    }
    expect(west).toBeGreaterThan(0);
    expect(east).toBeGreaterThan(0);
    expect(tie).toBeGreaterThan(0);
  });

  it("par commandes : arrivé en (3,9), récolte la cible puis l'autre, 2 × yield, une fois chacun", () => {
    const t = trace(fresh());
    walk(t, BETWEEN_TREES);
    const first = findHarvestTarget(t.s)!;
    const dx = t.s.player.pos.x - tileCenter(BETWEEN_TREES).x;
    expect(first.id).toBe(dx > 0 ? 8 : 7);
    const second = first.id === 7 ? 8 : 7;
    const wood0 = t.s.resources.wood;
    // En chemin ((5,8), (4,8), (3,8) sont à portée) une progression partielle a pu s'accumuler : elle est conservée.
    expect(t.depletions).toEqual([]);
    step(t, 2 * TREE.harvestTicks);
    expect(t.depletions.map((d) => d.id)).toEqual([first.id, second]);
    expect(t.s.resources.wood).toBe(wood0 + 2 * TREE.yield);
    // Les deux épuisés : plus rien pendant la repousse.
    step(t, 100);
    expect(t.depletions).toHaveLength(2);
  });
});

describe("limites — repousse pendant que le joueur est à portée", () => {
  it("(13,8) entre deux buissons : épuisements aux ticks attendus, alternance 6 / 9", () => {
    const H = BUSH.harvestTicks;
    const R = BUSH.regrowTicks;
    expect(H).toBeLessThan(R); // hypothèse de la chronologie ci-dessous
    const t = trace(place(fresh(), BETWEEN_BUSHES));
    const food0 = t.s.resources.food;
    const end = 4 * H + 2 * R - 2;
    step(t, end + 1, (_prev, next) => {
      for (const n of next.nodes) expect(isWalkable(next.map, n.tile)).toBe(false);
      // La cible en pause garde sa progression : jamais les deux buissons en cours en même temps.
      const a = nodeAt(next, BUSH_N);
      const b = nodeAt(next, BUSH_S);
      expect(a.progress > 0 && b.progress > 0).toBe(false);
    });
    expect(t.depletions).toEqual([
      { tick: H, id: 6 },
      { tick: 2 * H, id: 9 },
      { tick: 2 * H + R - 1, id: 6 },
      { tick: 3 * H + R - 1, id: 9 },
      { tick: 3 * H + 2 * R - 2, id: 6 },
      { tick: 4 * H + 2 * R - 2, id: 9 },
    ]);
    expect(t.s.resources.food).toBe(food0 + 6 * BUSH.yield);
    expect(t.s.drops).toEqual([]);
  });
});

describe("limites — récolte simultanée avec une autre action", () => {
  // Sur la carte actuelle c'est IMPOSSIBLE : aucune tuile T/B/porte/W/Q/E/P n'est à portée d'un nœud
  // (vérifié dans state.test.ts « aucun nœud n'est à portée de T, B, des portes, de W, P, Q ou E »),
  // or nettoyage et construction exigent d'être SUR la tuile de la tente / de l'emplacement, et l'accueil
  // SUR W. Les tests ci-dessous déplacent donc la tente / l'emplacement / W par fixture (hors espace
  // des états atteignables) pour vérifier que la règle reste bien définie (systèmes indépendants).

  it("nettoyage + construction + récolte sur la même tuile : les trois progressent dans le même tick", () => {
    const here: TilePos = { tx: 13, ty: 2 };
    const s0 = edit(place(fresh(), here), (d) => {
      const tent = d.tents[0]!;
      tent.tile = { ...here };
      tent.status = "messy";
      tent.cleanProgress = 0;
      d.buildSlots[0]!.tile = { ...here };
      d.resources.wood = 5;
    });
    expect(checkInvariants(s0)).toEqual([]);
    const t = trace(s0);
    step(t, 1);
    expect(t.s.tents[0]!.cleanProgress).toBe(1);
    expect(t.s.buildSlots[0]!.paid).toBe(1);
    expect(nodeAt(t.s, TREE_NE).progress).toBe(1);
    expect(t.s.resources.wood).toBe(4);

    // Bois épuisé par la construction avant la fin de la récolte.
    step(t, TREE.harvestTicks - 1);
    expect(nodeAt(t.s, TREE_NE).status).toBe("depleted");
    // Ordre du tick : construction (bois à 0, ne paie rien) puis récolte puis ramassage ⇒ +yield.
    expect(t.s.buildSlots[0]!.paid).toBe(5);
    expect(t.s.resources.wood).toBe(TREE.yield);
    expect(t.s.tents[0]!.cleanProgress).toBe(TREE.harvestTicks);
    // Tick suivant : la construction reprend avec le bois récolté.
    step(t, 1);
    expect(t.s.buildSlots[0]!.paid).toBe(6);
    expect(t.s.resources.wood).toBe(TREE.yield - 1);
    step(t, TENT.cleanTicks - TREE.harvestTicks - 1);
    expect(t.s.tents[0]!.status).toBe("free");
  });

  it("accueil + récolte : W déplacé à côté de l'arbre, les deux progressent ensemble", () => {
    const here: TilePos = { tx: 13, ty: 2 };
    const base = withHeadQueued();
    const s0 = edit(place(base, here), (d) => {
      d.map = { ...d.map, welcome: { ...here } };
    });
    expect(base.map.welcome).toEqual({ tx: 7, ty: 9 }); // la carte d'origine n'est pas mutée
    const t = trace(s0);
    const headId = t.s.queue[0]!;
    step(t, WELCOME.ticks);
    expect(t.s.survivors.find((v) => v.id === headId)?.status).toBe("walkingToTent");
    expect(nodeAt(t.s, TREE_NE).progress).toBe(WELCOME.ticks);
  });

  it("récompense de survivant et récolte dans le même tick : les deux bois sont comptés", () => {
    // Survivant au repos dans T avec 1 tick restant, joueur à 1 tick de finir l'arbre.
    const base = withHeadQueued();
    const t = trace(base);
    walk(t, base.map.welcome);
    for (let i = 0; i < 500 && !t.s.survivors.some((v) => v.status === "resting"); i++) step(t, 1);
    const resting = t.s.survivors.find((v) => v.status === "resting");
    expect(resting).toBeDefined();
    const s1 = edit(place(t.s, { tx: 13, ty: 1 }), (d) => {
      d.survivors.find((v) => v.id === resting!.id)!.restTicksLeft = 1;
      nodeAt(d, TREE_NE).progress = TREE.harvestTicks - 1;
    });
    const t2 = trace(s1);
    let rewarded = 0;
    step(t2, 1, (prev, next) => {
      rewarded = next.survivors.filter(
        (v) => v.status === "leaving" && prev.survivors.find((p) => p.id === v.id)?.status === "resting",
      ).length;
    });
    expect(rewarded).toBe(1);
    expect(t2.depletions).toHaveLength(1);
    // Le registre a crû de yield + récompense (vérifié par ledgerDeltaErrors dans step).
    expect(t2.s.drops.some((d) => d.resource === "wood" && d.amount === SURVIVOR.woodReward)).toBe(true);
  });
});
