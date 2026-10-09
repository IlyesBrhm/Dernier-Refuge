// Événements d'interface détectés par tick (src/app/ui-events.ts, docs/design/ui-polish.md §1.7).
// États construits avec le core (createInitialState, cloneState via `edit`, ticks réels pour la simulation).

import { DUSK_START, detectUiEvents, type UiEvent } from "../../src/app/ui-events";
import { applyCommand, checkInvariants, cloneState, isFireLow, isFireOutAtNight, sleepersCount, tick, type GameState } from "../../src/core";
import { FIRE, TIME } from "../../src/data/balance";
import { attentiveFireGoal, botGoal, deepFreeze, edit, fresh, steer } from "../core/helpers";

const types = (es: UiEvent[]): string[] => es.map((e) => e.type);

/** État au tick `t`, feu à `wood` (le reste : état initial). */
function at(t: number, wood: number = FIRE.initialWood, coldLeavers = 0): GameState {
  return edit(fresh(), (d) => {
    d.tick = t;
    d.fire.wood = wood;
    d.night.coldLeavers = coldLeavers;
  });
}

/** État de nuit (tick 2500 par défaut), feu à `wood`. */
const nightWith = (wood: number, t = 2500): GameState => at(t, wood);

describe("aucun événement sans transition", () => {
  it("même référence ⇒ []", () => {
    const s = fresh();
    expect(detectUiEvents(s, s)).toEqual([]);
  });

  it("copie identique (autre référence) ⇒ [], de jour comme de nuit, feu faible ou éteint", () => {
    for (const s of [fresh(), nightWith(2), nightWith(0), at(DUSK_START)]) {
      expect(detectUiEvents(s, cloneState(s))).toEqual([]);
    }
  });

  it("entrées gelées non mutées", () => {
    const a = deepFreeze(nightWith(4));
    const b = deepFreeze(nightWith(3, 2501));
    expect(() => detectUiEvents(a, b)).not.toThrow();
  });
});

describe("tentBuilt", () => {
  it("emplacement null → id ⇒ tentBuilt(slotId)", () => {
    const prev = fresh();
    const slot = prev.buildSlots[0];
    if (!slot) throw new Error("aucun emplacement");
    const curr = edit(prev, (d) => {
      const s = d.buildSlots[0];
      if (s) {
        s.paid = s.cost;
        s.builtTentId = 99;
      }
    });
    expect(detectUiEvents(prev, curr)).toEqual([{ type: "tentBuilt", slotId: slot.id }]);
  });

  it("déjà construit des deux côtés ⇒ rien", () => {
    const built = edit(fresh(), (d) => {
      const s = d.buildSlots[0];
      if (s) s.builtTentId = 99;
    });
    expect(types(detectUiEvents(built, cloneState(built)))).not.toContain("tentBuilt");
  });
});

describe("feu : fireLow, fireOut, fireRelit", () => {
  it("fireLow : nuit, wood lowWood+1 → lowWood (avec le nombre de dormeurs)", () => {
    const ev = detectUiEvents(nightWith(FIRE.lowWood + 1), nightWith(FIRE.lowWood, 2501));
    expect(ev).toEqual([{ type: "fireLow", sleepers: 0 }]);
  });

  it("fireLow une seule fois : déjà faible → encore faible ⇒ rien", () => {
    expect(detectUiEvents(nightWith(3), nightWith(2, 2501))).toEqual([]);
  });

  it("pas de fireLow de jour (le jour, le feu n'est jamais « faible »)", () => {
    expect(detectUiEvents(at(1000, 4), at(1001, 3))).toEqual([]);
  });

  it("à la tombée de la nuit avec un feu déjà bas : fireLow au premier tick de nuit", () => {
    expect(types(detectUiEvents(at(TIME.dayTicks - 1, 2), at(TIME.dayTicks, 2)))).toEqual(["fireLow"]);
  });

  it("fireOut : nuit, 1 → 0 (et pas de fireLow puisque le feu n'est plus « faible »)", () => {
    expect(detectUiEvents(nightWith(1), nightWith(0, 2501))).toEqual([{ type: "fireOut" }]);
  });

  it("fireOut : feu déjà vide au début de la nuit", () => {
    expect(detectUiEvents(at(TIME.dayTicks - 1, 0), at(TIME.dayTicks, 0))).toEqual([{ type: "fireOut" }]);
  });

  it("feu vide de jour ⇒ ni fireOut ni fireRelit", () => {
    const a = at(1000, 1);
    const b = at(1001, 0);
    expect(detectUiEvents(a, b)).toEqual([]);
    expect(detectUiEvents(b, a)).toEqual([]);
  });

  it("fireRelit : nuit, 0 → > 0", () => {
    expect(detectUiEvents(nightWith(0), nightWith(FIRE.lowWood + 2, 2501))).toEqual([{ type: "fireRelit" }]);
  });

  it("rallumé mais encore faible (0 → 2) : fireLow (faux → vrai) et fireRelit, dans cet ordre", () => {
    expect(types(detectUiEvents(nightWith(0), nightWith(2, 2501)))).toEqual(["fireLow", "fireRelit"]);
  });
});

