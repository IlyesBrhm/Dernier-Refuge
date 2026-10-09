// Feu de camp (docs/design/day-night.md §1.4) : combustion sur calendrier fixe, alimentation
// depuis les 8 voisines après un arrêt de FIRE.feedDelayTicks (input 0,0), arrêts, rallumage,
// obstacle permanent.

import { FIRE, TIME, WORLD } from "../../src/data/balance";
import { tileAt, tileOf, sameTile } from "../../src/core/map";
import { isFeedingFire } from "../../src/core/selectors";
import type { GameState, TilePos } from "../../src/core/state";
import { fireSystem, isInFeedZone } from "../../src/core/systems/fire";
import { tick } from "../../src/core/tick";
import { isNight } from "../../src/core/time";
import { AWAY, FEED_SPOT, FIRE_NEIGHBOURS, FIRE_TILE, scenario } from "./day-night-fixtures";
import { edit, expectValid, fresh, ledgerDeltaErrors, move, place, run } from "./helpers";

describe("feu — état initial et carte", () => {
  it("présent dès le départ en (9,5), réserve initiale FIRE.initialWood, rien de brûlé", () => {
    const s = fresh();
    expect(s.map.fire).toEqual(FIRE_TILE);
    expect(tileAt(s.map, 9, 5)).toBe("fire");
    expect(s.fire).toEqual({ wood: FIRE.initialWood, burnedTotal: 0, feedProgress: 0 });
    expect(s.night).toEqual({ coldLeavers: 0, sleepersPaid: 0, woodEarned: 0, woodBurned: 0 });
  });
});

describe("feu — combustion", () => {
  it("sans joueur : 3 combustions le jour 1, wood = 7 au tick 2399, 0 au tick 3000 exactement", () => {
    let s = place(fresh(), AWAY);
    let prev = s;
    const burnTicks: number[] = [];
    let zeroAt: number | null = null;
    for (let t = 1; t <= 3100; t++) {
      s = tick(s);
      expectValid(s);
      expect(ledgerDeltaErrors(prev, s)).toEqual([]);
      if (s.fire.burnedTotal > prev.fire.burnedTotal) burnTicks.push(s.tick);
      if (zeroAt === null && s.fire.wood === 0) zeroAt = s.tick;
      expect(s.fire.wood).toBeGreaterThanOrEqual(0);
      if (s.tick === TIME.dayTicks - 1) {
        expect(s.fire.wood).toBe(7);
        expect(s.fire.burnedTotal).toBe(3);
      }
      prev = s;
    }
    expect(burnTicks.slice(0, 3)).toEqual([600, 1200, 1800]);
    expect(burnTicks.slice(3)).toEqual([2400, 2500, 2600, 2700, 2800, 2900, 3000]);
    expect(zeroAt).toBe(3000);
    expect(s.fire).toEqual({ wood: 0, burnedTotal: FIRE.initialWood, feedProgress: 0 });
    // Combustions de nuit comptées aussi dans le bilan de la nuit.
    expect(s.night.woodBurned).toBe(7);
  });

  it("le jour (dont le pas de l'aube), seul burnedTotal augmente ; la nuit, night.woodBurned aussi", () => {
    const day = tick(scenario({ tick: 599, fireWood: 5 }));
    expect(day.fire).toEqual({ wood: 4, burnedTotal: 1, feedProgress: 0 });
    expect(day.night.woodBurned).toBe(0);
    const night = tick(scenario({ tick: 2499, fireWood: 5 }));
    expect(night.fire.wood).toBe(4);
    expect(night.night.woodBurned).toBe(1);
    const dawn = tick(scenario({ tick: 3599, fireWood: 5 }));
    expect(dawn.tick).toBe(3600);
    expect(dawn.fire.wood).toBe(4);
    expect(dawn.night.woodBurned).toBe(0);
  });

  it("aucune combustion hors calendrier ; feu à 0 : rien ne brûle, jamais négatif", () => {
    const s = run(scenario({ tick: 2401, fireWood: 5, player: AWAY }), 98);
    expect(s.tick).toBe(2499);
    expect(s.fire.wood).toBe(5);
    const out = run(scenario({ tick: 2450, fireWood: 0, player: AWAY }), 200);
    expect(out.fire.wood).toBe(0);
    expect(out.fire.burnedTotal).toBe(scenario({ tick: 2450 }).fire.burnedTotal);
  });

  it("aucun RNG consommé par le système du feu", () => {
    const s = scenario({ tick: 2499, fireWood: 5, player: FEED_SPOT, wood: 5 });
    expect(fireSystem(s).rng).toBe(s.rng);
  });
});

