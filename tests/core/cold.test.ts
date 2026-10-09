// Froid et accueil suspendu (docs/design/day-night.md §1.5, décisions utilisateur) :
// la nuit, feu à 0 ⇒ tous les dormeurs partent immédiatement avec floor(R / D) (= 2), tente en
// désordre ; l'accueil est suspendu (la file attend) tant que le feu est éteint la nuit.

import { COLD, FIRE, SURVIVOR, TIME, WELCOME } from "../../src/data/balance";
import { tileCenter } from "../../src/core/map";
import { countBurnTicks, isBurnTick, isNight } from "../../src/core/time";
import { isFireLow, isFireOutAtNight, welcomeBlockedByCold } from "../../src/core/selectors";
import type { GameState } from "../../src/core/state";
import { COLD_REWARD } from "../../src/core/systems/cold";
import { tick } from "../../src/core/tick";
import { AWAY, FEED_SPOT, scenario, tentDoorDrop } from "./day-night-fixtures";
import { edit, expectValid, ledgerDeltaErrors, run, runUntil, walkTo, withHeadQueued } from "./helpers";

const COLD_R = Math.floor(SURVIVOR.woodReward / COLD.rewardDivisor);

describe("froid — départs", () => {
  it("récompense au froid = floor(woodReward / rewardDivisor) = 2 (arrondi inférieur)", () => {
    expect(COLD_REWARD).toBe(COLD_R);
    expect(COLD_R).toBe(2);
    expect(COLD_R).toBeLessThanOrEqual(SURVIVOR.woodReward / COLD.rewardDivisor);
  });

  it("nuit, le feu tombe à 0 avec 3 dormeurs ⇒ les 3 partent au même pas, 2 sur chaque porte", () => {
    const s0 = scenario({ tick: 2499, tents: 3, sleeping: 3, fireWood: 1, player: AWAY });
    expectValid(s0);
    expect(isFireLow(s0)).toBe(true);
    const s1 = tick(s0);
    expectValid(s1);
    expect(ledgerDeltaErrors(s0, s1)).toEqual([]);
    expect(s1.fire.wood).toBe(0);
    expect(isFireOutAtNight(s1)).toBe(true);
    expect(isFireLow(s1)).toBe(false);
    expect(s1.survivors.map((v) => v.status)).toEqual(["leaving", "leaving", "leaving"]);
    for (let i = 0; i < 3; i++) expect(tentDoorDrop(s1, i)).toBe(COLD_R);
    expect(s1.tents.slice(0, 3).every((t) => t.status === "messy" && t.cleanProgress === 0)).toBe(true);
    expect(s1.night).toEqual({ coldLeavers: 3, sleepersPaid: 0, woodEarned: 3 * COLD_R, woodBurned: 1 });
    expect(s1.night.woodEarned).toBe(6);
  });

  it("feu > 0 la nuit ⇒ personne ne part", () => {
    const s = run(scenario({ tick: 2501, tents: 2, sleeping: 2, fireWood: 5, player: AWAY }), 50);
    expect(s.survivors.every((v) => v.status === "sleeping")).toBe(true);
    expect(s.night.coldLeavers).toBe(0);
  });

  it("le jour, un feu éteint n'a aucun effet : les survivants au repos continuent", () => {
    const s = run(scenario({ tick: 1000, tents: 1, resting: 1, restTicksLeft: 50, fireWood: 0, player: AWAY }), 10);
    expect(s.survivors[0]!.status).toBe("resting");
    expect(s.survivors[0]!.restTicksLeft).toBe(40);
  });

  it("crépuscule avec un feu déjà à 0 ⇒ les survivants au repos s'endorment et partent au pas 2400 avec 2", () => {
    const s0 = scenario({ tick: 2399, tents: 2, resting: 2, restTicksLeft: 80, fireWood: 0, player: AWAY });
    const s1 = tick(s0);
    expectValid(s1);
    expect(s1.tick).toBe(2400);
    expect(s1.survivors.map((v) => v.status)).toEqual(["leaving", "leaving"]);
    expect(tentDoorDrop(s1, 0)).toBe(COLD_R);
    expect(tentDoorDrop(s1, 1)).toBe(COLD_R);
    expect(s1.night).toEqual({ coldLeavers: 2, sleepersPaid: 0, woodEarned: 2 * COLD_R, woodBurned: 0 });
  });

  /** Survivant à un pas de sa tente (T), la nuit, feu éteint. */
  function arrivingAtNight(t: number, extra?: (d: GameState) => void): GameState {
    return edit(scenario({ tick: t, fireWood: 0, player: AWAY }), (d) => {
      const tent = d.tents[0]!;
      const c = tileCenter(tent.tile);
      const id = d.nextId++;
      d.survivors.push({
        id,
        pos: { x: c.x, y: c.y + SURVIVOR.speed },
        status: "walkingToTent",
        path: [{ ...tent.tile }],
        tentId: tent.id,
        restTicksLeft: 0,
      });
      tent.status = "assigned";
      tent.occupantId = id;
      extra?.(d);
    });
  }

  it("installé après l'extinction : arrive, s'endort et repart au même pas avec 2 ; aucun dormeur en fin de pas", () => {
    const s0 = arrivingAtNight(2601);
    expectValid(s0);
    const s1 = tick(s0);
    expectValid(s1);
    expect(ledgerDeltaErrors(s0, s1)).toEqual([]);
    expect(s1.survivors[0]!.status).toBe("leaving");
    expect(tentDoorDrop(s1, 0)).toBe(COLD_R);
    expect(s1.survivors.some((v) => v.status === "sleeping")).toBe(false);
    expect(s1.night.coldLeavers).toBe(1);
  });

  it("même cas, mais le joueur rallume le feu au même pas ⇒ il reste endormi", () => {
    // 2602 : pair (alimentation), pas une combustion. Joueur déjà arrêté au feu depuis le délai.
    const s0 = arrivingAtNight(2601, (d) => {
      d.player.pos = tileCenter(FEED_SPOT);
      d.resources.wood = 5;
      d.fire.feedProgress = FIRE.feedDelayTicks;
    });
    const s1 = tick(s0);
    expectValid(s1);
    expect(s1.fire.wood).toBe(1);
    expect(s1.survivors[0]!.status).toBe("sleeping");
    expect(s1.night.coldLeavers).toBe(0);
  });

  it("toQueue, queued, walkingToTent et leaving ne sont pas concernés par le froid", () => {
    const base = edit(withHeadQueued(), (d) => {
      d.tick = 2600;
      d.fire.wood = 0;
    });
    expectValid(base);
    const s = run(base, 100);
    expect(s.queue).toEqual(base.queue);
    expect(s.survivors.map((v) => v.id)).toEqual(base.survivors.map((v) => v.id));
    expect(s.survivors.every((v) => v.status === "queued" || v.status === "toQueue")).toBe(true);
    expect(s.night.coldLeavers).toBe(0);
    // Un survivant qui repart (froid) n'est pas payé une deuxième fois en chemin.
    let left = tick(scenario({ tick: 2499, tents: 1, sleeping: 1, fireWood: 1, player: AWAY }));
    for (let i = 0; i < 30; i++) {
      const prev = left;
      left = tick(left);
      expect(ledgerDeltaErrors(prev, left)).toEqual([]);
    }
    expect(left.night.coldLeavers).toBe(1);
  });
});