describe("coldLeavers", () => {
  it("night.coldLeavers augmente ⇒ coldLeavers(count = différence)", () => {
    expect(detectUiEvents(at(2500, 0, 0), at(2501, 0, 2))).toEqual([{ type: "coldLeavers", count: 2 }]);
  });

  it("remise à zéro (2 → 0) ⇒ rien", () => {
    expect(types(detectUiEvents(at(2099, 5, 2), at(2100, 5, 0)))).not.toContain("coldLeavers");
  });
});

describe("nightSoon (début du crépuscule, cyclePos 2100)", () => {
  it("DUSK_START = dayTicks − duskTicks = 2100", () => {
    expect(DUSK_START).toBe(2100);
  });

  it("2099 → 2100 ⇒ « dans 30 s » ; aussi au cycle suivant", () => {
    expect(detectUiEvents(at(2099), at(2100))).toEqual([{ type: "nightSoon", seconds: 30 }]);
    const c = TIME.dayTicks + TIME.nightTicks;
    expect(detectUiEvents(at(c + 2099), at(c + 2100))).toEqual([{ type: "nightSoon", seconds: 30 }]);
  });

  it("franchi par un saut de plusieurs ticks (2050 → 2150) ⇒ secondes restantes réelles", () => {
    expect(detectUiEvents(at(2050), at(2150))).toEqual([{ type: "nightSoon", seconds: 25 }]);
  });

  it("déjà au crépuscule, en arrière (chargement), ou à cheval sur la nuit précédente ⇒ rien", () => {
    expect(detectUiEvents(at(2100), at(2101))).toEqual([]);
    expect(detectUiEvents(at(2200), at(2099))).toEqual([]);
    expect(detectUiEvents(at(2101), at(2099))).toEqual([]);
    expect(types(detectUiEvents(at(3599), at(3600)))).not.toContain("nightSoon");
  });
});

describe("pickup (son « pop ») : ramassage ≠ récolte ≠ dépense", () => {
  const withDrop = (amount: number): GameState =>
    edit(fresh(), (d) => {
      d.drops = [{ id: 500, pos: { x: 7500, y: 8500 }, resource: "wood", amount }];
      d.nextId = 501;
    });

  it("stock en hausse ET bois au sol en baisse ⇒ pickup wood", () => {
    const prev = withDrop(5);
    const curr = edit(prev, (d) => {
      d.drops = [];
      d.resources.wood += 5;
    });
    expect(detectUiEvents(prev, curr)).toEqual([{ type: "pickup", resource: "wood" }]);
  });

  it("nourriture ramassée ⇒ pickup food", () => {
    const prev = edit(fresh(), (d) => (d.drops = [{ id: 500, pos: { x: 7500, y: 8500 }, resource: "food", amount: 2 }]));
    const curr = edit(prev, (d) => {
      d.drops = [];
      d.resources.food += 2;
    });
    expect(detectUiEvents(prev, curr)).toEqual([{ type: "pickup", resource: "food" }]);
  });

  it("récolte (stock en hausse, sol inchangé) ⇒ rien", () => {
    const prev = withDrop(5);
    const curr = edit(prev, (d) => (d.resources.wood += 3));
    expect(detectUiEvents(prev, curr)).toEqual([]);
  });

  it("dépense (construction, feu : stock en baisse) ⇒ rien, même si du bois disparaît du sol", () => {
    const prev = withDrop(5);
    expect(detectUiEvents(prev, edit(prev, (d) => (d.resources.wood -= 1)))).toEqual([]);
    expect(detectUiEvents(prev, edit(prev, (d) => ((d.resources.wood -= 1), (d.drops = []))))).toEqual([]);
  });

  it("un survivant dépose du bois au sol (sol en hausse) ⇒ rien", () => {
    const prev = fresh();
    expect(detectUiEvents(prev, withDrop(5))).toEqual([]);
  });
});

