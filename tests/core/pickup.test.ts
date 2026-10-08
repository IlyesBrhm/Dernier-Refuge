import { PICKUP, RESOURCES } from "../../src/data/balance";
import type { GameState, Vec } from "../../src/core/state";
import { edit, fresh, run } from "./helpers";

/** Joueur en `player`, un drop de `amount` bois en `at`, bois du joueur = `wood`. */
function scene(player: Vec, at: Vec, amount: number, wood = 0): GameState {
  return edit(fresh(), (d) => {
    d.player.pos = { ...player };
    d.resources.wood = wood;
    d.drops.push({ id: d.nextId++, pos: { ...at }, resource: "wood", amount });
  });
}

const total = (s: GameState) =>
  s.resources.wood + s.drops.filter((d) => d.resource === "wood").reduce((a, d) => a + d.amount, 0);

describe("ramassage", () => {
  // Ligne 3 : entièrement en herbe.
  const player = { x: 3000, y: 3500 };

  it("n'aimante pas un drop hors du rayon", () => {
    const far = { x: player.x + PICKUP.magnetRadius + 1, y: player.y };
    const s = run(scene(player, far, 5), 20);
    expect(s.drops[0]!.pos).toEqual(far);
    expect(s.resources.wood).toBe(0);
  });

  it("aimante un drop dans le rayon puis le collecte", () => {
    const near = { x: player.x + PICKUP.magnetRadius, y: player.y };
    const s1 = run(scene(player, near, 5), 1);
    expect(s1.drops[0]!.pos).toEqual({ x: near.x - PICKUP.magnetSpeed, y: near.y });
    let s = s1;
    for (let i = 0; i < 20 && s.drops.length > 0; i++) s = run(s, 1);
    expect(s.drops).toHaveLength(0);
    expect(s.resources.wood).toBe(5);
  });

  it("collecte immédiatement un drop dans collectRadius", () => {
    const s = run(scene(player, { x: player.x + PICKUP.collectRadius, y: player.y }, 7, 2), 1);
    expect(s.resources.wood).toBe(9);
    expect(s.drops).toHaveLength(0);
  });

  it(`plafonne le stock à RESOURCES.cap, le reste reste au sol sans perte`, () => {
    const s0 = scene(player, player, 8, RESOURCES.cap - 3);
    const s = run(s0, 1);
    expect(s.resources.wood).toBe(RESOURCES.cap);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]!.amount).toBe(5);
    expect(total(s)).toBe(total(s0));
    const later = run(s, 100);
    expect(later.drops[0]).toEqual(s.drops[0]);
    expect(later.resources.wood).toBe(RESOURCES.cap);
  });

  it("stock plein : un drop dans le rayon ne bouge pas", () => {
    const near = { x: player.x + PICKUP.magnetRadius, y: player.y };
    const s = run(scene(player, near, 4, RESOURCES.cap), 10);
    expect(s.drops[0]!.pos).toEqual(near);
  });

  it("reprend la collecte quand de la place se libère", () => {
    const s = run(scene(player, player, 8, RESOURCES.cap - 3), 1);
    const freed = run(
      edit(s, (d) => {
        d.resources.wood = RESOURCES.cap - 10;
      }),
      1,
    );
    expect(freed.resources.wood).toBe(RESOURCES.cap - 5);
    expect(freed.drops).toHaveLength(0);
  });

  it("fusionne des drops qui convergent, sans perte (au plus 1 drop par tuile)", () => {
    const s0 = edit(fresh(), (d) => {
      d.player.pos = { x: 3500, y: 3500 };
      d.resources.wood = 0;
      d.drops.push({ id: d.nextId++, pos: { x: 4500, y: 3500 }, resource: "wood", amount: 2 });
      d.drops.push({ id: d.nextId++, pos: { x: 4500, y: 4500 }, resource: "wood", amount: 3 });
      d.drops.push({ id: d.nextId++, pos: { x: 3500, y: 4500 }, resource: "wood", amount: 4 });
    });
    let s = s0;
    for (let i = 0; i < 10; i++) {
      s = run(s, 1); // run vérifie l'invariant « 1 drop par tuile »
      expect(total(s)).toBe(total(s0));
    }
    expect(s.resources.wood).toBe(9);
  });
});

describe("ramassage par ressource", () => {
  const player = { x: 3000, y: 3500 };

  it("un drop de nourriture est crédité dans food (pas dans wood)", () => {
    const s0 = edit(fresh(), (d) => {
      d.player.pos = { ...player };
      d.drops.push({ id: d.nextId++, pos: { ...player }, resource: "food", amount: 4 });
    });
    const s = run(s0, 1);
    expect(s.resources.food).toBe(s0.resources.food + 4);
    expect(s.resources.wood).toBe(s0.resources.wood);
    expect(s.drops).toEqual([]);
  });

  it("un stock de bois plein n'empêche pas l'aimantation ni la collecte de nourriture", () => {
    const near = { x: player.x + PICKUP.magnetRadius, y: player.y };
    const s0 = edit(fresh(), (d) => {
      d.player.pos = { ...player };
      d.resources.wood = RESOURCES.cap;
      d.resources.food = 0;
      d.drops.push({ id: d.nextId++, pos: { ...near }, resource: "wood", amount: 2 });
      d.drops.push({ id: d.nextId++, pos: { ...near, y: near.y - 1 }, resource: "food", amount: 3 });
    });
    const s = run(s0, 10);
    expect(s.resources.food).toBe(3);
    expect(s.resources.wood).toBe(RESOURCES.cap);
    expect(s.drops).toEqual([expect.objectContaining({ resource: "wood", amount: 2, pos: near })]);
  });

  it("nourriture pleine : collecte partielle, le reste reste au sol", () => {
    const s0 = edit(fresh(), (d) => {
      d.player.pos = { ...player };
      d.resources.food = RESOURCES.cap - 1;
      d.drops.push({ id: d.nextId++, pos: { ...player }, resource: "food", amount: 5 });
    });
    const s = run(s0, 1);
    expect(s.resources.food).toBe(RESOURCES.cap);
    expect(s.drops).toEqual([expect.objectContaining({ resource: "food", amount: 4 })]);
  });

  it("les drops convergents ne fusionnent qu'entre ressources identiques, sans perte", () => {
    const s0 = edit(fresh(), (d) => {
      d.player.pos = { x: 3500, y: 3500 };
      d.resources.wood = 0;
      d.resources.food = 0;
      d.drops.push({ id: d.nextId++, pos: { x: 4500, y: 3500 }, resource: "wood", amount: 2 });
      d.drops.push({ id: d.nextId++, pos: { x: 4500, y: 4500 }, resource: "food", amount: 3 });
      d.drops.push({ id: d.nextId++, pos: { x: 3500, y: 4500 }, resource: "wood", amount: 4 });
    });
    let s = s0;
    for (let i = 0; i < 10; i++) s = run(s, 1); // invariant : au plus 1 drop par (tuile, ressource)
    expect(s.resources.wood).toBe(6);
    expect(s.resources.food).toBe(3);
    expect(s.drops).toEqual([]);
  });
});
