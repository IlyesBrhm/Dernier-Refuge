import type { NodeKind } from "../../src/data/balance";
import { applyCommand, type Command } from "../../src/core/commands";
import { isNodeInRange } from "../../src/core/harvest-rules";
import { checkInvariants } from "../../src/core/invariants";
import { nextInt, seedRng } from "../../src/core/rng";
import type { GameState } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import {
  accumulate,
  botGoal,
  conservationErrors,
  deepFreeze,
  emptyProduced,
  fresh,
  justDepleted,
  steer,
  type Produced,
} from "./helpers";

interface BotRun {
  final: GameState;
  commands: number;
  harvests: Record<NodeKind, number>;
  welcomed: number;
  produced: Produced;
}

/**
 * Bot qui ne passe QUE par des commandes (objectif : botGoal, récolte comprise) ; vérifie à chaque tick
 * invariants, conservation bois + nourriture, non-mutation, récolte uniquement à portée, nourriture monotone.
 */
function runBot(seed: number, ticks: number, freeze = false): BotRun {
  let s = fresh(seed);
  let produced = emptyProduced();
  let commands = 0;
  let welcomed = 0;
  const harvests: Record<NodeKind, number> = { tree: 0, bush: 0 };
  for (let i = 0; i < ticks; i++) {
    const want = steer(s, botGoal(s));
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
    for (const n of justDepleted(s, next)) {
      harvests[n.kind] += 1;
      // Toute récolte terminée l'a été avec le joueur à portée (position de fin de tick).
      if (!isNodeInRange(next, n)) throw new Error(`tick ${next.tick}: nœud ${n.id} épuisé hors de portée`);
    }
    for (const v of next.survivors) {
      const p = s.survivors.find((x) => x.id === v.id);
      if (p && (p.status === "queued" || p.status === "toQueue") && v.status === "walkingToTent") welcomed++;
    }
    if (next.resources.food < s.resources.food) throw new Error(`tick ${next.tick}: la nourriture a diminué`);
    produced = accumulate(produced, s, next);
    s = next;
    const errors = [...checkInvariants(s), ...conservationErrors(s, produced)];
    if (errors.length > 0) throw new Error(`tick ${s.tick}: ${errors.join("; ")}`);
  }
  return { final: s, commands, harvests, welcomed, produced };
}

describe("simulation", () => {
  it("bot 3000 ticks : invariants OK, récolte, accueil, construction, bois et nourriture conservés, entrée jamais mutée", () => {
    const { final, commands, harvests, welcomed, produced } = runBot(2024, 3000, true);
    expect(commands).toBeGreaterThan(0);
    expect(harvests.tree).toBeGreaterThanOrEqual(1);
    expect(harvests.bush).toBeGreaterThanOrEqual(1);
    expect(produced.food).toBeGreaterThan(0);
    expect(welcomed).toBeGreaterThanOrEqual(1);
    expect(final.buildSlots.filter((b) => b.builtTentId !== null).length).toBeGreaterThanOrEqual(1);
  });

  it("le JSON aller-retour d'un état avec des nœuds en cours (récolte / repousse) est identique et valide", () => {
    const { final } = runBot(2024, 1500);
    expect(final.nodes.some((n) => n.status === "depleted" || n.progress > 0)).toBe(true);
    const back = JSON.parse(JSON.stringify(final)) as GameState;
    expect(back).toEqual(final);
    expect(checkInvariants(back)).toEqual([]);
    expect(tick(back, 300)).toEqual(tick(final, 300));
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
