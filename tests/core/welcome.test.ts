import { WELCOME } from "../../src/data/balance";
import { tileCenter } from "../../src/core/map";
import type { GameState } from "../../src/core/state";
import { edit, fresh, place, run, runUntil, withHeadQueued } from "./helpers";

/** Ajoute (fixture cohérente) la tente construite de l'emplacement 0. */
function withBuiltSlot0(state: GameState): GameState {
  return edit(state, (d) => {
    const slot = d.buildSlots[0]!;
    const id = d.nextId++;
    slot.paid = slot.cost;
    slot.builtTentId = id;
    d.tents.push({ id, tile: { ...slot.tile }, status: "free", occupantId: null, cleanProgress: 0 });
  });
}

describe("accueil", () => {
  it("attribue la tente libre après WELCOME.ticks sur W", () => {
    const s0 = place(withHeadQueued(), fresh().map.welcome);
    const headId = s0.queue[0]!;
    const almost = run(s0, WELCOME.ticks - 1);
    expect(almost.welcomeProgress).toBe(WELCOME.ticks - 1);
    expect(almost.tents[0]!.status).toBe("free");
    const s = run(almost, 1);
    const head = s.survivors.find((v) => v.id === headId)!;
    expect(head.status).toBe("walkingToTent");
    expect(head.tentId).toBe(s.tents[0]!.id);
    expect(s.tents[0]).toMatchObject({ status: "assigned", occupantId: headId });
    expect(s.queue).not.toContain(headId);
    expect(s.welcomeProgress).toBe(0);
  });

  it("ne fait rien sans tente libre", () => {
    const s0 = edit(place(withHeadQueued(), fresh().map.welcome), (d) => {
      d.tents[0]!.status = "messy";
    });
    const s = run(s0, WELCOME.ticks * 4);
    expect(s.welcomeProgress).toBe(0);
    expect(s.queue[0]).toBe(s0.queue[0]);
    expect(s.survivors.every((v) => v.status !== "walkingToTent")).toBe(true);
  });

  it("repart de zéro si le joueur quitte W", () => {
    const base = withHeadQueued();
    const onW = place(base, base.map.welcome);
    const partial = run(onW, WELCOME.ticks - 1);
    const left = run(place(partial, { tx: 7, ty: 7 }), 1);
    expect(left.welcomeProgress).toBe(0);
    const back = run(place(left, base.map.welcome), WELCOME.ticks - 1);
    expect(back.tents[0]!.status).toBe("free"); // il faut un cycle complet
    expect(run(back, 1).tents[0]!.status).toBe("assigned");
  });

  it("choisit la tente libre d'id le plus petit", () => {
    const s0 = place(withBuiltSlot0(withHeadQueued()), fresh().map.welcome);
    const s = run(s0, WELCOME.ticks);
    expect(s.tents[0]!.status).toBe("assigned");
    expect(s.tents[1]!.status).toBe("free");
  });

  it("n'accueille pas une tête pas encore arrivée", () => {
    const s0 = place(fresh(), fresh().map.welcome);
    const s = runUntil(s0, (st) => st.survivors.length === 1);
    let cur = s;
    while (cur.survivors[0]!.status === "toQueue") {
      expect(cur.welcomeProgress).toBe(0);
      cur = run(cur, 1);
    }
    expect(cur.survivors[0]!.pos).toEqual(tileCenter(cur.map.queueTiles[0]!));
    expect(run(cur, WELCOME.ticks).survivors[0]!.status).toBe("walkingToTent");
  });

  it("un seul accueil par cycle de progression", () => {
    const two = runUntil(fresh(), (st) => st.queue.length === 2 && st.survivors.every((v) => v.status === "queued"));
    const s0 = place(withBuiltSlot0(two), two.map.welcome);
    const first = run(s0, WELCOME.ticks);
    expect(first.survivors.filter((v) => v.status === "walkingToTent")).toHaveLength(1);
    expect(first.welcomeProgress).toBe(0);
    // Le suivant doit avancer jusqu'à la tête puis refaire un cycle complet.
    const next = runUntil(first, (st) => st.tents.every((t) => t.status !== "free"), 100);
    expect(next.tick - first.tick).toBeGreaterThanOrEqual(WELCOME.ticks);
  });

  it("la file avance quand la tête part", () => {
    const two = runUntil(fresh(), (st) => st.queue.length === 2 && st.survivors.every((v) => v.status === "queued"));
    const second = two.queue[1]!;
    const s = run(place(two, two.map.welcome), WELCOME.ticks);
    expect(s.queue[0]).toBe(second);
    const moved = runUntil(s, (st) => st.survivors.find((v) => v.id === second)!.status === "queued", 50);
    expect(moved.survivors.find((v) => v.id === second)!.pos).toEqual(tileCenter(moved.map.queueTiles[0]!));
  });
});
