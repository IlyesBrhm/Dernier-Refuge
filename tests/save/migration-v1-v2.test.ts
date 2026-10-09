// Migration v1 → v2 (docs/design/day-night.md §2.2) : sauvegardes v1 synthétiques (états valides en v1,
// signés en version 1) passées par le VRAI pipeline decodeSave.

import {
  checkInvariants,
  createInitialState,
  findPath,
  referenceMap,
  tick,
  tileCenter,
  type GameState,
  type Survivor,
  type TilePos,
} from "../../src/core/index";
import { FIRE, SLEEP, STARTING_RESOURCES, SURVIVOR, PLAUSIBILITY } from "../../src/data/balance";
import {
  decodeSave,
  migrate,
  migrateV1toV2,
  migrations,
  toSavedState,
  type DecodeError,
  type DecodeResult,
} from "../../src/save/index";
import { deepFreeze, edit } from "../core/helpers";
import { install } from "../core/day-night-fixtures";
import { SEED, signed, toV1Raw } from "./helpers";

const MAP = referenceMap();
const F: TilePos = { tx: 9, ty: 5 };
const EAST_OF_F: TilePos = { tx: 10, ty: 5 };
const WEST_OF_F: TilePos = { tx: 8, ty: 5 };
const NORTH_OF_F: TilePos = { tx: 9, ty: 4 };

function v1(state: GameState): string {
  return signed(toV1Raw(state), 1);
}

function ok(r: DecodeResult): GameState {
  if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
  expect(r.version).toBe(1);
  expect(checkInvariants(r.state)).toEqual([]);
  return r.state;
}

function expectError(r: DecodeResult, error: DecodeError, detail?: RegExp): void {
  if (r.ok) throw new Error(`accepté alors que ${error} attendu`);
  expect(r.error, r.details.join("; ")).toBe(error);
  if (detail) expect(r.details.some((d) => detail.test(d)), r.details.join("; ")).toBe(true);
}

function path(from: TilePos, to: TilePos): TilePos[] {
  const p = findPath(MAP, from, to);
  if (!p) throw new Error("pas de chemin");
  return p;
}

/** Base v1 de jour : état initial au tick 500. */
function base(fn: (d: GameState) => void = () => {}): GameState {
  return edit(createInitialState(SEED), (d) => {
    d.tick = 500;
    fn(d);
  });
}

/** Ajoute un survivant (statut, position, chemin) ; met à jour file / tente selon le statut. */
function addSurvivor(d: GameState, status: Survivor["status"], at: TilePos | { x: number; y: number }, p: TilePos[]): Survivor {
  const s: Survivor = {
    id: d.nextId++,
    pos: "tx" in at ? tileCenter(at) : at,
    status,
    path: p,
    tentId: null,
    restTicksLeft: 0,
  };
  if (status === "walkingToTent") {
    const tent = d.tents[0]!;
    tent.status = "assigned";
    tent.occupantId = s.id;
    s.tentId = tent.id;
  }
  if (status === "toQueue") d.queue.push(s.id);
  d.survivors.push(s);
  return s;
}

describe("registre", () => {
  it("migrations[1] est la migration v1 → v2", () => {
    expect(migrations[1]).toBe(migrateV1toV2);
  });
});

