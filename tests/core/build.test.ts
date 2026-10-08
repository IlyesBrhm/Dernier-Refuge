import { BUILD, STARTING_RESOURCES, WELCOME } from "../../src/data/balance";
import { slotRemaining } from "../../src/core/selectors";
import type { GameState } from "../../src/core/state";
import { edit, fresh, place, run, runUntil } from "./helpers";

const paidTotal = (s: GameState) => s.buildSlots.reduce((a, b) => a + b.paid, 0);

function onSlot0(wood: number): GameState {
  const s = fresh();
  return edit(place(s, s.buildSlots[0]!.tile), (d) => {
    d.resources.wood = wood;
  });
}

describe("construction", () => {
  const cost = BUILD.slotCosts[0];

  it("verse le bois progressivement (payPerStep tous les payIntervalTicks)", () => {
    const s0 = onSlot0(cost);
    let s = s0;
    let prevPaid = 0;
    for (let i = 0; i < BUILD.payIntervalTicks * 3; i++) {
      s = run(s, 1);
      const paid = s.buildSlots[0]!.paid;
      expect(paid - prevPaid).toBeGreaterThanOrEqual(0);
      expect(paid - prevPaid).toBeLessThanOrEqual(BUILD.payPerStep);
      expect(s.resources.wood + paid).toBe(cost); // conservation
      prevPaid = paid;
    }
    expect(prevPaid).toBe(Math.min(cost, 3 * BUILD.payPerStep));
  });

  it("ressources insuffisantes : paie partiellement, jamais négatif, pas construit", () => {
    const wood = cost - 5;
    const s = run(onSlot0(wood), cost * BUILD.payIntervalTicks * 3);
    expect(s.resources.wood).toBe(0);
    expect(s.buildSlots[0]!.paid).toBe(wood);
    expect(s.buildSlots[0]!.builtTentId).toBeNull();
    expect(s.tents).toHaveLength(1);
    expect(slotRemaining(s.buildSlots[0]!)).toBe(5);
  });

  it("0 bois ⇒ rien", () => {
    const s = run(onSlot0(0), 50);
    expect(s.buildSlots[0]!.paid).toBe(0);
    expect(s.resources.wood).toBe(0);
  });

  it("quitter conserve le bois versé, revenir complète sans double paiement", () => {
    const part = Math.min(4, cost - 1);
    const s0 = onSlot0(100);
    const partial = runUntil(s0, (st) => st.buildSlots[0]!.paid === part);
    const away = run(place(partial, { tx: 7, ty: 6 }), 50);
    expect(away.buildSlots[0]!.paid).toBe(part);
    expect(away.resources.wood).toBe(100 - part);
    // Va-et-vient répétés : on ne paie jamais plus que le coût.
    let s = away;
    for (let i = 0; i < 40; i++) {
      s = run(place(s, i % 2 === 0 ? s.buildSlots[0]!.tile : { tx: 7, ty: 6 }), 3);
      expect(s.buildSlots[0]!.paid).toBeLessThanOrEqual(cost);
      expect(s.resources.wood + paidTotal(s)).toBe(100);
    }
    s = runUntil(place(s, s.buildSlots[0]!.tile), (st) => st.buildSlots[0]!.builtTentId !== null);
    expect(s.buildSlots[0]!.paid).toBe(cost);
    expect(s.resources.wood).toBe(100 - cost);
  });

  it("construit une tente libre sur l'emplacement, qui ne consomme plus rien", () => {
    const s = runUntil(onSlot0(cost + 20), (st) => st.buildSlots[0]!.builtTentId !== null);
    const slot = s.buildSlots[0]!;
    const tent = s.tents.find((t) => t.id === slot.builtTentId)!;
    expect(tent).toMatchObject({ tile: slot.tile, status: "free", occupantId: null });
    expect(s.tents).toHaveLength(2);
    const later = run(s, 100);
    expect(later.resources.wood).toBe(20);
    expect(later.tents).toHaveLength(2);
  });

  it("la nouvelle tente est utilisable pour accueillir", () => {
    const built = runUntil(onSlot0(cost), (st) => st.buildSlots[0]!.builtTentId !== null);
    const s0 = edit(built, (d) => {
      d.tents[0]!.status = "messy"; // la tente initiale n'est pas disponible
    });
    const queued = runUntil(s0, (st) => st.survivors.some((v) => v.status === "queued"));
    const s = run(place(queued, queued.map.welcome), WELCOME.ticks);
    const newTent = s.tents.find((t) => t.id === s.buildSlots[0]!.builtTentId)!;
    expect(newTent.status).toBe("assigned");
    const v = s.survivors.find((x) => x.id === newTent.occupantId)!;
    expect(v.status).toBe("walkingToTent");
    const arrived = runUntil(s, (st) => st.tents.find((t) => t.id === newTent.id)!.status === "occupied", 200);
    expect(arrived.survivors.find((x) => x.id === v.id)!.status).toBe("resting");
  });

  it("le départ standard (10 bois) ne suffit pas pour le premier emplacement", () => {
    expect(STARTING_RESOURCES.wood).toBeLessThan(cost);
  });
});
