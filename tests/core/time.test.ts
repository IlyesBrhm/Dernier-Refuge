// Temps dérivé du tick (docs/design/day-night.md §1.1, §3.1).

import { FIRE, TIME } from "../../src/data/balance";
import * as coreIndex from "../../src/core/index";
import {
  CYCLE_TICKS,
  countBurnTicks,
  cyclePos,
  dayIndex,
  isBurnTick,
  isDawnTick,
  isDuskTick,
  isNight,
  lightPhase,
  nightStartTick,
  phase,
} from "../../src/core/time";

/** Référence naïve, indépendante de l'implémentation O(1). */
function naiveIsBurn(t: number): boolean {
  const night = t % CYCLE_TICKS >= TIME.dayTicks;
  return t % (night ? FIRE.nightBurnIntervalTicks : FIRE.dayBurnIntervalTicks) === 0;
}

describe("temps — phases", () => {
  it("cycle = jour + nuit = 3600 ticks", () => {
    expect(CYCLE_TICKS).toBe(TIME.dayTicks + TIME.nightTicks);
    expect(CYCLE_TICKS).toBe(3600);
  });

  it.each([
    [0, "day"],
    [2399, "day"],
    [2400, "night"],
    [3599, "night"],
    [3600, "day"],
    [6000, "night"],
    [7199, "night"],
    [7200, "day"],
  ] as const)("phase(%i) = %s", (t, p) => {
    expect(phase(t)).toBe(p);
    expect(isNight(t)).toBe(p === "night");
  });

  it("dayIndex : base 0, change à l'aube", () => {
    expect(dayIndex(0)).toBe(0);
    expect(dayIndex(3599)).toBe(0);
    expect(dayIndex(3600)).toBe(1);
    expect(dayIndex(7199)).toBe(1);
    expect(dayIndex(7200)).toBe(2);
  });

  it("aube : tick > 0 et cyclePos = 0 ; crépuscule : cyclePos = 2400", () => {
    expect(isDawnTick(0)).toBe(false);
    expect(isDawnTick(3600)).toBe(true);
    expect(isDawnTick(7200)).toBe(true);
    expect(isDawnTick(3601)).toBe(false);
    expect(isDuskTick(2400)).toBe(true);
    expect(isDuskTick(6000)).toBe(true);
    expect(isDuskTick(2399)).toBe(false);
    expect(isDuskTick(2401)).toBe(false);
  });

  it("nightStartTick : premier tick de la nuit en cours", () => {
    expect(nightStartTick(2400)).toBe(2400);
    expect(nightStartTick(3599)).toBe(2400);
    expect(nightStartTick(6500)).toBe(6000);
  });

  it("sous-phases visuelles : dawn [0,300) day [300,2100) dusk [2100,2400) night [2400,3600)", () => {
    expect(lightPhase(0)).toEqual({ phase: "dawn", progress: 0 });
    expect(lightPhase(150)).toEqual({ phase: "dawn", progress: 0.5 });
    expect(lightPhase(299).phase).toBe("dawn");
    expect(lightPhase(300)).toEqual({ phase: "day", progress: 0 });
    expect(lightPhase(2099).phase).toBe("day");
    expect(lightPhase(2100)).toEqual({ phase: "dusk", progress: 0 });
    expect(lightPhase(2399).phase).toBe("dusk");
    expect(lightPhase(2400)).toEqual({ phase: "night", progress: 0 });
    expect(lightPhase(3000)).toEqual({ phase: "night", progress: 0.5 });
    expect(lightPhase(3599).phase).toBe("night");
    expect(lightPhase(3600)).toEqual({ phase: "dawn", progress: 0 });
    for (let t = 0; t < CYCLE_TICKS; t += 7) {
      const { progress } = lightPhase(t);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThan(1);
    }
  });

  it("temps réel (interpolation du rendu) accepté, continu", () => {
    expect(cyclePos(3600.5)).toBeCloseTo(0.5);
    expect(lightPhase(2399.5).phase).toBe("dusk");
  });

  it("NaN, infini, négatif ⇒ 0 ; 2^53 − 1 reste fini", () => {
    for (const bad of [NaN, -1, -3600, Infinity, -Infinity]) {
      expect(cyclePos(bad)).toBe(0);
      expect(dayIndex(bad)).toBe(0);
      expect(isDawnTick(bad)).toBe(false);
      expect(isBurnTick(bad)).toBe(false);
    }
    const big = Number.MAX_SAFE_INTEGER;
    expect(Number.isFinite(cyclePos(big))).toBe(true);
    expect(Number.isFinite(dayIndex(big))).toBe(true);
    expect(lightPhase(big).progress).toBeLessThan(1);
  });

  it("est exporté par l'index du core (via les sélecteurs)", () => {
    expect(coreIndex.cyclePos).toBe(cyclePos);
    expect(coreIndex.isNight).toBe(isNight);
    expect(coreIndex.countBurnTicks).toBe(countBurnTicks);
    expect(coreIndex.CYCLE_TICKS).toBe(CYCLE_TICKS);
  });
});

describe("temps — calendrier de combustion", () => {
  it("isBurnTick = référence naïve sur [0, 20 000]", () => {
    for (let t = 0; t <= 20_000; t++) expect(isBurnTick(t), `tick ${t}`).toBe(naiveIsBurn(t));
  });

  it("jour 1 : 600, 1200, 1800 ; nuit 1 : 2400, 2500, …, 3500 ; aube : 3600 (combustion de jour)", () => {
    const burns = [];
    for (let t = 1; t <= 3600; t++) if (isBurnTick(t)) burns.push(t);
    expect(burns).toEqual([600, 1200, 1800, ...Array.from({ length: 12 }, (_, i) => 2400 + 100 * i), 3600]);
  });

  it("countBurnTicks = boucle naïve, pour tout préfixe [1, t] avec t ≤ 20 000", () => {
    let n = 0;
    for (let t = 1; t <= 20_000; t++) {
      if (naiveIsBurn(t)) n++;
      expect(countBurnTicks(1, t), `[1, ${t}]`).toBe(n);
    }
  });

  it("countBurnTicks : intervalles quelconques, additif, vide si from > to", () => {
    let seed = 12345;
    const rnd = (m: number): number => {
      seed = (seed * 48271) % 2147483647; // Park-Miller, produits < 2^53
      return seed % m;
    };
    for (let k = 0; k < 300; k++) {
      const a = rnd(15_000);
      const b = a + rnd(5000);
      const c = b + 1 + rnd(5000);
      let naive = 0;
      for (let t = a; t <= b; t++) if (naiveIsBurn(t)) naive++;
      expect(countBurnTicks(a, b), `[${a}, ${b}]`).toBe(naive);
      expect(countBurnTicks(a, b) + countBurnTicks(b + 1, c)).toBe(countBurnTicks(a, c));
    }
    expect(countBurnTicks(10, 9)).toBe(0);
    expect(countBurnTicks(600, 600)).toBe(1);
    expect(countBurnTicks(1.5, 10)).toBe(0);
  });

  it("countBurnTicks est O(1) : tick = 2^53 − 1 répond immédiatement, valeur finie et cohérente", () => {
    const big = Number.MAX_SAFE_INTEGER;
    const n = countBurnTicks(1, big);
    expect(Number.isFinite(n)).toBe(true);
    // Ordre de grandeur : (4 + 12) combustions par cycle.
    expect(n / (big / CYCLE_TICKS)).toBeCloseTo(16, 3);
  });
});
