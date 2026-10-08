// Cas limites de la boucle de base (test-writer) : file pleine, aucune tente libre,
// ressources insuffisantes, joueur qui quitte la zone pendant chaque action,
// delta énorme, actions répétées très vite.

import { BUILD, LIMITS, LOOP, OFFLINE, QUEUE, RESOURCES, SURVIVOR, TENT, WELCOME } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { checkInvariants } from "../../src/core/invariants";
import { doorOf, sameTile, tileCenter, tileOf } from "../../src/core/map";
import { stepBudget } from "../../src/core/loop-budget";
import type { GameState, TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { deepFreeze, edit, editPlausible, expectValid, fresh, move, place, run, runUntil, steer, withHeadQueued } from "./helpers";

const onTile = (s: GameState, t: TilePos): boolean => sameTile(tileOf(s.player.pos), t);
const paidTotal = (s: GameState): number => s.buildSlots.reduce((a, b) => a + b.paid, 0);
const dropTotal = (s: GameState): number => s.drops.reduce((a, d) => a + d.amount, 0);

/**
 * Place le joueur au centre de la porte de `target` (tuile juste en dessous), puis le fait
 * monter par commandes jusqu'à ce que son centre soit dans `target`, près du bord bas.
 * Ensuite, alterner dy = +1 / -1 à chaque tick fait changer de tuile À CHAQUE tick.
 */
function straddle(state: GameState, target: TilePos): GameState {
  let s = move(place(state, doorOf(target)), 0, -1);
  s = run(s, 2);
  expect(onTile(s, target)).toBe(true);
  return s;
}

/** Marche (commandes uniquement) jusqu'à quitter `tile`. Renvoie l'état au premier tick hors de la tuile. */
function walkOff(state: GameState, tile: TilePos, toward: TilePos): GameState {
  let s = state;
  for (let i = 0; i < 50 && onTile(s, tile); i++) {
    const w = steer(s, toward);
    if (w.dx !== s.player.input.dx || w.dy !== s.player.input.dy) s = move(s, w.dx, w.dy);
    s = run(s, 1);
  }
  expect(onTile(s, tile)).toBe(false);
  return s;
}

/** Marche (commandes uniquement) jusqu'à `tile`, puis s'arrête. */
function walkTo(state: GameState, tile: TilePos, max = 300): GameState {
  let s = state;
  for (let i = 0; i < max && !onTile(s, tile); i++) {
    const w = steer(s, tile);
    if (w.dx !== s.player.input.dx || w.dy !== s.player.input.dy) s = move(s, w.dx, w.dy);
    s = run(s, 1);
  }
  expect(onTile(s, tile)).toBe(true);
  if (s.player.input.dx !== 0 || s.player.input.dy !== 0) s = move(s, 0, 0);
  return s;
}

describe("cas limites — file pleine", () => {
  it("file pleine longtemps sans joueur : jamais plus de 5, aucun survivant fantôme", () => {
    let s = fresh(31);
    for (let i = 0; i < 3000; i++) {
      s = tick(s);
      expect(s.queue.length).toBeLessThanOrEqual(QUEUE.maxLength);
      expect(s.survivors.length).toBeLessThanOrEqual(QUEUE.maxLength);
    }
    expectValid(s);
    expect(s.queue).toHaveLength(QUEUE.maxLength);
    expect(s.spawnTimer).toBe(0);
    // Chaque survivant est arrivé à sa place, dans l'ordre de la file.
    s.queue.forEach((id, i) => {
      const v = s.survivors.find((x) => x.id === id)!;
      expect(v.status).toBe("queued");
      expect(v.pos).toEqual(tileCenter(s.map.queueTiles[i]!));
    });
  });

  it("file pleine + aucune tente libre : rien ne bouge ; nettoyer débloque l'accueil puis une arrivée", () => {
    const full = run(runUntil(fresh(), (st) => st.queue.length === QUEUE.maxLength), SURVIVOR.spawnIntervalMax + 1);
    const blocked = edit(full, (d) => {
      d.tents[0]!.status = "messy";
    });
    const onW = run(place(blocked, blocked.map.welcome), 200);
    expect(onW.welcomeProgress).toBe(0);
    expect(onW.queue).toEqual(blocked.queue);
    expect(onW.rng).toBe(blocked.rng);
    // Nettoyage puis retour sur W.
    const cleaned = run(place(onW, onW.tents[0]!.tile), TENT.cleanTicks);
    expect(cleaned.tents[0]!.status).toBe("free");
    const welcomed = run(place(cleaned, cleaned.map.welcome), WELCOME.ticks);
    expect(welcomed.tents[0]!.status).toBe("assigned");
    expect(welcomed.queue).toHaveLength(QUEUE.maxLength - 1);
    const refilled = runUntil(welcomed, (st) => st.queue.length === QUEUE.maxLength, 3);
    expect(refilled.survivors).toHaveLength(QUEUE.maxLength + 1);
  });
});

describe("cas limites — aucune tente libre", () => {
  it("unique tente occupée puis en désordre : le joueur sur W n'accueille personne", () => {
    const base = place(withHeadQueued(), fresh().map.welcome);
    const first = run(base, WELCOME.ticks);
    expect(first.tents[0]!.status).toBe("assigned");
    let s = first;
    // Le suivant arrive en tête ; la tente reste assigned/occupied/messy : progression toujours 0.
    for (let i = 0; i < SURVIVOR.restTicks + 200; i++) {
      s = run(s, 1);
      expect(s.welcomeProgress).toBe(0);
      expect(s.tents[0]!.status).not.toBe("free");
    }
    expect(s.tents[0]!.status).toBe("messy");
    expect(s.survivors.filter((v) => v.status === "walkingToTent")).toHaveLength(0);
  });

  it("la dernière tente libre disparaît en cours de progression ⇒ retombe à 0", () => {
    const s0 = place(withHeadQueued(), fresh().map.welcome);
    const partial = run(s0, WELCOME.ticks - 1);
    expect(partial.welcomeProgress).toBe(WELCOME.ticks - 1);
    const noTent = edit(partial, (d) => {
      d.tents[0]!.status = "messy";
    });
    const s = run(noTent, 1);
    expect(s.welcomeProgress).toBe(0);
    expect(s.queue).toEqual(partial.queue);
  });
});

describe("cas limites — ressources insuffisantes", () => {
  const cost = BUILD.slotCosts[0];

  function onSlot0(wood: number): GameState {
    const s = fresh();
    return editPlausible(place(s, s.buildSlots[0]!.tile), (d) => {
      d.resources.wood = wood;
    });
  }

  it("bois exactement égal au coût : construit, stock à 0, rien de plus", () => {
    const s = runUntil(onSlot0(cost), (st) => st.buildSlots[0]!.builtTentId !== null, cost * BUILD.payIntervalTicks + 5);
    expect(s.resources.wood).toBe(0);
    expect(s.buildSlots[0]!.paid).toBe(cost);
    expect(run(s, 50).tents).toHaveLength(2);
  });

  it("coût - 1 : bloqué à 1 du but, indéfiniment, sans négatif ni construction", () => {
    let s = onSlot0(cost - 1);
    for (let i = 0; i < 500; i++) {
      s = run(s, 1);
      expect(s.resources.wood).toBeGreaterThanOrEqual(0);
      expect(s.resources.wood + s.buildSlots[0]!.paid).toBe(cost - 1);
    }
    expect(s.buildSlots[0]).toMatchObject({ paid: cost - 1, builtTentId: null });
    expect(s.tents).toHaveLength(1);
  });

  it("0 bois puis un drop ramassé sur place : le versement reprend sans quitter la zone", () => {
    const s0 = editPlausible(onSlot0(0), (d) => {
      d.drops.push({ id: d.nextId++, pos: tileCenter(doorOf(d.buildSlots[0]!.tile)), resource: "wood", amount: cost });
    });
    const total0 = s0.resources.wood + dropTotal(s0) + paidTotal(s0);
    let s = s0;
    for (let i = 0; i < cost * BUILD.payIntervalTicks + 20; i++) {
      s = run(s, 1);
      expect(s.resources.wood + dropTotal(s) + paidTotal(s)).toBe(total0);
    }
    expect(s.buildSlots[0]!.builtTentId).not.toBeNull();
    expect(s.resources.wood).toBe(0);
  });

  it("autres ressources jamais touchées par la construction", () => {
    const s0 = onSlot0(cost * 2);
    const s = run(s0, cost * BUILD.payIntervalTicks * 2);
    const { wood: _w0, ...others0 } = s0.resources;
    const { wood: _w1, ...others1 } = s.resources;
    expect(others1).toEqual(others0);
  });
});

describe("cas limites — stock et drops au plafond", () => {
  /** Survivant au repos dans la tente initiale, joueur loin (sur W), drop `amount` déjà sur la porte. */
  function restingWithDoorDrop(amount: number): GameState {
    const base = place(withHeadQueued(), fresh().map.welcome);
    const resting = runUntil(run(base, WELCOME.ticks), (st) => st.tents[0]!.status === "occupied", 300);
    // État simulé + drop gonflé : editPlausible, la conservation est vérifiée par chaque test (woodTotal).
    return editPlausible(resting, (d) => {
      d.drops.push({ id: d.nextId++, pos: tileCenter(doorOf(d.tents[0]!.tile)), resource: "wood", amount });
    });
  }
  const woodTotal = (s: GameState): number => s.resources.wood + dropTotal(s) + paidTotal(s);

  it("fusion sur la porte sous le plafond : montants additionnés, rien de perdu", () => {
    const s0 = restingWithDoorDrop(100);
    const s = runUntil(s0, (st) => st.tents[0]!.status === "messy", SURVIVOR.restTicks + 5);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]!.amount).toBe(100 + SURVIVOR.woodReward);
    expect(woodTotal(s)).toBe(woodTotal(s0) + SURVIVOR.woodReward);
  });

  // RESOURCES.cap est une règle de stock, pas de tas au sol : la fusion n'est pas plafonnée,
  // aucune récompense n'est détruite (conservation du bois, core-loop.md §5).
  it("fusion au-delà du plafond : la récompense excédentaire n'est pas détruite", () => {
    const s0 = restingWithDoorDrop(RESOURCES.cap - 3);
    const s = runUntil(s0, (st) => st.tents[0]!.status === "messy", SURVIVOR.restTicks + 5);
    expectValid(s);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]!.amount).toBe(RESOURCES.cap - 3 + SURVIVOR.woodReward);
    expect(woodTotal(s)).toBe(woodTotal(s0) + SURVIVOR.woodReward);
  });

  it("drop au sol > plafond : la collecte ne remplit le stock que jusqu'au plafond, le reste reste au sol", () => {
    const big = RESOURCES.cap + 50;
    const s0 = editPlausible(fresh(), (d) => {
      d.resources.wood = 0;
      d.drops.push({ id: d.nextId++, pos: { ...d.player.pos }, resource: "wood", amount: big });
    });
    const s = run(s0, 1);
    expect(s.resources.wood).toBe(RESOURCES.cap);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]!.amount).toBe(50);
    expect(s.resources.wood + dropTotal(s)).toBe(big);
  });
});

