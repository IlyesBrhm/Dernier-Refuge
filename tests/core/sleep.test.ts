// Sommeil et paiement de l'aube (docs/design/day-night.md §1.3, décisions utilisateur) :
// un survivant qui se couche la nuit, ou encore au repos quand la nuit tombe, dort jusqu'à l'aube
// et paie à l'aube woodReward + dawnBonus ; toutes les tentes des dormeurs passent en désordre.

import { FIRE, SLEEP, SURVIVOR, TIME } from "../../src/data/balance";
import { tileCenter } from "../../src/core/map";
import { nightReport, sleepersCount } from "../../src/core/selectors";
import type { GameState } from "../../src/core/state";
import { DAWN_REWARD } from "../../src/core/systems/survivorLifecycle";
import { tick } from "../../src/core/tick";
import { isNight } from "../../src/core/time";
import { AWAY, FEED_SPOT, scenario, tentDoorDrop } from "./day-night-fixtures";
import { edit, expectValid, ledgerDeltaErrors, run } from "./helpers";

const R = SURVIVOR.woodReward;
const DAWN = R + SLEEP.dawnBonus;

describe("sommeil — tombée de la nuit", () => {
  it("récompense de l'aube = woodReward + dawnBonus (= 12)", () => {
    expect(DAWN_REWARD).toBe(DAWN);
    expect(DAWN).toBe(12);
  });

  it("au pas 2400, chaque survivant au repos s'endort (restTicksLeft = 0), aucun drop, aucun paiement", () => {
    const s0 = scenario({ tick: 2399, tents: 3, resting: 3, restTicksLeft: 100 });
    const s1 = tick(s0);
    expect(s1.tick).toBe(2400);
    expect(s1.survivors.map((v) => v.status)).toEqual(["sleeping", "sleeping", "sleeping"]);
    expect(s1.survivors.every((v) => v.restTicksLeft === 0 && v.path.length === 0)).toBe(true);
    expect(s1.tents.slice(0, 3).every((t) => t.status === "occupied")).toBe(true);
    expect(s1.drops).toEqual([]);
    expect(sleepersCount(s1)).toBe(3);
    expectValid(s1);
  });

  it("restTicksLeft = 1 au tick 2399 ⇒ dort au 2400 sans payer ; au tick 2398 ⇒ paie au 2399", () => {
    const late = tick(scenario({ tick: 2399, tents: 1, resting: 1, restTicksLeft: 1 }));
    expect(late.survivors[0]!.status).toBe("sleeping");
    expect(late.drops).toEqual([]);
    const inTime = tick(scenario({ tick: 2398, tents: 1, resting: 1, restTicksLeft: 1 }));
    expect(inTime.tick).toBe(2399);
    expect(inTime.survivors[0]!.status).toBe("leaving");
    expect(tentDoorDrop(inTime, 0)).toBe(R);
    expect(inTime.night.woodEarned).toBe(0); // fin de repos de jour : hors bilan de nuit
  });

  it("walkingToTent qui arrive de nuit ⇒ sleeping ; de jour ⇒ resting", () => {
    const arriving = (t: number): GameState =>
      edit(scenario({ tick: t, fireWood: 5 }), (d) => {
        const tent = d.tents[0]!;
        const c = tileCenter(tent.tile);
        const id = d.nextId++;
        d.survivors.push({
          id,
          pos: { x: c.x, y: c.y + SURVIVOR.speed },
          status: "walkingToTent",
          path: [{ ...tent.tile }],
          tentId: tent.id,
          restTicksLeft: 0,
        });
        tent.status = "assigned";
        tent.occupantId = id;
      });
    const night = arriving(2600);
    expectValid(night);
    const n1 = tick(night);
    expect(n1.survivors[0]!.status).toBe("sleeping");
    expect(n1.survivors[0]!.restTicksLeft).toBe(0);
    expectValid(n1);
    const d1 = tick(arriving(1000));
    expect(d1.survivors[0]!.status).toBe("resting");
    expect(d1.survivors[0]!.restTicksLeft).toBe(SURVIVOR.restTicks);
  });

  it("aucun départ de dormeur sur [2400, 3599] tant que le feu reste allumé", () => {
    // Feu plein au crépuscule : 12 combustions de nuit < 16, jamais éteint.
    let s = scenario({ tick: 2399, tents: 2, resting: 2, fireWood: FIRE.capacity, player: AWAY });
    for (let t = 2400; t <= 3599; t++) {
      s = tick(s);
      expect(s.fire.wood).toBeGreaterThan(0);
      expect(s.survivors.filter((v) => v.status === "sleeping")).toHaveLength(2);
    }
    expectValid(s);
    expect(s.drops).toEqual([]);
  });
});

