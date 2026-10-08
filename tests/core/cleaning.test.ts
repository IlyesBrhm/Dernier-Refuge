import { TENT, WELCOME } from "../../src/data/balance";
import type { GameState } from "../../src/core/state";
import { edit, fresh, place, run, runUntil, withHeadQueued } from "./helpers";

function messyTent(): GameState {
  return edit(fresh(), (d) => {
    d.tents[0]!.status = "messy";
  });
}

describe("remise en état des tentes", () => {
  it("nettoie en TENT.cleanTicks ticks sur la tuile", () => {
    const s0 = place(messyTent(), fresh().tents[0]!.tile);
    const almost = run(s0, TENT.cleanTicks - 1);
    expect(almost.tents[0]).toMatchObject({ status: "messy", cleanProgress: TENT.cleanTicks - 1 });
    const s = run(almost, 1);
    expect(s.tents[0]).toMatchObject({ status: "free", cleanProgress: 0 });
  });

  it("met en pause si le joueur part, reprend au retour (progression conservée)", () => {
    const tile = fresh().tents[0]!.tile;
    const part = Math.floor(TENT.cleanTicks / 3);
    const a = run(place(messyTent(), tile), part);
    expect(a.tents[0]!.cleanProgress).toBe(part);
    const away = run(place(a, { tx: 7, ty: 6 }), 100);
    expect(away.tents[0]).toMatchObject({ status: "messy", cleanProgress: part });
    const back = run(place(away, tile), TENT.cleanTicks - part - 1);
    expect(back.tents[0]!.status).toBe("messy");
    expect(run(back, 1).tents[0]!.status).toBe("free");
  });

  it("ne dépasse jamais cleanTicks et ne fait rien sur une tente libre", () => {
    const tile = fresh().tents[0]!.tile;
    const s = run(place(fresh(), tile), TENT.cleanTicks * 3);
    expect(s.tents[0]).toMatchObject({ status: "free", cleanProgress: 0 });
  });

  it("ne nettoie pas une tente occupée", () => {
    const base = withHeadQueued();
    const assigned = run(place(base, base.map.welcome), WELCOME.ticks);
    const resting = runUntil(assigned, (st) => st.tents[0]!.status === "occupied");
    const s = run(place(resting, resting.tents[0]!.tile), TENT.cleanTicks * 2);
    expect(s.tents[0]!.cleanProgress).toBe(0);
    expect(s.tents[0]!.status).not.toBe("free");
  });
});