describe("cas limites — le joueur quitte la zone pendant l'action (commandes uniquement)", () => {
  it("accueil : sortir de W remet la progression à 0 ; un cycle complet est requis au retour", () => {
    const base = withHeadQueued();
    let s = walkTo(base, base.map.welcome);
    // Progresse un peu (sans finir).
    const startProgress = s.welcomeProgress;
    expect(startProgress).toBeLessThan(WELCOME.ticks);
    s = runUntil(s, (st) => st.welcomeProgress >= WELCOME.ticks - 2, WELCOME.ticks);
    s = walkOff(s, s.map.welcome, { tx: 7, ty: 6 });
    expect(s.welcomeProgress).toBe(0);
    expect(s.tents[0]!.status).toBe("free");
    // Retour : il faut WELCOME.ticks ticks pleins sur W.
    s = walkTo(s, s.map.welcome);
    const arrivedTick = s.tick;
    const assigned = runUntil(s, (st) => st.tents[0]!.status === "assigned", 20);
    // La progression du tick d'arrivée compte : WELCOME.ticks ticks sur W au total.
    expect(assigned.tick - arrivedTick).toBe(WELCOME.ticks - s.welcomeProgress);
    expect(s.welcomeProgress).toBe(1);
  });

  it("nettoyage : sortir conserve la progression, revenir la reprend", () => {
    const messy = edit(fresh(), (d) => {
      d.tents[0]!.status = "messy";
    });
    const tile = messy.tents[0]!.tile;
    let s = walkTo(messy, tile);
    s = run(s, 5);
    s = walkOff(s, tile, { tx: 6, ty: 3 });
    const kept = s.tents[0]!.cleanProgress;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(TENT.cleanTicks);
    s = run(move(s, 0, 0), 100);
    expect(s.tents[0]).toMatchObject({ status: "messy", cleanProgress: kept });
    s = walkTo(s, tile);
    const back = runUntil(s, (st) => st.tents[0]!.status === "free", TENT.cleanTicks);
    // Pas de double comptage : il restait (cleanTicks - kept) ticks à faire.
    expect(back.tick - s.tick).toBeLessThanOrEqual(TENT.cleanTicks - kept);
  });

  it("construction : sortir conserve le bois versé, revenir complète sans payer deux fois", () => {
    const start = editPlausible(fresh(), (d) => {
      d.resources.wood = 100;
    });
    const tile = start.buildSlots[0]!.tile;
    let s = walkTo(start, tile);
    s = run(s, 4);
    s = walkOff(s, tile, { tx: 7, ty: 6 });
    const kept = s.buildSlots[0]!.paid;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(BUILD.slotCosts[0]);
    s = run(move(s, 0, 0), 100);
    expect(s.buildSlots[0]!.paid).toBe(kept);
    expect(s.resources.wood).toBe(100 - kept);
    s = walkTo(s, tile);
    s = runUntil(s, (st) => st.buildSlots[0]!.builtTentId !== null, 200);
    expect(s.resources.wood).toBe(100 - BUILD.slotCosts[0]);
    expect(s.tents).toHaveLength(2);
  });
});

