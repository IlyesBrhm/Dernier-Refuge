// Simulations longues avec récolte (≥ 10 min de jeu, plusieurs seeds) et propriétés sur tout état atteint :
// invariants, conservation bois + nourriture, au plus un drop par (tuile, ressource), aucun nœud praticable.

import { NODES, RESOURCES, TIME, type NodeKind } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { isNodeInRange } from "../../src/core/harvest-rules";
import { checkInvariants } from "../../src/core/invariants";
import { sameTile, tileCenter, tileOf } from "../../src/core/map";
import { nextInt, seedRng, type RngState } from "../../src/core/rng";
import { dropsAt } from "../../src/core/selectors";
import type { GameState, TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import {
  accumulate,
  botGoal,
  conservationErrors,
  edit,
  editPlausible,
  emptyProduced,
  fresh,
  harvestPropertyErrors,
  harvestSpot,
  justDepleted,
  ledgerDeltaErrors,
  place,
  steer,
} from "./helpers";

const TEN_MINUTES = 10 * 60 * TIME.ticksPerSecond;

/** Nombre de tuiles portant à la fois un drop de bois et un drop de nourriture. */
function mixedTiles(s: GameState): number {
  const wood = new Set<string>();
  const food = new Set<string>();
  for (const d of s.drops) {
    const t = tileOf(d.pos);
    (d.resource === "wood" ? wood : food).add(`${t.tx},${t.ty}`);
  }
  let n = 0;
  for (const k of wood) if (food.has(k)) n++;
  return n;
}

interface SimStats {
  final: GameState;
  harvests: Record<NodeKind, number>;
  mixedTicks: number;
  maxDrops: number;
}

/**
 * Pilote un bot par commandes ; vérifie à chaque tick invariants, conservation, propriétés récolte.
 * `cumulative` : conservation depuis l'état initial (stocks non modifiés) ; sinon conservation par tick.
 */
function simulate(
  start: GameState,
  ticks: number,
  goal: (s: GameState) => TilePos,
  cumulative: boolean,
): SimStats {
  let s = start;
  let produced = emptyProduced();
  const harvests: Record<NodeKind, number> = { tree: 0, bush: 0 };
  let mixedTicks = 0;
  let maxDrops = 0;
  for (let i = 0; i < ticks; i++) {
    const want = steer(s, goal(s));
    if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) {
      const r = applyCommand(s, { type: "setMoveInput", ...want });
      if (!r.ok) throw new Error(`tick ${s.tick}: commande refusée ${r.error}`);
      s = r.state;
    }
    const next = tick(s);
    for (const n of justDepleted(s, next)) {
      harvests[n.kind] += 1;
      if (!isNodeInRange(next, n)) throw new Error(`tick ${next.tick}: nœud ${n.id} épuisé hors de portée`);
    }
    produced = accumulate(produced, s, next);
    const errors = [
      ...checkInvariants(next),
      ...harvestPropertyErrors(next),
      ...(cumulative ? conservationErrors(next, produced) : ledgerDeltaErrors(s, next)),
    ];
    if (errors.length > 0) throw new Error(`tick ${next.tick}: ${errors.join("; ")}`);
    if (mixedTiles(next) > 0) mixedTicks++;
    maxDrops = Math.max(maxDrops, next.drops.length);
    s = next;
  }
  return { final: s, harvests, mixedTicks, maxDrops };
}

/**
 * Objectif d'un bot « stocks presque pleins » : comme botGoal, mais ignore les drops dont la ressource
 * est pleine (sinon il resterait bloqué dessus) ; récolte même stock plein.
 */
function hoarderGoal(s: GameState): TilePos {
  const messy = s.tents.find((t) => t.status === "messy");
  if (messy) return messy.tile;
  const drop = s.drops.find((d) => s.resources[d.resource] < RESOURCES.cap);
  if (drop) return tileOf(drop.pos);
  const slot = s.buildSlots.find((b) => b.builtTentId === null);
  if (slot && s.resources.wood > 0) return slot.tile;
  const head = s.survivors.find((v) => v.id === s.queue[0]);
  if (head?.status === "queued" && s.tents.some((t) => t.status === "free")) return s.map.welcome;
  // Récolte en tournant sur les nœuds prêts (le premier par id après l'index du tick).
  const ready = s.nodes.filter((n) => n.status === "ready");
  const n = ready[Math.floor(s.tick / 400) % Math.max(1, ready.length)];
  const spot = n ? harvestSpot(s, n) : null;
  return spot ?? s.map.welcome;
}

