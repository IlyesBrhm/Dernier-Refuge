// Invariants jour/nuit (docs/design/day-night.md §5, décision Q3 : borne supérieure sur
// woodEarned). Un cas valide et une corruption détectée par invariant.

import { COLD, FIRE, PLAUSIBILITY, SLEEP, STARTING_RESOURCES, SURVIVOR, TIME, WORLD } from "../../src/data/balance";
import { checkInvariants, heldTotal, plausibleMax } from "../../src/core/invariants";
import { tileCenter } from "../../src/core/map";
import type { GameState } from "../../src/core/state";
import { countBurnTicks } from "../../src/core/time";
import { scenario } from "./day-night-fixtures";
import { edit, expectValid } from "./helpers";

const COLD_R = Math.floor(SURVIVOR.woodReward / COLD.rewardDivisor);
const DAWN = SURVIVOR.woodReward + SLEEP.dawnBonus;
const U = WORLD.unitsPerTile;
/** Voisine sud du feu (zone d'alimentation). */
const FEED = { tx: 9, ty: 6 };

/** Nuit, 2 dormeurs, feu allumé. */
const nightBase = (): GameState => scenario({ tick: 2900, tents: 2, sleeping: 2, fireWood: 5 });
/** Jour 2, après la 1re nuit, bilan cohérent. */
const dayBase = (): GameState =>
  edit(scenario({ tick: 4000, tents: 3 }), (d) => {
    d.night = { coldLeavers: 1, sleepersPaid: 2, woodEarned: COLD_R + 2 * DAWN, woodBurned: 12 };
  });
/** Jour 1, au repos. */
const restBase = (): GameState => scenario({ tick: 1000, tents: 1, resting: 1 });

type Case = [name: string, base: () => GameState, corrupt: (d: GameState) => void, expected: RegExp];