describe("cas limites — actions répétées très vite", () => {
  it("aller-retour sur W à chaque tick : jamais d'accueil, progression ≤ 1", () => {
    const base = withHeadQueued();
    let s = straddle(base, base.map.welcome);
    for (let i = 0; i < 300; i++) {
      s = move(s, 0, i % 2 === 0 ? 1 : -1);
      s = run(s, 1);
      expect(s.welcomeProgress).toBeLessThanOrEqual(1);
    }
    expect(s.survivors.some((v) => v.status === "walkingToTent")).toBe(false);
    expect(s.tents[0]!.status).toBe("free");
  });

  it("aller-retour sur une tente en désordre à chaque tick : progression = ticks passés dessus", () => {
    const messy = edit(fresh(), (d) => {
      d.tents[0]!.status = "messy";
    });
    const tile = messy.tents[0]!.tile;
    let s = straddle(messy, tile);
    let ticksOn = s.tents[0]!.cleanProgress; // déjà sur la tente pendant straddle
    for (let i = 0; i < TENT.cleanTicks * 4 && s.tents[0]!.status === "messy"; i++) {
      s = move(s, 0, i % 2 === 0 ? 1 : -1);
      s = run(s, 1);
      if (onTile(s, tile)) ticksOn++;
      if (s.tents[0]!.status === "messy") expect(s.tents[0]!.cleanProgress).toBe(ticksOn);
    }
    expect(s.tents[0]).toMatchObject({ status: "free", cleanProgress: 0 });
    expect(ticksOn).toBe(TENT.cleanTicks);
  });

  it("aller-retour sur un emplacement à chaque tick : jamais au-delà du coût, construit une seule fois", () => {
    const start = editPlausible(fresh(), (d) => {
      d.resources.wood = 200;
    });
    const tile = start.buildSlots[0]!.tile;
    let s = straddle(start, tile);
    let builtId: number | null = null;
    for (let i = 0; i < 400; i++) {
      s = move(s, 0, i % 2 === 0 ? 1 : -1);
      s = run(s, 1);
      const slot = s.buildSlots[0]!;
      expect(slot.paid).toBeLessThanOrEqual(slot.cost);
      expect(s.resources.wood + paidTotal(s)).toBe(200);
      if (builtId === null) builtId = slot.builtTentId;
      else expect(slot.builtTentId).toBe(builtId);
    }
    expect(builtId).not.toBeNull();
    expect(s.tents).toHaveLength(2);
    expect(s.resources.wood).toBe(200 - BUILD.slotCosts[0]);
  });

  it("spam de commandes alternées dans le même tick : seule la dernière acceptée compte, le reste est refusé sans effet", () => {
    let s = fresh();
    for (let t = 0; t < 50; t++) {
      let lastAccepted: { dx: number; dy: number } | null = null;
      for (let k = 0; k < LIMITS.maxCommandsPerTick * 3; k++) {
        const cmd = { type: "setMoveInput" as const, dx: k % 2 === 0 ? 1 : -1, dy: (k % 3) - 1 };
        const before = deepFreeze(s);
        const r = applyCommand(before, cmd);
        if (k < LIMITS.maxCommandsPerTick) {
          expect(r.ok).toBe(true);
          lastAccepted = { dx: cmd.dx, dy: cmd.dy };
        } else {
          expect(r.ok).toBe(false);
          expect(r.state).toBe(before);
        }
        s = r.state;
      }
      expect(s.player.input).toEqual(lastAccepted);
      s = tick(s);
      expectValid(s);
    }
  });

  it("alterner gauche/droite à chaque tick ne fait pas dériver le joueur hors de la carte ni dans un obstacle", () => {
    let s = fresh();
    const x0 = s.player.pos.x;
    for (let i = 0; i < 1000; i++) {
      s = move(s, i % 2 === 0 ? 1 : -1, 0);
      s = run(s, 1);
    }
    expect(Math.abs(s.player.pos.x - x0)).toBeLessThanOrEqual(400);
  });
});

