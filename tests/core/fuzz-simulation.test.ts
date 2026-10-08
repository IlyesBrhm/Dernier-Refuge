// Simulation longue avec bot aléatoire seedé (commandes parfois invalides), propriétés
// sur plusieurs seeds et non-régression « chaque tente construite finit par servir ».

import { QUEUE, RESOURCES, STARTING_RESOURCES, SURVIVOR, TIME } from "../../src/data/balance";
import { applyCommand, type Command } from "../../src/core/commands";
import { checkInvariants } from "../../src/core/invariants";
import { tileOf } from "../../src/core/map";
import { nextInt, seedRng, type RngState } from "../../src/core/rng";
import { createInitialState, type GameState, type TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { deepFreeze, steer } from "./helpers";

const TEN_MINUTES = 10 * 60 * TIME.ticksPerSecond; // 6000 ticks

/** Objectif « utile » : tente en désordre > drop > emplacement payable > accueil. */
function usefulGoal(s: GameState): TilePos {
  const messy = s.tents.find((t) => t.status === "messy");
  if (messy) return messy.tile;
  const drop = s.drops[0];
  if (drop) return tileOf(drop.pos);
  const slot = s.buildSlots.find((b) => b.builtTentId === null);
  if (slot && s.resources.wood > 0) return slot.tile;
  return s.map.welcome;
}

/** Commandes hostiles / malformées : toutes doivent être refusées. */
const JUNK: unknown[] = [
  { type: "setMoveInput", dx: 2, dy: 0 },
  { type: "setMoveInput", dx: 0, dy: -2 },
  { type: "setMoveInput", dx: NaN, dy: 0 },
  { type: "setMoveInput", dx: 0.5, dy: 0 },
  { type: "setMoveInput", dx: Infinity, dy: 1 },
  { type: "setMoveInput", dx: "1", dy: 0 },
  { type: "setMoveInput", dx: 1 },
  { type: "teleport", x: 0, y: 0 },
  { type: "addWood", amount: 9999 },
  null,
  42,
  "setMoveInput",
];

/** Tire un lot de commandes pour un tick. Le RNG du bot est séparé de celui du jeu. */
function botBatch(s: GameState, r: RngState): [unknown[], RngState] {
  let roll: number;
  [roll, r] = nextInt(r, 0, 99);
  const out: unknown[] = [];
  if (roll < 55) {
    const w = steer(s, usefulGoal(s));
    if (w.dx !== s.player.input.dx || w.dy !== s.player.input.dy) out.push({ type: "setMoveInput", ...w });
  } else if (roll < 75) {
    let dx: number;
    let dy: number;
    [dx, r] = nextInt(r, -1, 1);
    [dy, r] = nextInt(r, -1, 1);
    out.push({ type: "setMoveInput", dx, dy });
  } else if (roll < 90) {
    let n: number;
    [n, r] = nextInt(r, 1, 4);
    for (let k = 0; k < n; k++) {
      let j: number;
      [j, r] = nextInt(r, 0, JUNK.length - 1);
      out.push(JUNK[j]);
    }
  } else if (roll < 95) {
    // Rafale au-delà du plafond : les dernières doivent être « rate_limited ».
    for (let k = 0; k < 12; k++) out.push({ type: "setMoveInput", dx: k % 2 === 0 ? 1 : -1, dy: 0 });
  }
  // sinon : aucune commande ce tick.
  return [out, r];
}

interface FuzzResult {
  final: GameState;
  accepted: number;
  rejected: number;
  welcomed: number;
}

/** Vérifie TOUTES les propriétés demandées à chaque tick. */
function fuzz(seed: number, ticks: number): FuzzResult {
  let s = createInitialState(seed);
  let r = seedRng(seed ^ 0x5eed);
  let rewards = 0;
  let accepted = 0;
  let rejected = 0;
  let welcomed = 0;
  const builtOnce = new Map<number, number>(); // slotId -> builtTentId
  const prevPaid = new Map<number, number>(s.buildSlots.map((b) => [b.id, b.paid]));

  const fail = (msg: string): never => {
    throw new Error(`seed ${seed}, tick ${s.tick}: ${msg}`);
  };

  for (let i = 0; i < ticks; i++) {
    let batch: unknown[];
    [batch, r] = botBatch(s, r);
    for (const cmd of batch) {
      const input = deepFreeze(s);
      const snap = JSON.stringify(input);
      const res = applyCommand(input, cmd as Command);
      if (JSON.stringify(input) !== snap) fail("applyCommand a muté son entrée");
      if (res.ok) {
        accepted++;
      } else {
        rejected++;
        if (res.state !== input) fail(`commande refusée (${res.error}) mais état différent`);
      }
      s = res.state;
    }

    const input = deepFreeze(s);
    const snap = JSON.stringify(input);
    const next = tick(input);
    if (JSON.stringify(input) !== snap) fail("tick a muté son entrée");

    for (const v of next.survivors) {
      const prev = input.survivors.find((x) => x.id === v.id);
      if (prev?.status === "resting" && v.status === "leaving") rewards += SURVIVOR.woodReward;
      if (prev && (prev.status === "queued" || prev.status === "toQueue") && v.status === "walkingToTent") welcomed++;
    }
    s = next;

    // 1. Invariants du cœur.
    const errors = checkInvariants(s);
    if (errors.length > 0) fail(errors.join("; "));

    // 2. Ressources entières dans [0, cap].
    for (const [k, v] of Object.entries(s.resources)) {
      if (!Number.isInteger(v) || v < 0 || v > RESOURCES.cap) fail(`ressource ${k} = ${v}`);
    }

    // 3. Jamais deux survivants sur une tente.
    const perTent = new Map<number, number>();
    for (const v of s.survivors) {
      if (v.tentId !== null) perTent.set(v.tentId, (perTent.get(v.tentId) ?? 0) + 1);
    }
    for (const [tentId, n] of perTent) if (n > 1) fail(`tente ${tentId} : ${n} survivants`);
    for (const t of s.tents) {
      const pointing = s.survivors.filter((v) => v.tentId === t.id).length;
      if (pointing > 1) fail(`tente ${t.id} pointée par ${pointing} survivants`);
    }

    // 4. Emplacements : jamais au-delà du coût, paid monotone, construit une seule fois.
    for (const b of s.buildSlots) {
      if (b.paid > b.cost) fail(`slot ${b.id} payé ${b.paid}/${b.cost}`);
      if (b.paid < (prevPaid.get(b.id) ?? 0)) fail(`slot ${b.id} : paid a diminué`);
      prevPaid.set(b.id, b.paid);
      const known = builtOnce.get(b.id);
      if (known !== undefined && b.builtTentId !== known) fail(`slot ${b.id} reconstruit / tente changée`);
      if (b.builtTentId !== null) builtOnce.set(b.id, b.builtTentId);
    }
    if (s.tents.length !== 1 + builtOnce.size) fail(`${s.tents.length} tentes pour ${builtOnce.size} constructions`);

    // 5. Conservation du bois.
    const dropped = s.drops.reduce((a, d) => a + d.amount, 0);
    const paid = s.buildSlots.reduce((a, b) => a + b.paid, 0);
    if (s.resources.wood + dropped + paid !== STARTING_RESOURCES.wood + rewards) {
      fail(`bois non conservé : ${s.resources.wood} + ${dropped} + ${paid} ≠ ${STARTING_RESOURCES.wood} + ${rewards}`);
    }

    // 6. File ≤ 5.
    if (s.queue.length > QUEUE.maxLength) fail(`file de ${s.queue.length}`);
  }
  return { final: s, accepted, rejected, welcomed };
}

describe("simulation longue — bot aléatoire seedé (10 min de jeu)", () => {
  for (const seed of [1, 42, 2024, 99991]) {
    it(`seed ${seed} : ${TEN_MINUTES} ticks, toutes les propriétés vérifiées à chaque tick`, () => {
      const res = fuzz(seed, TEN_MINUTES);
      expect(res.final.tick).toBe(TEN_MINUTES);
      // Le bot a vraiment exercé le jeu (sinon le test ne prouverait rien).
      expect(res.accepted).toBeGreaterThan(100);
      expect(res.rejected).toBeGreaterThan(100);
      expect(res.welcomed).toBeGreaterThan(0);
      expect(res.final.buildSlots.reduce((a, b) => a + b.paid, 0)).toBeGreaterThan(0);
    }, 60_000);
  }

  it("déterminisme du fuzz : même seed ⇒ même état final (comparaison profonde)", () => {
    const a = fuzz(7, 2000);
    const b = fuzz(7, 2000);
    expect(b.final).toEqual(a.final);
    expect(b.accepted).toBe(a.accepted);
    expect(b.rejected).toBe(a.rejected);
  }, 60_000);
});

describe("propriétés sur plusieurs seeds", () => {
  const seeds = Array.from({ length: 25 }, (_, i) => i * 7919 + 3);

  it("état initial valide, identique hors RNG, pour toute seed", () => {
    const ref = createInitialState(0);
    for (const seed of seeds) {
      const s = createInitialState(seed);
      expect(checkInvariants(s)).toEqual([]);
      expect({ ...s, rng: 0 }).toEqual({ ...ref, rng: 0 });
    }
  });

  it("joueur immobile : invariants OK, file pleine en régime établi, survivants ≤ 5, déterministe", () => {
    for (const seed of seeds) {
      const a = tick(createInitialState(seed), 1500);
      expect(checkInvariants(a)).toEqual([]);
      expect(a.queue).toHaveLength(QUEUE.maxLength);
      expect(a.survivors).toHaveLength(QUEUE.maxLength);
      expect(tick(createInitialState(seed), 1500)).toEqual(a);
    }
  });

  it("chaque intervalle d'arrivée tiré est dans [min, max] (sur toute la vie de la partie)", () => {
    for (const seed of seeds.slice(0, 10)) {
      let s = createInitialState(seed);
      for (let i = 0; i < 1000; i++) {
        const prev = s.spawnTimer;
        const n = s.survivors.length;
        s = tick(s);
        if (s.survivors.length > n) {
          expect(prev).toBeLessThanOrEqual(1);
          expect(s.spawnTimer).toBeGreaterThanOrEqual(SURVIVOR.spawnIntervalMin);
          expect(s.spawnTimer).toBeLessThanOrEqual(SURVIVOR.spawnIntervalMax);
        }
      }
    }
  });

  it("le JSON aller-retour d'un état en cours de partie est identique et toujours valide", () => {
    for (const seed of seeds.slice(0, 5)) {
      const s = fuzz(seed, 800).final;
      const back = JSON.parse(JSON.stringify(s)) as GameState;
      expect(back).toEqual(s);
      expect(checkInvariants(back)).toEqual([]);
      expect(tick(back, 300)).toEqual(tick(s, 300));
    }
  }, 60_000);
});

describe("non-régression — chaque tente construite finit par accueillir un survivant", () => {
  /** Bot piloté (objectif utile uniquement) ; renvoie, par tente construite, si elle a été occupée. */
  function piloted(seed: number, maxTicks: number): { built: number; hosted: Set<number>; state: GameState } {
    let s = createInitialState(seed);
    const builtTents = new Set<number>();
    const hosted = new Set<number>();
    for (let i = 0; i < maxTicks; i++) {
      const w = steer(s, usefulGoal(s));
      if (w.dx !== s.player.input.dx || w.dy !== s.player.input.dy) {
        const r = applyCommand(s, { type: "setMoveInput", ...w });
        expect(r.ok).toBe(true);
        s = r.state;
      }
      s = tick(s);
      const errors = checkInvariants(s);
      if (errors.length > 0) throw new Error(`seed ${seed}, tick ${s.tick}: ${errors.join("; ")}`);
      for (const b of s.buildSlots) if (b.builtTentId !== null) builtTents.add(b.builtTentId);
      for (const t of s.tents) {
        if (builtTents.has(t.id) && t.status === "occupied") {
          const v = s.survivors.find((x) => x.id === t.occupantId);
          expect(v?.status).toBe("resting");
          hosted.add(t.id);
        }
      }
      if (builtTents.size === s.buildSlots.length && hosted.size === builtTents.size) break;
    }
    return { built: builtTents.size, hosted, state: s };
  }

  for (const seed of [3, 2024, 31337]) {
    it(`seed ${seed} : tous les emplacements construits, chaque nouvelle tente occupée au moins une fois`, () => {
      const { built, hosted } = piloted(seed, 30 * 60 * TIME.ticksPerSecond);
      expect(built).toBe(3);
      expect(hosted.size).toBe(built);
    }, 60_000);
  }
});
