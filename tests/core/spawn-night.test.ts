// Arrivées arrêtées la nuit (docs/design/day-night.md §1.2) : le minuteur descend jusqu'à 0 puis
// s'arrête sans RNG ; arrivée au pas de l'aube ; la file est conservée.

import { QUEUE } from "../../src/data/balance";
import { tick } from "../../src/core/tick";
import { isNight } from "../../src/core/time";
import { AWAY, scenario } from "./day-night-fixtures";
import { edit, expectValid, place, runUntil, fresh } from "./helpers";

describe("arrivées — nuit", () => {
  it("aucune arrivée sur [2400, 3599] ; minuteur gelé à 0 et RNG identique ; arrivée au tick 3600", () => {
    let s = edit(scenario({ tick: 2399, player: AWAY }), (d) => void (d.spawnTimer = 50));
    const rng0 = s.rng;
    for (let t = 2400; t <= 3599; t++) {
      s = tick(s);
      expect(s.survivors).toHaveLength(0);
      expect(s.rng).toBe(rng0);
      if (t >= 2449) expect(s.spawnTimer).toBe(0);
    }
    expectValid(s);
    s = tick(s);
    expect(s.tick).toBe(3600);
    expect(isNight(s.tick)).toBe(false);
    expect(s.survivors).toHaveLength(1);
    expect(s.queue).toHaveLength(1);
    expect(s.rng).not.toBe(rng0);
    expect(s.spawnTimer).toBeGreaterThan(0);
  });

  it("la file n'est pas vidée à la tombée de la nuit et reste en place toute la nuit", () => {
    const day = runUntil(place(fresh(), AWAY), (st) => st.queue.length === 3 && st.survivors.every((v) => v.status === "queued"), 2000);
    const base = edit(day, (d) => void (d.tick = 2399));
    expectValid(base);
    let s = base;
    for (let t = 2400; t <= 3599; t++) s = tick(s);
    expectValid(s);
    expect(s.queue).toEqual(base.queue);
    expect(s.survivors.map((v) => [v.id, v.status, v.pos])).toEqual(base.survivors.map((v) => [v.id, v.status, v.pos]));
  });

  it("file pleine à l'aube ⇒ aucune arrivée (minuteur gelé à 0)", () => {
    const full = runUntil(place(fresh(), AWAY), (st) => st.queue.length === QUEUE.maxLength, 3000);
    const s0 = edit(full, (d) => void (d.tick = 3599));
    const s1 = tick(s0);
    expect(s1.queue).toHaveLength(QUEUE.maxLength);
    expect(s1.survivors).toHaveLength(s0.survivors.length);
  });
});