describe("cas limites — delta énorme", () => {
  it("tick(s, 36000) (1 h de jeu) = 36 × tick(s, 1000), invariants OK", () => {
    const s0 = place(fresh(8), fresh().map.welcome);
    const big = tick(s0, 36000);
    let chunked = s0;
    for (let i = 0; i < 36; i++) chunked = tick(chunked, 1000);
    expect(big).toEqual(chunked);
    expect(big.tick).toBe(36000);
    expect(checkInvariants(big)).toEqual([]);
  });

  it("tick(s, n) avec n énorme est borné à OFFLINE.maxTicks (état égal à tick(s, plafond))", () => {
    const s0 = deepFreeze(place(fresh(8), fresh().map.welcome));
    const capped = tick(s0, OFFLINE.maxTicks);
    const huge = tick(s0, Number.MAX_SAFE_INTEGER);
    expect(huge.tick).toBe(OFFLINE.maxTicks);
    expect(huge).toEqual(capped);
    expect(checkInvariants(huge)).toEqual([]);
  }, 60_000);

  it("tick(s, n) avec n non sûr (> MAX_SAFE_INTEGER, chaîne, objet) ⇒ même référence, pas de blocage", () => {
    const s = deepFreeze(fresh());
    for (const bad of [Number.MAX_SAFE_INTEGER + 1, 1e300, "5", {}, null, -0.5]) {
      expect(tick(s, bad as unknown as number)).toBe(s);
    }
  });

  it("boucle pilotée par stepBudget avec des deltas énormes/absurdes : ≤ maxTicksPerFrame par frame", () => {
    const deltas = [16, 1e9, 10 * 60 * 1000, -5, NaN, Infinity, 250, 251, 33, 0, 99.9, 100, 1e6, 16, 16];
    let s = fresh();
    let acc = 0;
    let total = 0;
    for (let f = 0; f < 600; f++) {
      const d = deltas[f % deltas.length]!;
      const r = stepBudget(acc, d);
      expect(Number.isInteger(r.steps) && r.steps >= 0 && r.steps <= LOOP.maxTicksPerFrame).toBe(true);
      expect(r.acc >= 0 && r.acc < LOOP.tickMs).toBe(true);
      acc = r.acc;
      total += r.steps;
      const next = tick(s, r.steps);
      if (r.steps === 0) expect(next).toBe(s);
      s = next;
    }
    expect(s.tick).toBe(total);
    expect(total).toBeLessThanOrEqual(600 * LOOP.maxTicksPerFrame);
    expectValid(s);
  });

  it("une suite de frames énormes n'accumule pas de retard (pas de spirale de rattrapage)", () => {
    let acc = 0;
    for (let i = 0; i < 100; i++) {
      const r = stepBudget(acc, 1e7);
      expect(r.steps).toBeLessThanOrEqual(LOOP.maxTicksPerFrame);
      expect(r.acc).toBeLessThan(LOOP.tickMs);
      acc = r.acc;
    }
    // Retour à des frames normales : le rythme redevient ~1 tick / 100 ms immédiatement.
    const r = stepBudget(acc, 16);
    expect(r.steps).toBeLessThanOrEqual(1);
  });
});
