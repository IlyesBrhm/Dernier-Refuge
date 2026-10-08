// Tests des utilitaires de fixture : `edit` ne touche jamais `tick` ; `editPlausible` ne l'avance
// que si nécessaire, au minimum, et jamais à la baisse.

import { PLAUSIBILITY, RESOURCES, STARTING_RESOURCES } from "../../src/data/balance";
import { checkInvariants } from "../../src/core/invariants";
import { tileCenter } from "../../src/core/map";
import { edit, editPlausible, fresh, plausibleTick, run } from "./helpers";

const plausibilityErrors = (s: Parameters<typeof checkInvariants>[0]): string[] =>
  checkInvariants(s).filter((e) => e.startsWith("plausibilité"));

describe("helpers de fixture", () => {
  it("edit ne modifie jamais tick, même avec des stocks gonflés (l'état reste implausible)", () => {
    const s0 = fresh();
    const s = edit(s0, (d) => {
      d.resources.wood = RESOURCES.cap;
      d.resources.food = RESOURCES.cap;
    });
    expect(s.tick).toBe(s0.tick);
    expect(s0.resources.wood).toBe(STARTING_RESOURCES.wood); // copie, l'original n'est pas muté
    expect(plausibilityErrors(s).length).toBeGreaterThan(0);

    const later = run(fresh(), 37);
    expect(edit(later, (d) => void (d.resources.wood = RESOURCES.cap)).tick).toBe(37);
  });

  it("editPlausible ne change pas tick si l'état est déjà plausible", () => {
    const s0 = run(fresh(), 50);
    expect(editPlausible(s0, (d) => void (d.player.pos = tileCenter({ tx: 3, ty: 3 }))).tick).toBe(50);
    // Stocks réduits : toujours plausible, tick inchangé.
    expect(editPlausible(s0, (d) => void (d.resources.wood = 0)).tick).toBe(50);
  });

  it("editPlausible avance tick au minimum nécessaire (bois, nourriture, drops compris)", () => {
    const wood = editPlausible(fresh(), (d) => void (d.resources.wood = RESOURCES.cap));
    const expectedWood = Math.ceil((RESOURCES.cap - STARTING_RESOURCES.wood) / PLAUSIBILITY.woodPerTick);
    expect(wood.tick).toBe(expectedWood);
    expect(plausibilityErrors(wood)).toEqual([]);
    // Un tick de moins serait implausible : c'est bien le minimum.
    expect(plausibilityErrors(edit(wood, (d) => void (d.tick -= 1))).length).toBeGreaterThan(0);

    const food = editPlausible(fresh(), (d) => {
      d.drops.push({ id: d.nextId++, pos: tileCenter({ tx: 3, ty: 3 }), resource: "food", amount: 40 });
    });
    expect(food.tick).toBe(Math.ceil(40 / PLAUSIBILITY.foodPerTick));
    expect(plausibilityErrors(food)).toEqual([]);
  });

  it("editPlausible ne recule jamais tick", () => {
    const s0 = edit(fresh(), (d) => void (d.tick = 100_000));
    const s = editPlausible(s0, (d) => void (d.resources.wood = RESOURCES.cap));
    expect(s.tick).toBe(100_000);
    expect(plausibleTick(s0)).toBe(100_000);
  });

  it("editPlausible ne mute pas l'état d'entrée", () => {
    const s0 = fresh();
    const snap = JSON.stringify(s0);
    editPlausible(s0, (d) => void (d.resources.wood = RESOURCES.cap));
    expect(JSON.stringify(s0)).toBe(snap);
  });
});