describe("froid — accueil suspendu la nuit feu éteint (décision utilisateur)", () => {
  /** Tête de file arrivée, tente T libre, joueur sur W, au tick `t`, feu `wood`. */
  function atWelcome(t: number, wood: number): GameState {
    return edit(withHeadQueued(), (d) => {
      d.tick = t;
      d.fire.wood = wood;
      d.player.pos = tileCenter(d.map.welcome);
    });
  }

  it("nuit ∧ feu à 0 : la progression d'accueil reste à 0, la file attend", () => {
    const s0 = atWelcome(2600, 0);
    expectValid(s0);
    expect(welcomeBlockedByCold(s0)).toBe(true);
    const s = run(s0, 3 * WELCOME.ticks);
    expect(s.welcomeProgress).toBe(0);
    expect(s.queue[0]).toBe(s0.queue[0]);
    expect(s.tents[0]!.status).toBe("free");
  });

  it("nuit ∧ feu allumé : l'accueil reste ouvert", () => {
    const s0 = atWelcome(2600, 5);
    expect(welcomeBlockedByCold(s0)).toBe(false);
    const s = run(s0, WELCOME.ticks);
    expect(s.survivors.find((v) => v.id === s0.queue[0])!.status).toBe("walkingToTent");
  });

  it("jour ∧ feu à 0 : l'accueil fonctionne", () => {
    const s0 = atWelcome(1000, 0);
    expect(welcomeBlockedByCold(s0)).toBe(false);
    const s = run(s0, WELCOME.ticks);
    expect(s.survivors.find((v) => v.id === s0.queue[0])!.status).toBe("walkingToTent");
  });

  describe("accueil terminé au pas exact de l'extinction (cas limite, comportement actuel documenté)", () => {
    // Ordre des systèmes (src/core/tick.ts) : welcome AVANT fire puis cold. Au pas de combustion qui
    // fait tomber le feu de 1 à 0, welcome lit encore wood = 1 : l'accueil n'est pas suspendu et se
    // termine (tente attribuée, survivant en route). Puis le feu s'éteint ; cold ne touche que les
    // dormeurs, le nouveau venu (walkingToTent) n'est donc pas concerné à ce pas-là. Dès le pas
    // suivant, l'accueil est fermé (nuit ∧ feu à 0). Quand le survivant atteint sa tente, lifecycle
    // l'endort puis cold le fait repartir AU MÊME PAS avec la récompense réduite (COLD_R) : il n'est
    // jamais observé « sleeping » en fin de pas. Conservation vérifiée à chaque pas.
    const BURN = 2500;

    /** Tête de file arrivée, joueur sur W, tick BURN − WELCOME.ticks : l'accueil s'achève au tick BURN. */
    function welcomeEndingAtBurn(fireWood: number): GameState {
      return edit(withHeadQueued(), (d) => {
        d.tick = BURN - WELCOME.ticks;
        d.fire.wood = fireWood;
        d.fire.burnedTotal = countBurnTicks(1, d.tick);
        d.player.pos = tileCenter(d.map.welcome);
        d.welcomeProgress = 0;
      });
    }

    /** Avance pas à pas jusqu'à `pred`, en vérifiant invariants et conservation à chaque pas. */
    function stepUntil(s0: GameState, pred: (s: GameState) => boolean, max: number): GameState {
      let s = s0;
      for (let i = 0; i < max && !pred(s); i++) {
        const next = tick(s);
        expectValid(next);
        expect(ledgerDeltaErrors(s, next), `tick ${next.tick}`).toEqual([]);
        s = next;
      }
      expect(pred(s)).toBe(true);
      return s;
    }

    it("préconditions : BURN est un pas de combustion de nuit, aucun autre dans la fenêtre d'accueil", () => {
      expect(isNight(BURN)).toBe(true);
      expect(isBurnTick(BURN)).toBe(true);
      for (let t = BURN - WELCOME.ticks + 1; t < BURN; t++) expect(isBurnTick(t), `tick ${t}`).toBe(false);
      expect(BURN + 600).toBeLessThan(TIME.dayTicks + TIME.nightTicks); // le trajet tient avant l'aube
    });

    it("feu à 1 : accueil terminé au pas où le feu s'éteint, puis départ au froid à l'arrivée (COLD_R), conservation tenue", () => {
      const s0 = welcomeEndingAtBurn(1);
      expectValid(s0);
      const headId = s0.queue[0]!;
      const tentIdx = s0.tents.findIndex((t) => t.status === "free");
      expect(tentIdx).toBeGreaterThanOrEqual(0);
      const tentId = s0.tents[tentIdx]!.id;

      // Jusqu'à la veille de la combustion : l'accueil progresse, le feu tient.
      const before = stepUntil(s0, (s) => s.tick === BURN - 1, WELCOME.ticks);
      expect(before.welcomeProgress).toBe(WELCOME.ticks - 1);
      expect(before.fire.wood).toBe(1);
      expect(welcomeBlockedByCold(before)).toBe(false);

      // Pas BURN : welcome (wood = 1) termine l'accueil, PUIS le feu tombe à 0.
      const atBurn = tick(before);
      expectValid(atBurn);
      expect(ledgerDeltaErrors(before, atBurn)).toEqual([]);
      expect(atBurn.tick).toBe(BURN);
      expect(atBurn.fire.wood).toBe(0);
      expect(atBurn.night.woodBurned).toBe(before.night.woodBurned + 1);
      const head = atBurn.survivors.find((v) => v.id === headId)!;
      expect(head.status).toBe("walkingToTent");
      expect(head.tentId).toBe(tentId);
      expect(atBurn.tents[tentIdx]).toMatchObject({ status: "assigned", occupantId: headId });
      expect(atBurn.queue).not.toContain(headId);
      expect(atBurn.welcomeProgress).toBe(0);
      // Le nouveau venu n'est pas un dormeur : aucun départ au froid à ce pas.
      expect(atBurn.night.coldLeavers).toBe(before.night.coldLeavers);
      // Dès maintenant, l'accueil est fermé (nuit ∧ feu à 0) pour la suite de la file.
      expect(welcomeBlockedByCold(atBurn)).toBe(true);
      const queueAfter = [...atBurn.queue];

      // Trajet jusqu'à la tente : jamais endormi en fin de pas ; à l'arrivée, départ au froid immédiat.
      let s = atBurn;
      for (let i = 0; i < 600; i++) {
        const v = s.survivors.find((x) => x.id === headId)!;
        if (v.status !== "walkingToTent") break;
        const next = tick(s);
        expectValid(next);
        expect(ledgerDeltaErrors(s, next), `tick ${next.tick}`).toEqual([]);
        expect(next.survivors.find((x) => x.id === headId)!.status).not.toBe("sleeping");
        expect(next.queue).toEqual(queueAfter); // accueil toujours fermé
        expect(next.welcomeProgress).toBe(0);
        s = next;
      }
      const arrived = s.survivors.find((v) => v.id === headId)!;
      expect(arrived.status).toBe("leaving");
      expect(s.tick).toBeLessThan(TIME.dayTicks + TIME.nightTicks);
      expect(tentDoorDrop(s, tentIdx)).toBe(COLD_R);
      expect(s.tents[tentIdx]).toMatchObject({ status: "messy", cleanProgress: 0 });
      expect(s.night.coldLeavers).toBe(before.night.coldLeavers + 1);
      expect(s.night.woodEarned).toBe(before.night.woodEarned + COLD_R);
      expect(s.night.sleepersPaid).toBe(before.night.sleepersPaid);
    });

    it("témoin : feu à 2 au même pas ⇒ même accueil, mais le feu tient et le survivant s'endort", () => {
      const s0 = welcomeEndingAtBurn(2);
      const headId = s0.queue[0]!;
      const atBurn = stepUntil(s0, (s) => s.tick === BURN, WELCOME.ticks);
      expect(atBurn.fire.wood).toBe(1);
      expect(atBurn.survivors.find((v) => v.id === headId)!.status).toBe("walkingToTent");
      expect(welcomeBlockedByCold(atBurn)).toBe(false);
      const asleep = stepUntil(atBurn, (s) => s.survivors.find((v) => v.id === headId)!.status !== "walkingToTent", 600);
      // Arrivée avant la combustion suivante (BURN + intervalle) : le feu est encore à 1, il dort.
      expect(asleep.tick).toBeLessThan(BURN + FIRE.nightBurnIntervalTicks);
      expect(asleep.fire.wood).toBe(1);
      expect(asleep.survivors.find((x) => x.id === headId)!.status).toBe("sleeping");
      expect(asleep.night.coldLeavers).toBe(s0.night.coldLeavers);
    });
  });

  it("repris si on rallume : aller au feu, verser, revenir sur W ⇒ accueil (commandes uniquement)", () => {
    const s0 = atWelcome(2600, 0);
    const headId = s0.queue[0]!;
    let s = walkTo(s0, FEED_SPOT);
    s = runUntil(s, (st) => st.fire.wood >= 3, 50);
    expect(welcomeBlockedByCold(s)).toBe(false);
    s = walkTo(s, s.map.welcome);
    s = runUntil(s, (st) => st.survivors.find((v) => v.id === headId)?.status === "walkingToTent", 50);
    expect(s.fire.wood).toBeGreaterThan(0);
    expect(s.tick).toBeLessThan(3600);
    expect(FIRE.capacity).toBeGreaterThan(0);
  });
});
