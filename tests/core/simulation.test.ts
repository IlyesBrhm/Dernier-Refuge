import { STARTING_RESOURCES, SURVIVOR } from "../../src/data/balance";
import { applyCommand, type Command } from "../../src/core/commands";
import { checkInvariants } from "../../src/core/invariants";
import { tileOf } from "../../src/core/map";
import { nextInt, seedRng } from "../../src/core/rng";
import type { GameState, TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { deepFreeze, fresh, steer } from "./helpers";

/** Objectif du bot : tente en désordre > drops > emplacement payable > accueil. */
function goal(s: GameState): TilePos {
  const messy = s.tents.find((t) => t.status === "messy");
  if (messy) return messy.tile;
  const drop = s.drops[0];
  if (drop) return tileOf(drop.pos);
  const slot = s.buildSlots.find((b) => b.builtTentId === null);
  if (slot && s.resources.wood > 0) return slot.tile;
  return s.map.welcome;
}

interface BotRun {
  final: GameState;
  commands: number;
}

/** Bot qui ne passe QUE par des commandes ; vérifie invariants, conservation et non-mutation. */
function runBot(seed: number, ticks: number, freeze = false): BotRun {
  let s = fresh(seed);
  let rewards = 0;
  let commands = 0;
  for (let i = 0; i < ticks; i++) {
    const want = steer(s, goal(s));
    if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) {
      const r = applyCommand(s, { type: "setMoveInput", ...want });
      expect(r.ok).toBe(true);
      s = r.state;
      commands++;
    }
    const before = freeze ? deepFreeze(s) : s;
    const snapshot = freeze ? JSON.stringify(before) : "";
    const next = tick(before);
    if (freeze) expect(JSON.stringify(before)).toBe(snapshot);
    for (const v of next.survivors) {
      const prev = s.survivors.find((x) => x.id === v.id);
      if (prev?.status === "resting" && v.status === "leaving") rewards += SURVIVOR.woodReward;
    }
    s = next;
    const errors = checkInvariants(s);
    if (errors.length > 0) throw new Error(`tick ${s.tick}: ${errors.join("; ")}`);
    const dropped = s.drops.reduce((a, d) => a + d.amount, 0);
    const paid = s.buildSlots.reduce((a, b) => a + b.paid, 0);
    expect(s.resources.wood + dropped + paid).toBe(STARTING_RESOURCES.wood + rewards);
  }
  return { final: s, commands };
}

describe("simulation", () => {
  it("bot 3000 ticks : invariants OK, ≥ 1 tente construite, bois conservé, entrée jamais mutée", () => {
    const { final, commands } = runBot(2024, 3000, true);
    expect(commands).toBeGreaterThan(0);
    expect(final.buildSlots.filter((b) => b.builtTentId !== null).length).toBeGreaterThanOrEqual(1);
  });

  it("déterminisme : même seed + mêmes commandes ⇒ même état", () => {
    const a = runBot(77, 1500).final;
    const b = runBot(77, 1500).final;
    expect(b).toEqual(a);
  });

  it("seeds différentes ⇒ états différents", () => {
    const a = runBot(1, 800).final;
    const b = runBot(2, 800).final;
    expect(b).not.toEqual(a);
  });

  it("déterminisme sous une suite de commandes aléatoires (y compris invalides)", () => {
    const script = (cmdSeed: number): Command[][] => {
      let r = seedRng(cmdSeed);
      const out: Command[][] = [];
      for (let t = 0; t < 1500; t++) {
        const batch: Command[] = [];
        let n: number;
        [n, r] = nextInt(r, 0, 3);
        for (let k = 0; k < n; k++) {
          let dx: number;
          let dy: number;
          [dx, r] = nextInt(r, -2, 2); // ±2 ⇒ invalides, rejetées
          [dy, r] = nextInt(r, -1, 1);
          batch.push({ type: "setMoveInput", dx, dy });
        }
        out.push(batch);
      }
      return out;
    };
    const play = (seed: number, cmds: Command[][]): GameState => {
      let s = fresh(seed);
      for (const batch of cmds) {
        for (const c of batch) s = applyCommand(s, c).state;
        s = tick(s);
        const errors = checkInvariants(s);
        if (errors.length > 0) throw new Error(`tick ${s.tick}: ${errors.join("; ")}`);
      }
      return s;
    };
    const cmds = script(9);
    expect(play(5, cmds)).toEqual(play(5, cmds));
  });

  it("tick(state, n) équivaut à n appels de tick(state)", () => {
    let a = fresh(3);
    for (let i = 0; i < 400; i++) a = tick(a);
    expect(tick(fresh(3), 400)).toEqual(a);
    const s = fresh(3);
    for (const bad of [0, -1, NaN, 1.5, Infinity]) expect(tick(s, bad)).toBe(s);
  });
});