describe("simulation longue — bot récolteur, plusieurs seeds (≥ 10 min de jeu)", () => {
  for (const seed of [11, 404, 1337, 5150, 90210]) {
    it(`seed ${seed} : ${TEN_MINUTES} ticks, invariants + conservation bois/nourriture + propriétés à chaque tick`, () => {
      const res = simulate(fresh(seed), TEN_MINUTES, botGoal, true);
      expect(res.final.tick).toBe(TEN_MINUTES);
      expect(res.harvests.tree).toBeGreaterThanOrEqual(3);
      expect(res.harvests.bush).toBeGreaterThanOrEqual(3);
      expect(res.final.resources.food).toBeGreaterThan(fresh(seed).resources.food);
    }, 60_000);
  }

  it("déterministe : même seed + mêmes commandes ⇒ même état final", () => {
    const a = simulate(fresh(404), 2500, botGoal, true).final;
    const b = simulate(fresh(404), 2500, botGoal, true).final;
    expect(b).toEqual(a);
  }, 60_000);
});

describe("simulation longue — stocks proches du plafond (drops au sol, ramassage partiel)", () => {
  for (const seed of [7, 2024, 31337]) {
    it(`seed ${seed} : ${TEN_MINUTES} ticks avec bois et nourriture proches du cap`, () => {
      // Stocks gonflés : `editPlausible` avance le tick de départ (explicitement) pour rester plausible.
      const start = editPlausible(fresh(seed), (d) => {
        d.resources.wood = RESOURCES.cap - 20;
        d.resources.food = RESOURCES.cap - 3;
      });
      expect(start.tick).toBeGreaterThan(0);
      const res = simulate(start, TEN_MINUTES, hoarderGoal, false);
      expect(res.final.tick).toBe(start.tick + TEN_MINUTES);
      expect(res.harvests.tree + res.harvests.bush).toBeGreaterThan(5);
      expect(res.final.resources.food).toBe(RESOURCES.cap);
      // Des drops sont restés au sol (stock plein) : rien n'a été détruit (conservation par tick).
      expect(res.maxDrops).toBeGreaterThan(0);
    }, 60_000);
  }
});