describe("feu — alimentation (joueur arrêté sur une voisine)", () => {
  it.each(FIRE_NEIGHBOURS.map((t) => [t.tx, t.ty] as const))("depuis la voisine (%i,%i), délai écoulé : 1 bois / 2 ticks", (tx, ty) => {
    const s0 = scenario({ tick: 100, fireWood: 5, player: { tx, ty }, wood: 10, feedProgress: "ready" });
    expectValid(s0);
    const s1 = tick(s0); // tick 101 : impair, rien
    expect(s1.fire.wood).toBe(5);
    const s2 = tick(s1); // tick 102 : versement
    expect(s2.fire.wood).toBe(6);
    expect(s2.resources.wood).toBe(9);
    expect(ledgerDeltaErrors(s1, s2)).toEqual([]);
    const s10 = run(s0, 10);
    expect(s10.fire.wood).toBe(10);
    expect(s10.resources.wood).toBe(5);
  });

  it("rien à distance 2 du feu", () => {
    for (const t of [
      { tx: 9, ty: 7 },
      { tx: 11, ty: 5 },
      { tx: 7, ty: 5 },
      { tx: 11, ty: 7 },
      { tx: 9, ty: 3 },
    ]) {
      const s = run(scenario({ tick: 100, fireWood: 5, player: t, wood: 10 }), 20);
      expect(s.fire.wood, `(${t.tx},${t.ty})`).toBe(5);
      expect(s.resources.wood).toBe(10);
      expect(s.fire.feedProgress).toBe(0);
    }
  });

  it("s'arrête feu plein : le stock ne bouge plus (le délai reste acquis)", () => {
    const s0 = scenario({ tick: 100, fireWood: FIRE.capacity - 2, player: FEED_SPOT, wood: 10, feedProgress: "ready" });
    const s = run(s0, 20);
    expect(s.fire.wood).toBe(FIRE.capacity);
    expect(s.resources.wood).toBe(8);
    expect(s.fire.feedProgress).toBe(FIRE.feedDelayTicks);
  });

  it("s'arrête stock vide : le feu ne reçoit rien de plus", () => {
    const s = run(scenario({ tick: 100, fireWood: 5, player: FEED_SPOT, wood: 3, feedProgress: "ready" }), 20);
    expect(s.resources.wood).toBe(0);
    expect(s.fire.wood).toBe(8);
  });

  it("feu plein / stock vide depuis l'arrêt : 20 ticks arrêté ne versent rien", () => {
    const full = run(scenario({ tick: 100, fireWood: FIRE.capacity, player: FEED_SPOT, wood: 10 }), 20);
    expect(full.resources.wood).toBe(10);
    expect(full.fire.wood).toBe(FIRE.capacity);
    const empty = run(scenario({ tick: 100, fireWood: 5, player: FEED_SPOT, wood: 0 }), 20);
    expect(empty.fire.wood).toBe(5);
  });

  it("feu à 1 + combustion + alimentation au même pas ⇒ jamais éteint en fin de pas", () => {
    const s0 = scenario({ tick: 2499, fireWood: 1, player: FEED_SPOT, wood: 5, tents: 1, sleeping: 1, feedProgress: "ready" });
    expectValid(s0);
    const s1 = tick(s0); // 2500 : brûle 1 puis reçoit 1
    expect(s1.fire.wood).toBe(1);
    expect(s1.night.woodBurned).toBe(1);
    expect(s1.survivors[0]!.status).toBe("sleeping");
    expect(s1.night.coldLeavers).toBe(0);
    expectValid(s1);
  });

  it("rallumage : un feu à 0 alimenté repart dès le premier bois", () => {
    const s0 = scenario({ tick: 2601, fireWood: 0, player: FEED_SPOT, wood: 5, feedProgress: "ready" });
    const s1 = tick(s0);
    expect(s1.fire.wood).toBe(1);
    expect(isNight(s1.tick)).toBe(true);
  });
});

/**
 * Parcourt la carte par commandes (setMoveInput + tick) dans la direction (dx, dy) jusqu'à ce que
 * `stop` soit vrai ; à chaque tick : invariants, conservation, aucun versement, délai à 0.
 */
