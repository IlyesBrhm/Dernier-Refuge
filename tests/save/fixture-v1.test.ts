// Fixtures figées de sauvegardes v1 (tests/save/fixtures/). NE JAMAIS LES RÉGÉNÉRER : elles représentent
// des sauvegardes déjà chez les joueurs. Production documentée dans fixture-generate.test.ts.
// Si ce test casse après un changement du core / de la carte / des coûts : nouvelle version de sauvegarde
// + migration v1 → v2 + fixture v2 ; ces fixtures v1 doivent continuer à se charger via la migration.

import { checkInvariants, tick } from "../../src/core/index";
import { decodeSave, encodeSave } from "../../src/save/index";
// Texte brut, exactement tel que stocké (import Vite `?raw`).
import V1_INITIAL from "./fixtures/v1-initial.json?raw";
import V1_MIDGAME from "./fixtures/v1-midgame.json?raw";

describe("fixture v1-initial.json", () => {
  it("se charge ; valeurs notées à la génération", () => {
    const r = decodeSave(V1_INITIAL);
    if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
    expect(r.version).toBe(1);
    expect(r.seed).toBe(4242);
    expect(r.savedAt).toBe(1_760_000_000_000);
    expect(r.state.tick).toBe(0);
    expect(r.state.rng).toBe(4242);
    expect(r.state.nextId).toBe(10);
    expect(r.state.resources).toEqual({ wood: 10, food: 5, stone: 0, water: 5, coins: 0 });
    expect(r.state.survivors).toEqual([]);
    expect(r.state.tents.map((t) => t.status)).toEqual(["free"]);
    expect(r.state.nodes.map((n) => n.status)).toEqual(["ready", "ready", "ready", "ready", "ready"]);
  });
});

describe("fixture v1-midgame.json", () => {
  const text = V1_MIDGAME;

  it("se charge ; valeurs notées à la génération", () => {
    const r = decodeSave(text);
    if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
    const s = r.state;
    expect(r.version).toBe(1);
    expect(r.seed).toBe(4242);
    expect(s.tick).toBe(925);
    expect(s.rng).toBe(2967359001);
    expect(s.nextId).toBe(36);
    expect(s.resources).toEqual({ wood: 0, food: 11, stone: 0, water: 5, coins: 0 });
    expect(s.commandsThisTick).toBe(1);
    expect(s.player.input).toEqual({ dx: 1, dy: 0 });
    expect(s.player.pos).toEqual({ x: 11733, y: 8432 });
    expect(s.queue).toEqual([23, 25, 29, 31, 34]);
    expect(s.survivors.map((v) => v.status)).toEqual([
      "resting",
      "leaving",
      "resting",
      "queued",
      "queued",
      "queued",
      "queued",
      "queued",
    ]);
    expect(s.survivors[1]!.path).toHaveLength(13);
    expect(s.tents.map((t) => `${t.id}:${t.status}`)).toEqual(["1:occupied", "18:messy", "28:occupied"]);
    expect(s.nodes.map((n) => n.status)).toEqual(["depleted", "depleted", "depleted", "ready", "ready"]);
    expect(s.drops).toEqual([{ id: 35, pos: { x: 7500, y: 3500 }, resource: "wood", amount: 8 }]);
    expect(s.buildSlots.map((b) => `${b.paid}/${b.cost}:${String(b.builtTentId)}`)).toEqual([
      "15/15:18",
      "25/25:28",
      "12/40:null",
    ]);
  });

  it("ré-encodée à l'identique (format canonique stable)", () => {
    const r = decodeSave(text);
    if (!r.ok) throw new Error(r.error);
    const again = encodeSave(r.state, { seed: r.seed, savedAt: r.savedAt });
    expect(again.ok && again.text).toBe(text.trim());
  });

  it("la partie reprend : 300 ticks sans violation d'invariant", () => {
    const r = decodeSave(text);
    if (!r.ok) throw new Error(r.error);
    let s = r.state;
    for (let i = 0; i < 300; i++) {
      s = tick(s);
      expect(checkInvariants(s)).toEqual([]);
    }
  });
});