describe("coexistence d'un drop de bois et d'un drop de nourriture sur une tuile", () => {
  // Sur la carte actuelle, aucune tuile n'est à portée d'un arbre ET d'un buisson, et aucune porte de tente
  // n'est voisine d'un buisson : la coexistence ne peut venir que d'un drop aimanté qui traverse ou atteint
  // la tuile d'un drop de l'autre ressource resté au sol (stock plein). Observé : 0 tick de coexistence sur
  // les 8 simulations longues ci-dessus et les 40 000 ticks de marche aléatoire. Scénario dédié, forcé par fixture.
  it("drop de baies au sol (nourriture pleine) + drop de bois aimanté sur la même tuile : 2 drops, puis ramassage", () => {
    const at: TilePos = { tx: 13, ty: 6 }; // voisine du buisson (14,7), à côté de la porte de B2 (12,6)
    let s = editPlausible(place(fresh(), at), (d) => {
      d.resources.wood = RESOURCES.cap;
      d.resources.food = RESOURCES.cap;
    });
    // 1. Récolte du buisson stock plein : drop de nourriture sur (13,6).
    for (let i = 0; i < NODES.bush.harvestTicks; i++) {
      const next = tick(s);
      expect(ledgerDeltaErrors(s, next)).toEqual([]);
      s = next;
    }
    expect(dropsAt(s, at)).toEqual([expect.objectContaining({ resource: "food", amount: NODES.bush.yield })]);
    // 2. Récompense de survivant posée à la porte de B2 (comme le ferait survivorLifecycle), bois plein.
    // Bois ajouté hors simulation : editPlausible (la conservation est vérifiée tick par tick ensuite).
    s = editPlausible(s, (d) => {
      d.drops.push({ id: d.nextId++, pos: tileCenter({ tx: 12, ty: 6 }), resource: "wood", amount: 8 });
    });
    expect(checkInvariants(s)).toEqual([]);
    s = tick(s);
    expect(s.drops.find((d) => d.resource === "wood")!.pos).toEqual(tileCenter({ tx: 12, ty: 6 })); // bois plein : immobile
    // 3. De la place se libère en bois : le drop de bois est aimanté et entre sur la tuile de la nourriture.
    s = edit(s, (d) => void (d.resources.wood = RESOURCES.cap - 2));
    let prev = s;
    s = tick(s);
    expect(ledgerDeltaErrors(prev, s)).toEqual([]);
    expect(checkInvariants(s)).toEqual([]);
    expect(harvestPropertyErrors(s)).toEqual([]);
    expect(mixedTiles(s)).toBe(1);
    expect(dropsAt(s, at).map((d) => d.resource).sort()).toEqual(["food", "wood"]);
    // 4. Collecte partielle : 2 bois crédités, 6 restent sur la tuile avec la nourriture (pas de fusion).
    prev = s;
    s = tick(s);
    expect(ledgerDeltaErrors(prev, s)).toEqual([]);
    expect(checkInvariants(s)).toEqual([]);
    expect(s.resources.wood).toBe(RESOURCES.cap);
    expect(dropsAt(s, tileOf(s.player.pos))).toEqual([
      expect.objectContaining({ resource: "food", amount: NODES.bush.yield }),
      expect.objectContaining({ resource: "wood", amount: 6 }),
    ]);
    // 5. Tout se libère : tout est ramassé.
    s = edit(s, (d) => {
      d.resources.wood = 0;
      d.resources.food = 0;
    });
    s = tick(s, 3);
    expect(s.drops).toEqual([]);
    expect(s.resources).toMatchObject({ wood: 6, food: NODES.bush.yield });
  });
});

describe("propriété — tout état atteint : ≤ 1 drop par (tuile, ressource), aucun nœud praticable", () => {
  /** Marche aléatoire seedée (RNG du test, séparé de celui du jeu), stocks de départ tirés près du cap. */
  function randomWalk(seed: number, ticks: number): { states: number; mixed: number } {
    const [woodGap, r1] = nextInt(seedRng(seed ^ 0xa11ce), 0, 10);
    const [foodGap, r2] = nextInt(r1, 0, 10);
    let r: RngState = r2;
    let s = editPlausible(fresh(seed), (d) => {
      d.resources.wood = RESOURCES.cap - woodGap;
      d.resources.food = RESOURCES.cap - foodGap;
    });
    let mixed = 0;
    for (let i = 0; i < ticks; i++) {
      let roll: number;
      [roll, r] = nextInt(r, 0, 9);
      if (roll < 2) {
        let dx: number;
        let dy: number;
        [dx, r] = nextInt(r, -1, 1);
        [dy, r] = nextInt(r, -1, 1);
        const res = applyCommand(s, { type: "setMoveInput", dx, dy });
        if (!res.ok) throw new Error(`commande refusée ${res.error}`);
        s = res.state;
      } else if (roll === 2) {
        // Va vers un nœud (pour récolter souvent).
        const n = s.nodes[i % s.nodes.length]!;
        const spot = harvestSpot(s, n);
        const want = spot && !sameTile(tileOf(s.player.pos), spot) ? steer(s, spot) : { dx: 0, dy: 0 };
        const res = applyCommand(s, { type: "setMoveInput", ...want });
        if (!res.ok) throw new Error(`commande refusée ${res.error}`);
        s = res.state;
      }
      const next = tick(s);
      const errors = [...checkInvariants(next), ...harvestPropertyErrors(next), ...ledgerDeltaErrors(s, next)];
      if (errors.length > 0) throw new Error(`seed ${seed}, tick ${next.tick}: ${errors.join("; ")}`);
      if (mixedTiles(next) > 0) mixed++;
      s = next;
    }
    return { states: ticks, mixed };
  }

  it("20 seeds × 2000 ticks de marche aléatoire, stocks près du plafond", () => {
    let states = 0;
    for (let k = 0; k < 20; k++) states += randomWalk(1000 + k * 37, 2000).states;
    expect(states).toBe(40_000);
  }, 60_000);
});