describe("simulation réelle (core, bot attentif, seed fixe)", () => {
  /** Joue `n` ticks avec le bot ; renvoie les événements par tick. */
  function simulate(seed: number, n: number): { tick: number; events: UiEvent[]; prev: GameState; curr: GameState }[] {
    let s = fresh(seed);
    const out: { tick: number; events: UiEvent[]; prev: GameState; curr: GameState }[] = [];
    for (let i = 0; i < n; i++) {
      const goal = attentiveFireGoal(s) ?? botGoal(s);
      const want = steer(s, goal);
      if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) {
        const r = applyCommand(s, { type: "setMoveInput", dx: want.dx, dy: want.dy });
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      const prev = s;
      s = tick(s);
      expect(checkInvariants(s)).toEqual([]);
      out.push({ tick: s.tick, events: detectUiEvents(prev, s), prev, curr: s });
    }
    return out;
  }

  const N = 2 * (TIME.dayTicks + TIME.nightTicks);
  const run = simulate(7, N);

  it("nightSoon exactement une fois par cycle, au tick 2100 du cycle", () => {
    const at = run.filter((r) => r.events.some((e) => e.type === "nightSoon")).map((r) => r.tick);
    expect(at).toEqual([2100, 3600 + 2100]);
  });

  it("chaque événement correspond à la transition annoncée (vérifiée indépendamment)", () => {
    for (const r of run) {
      for (const e of r.events) {
        const ctx = `tick ${r.tick} : ${JSON.stringify(e)}`;
        switch (e.type) {
          case "tentBuilt":
            expect(r.curr.buildSlots.find((b) => b.id === e.slotId)?.builtTentId, ctx).not.toBeNull();
            expect(r.prev.buildSlots.find((b) => b.id === e.slotId)?.builtTentId, ctx).toBeNull();
            break;
          case "fireLow":
            expect(isFireLow(r.curr) && !isFireLow(r.prev), ctx).toBe(true);
            expect(e.sleepers, ctx).toBe(sleepersCount(r.curr));
            break;
          case "fireOut":
            expect(isFireOutAtNight(r.curr) && !isFireOutAtNight(r.prev), ctx).toBe(true);
            break;
          case "pickup":
            expect(r.curr.resources[e.resource], ctx).toBeGreaterThan(r.prev.resources[e.resource]);
            break;
          default:
            break;
        }
      }
    }
  });

  it("le bot ramasse et construit : au moins un pickup et un tentBuilt ; tentBuilt = emplacements construits", () => {
    const all = run.flatMap((r) => r.events);
    expect(all.some((e) => e.type === "pickup")).toBe(true);
    const built = run.at(-1)?.curr.buildSlots.filter((b) => b.builtTentId !== null).length ?? 0;
    expect(all.filter((e) => e.type === "tentBuilt")).toHaveLength(built);
    expect(built).toBeGreaterThan(0);
  });

  it("déterministe : même seed ⇒ mêmes événements aux mêmes ticks", () => {
    const again = simulate(7, N);
    expect(again.map((r) => [r.tick, r.events])).toEqual(run.map((r) => [r.tick, r.events]));
  });
});
