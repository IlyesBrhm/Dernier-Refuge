// Sélecteurs jour/nuit pour le rendu et l'UI (docs/design/day-night.md §3.3) : lecture seule.

import { FIRE } from "../../src/data/balance";
import * as coreIndex from "../../src/core/index";
import {
  clockInfo,
  feedProgressRatio,
  feedZone,
  fireRatio,
  isFeedingFire,
  isFireLit,
  isFireLow,
  isFireOutAtNight,
  nightReport,
  sleepersCount,
  welcomeBlockedByCold,
} from "../../src/core/selectors";
import { AWAY, FEED_SPOT, scenario } from "./day-night-fixtures";
import { deepFreeze, edit, fresh } from "./helpers";

describe("sélecteurs jour/nuit", () => {
  it("clockInfo : jour affiché base 1, phase, sous-phase, avancement", () => {
    expect(clockInfo(fresh())).toEqual({ day: 1, cyclePos: 0, phase: "day", light: "dawn", lightProgress: 0 });
    expect(clockInfo(scenario({ tick: 2250 }))).toMatchObject({ day: 1, phase: "day", light: "dusk", lightProgress: 0.5 });
    expect(clockInfo(scenario({ tick: 3000 }))).toMatchObject({ day: 1, phase: "night", light: "night" });
    expect(clockInfo(scenario({ tick: 3600 }))).toMatchObject({ day: 2, cyclePos: 0, phase: "day", light: "dawn" });
  });

  it("fireRatio, isFireLit", () => {
    expect(fireRatio(fresh())).toBe(FIRE.initialWood / FIRE.capacity);
    expect(fireRatio(scenario({ tick: 100, fireWood: FIRE.capacity }))).toBe(1);
    expect(fireRatio(scenario({ tick: 100, fireWood: 0 }))).toBe(0);
    expect(isFireLit(scenario({ tick: 100, fireWood: 1 }))).toBe(true);
    expect(isFireLit(scenario({ tick: 100, fireWood: 0 }))).toBe(false);
  });

  it("isFireLow : nuit ∧ 0 < wood ≤ lowWood ; isFireOutAtNight : nuit ∧ wood = 0", () => {
    expect(isFireLow(scenario({ tick: 2500, fireWood: FIRE.lowWood }))).toBe(true);
    expect(isFireLow(scenario({ tick: 2500, fireWood: FIRE.lowWood + 1 }))).toBe(false);
    expect(isFireLow(scenario({ tick: 2500, fireWood: 0 }))).toBe(false);
    expect(isFireLow(scenario({ tick: 1000, fireWood: 1 }))).toBe(false); // le jour, jamais
    expect(isFireOutAtNight(scenario({ tick: 2500, fireWood: 0 }))).toBe(true);
    expect(isFireOutAtNight(scenario({ tick: 1000, fireWood: 0 }))).toBe(false);
  });

  it("feedZone : les 8 voisines ; isFeedingFire : arrêté dans la zone depuis le délai, feu non plein, bois en stock", () => {
    expect(feedZone(fresh().map)).toHaveLength(8);
    const ready = { tick: 100, fireWood: 5, player: FEED_SPOT, wood: 3, feedProgress: "ready" } as const;
    expect(isFeedingFire(scenario(ready))).toBe(true);
    expect(isFeedingFire(scenario({ ...ready, player: AWAY, feedProgress: 0 }))).toBe(false);
    expect(isFeedingFire(scenario({ ...ready, fireWood: FIRE.capacity }))).toBe(false);
    expect(isFeedingFire(scenario({ ...ready, wood: 0 }))).toBe(false);
    // Délai non écoulé : pas encore d'alimentation.
    expect(isFeedingFire(scenario({ ...ready, feedProgress: FIRE.feedDelayTicks - 1 }))).toBe(false);
    expect(isFeedingFire(scenario({ ...ready, feedProgress: 0 }))).toBe(false);
    // Une direction vient d'être donnée (commande, avant le tick) : il ne verse plus.
    expect(isFeedingFire(edit(scenario(ready), (d) => void (d.player.input = { dx: 1, dy: 0 })))).toBe(false);
  });

  it("feedProgressRatio : 0..1 selon le délai d'arrêt, 0 si le joueur bouge", () => {
    const base = { tick: 100, fireWood: 5, player: FEED_SPOT, wood: 3 } as const;
    expect(feedProgressRatio(scenario(base))).toBe(0);
    expect(feedProgressRatio(scenario({ ...base, feedProgress: 2 }))).toBe(2 / FIRE.feedDelayTicks);
    expect(feedProgressRatio(scenario({ ...base, feedProgress: "ready" }))).toBe(1);
    // Feu plein : la jauge reste pleine (le joueur est arrêté au feu), isFeedingFire non.
    expect(feedProgressRatio(scenario({ ...base, fireWood: FIRE.capacity, feedProgress: "ready" }))).toBe(1);
    const moving = edit(scenario({ ...base, feedProgress: 3 }), (d) => void (d.player.input = { dx: 0, dy: 1 }));
    expect(feedProgressRatio(moving)).toBe(0);
    expect(feedProgressRatio(scenario({ tick: 100, player: AWAY }))).toBe(0);
  });

  it("welcomeBlockedByCold : nuit ∧ feu à 0 seulement", () => {
    expect(welcomeBlockedByCold(scenario({ tick: 2500, fireWood: 0 }))).toBe(true);
    expect(welcomeBlockedByCold(scenario({ tick: 2500, fireWood: 1 }))).toBe(false);
    expect(welcomeBlockedByCold(scenario({ tick: 1000, fireWood: 0 }))).toBe(false);
  });

  it("sleepersCount, nightReport ; aucun sélecteur ne mute l'état", () => {
    const s = deepFreeze(scenario({ tick: 2900, tents: 3, sleeping: 2, fireWood: 5 }));
    expect(sleepersCount(s)).toBe(2);
    expect(nightReport(s)).toBeNull();
    expect(() => {
      clockInfo(s);
      fireRatio(s);
      isFireLow(s);
      isFeedingFire(s);
      feedProgressRatio(s);
      feedZone(s.map);
      welcomeBlockedByCold(s);
    }).not.toThrow();
    const day2 = edit(scenario({ tick: 4000 }), (d) => void (d.night.woodBurned = 12));
    expect(nightReport(day2)).toEqual({ night: 1, sleepersPaid: 0, coldLeavers: 0, woodEarned: 0, woodBurned: 12 });
  });

  it("exportés par l'index du core", () => {
    expect(coreIndex.clockInfo).toBe(clockInfo);
    expect(coreIndex.nightReport).toBe(nightReport);
    expect(coreIndex.welcomeBlockedByCold).toBe(welcomeBlockedByCold);
    expect(coreIndex.isFireLow).toBe(isFireLow);
    expect(coreIndex.sleepersCount).toBe(sleepersCount);
    expect(coreIndex.feedProgressRatio).toBe(feedProgressRatio);
    expect(coreIndex.isFeedingFire).toBe(isFeedingFire);
    expect(coreIndex.DAWN_REWARD).toBe(12);
    expect(coreIndex.COLD_REWARD).toBe(2);
  });
});
