// Fixtures figées de sauvegardes v1 (tests/save/fixtures/v1-*.json). NE JAMAIS LES MODIFIER NI LES
// RÉGÉNÉRER : elles représentent des sauvegardes déjà chez les joueurs (production documentée dans
// fixture-generate.test.ts ; générateur v1 retiré depuis la v2).
// Depuis la v2 (jour/nuit), elles se chargent via la migration v1 → v2 (docs/design/day-night.md §2.2) :
// feu plein ajouté, bilan de nuit à 0, et rien d'autre (leur tick est de jour et aucun joueur/survivant
// n'est sur la tuile F ni ne la traverse — vérifié ici).

import { checkInvariants, isNight, tick } from "../../src/core/index";
import { FIRE } from "../../src/data/balance";
import { decodeSave, encodeSave, toSavedState } from "../../src/save/index";
// Texte brut, exactement tel que commité (import Vite `?raw`).
import V1_INITIAL from "./fixtures/v1-initial.json?raw";
import V1_MIDGAME from "./fixtures/v1-midgame.json?raw";

/** État v2 attendu après migration : l'état v1 stocké + feu plein + bilan à 0, rien d'autre. */
function expectedAfterMigration(text: string): Record<string, unknown> {
  const env = JSON.parse(text) as { version: number; state: Record<string, unknown> };
  expect(env.version).toBe(1);
  expect(Object.hasOwn(env.state, "fire") || Object.hasOwn(env.state, "night")).toBe(false);
  return {
    ...env.state,
    fire: { wood: FIRE.initialWood, burnedTotal: 0, feedProgress: 0 },
    night: { coldLeavers: 0, sleepersPaid: 0, woodEarned: 0, woodBurned: 0 },
  };
}

describe.each([
  ["v1-initial.json", V1_INITIAL],
  ["v1-midgame.json", V1_MIDGAME],
])("fixture %s (v1 migrée en v2)", (_name, text) => {
  it("se charge via la migration : état v1 inchangé + fire/night ajoutés (tick de jour, aucun déplacement)", () => {
    const r = decodeSave(text);
    if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
    expect(r.version).toBe(1);
    expect(isNight(r.state.tick)).toBe(false);
    expect(toSavedState(r.state)).toEqual(expectedAfterMigration(text));
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it("décodée puis ré-encodée ⇒ v2 décodable et identique", () => {
    const r = decodeSave(text);
    if (!r.ok) throw new Error(r.error);
    const again = encodeSave(r.state, { seed: r.seed, savedAt: r.savedAt });
    if (!again.ok) throw new Error(again.error);
    expect(again.text).toMatch(/"version":2}$/);
    const r2 = decodeSave(again.text);
    expect(r2.ok && r2.version).toBe(2);
    expect(r2.ok && r2.state).toEqual(r.state);
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

describe("fixture v1-initial.json : valeurs notées à la génération", () => {
  it("valeurs clés", () => {
    const r = decodeSave(V1_INITIAL);
    if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
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

describe("fixture v1-midgame.json : valeurs notées à la génération", () => {
  it("valeurs clés", () => {
    const r = decodeSave(V1_MIDGAME);
    if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
    const s = r.state;
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
    expect(s.fire).toEqual({ wood: FIRE.initialWood, burnedTotal: 0, feedProgress: 0 });
  });
});
