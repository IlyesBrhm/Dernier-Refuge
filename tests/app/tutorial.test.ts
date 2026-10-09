// Tutoriel (src/app/tutorial.ts, docs/design/ui-polish.md §1.6). Logique pure : états construits avec
// le core (createInitialState + ticks scriptés, ou cloneState modifié via `edit`).

import {
  ALL_DONE,
  completedBy,
  currentStep,
  guideTarget,
  isAdvancedSave,
  isStepDone,
  observeTick,
  restartForNewGame,
  skipIfAdvanced,
  skipTutorial,
  startTutorial,
  stepBit,
  stepHint,
  stepNumber,
  TUTORIAL_STEPS,
  type TutorialProgress,
  type TutorialStepId,
} from "../../src/app/tutorial";
import {
  applyCommand,
  checkInvariants,
  CYCLE_TICKS,
  tick,
  tileCenter,
  type GameState,
  type Survivor,
  type TilePos,
} from "../../src/core";
import { BUILD, FIRE, TIME } from "../../src/data/balance";
import { attentiveFireGoal, botGoal, deepFreeze, edit, fresh, place, steer, walkTo, withHeadQueued } from "../core/helpers";

const ACTIVE0: TutorialProgress = { status: "active", done: 0 };
const bits = (...steps: TutorialStepId[]): number => steps.reduce((m, s) => m | stepBit(s), 0);
const active = (...steps: TutorialStepId[]): TutorialProgress => ({ status: "active", done: bits(...steps) });

function survivor(id: number, status: Survivor["status"], tentId: number | null = null): Survivor {
  return { id, pos: { x: 7500, y: 10500 }, status, path: [], tentId, restTicksLeft: status === "resting" ? 10 : 0 };
}

/** Un pas de bot (attentif au feu) : commande si la direction change, puis tick, invariants vérifiés. */
function botStep(s: GameState): GameState {
  const want = steer(s, attentiveFireGoal(s) ?? botGoal(s));
  let cur = s;
  if (want.dx !== cur.player.input.dx || want.dy !== cur.player.input.dy) {
    const r = applyCommand(cur, { type: "setMoveInput", dx: want.dx, dy: want.dy });
    if (!r.ok) throw new Error(r.error);
    cur = r.state;
  }
  const next = tick(cur);
  expect(checkInvariants(next)).toEqual([]);
  return next;
}

