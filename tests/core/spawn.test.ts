import { QUEUE, SURVIVOR } from "../../src/data/balance";
import { tileCenter } from "../../src/core/map";
import { spawnSystem } from "../../src/core/systems/spawn";
import { edit, fresh, place, run, runUntil } from "./helpers";

describe("arrivée des survivants", () => {
  it("premier survivant à firstSpawnTicks, à l'entrée, en route vers la file", () => {
    const before = run(fresh(), SURVIVOR.firstSpawnTicks - 1);
    expect(before.survivors).toHaveLength(0);
    const s = run(before, 1);
    expect(s.survivors).toHaveLength(1);
    const v = s.survivors[0]!;
    expect(s.queue).toEqual([v.id]);
    expect(v.status).toBe("toQueue");
    expect(v.path[v.path.length - 1]).toEqual(s.map.queueTiles[0]);
  });

  it("tire l'intervalle suivant dans [min, max]", () => {
    for (const seed of [1, 2, 3, 4, 5, 99, 1234]) {
      const s = run(fresh(seed), SURVIVOR.firstSpawnTicks);
      expect(s.spawnTimer).toBeGreaterThanOrEqual(SURVIVOR.spawnIntervalMin);
      expect(s.spawnTimer).toBeLessThanOrEqual(SURVIVOR.spawnIntervalMax);
    }
  });

  it("spawnSystem seul : pose le survivant au centre de E", () => {
    const s = spawnSystem(edit(fresh(), (d) => (d.spawnTimer = 1)));
    expect(s.survivors[0]!.pos).toEqual(tileCenter(s.map.entrance));
  });

  it("chaque survivant rejoint sa place de file", () => {
    const s = runUntil(fresh(), (st) => st.queue.length === 2 && st.survivors.every((v) => v.status === "queued"));
    s.queue.forEach((id, i) => {
      const v = s.survivors.find((x) => x.id === id)!;
      expect(v.pos).toEqual(tileCenter(s.map.queueTiles[i]!));
    });
  });

  it("file pleine ⇒ plus d'arrivée, minuteur gelé à 0, RNG non consommé", () => {
    const full = runUntil(fresh(), (st) => st.queue.length === QUEUE.maxLength);
    const settled = run(full, SURVIVOR.spawnIntervalMax + 1);
    expect(settled.spawnTimer).toBe(0);
    const later = run(settled, 500);
    expect(later.queue).toHaveLength(QUEUE.maxLength);
    expect(later.survivors).toHaveLength(QUEUE.maxLength);
    expect(later.rng).toBe(settled.rng);
    expect(later.spawnTimer).toBe(0);
  });

  it("reprend dès que la tête quitte la file", () => {
    const full = run(runUntil(fresh(), (st) => st.queue.length === QUEUE.maxLength), SURVIVOR.spawnIntervalMax + 1);
    const maxId = Math.max(...full.survivors.map((v) => v.id));
    const onW = place(full, full.map.welcome);
    const welcomed = runUntil(onW, (st) => st.queue.length < QUEUE.maxLength, 50);
    const respawned = runUntil(welcomed, (st) => st.survivors.some((v) => v.id > maxId), 2);
    expect(respawned.queue).toHaveLength(QUEUE.maxLength);
  });
});
