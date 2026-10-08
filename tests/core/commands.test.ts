import { LIMITS } from "../../src/data/balance";
import { applyCommand, type Command } from "../../src/core/commands";
import { tick } from "../../src/core/tick";
import { deepFreeze, expectValid, fresh, run } from "./helpers";

describe("applyCommand / setMoveInput", () => {
  it("accepte dx, dy ∈ {-1, 0, 1}", () => {
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        const r = applyCommand(fresh(), { type: "setMoveInput", dx, dy });
        expect(r.ok).toBe(true);
        expect(r.state.player.input).toEqual({ dx, dy });
      }
    }
  });

  it("ne mute pas l'état d'entrée", () => {
    const s = deepFreeze(fresh());
    const r = applyCommand(s, { type: "setMoveInput", dx: 1, dy: 0 });
    expect(r.ok).toBe(true);
    expect(s.player.input).toEqual({ dx: 0, dy: 0 });
  });

  it("est idempotent", () => {
    const a = applyCommand(fresh(), { type: "setMoveInput", dx: 1, dy: -1 }).state;
    const b = applyCommand(a, { type: "setMoveInput", dx: 1, dy: -1 }).state;
    expect(b.player).toEqual(a.player);
  });

  const invalid: [string, unknown][] = [
    ["NaN", { type: "setMoveInput", dx: NaN, dy: 0 }],
    ["Infinity", { type: "setMoveInput", dx: 0, dy: Infinity }],
    ["-Infinity", { type: "setMoveInput", dx: -Infinity, dy: 0 }],
    ["0.5", { type: "setMoveInput", dx: 0.5, dy: 0 }],
    ["2", { type: "setMoveInput", dx: 2, dy: 0 }],
    ["-2", { type: "setMoveInput", dx: 0, dy: -2 }],
    ["string", { type: "setMoveInput", dx: "1", dy: 0 }],
    ["manquant", { type: "setMoveInput", dx: 1 }],
    ["null", { type: "setMoveInput", dx: null, dy: 0 }],
  ];
  for (const [name, cmd] of invalid) {
    it(`rejette un payload invalide (${name}) sans rien changer`, () => {
      const s = fresh();
      const r = applyCommand(s, cmd as Command);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("invalid_payload");
      expect(r.state).toBe(s);
    });
  }

  it("rejette une commande inconnue / non-objet", () => {
    const s = fresh();
    for (const cmd of [{ type: "teleport", x: 0, y: 0 }, null, undefined, 42, "setMoveInput", {}]) {
      const r = applyCommand(s, cmd as unknown as Command);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("unknown_command");
      expect(r.state).toBe(s);
    }
  });

  it("limite le débit puis accepte de nouveau après tick()", () => {
    let s = fresh();
    for (let i = 0; i < LIMITS.maxCommandsPerTick; i++) {
      const r = applyCommand(s, { type: "setMoveInput", dx: i % 2, dy: 0 });
      expect(r.ok).toBe(true);
      s = r.state;
    }
    const refused = applyCommand(s, { type: "setMoveInput", dx: -1, dy: 0 });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("rate_limited");
    expect(refused.state).toBe(s);
    s = tick(s);
    expect(s.commandsThisTick).toBe(0);
    expect(applyCommand(s, { type: "setMoveInput", dx: -1, dy: 0 }).ok).toBe(true);
  });

  it("résiste à un spam de 1000 commandes (invariants OK)", () => {
    let s = fresh();
    let accepted = 0;
    for (let i = 0; i < 1000; i++) {
      const r = applyCommand(s, { type: "setMoveInput", dx: (i % 3) - 1, dy: ((i >> 1) % 3) - 1 });
      if (r.ok) accepted++;
      s = r.state;
      expectValid(s);
      if (i % 50 === 49) s = run(s, 1);
    }
    expect(accepted).toBe(20 * LIMITS.maxCommandsPerTick);
  });
});