function passBy(state: GameState, dx: number, dy: number, stop: (t: TilePos) => boolean): { s: GameState; inZone: number } {
  let s = move(state, dx, dy);
  let inZone = 0;
  for (let i = 0; i < 400; i++) {
    const next = tick(s);
    expectValid(next);
    expect(ledgerDeltaErrors(s, next)).toEqual([]);
    expect(next.fire.wood, `tick ${next.tick}`).toBe(s.fire.wood);
    expect(next.resources.wood, `tick ${next.tick}`).toBe(s.resources.wood);
    expect(next.fire.feedProgress).toBe(0);
    expect(isFeedingFire(next)).toBe(false);
    // Le joueur avance à chaque tick (il ne s'arrête jamais).
    expect(next.player.pos).not.toEqual(s.player.pos);
    if (isInFeedZone(FIRE_TILE, tileOf(next.player.pos))) inZone++;
    s = next;
    if (stop(tileOf(s.player.pos))) return { s, inZone };
  }
  throw new Error("passage non terminé");
}

describe("feu — délai d'arrêt avant alimentation (FIRE.feedDelayTicks, comme l'accueil)", () => {
  it("test utilisateur : passer à côté du feu sans s'arrêter (ligne 6, dans les deux sens) ne verse aucun bois", () => {
    // Jour, feu à moitié : il pourrait recevoir ; le joueur a du bois.
    const s0 = scenario({ tick: 100, fireWood: 5, player: { tx: 1, ty: 6 }, wood: 10 });
    const east = passBy(s0, 1, 0, (t) => t.tx === 14);
    expect(east.inZone).toBeGreaterThan(FIRE.feedDelayTicks); // il a bien traversé (8,6) (9,6) (10,6)
    const west = passBy(east.s, -1, 0, (t) => t.tx === 1);
    expect(west.inZone).toBeGreaterThan(FIRE.feedDelayTicks);
    expect(west.s.fire.wood).toBe(5);
    expect(west.s.resources.wood).toBe(10);
  });

  it("test utilisateur : passage en diagonale par (8,4), dans les deux sens, ne verse aucun bois", () => {
    // (4,8) → (5,7) → (6,6) → (7,5) → (8,4) [zone] → (9,3) → (10,2) : que de l'herbe.
    const s0 = scenario({ tick: 100, fireWood: 5, player: { tx: 4, ty: 8 }, wood: 10 });
    const up = passBy(s0, 1, -1, (t) => t.tx >= 10 && t.ty <= 2);
    expect(up.inZone).toBeGreaterThan(0);
    const down = passBy(up.s, -1, 1, (t) => t.tx <= 5 && t.ty >= 7);
    expect(down.inZone).toBeGreaterThan(0);
    expect(down.s.fire.wood).toBe(5);
    expect(down.s.resources.wood).toBe(10);
  });

  it("pousser contre le feu (direction maintenue, bloqué) ne verse rien : seul un arrêt (input 0,0) compte", () => {
    let s = move(scenario({ tick: 100, fireWood: 5, player: FEED_SPOT, wood: 10 }), 0, -1);
    s = run(s, 50);
    expect(isInFeedZone(FIRE_TILE, tileOf(s.player.pos))).toBe(true);
    expect(s.fire.wood).toBe(5);
    expect(s.resources.wood).toBe(10);
    expect(s.fire.feedProgress).toBe(0);
  });

  for (const start of [100, 101]) {
    it(`arrêt sur une voisine (départ tick ${start}) : 4 ticks ne versent rien, le 5e verse, puis 1 bois / 2 ticks`, () => {
      const s0 = scenario({ tick: start, fireWood: 5, player: FEED_SPOT, wood: 10 });
      let s = s0;
      for (let k = 1; k < FIRE.feedDelayTicks; k++) {
        s = tick(s);
        expectValid(s);
        expect(s.fire.feedProgress).toBe(k);
        expect(s.fire.wood, `après ${k} ticks`).toBe(5);
        expect(s.resources.wood).toBe(10);
        expect(isFeedingFire(s)).toBe(false);
      }
      const prev = s;
      s = tick(s); // 5e tick arrêté : le délai est atteint, premier versement
      expect(s.fire.feedProgress).toBe(FIRE.feedDelayTicks);
      expect(s.fire.wood).toBe(6);
      expect(s.resources.wood).toBe(9);
      expect(ledgerDeltaErrors(prev, s)).toEqual([]);
      expect(isFeedingFire(s)).toBe(true);
      // Puis le rythme normal : 1 bois par tick multiple de feedIntervalTicks.
      const later = run(s, 10);
      expect(later.fire.wood).toBe(6 + 10 / FIRE.feedIntervalTicks);
      expect(later.fire.feedProgress).toBe(FIRE.feedDelayTicks);
    });
  }

  it("bouger remet le délai à 0 : s'arrêter 4 ticks, repartir, s'arrêter de nouveau 4 ticks ⇒ rien", () => {
    let s = run(scenario({ tick: 100, fireWood: 5, player: { tx: 8, ty: 6 }, wood: 10 }), FIRE.feedDelayTicks - 1);
    expect(s.fire.feedProgress).toBe(FIRE.feedDelayTicks - 1);
    s = move(s, 1, 0);
    s = tick(s); // un pas vers l'est, toujours dans la zone
    expectValid(s);
    expect(isInFeedZone(FIRE_TILE, tileOf(s.player.pos))).toBe(true);
    expect(s.fire.feedProgress).toBe(0);
    s = move(s, 0, 0);
    s = run(s, FIRE.feedDelayTicks - 1);
    expect(s.fire.feedProgress).toBe(FIRE.feedDelayTicks - 1);
    expect(s.fire.wood).toBe(5);
    expect(s.resources.wood).toBe(10);
    s = tick(s);
    expect(s.fire.wood).toBe(6);
  });

  it("en cours d'alimentation, une direction l'interrompt aussitôt ; sortir de la zone aussi", () => {
    let s = scenario({ tick: 100, fireWood: 5, player: FEED_SPOT, wood: 10, feedProgress: "ready" });
    s = move(s, 0, 1); // vers le sud, hors de la zone en quelques ticks
    const moved = run(s, 30);
    expect(moved.fire.wood).toBe(5);
    expect(moved.resources.wood).toBe(10);
    expect(moved.fire.feedProgress).toBe(0);
    expect(isInFeedZone(FIRE_TILE, tileOf(moved.player.pos))).toBe(false);
    // Arrêté hors zone : rien.
    const still = run(move(moved, 0, 0), 20);
    expect(still.fire.feedProgress).toBe(0);
    expect(still.fire.wood).toBe(5);
  });

  it("feu plein à l'arrivée : le délai s'écoule, rien n'est versé ; dès la combustion suivante, il reprend sans nouveau délai", () => {
    // 599 → 600 : combustion de jour (16 → 15), puis le joueur arrêté depuis le délai reverse 1 au tick 600.
    let s = scenario({ tick: 590, fireWood: FIRE.capacity, player: FEED_SPOT, wood: 10 });
    s = run(s, 9); // tick 599
    expect(s.fire.feedProgress).toBe(FIRE.feedDelayTicks);
    expect(s.fire.wood).toBe(FIRE.capacity);
    expect(s.resources.wood).toBe(10);
    s = tick(s); // 600 : brûle 1 puis reçoit 1
    expect(s.fire.wood).toBe(FIRE.capacity);
    expect(s.fire.burnedTotal).toBe(1);
    expect(s.resources.wood).toBe(9);
  });
});