const cases: Case[] = [
  // Feu.
  ["fire.wood > capacity", nightBase, (d) => void (d.fire.wood = FIRE.capacity + 1), /^fire\.wood/],
  ["fire.wood négatif", nightBase, (d) => void (d.fire.wood = -1), /^fire\.wood/],
  ["fire.wood non entier", nightBase, (d) => void (d.fire.wood = 1.5), /^fire\.wood/],
  ["burnedTotal > combustions possibles", nightBase, (d) => void (d.fire.burnedTotal = countBurnTicks(1, d.tick) + 1), /^fire\.burnedTotal/],
  ["burnedTotal négatif", nightBase, (d) => void (d.fire.burnedTotal = -1), /^fire\.burnedTotal/],
  ["burnedTotal = 10^9", nightBase, (d) => void (d.fire.burnedTotal = 1e9), /^fire\.burnedTotal/],
  // Délai d'arrêt avant alimentation (joueur placé dans la zone, sauf mention).
  ["feedProgress > feedDelayTicks", nightBase, (d) => void ((d.player.pos = tileCenter(FEED)), (d.fire.feedProgress = FIRE.feedDelayTicks + 1)), /^fire\.feedProgress hors bornes/],
  ["feedProgress négatif", nightBase, (d) => void ((d.player.pos = tileCenter(FEED)), (d.fire.feedProgress = -1)), /^fire\.feedProgress hors bornes/],
  ["feedProgress non entier", nightBase, (d) => void ((d.player.pos = tileCenter(FEED)), (d.fire.feedProgress = 1.5)), /^fire\.feedProgress hors bornes/],
  ["feedProgress absent", nightBase, (d) => void delete (d.fire as Partial<GameState["fire"]>).feedProgress, /^fire\.feedProgress hors bornes/],
  ["feedProgress > 0 hors de la zone", nightBase, (d) => void (d.fire.feedProgress = 1), /^fire\.feedProgress 1 > 0 hors de la zone/],
  // Statuts et heure.
  [
    "dormeur de jour",
    restBase,
    (d) => {
      d.survivors[0]!.status = "sleeping";
      d.survivors[0]!.restTicksLeft = 0;
    },
    /endormi de jour/,
  ],
  ["dormeur la nuit avec le feu à 0", nightBase, (d) => void (d.fire.wood = 0), /endormi avec le feu éteint/],
  [
    "au repos la nuit",
    nightBase,
    (d) => {
      d.survivors[0]!.status = "resting";
      d.survivors[0]!.restTicksLeft = 10;
    },
    /au repos \(non endormi\) la nuit/,
  ],
  ["dormeur avec restTicksLeft ≠ 0", nightBase, (d) => void (d.survivors[0]!.restTicksLeft = 5), /restTicksLeft invalide/],
  ["dormeur hors de sa tente", nightBase, (d) => void (d.survivors[0]!.pos = tileCenter({ tx: 2, ty: 3 })), /endormi hors de sa tente/],
  ["dormeur avec un chemin", nightBase, (d) => void (d.survivors[0]!.path = [{ tx: 2, ty: 3 }]), /endormi hors de sa tente|non alignée/],
  ["dormeur sans tente", nightBase, (d) => void (d.survivors[0]!.tentId = null), /tentId incohérent/],
  ["tente occupée par un survivant en route", nightBase, (d) => void (d.survivors[0]!.status = "walkingToTent"), /occupant au statut walkingToTent/],
  ["tente assignée à un dormeur", nightBase, (d) => void (d.tents[0]!.status = "assigned"), /occupant au statut sleeping/],
  // Bilan de la nuit.
  ["bilan non nul avant la première nuit", restBase, (d) => void (d.night.woodBurned = 1), /avant la première nuit/],
  ["compteur négatif", dayBase, (d) => void (d.night.coldLeavers = -1), /^night: compteurs invalides/],
  ["compteur non entier", dayBase, (d) => void (d.night.woodEarned = 0.5), /^night: compteurs invalides/],
  ["woodEarned gonflé (> borne)", dayBase, (d) => void (d.night.woodEarned += 1), /^night\.woodEarned/],
  ["woodEarned sans départ", dayBase, (d) => void (d.night = { ...d.night, coldLeavers: 0, sleepersPaid: 0 }), /^night\.woodEarned/],
  ["sleepersPaid > 0 la nuit", nightBase, (d) => void (d.night = { ...d.night, sleepersPaid: 1, woodEarned: DAWN }), /sleepersPaid 1 pendant la nuit/],
  ["woodBurned > combustions de cette nuit", nightBase, (d) => void (d.night.woodBurned = 7), /woodBurned 7 > 6 possible cette nuit/],
  ["woodBurned > combustions d'une nuit (jour)", dayBase, (d) => void (d.night.woodBurned = 13), /woodBurned 13 > 12 possible par nuit/],
  ["sleepersPaid > nombre de tentes", dayBase, (d) => void (d.night = { ...d.night, sleepersPaid: 4, woodEarned: COLD_R + 4 * DAWN }), /> 3 tentes/],
  [
    "woodBurned > burnedTotal",
    dayBase,
    (d) => {
      d.fire.burnedTotal = 5;
    },
    /> fire\.burnedTotal/,
  ],
  [
    "départs ≥ nextId",
    dayBase,
    (d) => {
      d.night = { ...d.night, coldLeavers: d.nextId, woodEarned: d.night.woodEarned };
    },
    /≥ nextId/,
  ],
  // Carte : personne sur le feu.
  ["joueur sur le feu", restBase, (d) => void (d.player.pos = { x: 9 * U + U / 2, y: 5 * U + U / 2 }), /joueur dans un obstacle/],
  ["joueur qui chevauche le feu", restBase, (d) => void (d.player.pos = { x: 9 * U + U / 2, y: 6 * U + 200 }), /joueur dans un obstacle/],
  [
    "survivant sur le feu",
    nightBase,
    (d) => {
      const q = d.survivors[0]!;
      q.status = "leaving";
      q.tentId = null;
      d.tents[0]!.status = "messy";
      d.tents[0]!.occupantId = null;
      q.pos = tileCenter({ tx: 9, ty: 5 });
    },
    /sur une tuile non praticable/,
  ],
  [
    "chemin qui traverse le feu",
    nightBase,
    (d) => {
      const q = d.survivors[0]!;
      q.status = "leaving";
      q.tentId = null;
      d.tents[0]!.status = "messy";
      d.tents[0]!.occupantId = null;
      q.pos = tileCenter({ tx: 9, ty: 6 });
      q.path = [{ tx: 9, ty: 5 }, { tx: 9, ty: 4 }];
    },
    /\(9,5\) non praticable/,
  ],
  [
    "feu déplacé sur la carte",
    restBase,
    (d) => void (d.map = { ...d.map, fire: { tx: 8, ty: 5 } }),
    /feu de camp absent ou déplacé/,
  ],
];

