import { LOOP } from "../../src/data/balance";
import { stepBudget } from "../../src/core/loop-budget";

function expectBounded(r: { steps: number; acc: number }): void {
  expect(Number.isInteger(r.steps)).toBe(true);
  expect(r.steps).toBeGreaterThanOrEqual(0);
  expect(r.steps).toBeLessThanOrEqual(LOOP.maxTicksPerFrame);
  expect(r.acc).toBeGreaterThanOrEqual(0);
  expect(r.acc).toBeLessThan(LOOP.tickMs);
}

describe("stepBudget", () => {
  it("borne un delta énorme (10 min)", () => {
    const r = stepBudget(0, 10 * 60 * 1000);
    expectBounded(r);
  });

  it("ignore un delta négatif, NaN ou infini", () => {
    for (const d of [-1, -1e9, NaN, Infinity, -Infinity]) {
      const r = stepBudget(42, d);
      expectBounded(r);
      expect(r.steps).toBe(0);
      expect(r.acc).toBe(42);
    }
  });

  it("assainit un accumulateur corrompu", () => {
    for (const acc of [NaN, -5, Infinity, 1e12]) expectBounded(stepBudget(acc, 16));
  });

  it("cumule correctement des frames de 16 ms", () => {
    let acc = 0;
    let steps = 0;
    for (let i = 0; i < 100; i++) {
      const r = stepBudget(acc, 16);
      expectBounded(r);
      acc = r.acc;
      steps += r.steps;
    }
    expect(steps).toBe(Math.floor((100 * 16) / LOOP.tickMs));
    expect(acc).toBeCloseTo((100 * 16) % LOOP.tickMs);
  });

  it("joue un tick par tranche de tickMs", () => {
    expect(stepBudget(0, LOOP.tickMs)).toEqual({ steps: 1, acc: 0 });
    expect(stepBudget(LOOP.tickMs - 1, 1)).toEqual({ steps: 1, acc: 0 });
  });
});