describe("étapes", () => {
  it("six objectifs dans l'ordre du plan, numérotés 1..6, masque 6 bits", () => {
    expect(TUTORIAL_STEPS).toEqual(["welcome", "pickupWood", "cleanTent", "harvestTree", "buildTent", "feedFire"]);
    expect(Object.isFrozen(TUTORIAL_STEPS)).toBe(true);
    expect(TUTORIAL_STEPS.map(stepNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ALL_DONE).toBe(63);
    expect(new Set(TUTORIAL_STEPS.map(stepBit)).size).toBe(6);
  });
});

describe("détection prev → curr (états modifiés via cloneState)", () => {
  const base = fresh();

  it("rien sans transition (même référence ou copie identique, feu non plein)", () => {
    expect(base.fire.wood).toBeLessThan(FIRE.capacity);
    expect(completedBy(base, base)).toBe(0);
    expect(completedBy(base, edit(base, () => undefined))).toBe(0);
  });

  it("welcome : un survivant passe queued → walkingToTent", () => {
    const prev = edit(base, (d) => (d.survivors = [survivor(50, "queued")]));
    const curr = edit(base, (d) => (d.survivors = [survivor(50, "walkingToTent", 1)]));
    expect(completedBy(prev, curr)).toBe(bits("welcome"));
    // Pas depuis un autre statut, ni pour un survivant apparu directement en route.
    const fromToQueue = edit(base, (d) => (d.survivors = [survivor(50, "toQueue")]));
    expect(completedBy(fromToQueue, curr)).toBe(0);
    expect(completedBy(base, curr)).toBe(0);
  });

  it("pickupWood : stock de bois en hausse ET bois au sol en baisse", () => {
    const prev = edit(base, (d) => (d.drops = [{ id: 90, pos: { x: 2500, y: 3500 }, resource: "wood", amount: 4 }]));
    const picked = edit(prev, (d) => {
      d.drops = [];
      d.resources.wood += 4;
    });
    expect(completedBy(prev, picked)).toBe(bits("pickupWood"));
    // Récolte (stock en hausse, sol inchangé) : non.
    expect(completedBy(prev, edit(prev, (d) => (d.resources.wood += 3)))).toBe(0);
    // Dépense + bois au sol qui disparaît : non.
    expect(completedBy(prev, edit(prev, (d) => ((d.resources.wood -= 1), (d.drops = []))))).toBe(0);
    // Nourriture ramassée : non.
    const food = edit(base, (d) => (d.drops = [{ id: 91, pos: { x: 2500, y: 3500 }, resource: "food", amount: 2 }]));
    expect(completedBy(food, edit(food, (d) => ((d.drops = []), (d.resources.food += 2))))).toBe(0);
  });

  it("cleanTent : une tente passe messy → free (pas assigned → free)", () => {
    const messy = edit(base, (d) => {
      const t = d.tents[0];
      if (t) t.status = "messy";
    });
    expect(completedBy(messy, base)).toBe(bits("cleanTent"));
    const assigned = edit(base, (d) => {
      const t = d.tents[0];
      if (t) t.status = "assigned";
    });
    expect(completedBy(assigned, base)).toBe(0);
  });

  it("harvestTree : un ARBRE passe ready → depleted (un buisson ne compte pas)", () => {
    const deplete = (kind: "tree" | "bush"): [GameState, GameState] => {
      const i = base.nodes.findIndex((n) => n.kind === kind);
      expect(i).toBeGreaterThanOrEqual(0);
      return [
        base,
        edit(base, (d) => {
          const n = d.nodes[i];
          if (n) {
            n.status = "depleted";
            n.regrowTicksLeft = 100;
          }
        }),
      ];
    };
    expect(completedBy(...deplete("tree"))).toBe(bits("harvestTree"));
    expect(completedBy(...deplete("bush"))).toBe(0);
  });

  it("buildTent : un emplacement passe builtTentId null → id", () => {
    const built = edit(base, (d) => {
      const b = d.buildSlots[0];
      if (b) {
        b.paid = b.cost;
        b.builtTentId = 77;
      }
    });
    expect(completedBy(base, built)).toBe(bits("buildTent"));
    expect(completedBy(built, edit(built, () => undefined))).toBe(0);
  });

  it("feedFire : fire.wood augmente, OU feu plein (même sans transition)", () => {
    const fed = edit(base, (d) => (d.fire.wood += 1));
    expect(completedBy(base, fed)).toBe(bits("feedFire"));
    const full = edit(base, (d) => (d.fire.wood = FIRE.capacity));
    expect(completedBy(full, edit(full, () => undefined))).toBe(bits("feedFire"));
    // Le feu qui brûle (baisse) ne compte pas.
    expect(completedBy(base, edit(base, (d) => (d.fire.wood -= 1)))).toBe(0);
  });
});

describe("observeTick : progression, ordre, références", () => {
  const base = fresh();
  const welcomed: [GameState, GameState] = [
    edit(base, (d) => (d.survivors = [survivor(50, "queued")])),
    edit(base, (d) => (d.survivors = [survivor(50, "walkingToTent", 1)])),
  ];

  it("même référence si rien ne change", () => {
    const p = { ...ACTIVE0 };
    expect(observeTick(p, base, base)).toBe(p);
    const done = active("welcome");
    expect(observeTick(done, ...welcomed)).toBe(done); // déjà fait
  });

  it("seul le statut active progresse (pending, done, skipped : même référence)", () => {
    for (const status of ["pending", "done", "skipped"] as const) {
      const p: TutorialProgress = { status, done: 0 };
      expect(observeTick(p, ...welcomed)).toBe(p);
    }
    expect(observeTick(ACTIVE0, ...welcomed)).toEqual({ status: "active", done: bits("welcome") });
  });

  it("objectif fait en avance compté ; l'étape affichée est la première non faite", () => {
    const harvested = edit(base, (d) => {
      const n = d.nodes.find((x) => x.kind === "tree");
      if (n) {
        n.status = "depleted";
        n.regrowTicksLeft = 100;
      }
    });
    const day = edit(base, (d) => (d.tick = 1000));
    const p = observeTick(ACTIVE0, base, harvested);
    expect(isStepDone(p, "harvestTree")).toBe(true);
    expect(currentStep(p, day)).toBe("welcome");
    expect(currentStep(active("welcome", "pickupWood", "cleanTent", "harvestTree"), day)).toBe("buildTent");
    expect(currentStep(active("welcome", "pickupWood", "cleanTent"), day)).toBe("harvestTree");
  });

  it("tous faits ⇒ status done ; ensuite stable (même référence)", () => {
    const almost = active("welcome", "pickupWood", "cleanTent", "harvestTree", "buildTent");
    const done = observeTick(almost, base, edit(base, (d) => (d.fire.wood += 1)));
    expect(done).toEqual({ status: "done", done: ALL_DONE });
    expect(observeTick(done, ...welcomed)).toBe(done);
    expect(currentStep(done, base)).toBeNull();
  });

  it("entrées gelées non mutées", () => {
    const p = Object.freeze({ ...ACTIVE0 });
    const [a, b] = welcomed.map((s) => deepFreeze(edit(s, () => undefined)));
    expect(() => observeTick(p, a as GameState, b as GameState)).not.toThrow();
    expect(p).toEqual(ACTIVE0);
  });
});

describe("currentStep : priorité au feu au crépuscule et la nuit", () => {
  const at = (t: number): GameState => edit(fresh(), (d) => (d.tick = t));

  it("jour / aube ⇒ première étape non faite ; crépuscule / nuit ⇒ feedFire si pas fait", () => {
    expect(currentStep(ACTIVE0, at(0))).toBe("welcome"); // aube
    expect(currentStep(ACTIVE0, at(1200))).toBe("welcome");
    expect(currentStep(ACTIVE0, at(TIME.dayTicks - TIME.duskTicks - 1))).toBe("welcome");
    expect(currentStep(ACTIVE0, at(TIME.dayTicks - TIME.duskTicks))).toBe("feedFire"); // début du crépuscule
    expect(currentStep(ACTIVE0, at(3000))).toBe("feedFire"); // nuit
    expect(currentStep(ACTIVE0, at(CYCLE_TICKS + 10))).toBe("welcome"); // aube suivante
  });

  it("feedFire déjà fait : la nuit, on reprend la première étape non faite", () => {
    expect(currentStep(active("feedFire"), at(3000))).toBe("welcome");
  });

  it("statut non actif ⇒ null", () => {
    for (const status of ["pending", "done", "skipped"] as const) {
      expect(currentStep({ status, done: 0 }, at(3000))).toBeNull();
    }
  });
});

describe("guideTarget : cible de la flèche (unités du core)", () => {
  const base = fresh();

  it("welcome ⇒ centre de W ; feedFire ⇒ centre de F", () => {
    expect(guideTarget("welcome", base)).toEqual(tileCenter(base.map.welcome));
    expect(guideTarget("feedFire", base)).toEqual(tileCenter(base.map.fire));
  });

  it("pickupWood ⇒ drop de bois le plus proche du joueur (pas la nourriture), sinon tente occupée, sinon null", () => {
    const player = base.player.pos;
    const s = edit(base, (d) => {
      d.drops = [
        { id: 90, pos: { x: player.x + 4000, y: player.y }, resource: "wood", amount: 1 },
        { id: 91, pos: { x: player.x + 500, y: player.y }, resource: "food", amount: 1 },
        { id: 92, pos: { x: player.x - 2000, y: player.y }, resource: "wood", amount: 1 },
      ];
    });
    expect(guideTarget("pickupWood", s)).toEqual({ x: player.x - 2000, y: player.y });
    const occupied = edit(base, (d) => {
      const t = d.tents[0];
      if (t) {
        t.status = "occupied";
        t.occupantId = 50;
      }
    });
    expect(guideTarget("pickupWood", occupied)).toEqual(tileCenter(occupied.tents[0]?.tile as TilePos));
    expect(guideTarget("pickupWood", base)).toBeNull();
  });

  it("la cible est une copie (la modifier ne touche pas l'état)", () => {
    const s = edit(base, (d) => (d.drops = [{ id: 90, pos: { x: 1500, y: 1500 }, resource: "wood", amount: 1 }]));
    const g = guideTarget("pickupWood", s);
    if (g) g.x = -1;
    expect(s.drops[0]?.pos.x).toBe(1500);
  });

  it("cleanTent ⇒ 1re tente messy, sinon tente occupée, sinon null", () => {
    const withTents = edit(base, (d) => {
      const t0 = d.tents[0];
      if (!t0) return;
      d.tents = [
        { ...t0, id: 1, tile: { tx: 2, ty: 2 }, status: "occupied", occupantId: 50 },
        { ...t0, id: 2, tile: { tx: 7, ty: 2 }, status: "messy", occupantId: null },
        { ...t0, id: 3, tile: { tx: 12, ty: 2 }, status: "messy", occupantId: null },
      ];
    });
    expect(guideTarget("cleanTent", withTents)).toEqual(tileCenter({ tx: 7, ty: 2 }));
    const onlyOccupied = edit(withTents, (d) => (d.tents = d.tents.slice(0, 1)));
    expect(guideTarget("cleanTent", onlyOccupied)).toEqual(tileCenter({ tx: 2, ty: 2 }));
    expect(guideTarget("cleanTent", base)).toBeNull();
  });

  it("harvestTree ⇒ arbre PRÊT le plus proche du joueur ; tous épuisés ⇒ null", () => {
    const trees = base.nodes.filter((n) => n.kind === "tree");
    expect(trees.length).toBeGreaterThan(0);
    for (const t of trees) {
      // Joueur juste à côté de cet arbre : c'est lui la cible (s'il est seul le plus proche).
      const s = place(base, { tx: t.tile.tx, ty: t.tile.ty + 1 });
      const g = guideTarget("harvestTree", s);
      const best = Math.min(...trees.map((x) => Math.hypot(tileCenter(x.tile).x - s.player.pos.x, tileCenter(x.tile).y - s.player.pos.y)));
      expect(g && Math.hypot(g.x - s.player.pos.x, g.y - s.player.pos.y)).toBeCloseTo(best, 6);
    }
    const nearest = place(base, { tx: (trees[0] as { tile: TilePos }).tile.tx, ty: (trees[0] as { tile: TilePos }).tile.ty + 1 });
    const firstDepleted = edit(nearest, (d) => {
      const n = d.nodes.find((x) => x.id === trees[0]?.id);
      if (n) {
        n.status = "depleted";
        n.regrowTicksLeft = 100;
      }
    });
    expect(guideTarget("harvestTree", firstDepleted)).not.toEqual(tileCenter((trees[0] as { tile: TilePos }).tile));
    const allDepleted = edit(base, (d) => {
      for (const n of d.nodes) if (n.kind === "tree") n.status = "depleted";
    });
    expect(guideTarget("harvestTree", allDepleted)).toBeNull();
  });

  it("buildTent ⇒ 1er emplacement non construit ; tous construits ⇒ null", () => {
    expect(guideTarget("buildTent", base)).toEqual(tileCenter(base.buildSlots[0]?.tile as TilePos));
    const first = edit(base, (d) => {
      const b = d.buildSlots[0];
      if (b) b.builtTentId = 77;
    });
    expect(guideTarget("buildTent", first)).toEqual(tileCenter(base.buildSlots[1]?.tile as TilePos));
    const all = edit(base, (d) => {
      for (const b of d.buildSlots) b.builtTentId = 77 + b.id;
    });
    expect(guideTarget("buildTent", all)).toBeNull();
  });
});

describe("stepHint", () => {
  const base = fresh();

  it("pickupWood : attente du paiement tant qu'aucun bois n'est au sol", () => {
    expect(stepHint("pickupWood", base).waitingForPay).toBe(true);
    const s = edit(base, (d) => (d.drops = [{ id: 90, pos: { x: 1500, y: 1500 }, resource: "wood", amount: 1 }]));
    expect(stepHint("pickupWood", s).waitingForPay).toBe(false);
  });

  it("buildTent : bois manquant pour le 1er emplacement libre (jamais négatif)", () => {
    const cost = BUILD.slotCosts[0] ?? 0;
    expect(stepHint("buildTent", base).missingWood).toBe(Math.max(0, cost - base.resources.wood));
    expect(stepHint("buildTent", edit(base, (d) => (d.resources.wood = 999))).missingWood).toBe(0);
    const half = edit(base, (d) => {
      const b = d.buildSlots[0];
      if (b) b.paid = cost - 2;
      d.resources.wood = 0;
    });
    expect(stepHint("buildTent", half).missingWood).toBe(2);
  });

  it("feedFire : secondes avant la nuit (arrondi au supérieur), null la nuit", () => {
    const at = (t: number): GameState => edit(base, (d) => (d.tick = t));
    expect(stepHint("feedFire", at(0)).secondsToNight).toBe(TIME.dayTicks / TIME.ticksPerSecond);
    expect(stepHint("feedFire", at(2320)).secondsToNight).toBe(8);
    expect(stepHint("feedFire", at(2395)).secondsToNight).toBe(1);
    expect(stepHint("feedFire", at(2400)).secondsToNight).toBeNull();
  });

  it("autres étapes : aide neutre", () => {
    expect(stepHint("welcome", base)).toEqual({ waitingForPay: false, missingWood: 0, secondsToNight: null });
  });
});

describe("isAdvancedSave et transitions de statut", () => {
  const base = fresh();
  const at = (t: number): GameState => edit(base, (d) => (d.tick = t));
  const built = edit(base, (d) => {
    const b = d.buildSlots[0];
    if (b) b.builtTentId = 77;
  });

  it("tick 3599 faux, 3600 (première nuit passée) vrai, emplacement construit vrai, partie neuve faux", () => {
    expect(CYCLE_TICKS).toBe(3600);
    expect(isAdvancedSave(at(3599))).toBe(false);
    expect(isAdvancedSave(at(3600))).toBe(true);
    expect(isAdvancedSave(built)).toBe(true);
    expect(isAdvancedSave(base)).toBe(false);
  });

  it("saut automatique : pending / active ⇒ skipped (masque conservé) ; sinon même référence", () => {
    expect(skipIfAdvanced({ status: "pending", done: 0 }, at(3600))).toEqual({ status: "skipped", done: 0 });
    expect(skipIfAdvanced(active("welcome"), built)).toEqual({ status: "skipped", done: bits("welcome") });
    for (const p of [{ status: "done", done: ALL_DONE }, { status: "skipped", done: 3 }, ACTIVE0] as TutorialProgress[]) {
      const s = p.status === "active" ? base : at(5000);
      expect(skipIfAdvanced(p, s)).toBe(p);
    }
  });

  it("premier play : pending ⇒ active ; reprise (active) inchangée", () => {
    expect(startTutorial({ status: "pending", done: 0 })).toEqual({ status: "active", done: 0 });
    for (const p of [ACTIVE0, { status: "done", done: ALL_DONE }, { status: "skipped", done: 0 }] as TutorialProgress[]) {
      expect(startTutorial(p)).toBe(p);
    }
  });

  it("nouvelle partie alors qu'actif ⇒ done = 0 ; done / skipped jamais réactivés", () => {
    expect(restartForNewGame(active("welcome", "harvestTree"))).toEqual(ACTIVE0);
    const a0 = { ...ACTIVE0 };
    expect(restartForNewGame(a0)).toBe(a0);
    for (const p of [{ status: "done", done: ALL_DONE }, { status: "skipped", done: 5 }, { status: "pending", done: 0 }] as TutorialProgress[]) {
      expect(restartForNewGame(p)).toBe(p);
    }
  });

  it("Passer : pending / active ⇒ skipped ; done / skipped stables (même référence)", () => {
    expect(skipTutorial(ACTIVE0)).toEqual({ status: "skipped", done: 0 });
    expect(skipTutorial({ status: "pending", done: 0 })).toEqual({ status: "skipped", done: 0 });
    for (const p of [{ status: "done", done: ALL_DONE }, { status: "skipped", done: 5 }] as TutorialProgress[]) {
      expect(skipTutorial(p)).toBe(p);
    }
  });
});

describe("simulations du core (ticks réels)", () => {
  it("welcome : le joueur s'arrête sur W ⇒ objectif 1 accompli au tick exact du passage queued → walkingToTent", () => {
    let s = walkTo(withHeadQueued(), fresh().map.welcome);
    let p: TutorialProgress = ACTIVE0;
    let doneAt: number | null = null;
    for (let i = 0; i < 200 && doneAt === null; i++) {
      const prev = s;
      s = tick(s);
      expect(checkInvariants(s)).toEqual([]);
      const next = observeTick(p, prev, s);
      if (next !== p && isStepDone(next, "welcome")) {
        doneAt = s.tick;
        const moved = s.survivors.find((v) => v.status === "walkingToTent" && prev.survivors.find((o) => o.id === v.id)?.status === "queued");
        expect(moved).toBeDefined();
      } else {
        // Tant que ce n'est pas fait : aucun survivant n'a quitté la file vers sa tente.
        expect(s.survivors.some((v) => v.status === "walkingToTent")).toBe(false);
      }
      p = next;
    }
    expect(doneAt).not.toBeNull();
    expect(currentStep(p, s)).toBe("pickupWood");
    // Survivant en route : sa tente est « assigned » (ni occupée, ni bois au sol) ⇒ pas de flèche (§1.6 :
    // « drop le plus proche, sinon tente occupied »). Elle apparaît sur la tente dès qu'il s'y installe.
    expect(s.tents.some((t) => t.status === "assigned")).toBe(true);
    expect(guideTarget("pickupWood", s)).toBeNull();
    for (let i = 0; i < 300 && !s.tents.some((t) => t.status === "occupied"); i++) s = tick(s);
    const occupied = s.tents.find((t) => t.status === "occupied");
    expect(occupied).toBeDefined();
    expect(guideTarget("pickupWood", s)).toEqual(tileCenter(occupied?.tile as TilePos));
    expect(stepHint("pickupWood", s).waitingForPay).toBe(true);
  });

  it("bot attentif sur un cycle complet : les 6 objectifs sont accomplis, l'étape affichée suit l'ordre (sauf la priorité au feu)", () => {
    let s = fresh(7);
    let p: TutorialProgress = ACTIVE0;
    const order: TutorialStepId[] = [];
    const doneAt: Partial<Record<TutorialStepId, number>> = {};
    for (let i = 0; i < CYCLE_TICKS + 600 && p.status === "active"; i++) {
      const shown = currentStep(p, s);
      if (shown && order.at(-1) !== shown) order.push(shown);
      const prev = s;
      s = botStep(s);
      const next = observeTick(p, prev, s);
      for (const step of TUTORIAL_STEPS) if (!isStepDone(p, step) && isStepDone(next, step)) doneAt[step] = s.tick;
      p = next;
    }
    expect(p.status, `faits : ${JSON.stringify(doneAt)}`).toBe("done");
    expect(Object.keys(doneAt).sort()).toEqual([...TUTORIAL_STEPS].sort());
    // Hors feedFire, l'étape affichée n'avance que vers l'avant dans TUTORIAL_STEPS.
    const idx = order.filter((x) => x !== "feedFire").map((x) => TUTORIAL_STEPS.indexOf(x));
    for (let i = 1; i < idx.length; i++) expect(idx[i] as number).toBeGreaterThanOrEqual(idx[i - 1] as number);
  });

  it("déterministe : même seed et mêmes commandes ⇒ même progression", () => {
    const play = (): TutorialProgress[] => {
      let s = fresh(11);
      let p: TutorialProgress = ACTIVE0;
      const out: TutorialProgress[] = [];
      for (let i = 0; i < 1500; i++) {
        const prev = s;
        s = botStep(s);
        p = observeTick(p, prev, s);
        out.push(p);
      }
      return out;
    };
    expect(play()).toEqual(play());
  });
});
