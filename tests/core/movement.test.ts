import { PLAYER, WORLD } from "../../src/data/balance";
import { hitboxBlocked } from "../../src/core/collision";
import { tileCenter } from "../../src/core/map";
import { expectValid, fresh, move, place, run } from "./helpers";

const U = WORLD.unitsPerTile;
const H = PLAYER.halfSize;

describe("déplacement du joueur", () => {
  it("avance de PLAYER.speed en ligne droite", () => {
    const s0 = fresh();
    const s = run(move(s0, 1, 0), 1);
    expect(s.player.pos).toEqual({ x: s0.player.pos.x + PLAYER.speed, y: s0.player.pos.y });
    const up = run(move(s0, 0, -1), 1);
    expect(up.player.pos).toEqual({ x: s0.player.pos.x, y: s0.player.pos.y - PLAYER.speed });
  });

  it("avance de PLAYER.diagonalSpeed par axe en diagonale", () => {
    const s0 = fresh();
    const s = run(move(s0, -1, 1), 1);
    expect(s.player.pos).toEqual({ x: s0.player.pos.x - PLAYER.diagonalSpeed, y: s0.player.pos.y + PLAYER.diagonalSpeed });
  });

  it("ne bouge pas sans input", () => {
    const s0 = fresh();
    expect(run(s0, 10).player.pos).toEqual(s0.player.pos);
  });

  it("s'arrête contre les arbres du bord", () => {
    const s = run(move(place(fresh(), { tx: 1, ty: 1 }), -1, -1), 50);
    expect(s.player.pos).toEqual({ x: U + H, y: U + H });
  });

  it("s'arrête au bord de la carte (sortie E ouverte)", () => {
    const s0 = fresh();
    const s = run(move(place(s0, s0.map.entrance), 0, 1), 20);
    expect(s.player.pos.y).toBe(s0.map.height * U - H);
    expect(s.player.pos.x).toBe(tileCenter(s0.map.entrance).x);
  });

  it("glisse le long d'un obstacle en diagonale", () => {
    // Rochers en (5..6, 4..5) : depuis (4,4), aller vers +x+y.
    const s0 = move(place(fresh(), { tx: 4, ty: 4 }), 1, 1);
    const s = run(s0, 1);
    expect(s.player.pos.x).toBe(5 * U - H); // bloqué en X contre le rocher
    expect(s.player.pos.y).toBe(s0.player.pos.y + PLAYER.diagonalSpeed); // continue en Y
    const later = run(s, 5);
    expect(later.player.pos.x).toBe(5 * U - H);
    expect(later.player.pos.y).toBeGreaterThan(s.player.pos.y);
  });

  it("gère un coin sans entrer dans l'obstacle", () => {
    // Depuis (4,3), le rocher (5,4) est en diagonale.
    let s = move(place(fresh(), { tx: 4, ty: 3 }), 1, 1);
    for (let i = 0; i < 30; i++) {
      s = run(s, 1);
      expect(hitboxBlocked(s.map, s.player.pos.x, s.player.pos.y, H)).toBe(false);
    }
  });

  it("reste stable avec un input maintenu 1000 ticks contre un mur", () => {
    const s0 = move(place(fresh(), { tx: 4, ty: 6 }), 0, -1); // colonne 4 libre jusqu'au bord nord
    const s1 = run(move(place(fresh(), { tx: 3, ty: 6 }), 0, 1), 1000); // ## en (3..4, 7)
    expect(s1.player.pos).toEqual({ x: tileCenter({ tx: 3, ty: 6 }).x, y: 7 * U - H });
    const s2 = run(s0, 1000);
    expect(s2.player.pos.y).toBe(U + H);
    expectValid(s2);
  });
});