describe("sommeil — test utilisateur : feu entretenu toute la nuit", () => {
  it("2 dormeurs (T et B0), joueur posté au feu avec du bois : ils dorment jusqu'à 3599 et paient 12 chacun au 3600, au même pas", () => {
    let s = scenario({ tick: 2399, tents: 2, resting: 2, restTicksLeft: 120, fireWood: 7, player: FEED_SPOT, wood: 60 });
    expectValid(s);
    const ids = s.survivors.map((v) => v.id);
    for (let t = 2400; t <= 3599; t++) {
      const prev = s;
      s = tick(s);
      expect(s.tick).toBe(t);
      expectValid(s);
      expect(ledgerDeltaErrors(prev, s), `tick ${t}`).toEqual([]);
      expect(s.fire.wood, `tick ${t}`).toBeGreaterThan(0);
      expect(ids.map((id) => s.survivors.find((v) => v.id === id)?.status)).toEqual(["sleeping", "sleeping"]);
    }
    expect(s.night).toEqual({ coldLeavers: 0, sleepersPaid: 0, woodEarned: 0, woodBurned: 12 });
    const prev = s;
    s = tick(s); // aube
    expect(s.tick).toBe(3600);
    expect(isNight(s.tick)).toBe(false);
    expectValid(s);
    expect(ledgerDeltaErrors(prev, s)).toEqual([]);
    expect(ids.map((id) => s.survivors.find((v) => v.id === id)?.status)).toEqual(["leaving", "leaving"]);
    expect(tentDoorDrop(s, 0)).toBe(DAWN);
    expect(tentDoorDrop(s, 1)).toBe(DAWN);
    expect(s.tents.slice(0, 2).map((t) => [t.status, t.cleanProgress, t.occupantId])).toEqual([
      ["messy", 0, null],
      ["messy", 0, null],
    ]);
    expect(s.night).toEqual({ coldLeavers: 0, sleepersPaid: 2, woodEarned: 2 * DAWN, woodBurned: 12 });
    expect(s.night.woodEarned).toBe(24);
    expect(nightReport(s)).toEqual({ night: 1, sleepersPaid: 2, coldLeavers: 0, woodEarned: 24, woodBurned: 12 });
  });
});

describe("sommeil — aube", () => {
  it("tous les dormeurs partent au même pas, dans l'ordre des ids ; fusion avec un drop existant sur la porte", () => {
    const s0 = edit(scenario({ tick: 3599, tents: 3, sleeping: 3, fireWood: 5, player: AWAY }), (d) => {
      d.drops.push({ id: d.nextId++, pos: tileCenter({ tx: 2, ty: 3 }), resource: "wood", amount: 5 });
    });
    expectValid(s0);
    const s1 = tick(s0);
    expectValid(s1);
    expect(ledgerDeltaErrors(s0, s1)).toEqual([]);
    expect(s1.survivors.slice(0, 3).map((v) => v.status)).toEqual(["leaving", "leaving", "leaving"]);
    expect(tentDoorDrop(s1, 0)).toBe(5 + DAWN);
    expect(tentDoorDrop(s1, 1)).toBe(DAWN);
    expect(tentDoorDrop(s1, 2)).toBe(DAWN);
    // Nouveaux drops créés dans l'ordre des ids des survivants (B0 puis B1).
    const newDrops = s1.drops.filter((d) => !s0.drops.some((o) => o.id === d.id));
    expect(newDrops.map((d) => d.pos)).toEqual([tileCenter({ tx: 7, ty: 3 }), tileCenter({ tx: 12, ty: 3 })]);
    expect(newDrops[0]!.id).toBeLessThan(newDrops[1]!.id);
    expect(s1.night).toMatchObject({ sleepersPaid: 3, woodEarned: 3 * DAWN, coldLeavers: 0 });
  });

  it("coup de feu du matin : toutes les tentes des dormeurs passent en désordre à l'aube", () => {
    const s1 = tick(scenario({ tick: 3599, tents: 4, sleeping: 4, fireWood: 5, player: AWAY }));
    expect(s1.tents.map((t) => t.status)).toEqual(["messy", "messy", "messy", "messy"]);
    expect(s1.night.sleepersPaid).toBe(4);
    expect(s1.night.woodEarned).toBe(4 * DAWN);
  });

  it("le jour, le repos fonctionne comme avant (décompte, 8 à la fin du repos)", () => {
    const s = run(scenario({ tick: 3600, tents: 1, resting: 1, restTicksLeft: 10, player: AWAY }), 10);
    expect(s.survivors[0]!.status).toBe("leaving");
    expect(tentDoorDrop(s, 0)).toBe(R);
    expect(s.tick).toBeLessThan(TIME.dayTicks + 3600);
  });
});