describe("pureté et refus", () => {
  it("ne mute jamais son entrée (entrée gelée en profondeur)", () => {
    const raw = deepFreeze(toV1Raw(base((d) => addSurvivor(d, "leaving", EAST_OF_F, [F, WEST_OF_F, ...path(WEST_OF_F,MAP.entrance)]))));
    const before = JSON.stringify(raw);
    expect(() => migrateV1toV2(raw)).not.toThrow();
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("non-objet ⇒ renvoyé tel quel (la validation de forme refusera)", () => {
    for (const v of [null, 1, "x", [1], undefined]) expect(migrateV1toV2(v)).toBe(v);
  });

  it.each(["fire", "night"])("une v1 contenant déjà `%s` ⇒ migration_failed", (key) => {
    const raw: Record<string, unknown> = toV1Raw(base());
    raw[key] = key === "fire" ? { wood: 16, burnedTotal: 0, feedProgress: 0 } : { coldLeavers: 0, sleepersPaid: 0, woodEarned: 0, woodBurned: 0 };
    expect(migrate(raw, 1)).toMatchObject({ ok: false, details: [expect.stringMatching(/fire|night/)] });
    expectError(decodeSave(signed(raw, 1)), "migration_failed", /ne peut pas contenir/);
  });

  it("une save v2 complète signée en version 1 ⇒ migration_failed (jamais acceptée)", () => {
    const { map: _m, ...state } = createInitialState(SEED);
    expectError(decodeSave(signed(state, 1)), "migration_failed");
  });

  it("v1 malformée ⇒ bad_shape, sans exception, sans transformation", () => {
    const raw = toV1Raw(base());
    (raw.resources as Record<string, unknown>).wood = "beaucoup";
    expect(migrateV1toV2(raw)).toBe(raw);
    expect(() => decodeSave(signed(raw, 1))).not.toThrow();
    expectError(decodeSave(signed(raw, 1)), "bad_shape", /resources\.wood/);
  });

  it("statut `sleeping` dans une v1 (inexistant en v1) ⇒ bad_shape, même de nuit avec un état sinon cohérent", () => {
    const st = edit(createInitialState(SEED), (d) => {
      d.tick = 2900;
      install(d, 0, "sleeping");
    });
    const { map: _m, fire: _f, night: _n, ...raw } = st;
    expectError(decodeSave(signed(JSON.parse(JSON.stringify(raw)), 1)), "bad_shape");
  });
});

describe("ajouts : feu plein et bilan à 0, le reste intact", () => {
  it("état initial v1 ⇒ fire/night ajoutés, tout le reste identique", () => {
    const st = base();
    const s = ok(decodeSave(v1(st)));
    expect(s.fire).toEqual({ wood: FIRE.initialWood, burnedTotal: 0, feedProgress: 0 });
    expect(s.night).toEqual({ coldLeavers: 0, sleepersPaid: 0, woodEarned: 0, woodBurned: 0 });
    expect(toSavedState(s)).toEqual({ ...toV1Raw(st), fire: s.fire, night: s.night });
  });

  it("plausibilité : le bois du feu ajouté par la migration est accepté (plafond + initialWood), même à la borne exacte", () => {
    const max = STARTING_RESOURCES.wood + 10 * PLAUSIBILITY.woodPerTick; // borne v1 au tick 10
    const at = (wood: number) =>
      decodeSave(
        v1(
          edit(createInitialState(SEED), (d) => {
            d.tick = 10;
            d.resources.wood = wood;
          }),
        ),
      );
    expect(ok(at(max)).resources.wood).toBe(max);
    expectError(at(max + 1), "invariants", /plausibilité wood/);
  });
});

describe("sommeil : resting d'une v1 dont le tick tombe la nuit", () => {
  const restingAt = (t: number, restTicksLeft = 50): GameState =>
    edit(createInitialState(SEED), (d) => {
      d.tick = t;
      install(d, 0, "resting", restTicksLeft);
    });

  it("tick 2900 (nuit) ⇒ sleeping, restTicksLeft 0, invariants OK ; payé à l'aube (tick 3600)", () => {
    let s = ok(decodeSave(v1(restingAt(2900))));
    const v = s.survivors[0]!;
    expect(v.status).toBe("sleeping");
    expect(v.restTicksLeft).toBe(0);
    expect(v.path).toEqual([]);
    expect(s.tents[0]!.status).toBe("occupied");
    while (s.tick < 3599) {
      s = tick(s);
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(s.survivors[0]!.status).toBe("sleeping");
    expect(s.fire.wood).toBeGreaterThan(0);
    s = tick(s);
    expect(s.tick).toBe(3600);
    expect(checkInvariants(s)).toEqual([]);
    expect(s.survivors[0]!.status).toBe("leaving");
    expect(s.night.sleepersPaid).toBe(1);
    expect(s.night.woodEarned).toBe(SURVIVOR.woodReward + SLEEP.dawnBonus);
  });

  it.each([1000, 3600, 2399])("tick %i (jour) ⇒ resting inchangé", (t) => {
    const st = restingAt(t);
    const s = ok(decodeSave(v1(st)));
    expect(s.survivors).toEqual(st.survivors);
  });

  it("tick 2400 (premier tick de nuit) ⇒ sleeping", () => {
    expect(ok(decodeSave(v1(restingAt(2400)))).survivors[0]!.status).toBe("sleeping");
  });

  it("resting de nuit avec restTicksLeft invalide en v1 (0) ⇒ refusé, pas « réparé » en sleeping", () => {
    expectError(decodeSave(v1(restingAt(2900, 0))), "invariants");
  });
});

describe("carte : la tuile F (9,5) devient un obstacle", () => {
  it("joueur au centre de F ⇒ centre de la voisine N (égalité N, E, S, O), input conservé", () => {
    const st = base((d) => {
      d.player.pos = tileCenter(F);
      d.player.input = { dx: -1, dy: 1 };
    });
    const s = ok(decodeSave(v1(st)));
    expect(s.player.pos).toEqual(tileCenter(NORTH_OF_F));
    expect(s.player.input).toEqual({ dx: -1, dy: 1 });
  });

  it("hitbox du joueur qui déborde sur F depuis l'est ⇒ centre de la voisine E (décalage ≤ ½ tuile)", () => {
    const pos = { x: 10_300, y: 5_500 };
    const s = ok(decodeSave(v1(base((d) => void (d.player.pos = pos)))));
    expect(s.player.pos).not.toEqual(pos);
    expect(s.player.pos).toEqual(tileCenter(EAST_OF_F));
    expect(Math.abs(s.player.pos.x - pos.x)).toBeLessThanOrEqual(500);
  });

  it("hitbox qui touche le bord de F sans le chevaucher ⇒ joueur inchangé", () => {
    const pos = { x: 10_350, y: 5_500 };
    const st = base((d) => void (d.player.pos = pos));
    expect(ok(decodeSave(v1(st))).player.pos).toEqual(pos);
  });

  it("walkingToTent dont le chemin entre dans F ⇒ recentré sur sa tuile, chemin BFS v2 vers sa tente", () => {
    const tent = createInitialState(SEED).tents[0]!.tile;
    const st = base((d) => void addSurvivor(d, "walkingToTent", EAST_OF_F, [F, WEST_OF_F, ...path(WEST_OF_F,tent)]));
    const v = ok(decodeSave(v1(st))).survivors[0]!;
    expect(v.status).toBe("walkingToTent");
    expect(v.pos).toEqual(tileCenter(EAST_OF_F));
    expect(v.path).toEqual(path(EAST_OF_F, tent));
    expect(v.path.some((t) => t.tx === F.tx && t.ty === F.ty)).toBe(false);
  });

  it("walkingToTent en plein milieu d'un pas (pas au centre) ⇒ décalé d'au plus ½ tuile", () => {
    const tent = createInitialState(SEED).tents[0]!.tile;
    const at = { x: 10_300, y: 5_500 }; // tuile (10,5), en route vers F
    const st = base((d) => void addSurvivor(d, "walkingToTent", at, [F, WEST_OF_F, ...path(WEST_OF_F,tent)]));
    const v = ok(decodeSave(v1(st))).survivors[0]!;
    expect(v.pos).toEqual(tileCenter(EAST_OF_F));
    expect(Math.abs(v.pos.x - at.x) + Math.abs(v.pos.y - at.y)).toBeLessThanOrEqual(500);
  });

  it("survivant SUR F ⇒ placé sur la voisine la plus proche, chemin recalculé", () => {
    const tent = createInitialState(SEED).tents[0]!.tile;
    const st = base((d) => void addSurvivor(d, "walkingToTent", F, [WEST_OF_F, ...path(WEST_OF_F, tent)]));
    const v = ok(decodeSave(v1(st))).survivors[0]!;
    expect(v.pos).toEqual(tileCenter(NORTH_OF_F));
    expect(v.path).toEqual(path(NORTH_OF_F, tent));
  });

  it("leaving qui traverse F ⇒ chemin BFS v2 vers l'entrée", () => {
    const st = base((d) => void addSurvivor(d, "leaving", EAST_OF_F, [F, WEST_OF_F, ...path(WEST_OF_F,MAP.entrance)]));
    const v = ok(decodeSave(v1(st))).survivors[0]!;
    expect(v.pos).toEqual(tileCenter(EAST_OF_F));
    expect(v.path).toEqual(path(EAST_OF_F, MAP.entrance));
  });

  it("toQueue qui traverse F ⇒ chemin BFS v2 vers sa place de file", () => {
    const q0 = MAP.queueTiles[0]!;
    const st = base((d) => void addSurvivor(d, "toQueue", EAST_OF_F, [F, WEST_OF_F, ...path(WEST_OF_F,q0)]));
    const s = ok(decodeSave(v1(st)));
    expect(s.survivors[0]!.path).toEqual(path(EAST_OF_F, q0));
    expect(s.queue).toEqual(st.queue);
  });

  it("après migration, la partie reprend 300 ticks sans violation", () => {
    const tent = createInitialState(SEED).tents[0]!.tile;
    let s = ok(
      decodeSave(
        v1(
          base((d) => {
            addSurvivor(d, "walkingToTent", EAST_OF_F, [F, WEST_OF_F, ...path(WEST_OF_F,tent)]);
            d.player.pos = tileCenter(F);
          }),
        ),
      ),
    );
    for (let i = 0; i < 300; i++) {
      s = tick(s);
      expect(checkInvariants(s)).toEqual([]);
    }
  });

  it("drop sur F conservé tel quel", () => {
    const st = base((d) => {
      d.drops.push({ id: d.nextId++, pos: tileCenter(F), resource: "wood", amount: 3 });
      d.resources.wood = 0;
    });
    expect(ok(decodeSave(v1(st))).drops).toEqual(st.drops);
  });

  it("chemin v1 incohérent passant par F (non contigu) ⇒ migration_failed, jamais recalculé", () => {
    const tent = createInitialState(SEED).tents[0]!.tile;
    const st = base((d) => void addSurvivor(d, "walkingToTent", EAST_OF_F, [F, ...path({ tx: 7, ty: 5 }, tent)]));
    expectError(decodeSave(v1(st)), "migration_failed", /non contigu/);
  });

  it("chemin v1 vers une mauvaise destination passant par F ⇒ migration_failed", () => {
    const st = base((d) => void addSurvivor(d, "leaving", EAST_OF_F, [F, WEST_OF_F]));
    expectError(decodeSave(v1(st)), "migration_failed", /entrée/);
  });

  it("survivant `queued` sur F (impossible en v1 valide) ⇒ laissé tel quel, donc refusé par les invariants", () => {
    const st = base((d) => {
      addSurvivor(d, "queued", F, []);
      d.queue.push(d.survivors[0]!.id);
    });
    expectError(decodeSave(v1(st)), "invariants");
  });
});
