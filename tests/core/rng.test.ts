import { nextInt, nextRandom, seedRng } from "../../src/core/rng";

describe("rng", () => {
  it("est déterministe pour une même seed", () => {
    const run = () => {
      let s = seedRng(42);
      const out: number[] = [];
      for (let i = 0; i < 100; i++) {
        const [v, n] = nextRandom(s);
        out.push(v);
        s = n;
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("reste dans [0, 1[", () => {
    let s = seedRng(7);
    for (let i = 0; i < 10_000; i++) {
      const [v, n] = nextRandom(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      s = n;
    }
  });

  it("nextInt respecte les bornes incluses", () => {
    let s = seedRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) {
      const [v, n] = nextInt(s, 1, 6);
      seen.add(v);
      s = n;
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
