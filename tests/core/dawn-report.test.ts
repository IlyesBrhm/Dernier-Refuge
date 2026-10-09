// Bilan de la nuit (docs/design/day-night.md §1.6) : remis à 0 au crépuscule, figé de l'aube au
// crépuscule suivant, lisible par nightReport le jour à partir du jour 2.

import { SLEEP, SURVIVOR } from "../../src/data/balance";
import { clockInfo, nightReport } from "../../src/core/selectors";
import { tick } from "../../src/core/tick";
import { FEED_SPOT, scenario } from "./day-night-fixtures";
import { edit, expectValid } from "./helpers";

const DAWN = SURVIVOR.woodReward + SLEEP.dawnBonus;

describe("bilan de la nuit", () => {
  it("remis à 0 au pas du crépuscule (même non nul avant)", () => {
    const s0 = edit(scenario({ tick: 5999 }), (d) => {
      d.night = { coldLeavers: 1, sleepersPaid: 1, woodEarned: 2 + DAWN, woodBurned: 5 };
    });
    expectValid(s0);
    expect(nightReport(s0)).toEqual({ night: 1, coldLeavers: 1, sleepersPaid: 1, woodEarned: 2 + DAWN, woodBurned: 5 });
    const s1 = tick(s0);
    expect(s1.tick).toBe(6000);
    expect(s1.night.coldLeavers + s1.night.sleepersPaid + s1.night.woodEarned).toBe(0);
    expect(nightReport(s1)).toBeNull();
  });

  it("figé de 3600 à 5999, remplacé au tick 6000 ; nightReport null le jour 1 et la nuit, { night: 1 } le jour 2", () => {
    let s = scenario({ tick: 0 });
    expect(nightReport(s)).toBeNull();
    s = scenario({ tick: 2399, tents: 2, resting: 2, fireWood: 7, player: FEED_SPOT, wood: 60 });
    expect(nightReport(s)).toBeNull();
    for (let t = 2400; t < 3600; t++) {
      s = tick(s);
      expect(nightReport(s)).toBeNull();
    }
    s = tick(s);
    const report = nightReport(s);
    expect(report).toEqual({ night: 1, sleepersPaid: 2, coldLeavers: 0, woodEarned: 2 * DAWN, woodBurned: 12 });
    const frozen = { ...s.night };
    for (let t = 3601; t <= 5999; t++) {
      s = tick(s);
      expect(s.night).toEqual(frozen);
    }
    expectValid(s);
    expect(clockInfo(s)).toMatchObject({ day: 2, phase: "day", light: "dusk" });
    s = tick(s);
    expect(s.tick).toBe(6000);
    expect(s.night.sleepersPaid).toBe(0);
    expect(s.night.woodEarned).toBe(0);
    expect(clockInfo(s)).toMatchObject({ day: 2, phase: "night", light: "night", cyclePos: 2400 });
  });
});