describe("invariants jour/nuit", () => {
  it.each([
    ["nuit, 2 dormeurs", nightBase],
    ["jour 2, bilan cohérent", dayBase],
    ["jour 1, au repos", restBase],
  ] as const)("état de base valide : %s", (_, make) => {
    expectValid(make());
  });

  for (const [name, base, corrupt, expected] of cases) {
    it(`détecte : ${name}`, () => {
      const errors = checkInvariants(edit(base(), corrupt));
      expect(errors.some((e) => expected.test(e)), `aucune erreur ${String(expected)} dans ${JSON.stringify(errors)}`).toBe(true);
    });
  }

  it("bornes valides : feu vide de jour, feu plein, woodEarned = borne exacte et en dessous (borne supérieure)", () => {
    expectValid(edit(restBase(), (d) => void (d.fire.wood = 0)));
    expectValid(edit(nightBase(), (d) => void (d.fire.wood = FIRE.capacity)));
    expectValid(edit(dayBase(), (d) => void (d.night.woodEarned -= 1)));
    expectValid(edit(dayBase(), (d) => void (d.night.woodBurned = TIME.nightTicks / FIRE.nightBurnIntervalTicks)));
    expectValid(edit(nightBase(), (d) => void (d.night.woodBurned = 6)));
  });

  it("feedProgress : 0..feedDelayTicks dans la zone, valide même si une direction vient d'être donnée (commande avant le tick)", () => {
    for (let k = 0; k <= FIRE.feedDelayTicks; k++) {
      expectValid(edit(nightBase(), (d) => void ((d.player.pos = tileCenter(FEED)), (d.fire.feedProgress = k))));
    }
    expectValid(
      edit(nightBase(), (d) => {
        d.player.pos = tileCenter(FEED);
        d.fire.feedProgress = FIRE.feedDelayTicks;
        d.player.input = { dx: 1, dy: 0 };
      }),
    );
  });

  it("plausibilité : le bois du feu (réserve + brûlé) compte, la réserve initiale est ajoutée au plafond", () => {
    const s = nightBase();
    expect(heldTotal(s, "wood")).toBe(
      s.resources.wood + s.fire.wood + s.fire.burnedTotal + s.buildSlots.reduce((a, b) => a + b.paid, 0),
    );
    expect(plausibleMax(s, "wood")).toBe(STARTING_RESOURCES.wood + FIRE.initialWood + s.tick * PLAUSIBILITY.woodPerTick);
    const tooMuch = edit(s, (d) => void (d.resources.wood += plausibleMax(d, "wood") - heldTotal(d, "wood") + 1));
    expect(checkInvariants(tooMuch).some((e) => e.startsWith("plausibilité wood"))).toBe(true);
  });

  it("tick énorme (2^53 − 1) : vérification immédiate, sans exception", () => {
    const s = edit(dayBase(), (d) => void (d.tick = Number.MAX_SAFE_INTEGER));
    expect(() => checkInvariants(s)).not.toThrow();
  });
});
