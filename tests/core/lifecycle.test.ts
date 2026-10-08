import { SURVIVOR } from "../../src/data/balance";
import { doorOf, isWalkable, sameTile, tileCenter, tileOf } from "../../src/core/map";
import type { GameState } from "../../src/core/state";
import { edit, expectValid, fresh, place, run, runUntil, withHeadQueued } from "./helpers";
import { tick } from "../../src/core/tick";
import { WELCOME } from "../../src/data/balance";

/** Joueur sur W jusqu'à l'attribution ; renvoie l'état et l'id du survivant accueilli. */
function welcomed(base: GameState = withHeadQueued()): { s: GameState; id: number } {
  const id = base.queue[0]!;
  const s = run(place(base, base.map.welcome), WELCOME.ticks);
  expect(s.survivors.find((v) => v.id === id)!.status).toBe("walkingToTent");
  return { s, id };
}

describe("cycle de vie du survivant", () => {
  it("marche vers la tente en contournant les obstacles, puis se repose", () => {
    const { s: s0, id } = welcomed();
    const tent = s0.tents[0]!;
    let s = s0;
    for (let i = 0; i < 500; i++) {
      s = tick(s);
      expectValid(s);
      const v = s.survivors.find((x) => x.id === id)!;
      expect(isWalkable(s.map, tileOf(v.pos))).toBe(true);
      if (v.status === "resting") break;
    }
    const v = s.survivors.find((x) => x.id === id)!;
    expect(v.status).toBe("resting");
    expect(v.pos).toEqual(tileCenter(tent.tile));
    expect(v.restTicksLeft).toBe(SURVIVOR.restTicks);
    expect(s.tents[0]).toMatchObject({ status: "occupied", occupantId: id });
  });

  it("part après restTicks : tente en désordre, drop de bois sur la porte", () => {
    const { s: s0, id } = welcomed();
    const resting = runUntil(s0, (st) => st.survivors.find((v) => v.id === id)!.status === "resting");
    const almost = run(resting, SURVIVOR.restTicks - 1);
    expect(almost.survivors.find((v) => v.id === id)!.status).toBe("resting");
    expect(almost.drops).toHaveLength(0);
    const s = run(almost, 1);
    const v = s.survivors.find((x) => x.id === id)!;
    expect(v.status).toBe("leaving");
    expect(v.tentId).toBeNull();
    expect(s.tents[0]).toMatchObject({ status: "messy", occupantId: null, cleanProgress: 0 });
    const door = doorOf(s.tents[0]!.tile);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]).toMatchObject({ resource: "wood", amount: SURVIVOR.woodReward, pos: tileCenter(door) });
  });

  it("fusionne avec un drop déjà présent sur la porte", () => {
    const { s: s0, id } = welcomed();
    const door = doorOf(s0.tents[0]!.tile);
    const withDrop = edit(s0, (d) => {
      d.drops.push({ id: d.nextId++, pos: tileCenter(door), resource: "wood", amount: 3 });
    });
    const s = runUntil(withDrop, (st) => st.survivors.find((v) => v.id === id)!.status === "leaving");
    const onDoor = s.drops.filter((d) => sameTile(tileOf(d.pos), door));
    expect(onDoor).toHaveLength(1);
    expect(onDoor[0]!.amount).toBe(3 + SURVIVOR.woodReward);
  });

  it("est supprimé en atteignant l'entrée", () => {
    const { s: s0, id } = welcomed();
    const leaving = runUntil(s0, (st) => st.survivors.find((v) => v.id === id)?.status === "leaving");
    let s = leaving;
    let lastPos = leaving.survivors.find((v) => v.id === id)!.pos;
    for (let i = 0; i < 500 && s.survivors.some((v) => v.id === id); i++) {
      lastPos = s.survivors.find((v) => v.id === id)!.pos;
      s = run(s, 1);
    }
    expect(s.survivors.some((v) => v.id === id)).toBe(false);
    // Dernière position connue : à une tuile de l'entrée au plus.
    expect(Math.abs(lastPos.x - tileCenter(s.map.entrance).x) + Math.abs(lastPos.y - tileCenter(s.map.entrance).y)).toBeLessThanOrEqual(
      SURVIVOR.speed,
    );
  });

  it("aucun survivant ne partage une tente (2 tentes, 2 accueils)", () => {
    const base = withHeadQueued();
    const s0 = edit(base, (d) => {
      const slot = d.buildSlots[0]!;
      const tid = d.nextId++;
      slot.paid = slot.cost;
      slot.builtTentId = tid;
      d.tents.push({ id: tid, tile: { ...slot.tile }, status: "free", occupantId: null, cleanProgress: 0 });
    });
    const s = runUntil(place(s0, s0.map.welcome), (st) => st.tents.every((t) => t.status !== "free"), 400);
    const ids = s.tents.map((t) => t.occupantId);
    expect(new Set(ids).size).toBe(2);
    expect(fresh().tents).toHaveLength(1);
  });
});