describe("feu — obstacle permanent", () => {
  it("joueur poussé 1000 ticks contre le feu depuis chaque côté : jamais sur la tuile", () => {
    const sides: [{ tx: number; ty: number }, number, number][] = [
      [{ tx: 9, ty: 6 }, 0, -1],
      [{ tx: 9, ty: 4 }, 0, 1],
      [{ tx: 8, ty: 5 }, 1, 0],
      [{ tx: 10, ty: 5 }, -1, 0],
      [{ tx: 8, ty: 6 }, 1, -1],
    ];
    for (const [from, dx, dy] of sides) {
      let s = move(place(fresh(), from), dx, dy);
      for (let i = 0; i < 1000; i++) {
        s = tick(s);
        expect(sameTile(tileOf(s.player.pos), FIRE_TILE)).toBe(false);
      }
      expectValid(s);
      // Collé contre le bord de la tuile du feu (hitbox ±halfSize).
      const U = WORLD.unitsPerTile;
      const c = { x: FIRE_TILE.tx * U + U / 2, y: FIRE_TILE.ty * U + U / 2 };
      expect(Math.max(Math.abs(s.player.pos.x - c.x), Math.abs(s.player.pos.y - c.y))).toBeGreaterThanOrEqual(U / 2);
    }
  });

  it("un état avec le joueur sur le feu est rejeté par les invariants", () => {
    const U = WORLD.unitsPerTile;
    const bad = edit(fresh(), (d) => void (d.player.pos = { x: 9 * U + U / 2, y: 5 * U + U / 2 }));
    expect(bad.player.pos).toBeDefined();
    expect(() => expectValid(bad)).toThrow();
  });
});
