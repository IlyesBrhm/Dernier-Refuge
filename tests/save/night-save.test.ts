// Sauvegarde v2 et jour/nuit : recharger en pleine nuit reprend en pleine nuit (même phase, mêmes
// dormeurs, suite de jeu identique) ; valeurs du feu / du bilan de nuit trafiquées puis re-signées
// refusées (docs/design/day-night.md §5 et §6.3).

import { checkInvariants, cloneState, createInitialState, isNight, phase, type GameState } from "../../src/core/index";
import { FIRE } from "../../src/data/balance";
import {
  CURRENT_VERSION,
  createMemoryStorage,
  decodeSave,
  encodeSave,
  loadGame,
  validateSavedState,
  writeSave,
  type DecodeError,
  type DecodeResult,
} from "../../src/save/index";
import { attentiveStep, midgame, nightState, OWNER, resign, SAVED_AT, SEED } from "./helpers";

type Raw = Record<string, unknown>;
type S = Raw & { survivors: Raw[]; fire: Raw; night: Raw; tents: Raw[] };

function enc(s: GameState): string {
  const r = encodeSave(s, { seed: SEED, savedAt: SAVED_AT });
  if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
  return r.text;
}

function expectError(r: DecodeResult, error: DecodeError, detail?: RegExp): void {
  if (r.ok) throw new Error(`accepté alors que ${error} attendu`);
  expect(r.error, r.details.join("; ")).toBe(error);
  if (detail) expect(r.details.some((d) => detail.test(d)), r.details.join("; ")).toBe(true);
}

const sleepers = (s: GameState): number[] => s.survivors.filter((v) => v.status === "sleeping").map((v) => v.id);

let NIGHT: GameState;
let NIGHT_TEXT: string;
let MID_TEXT: string;
beforeAll(() => {
  NIGHT = nightState();
  NIGHT_TEXT = enc(NIGHT);
  MID_TEXT = enc(midgame());
});

describe("recharger en pleine nuit reprend en pleine nuit", () => {
  it("l'état de nuit est riche : nuit, feu allumé, dormeurs, bois brûlé", () => {
    expect(isNight(NIGHT.tick)).toBe(true);
    expect(NIGHT.fire.wood).toBeGreaterThan(0);
    expect(sleepers(NIGHT).length).toBeGreaterThan(0);
    expect(NIGHT.night.woodBurned).toBeGreaterThan(0);
  });

  it("aller-retour v2 : decode(encode(s)) toEqual s, version courante", () => {
    const r = decodeSave(NIGHT_TEXT);
    if (!r.ok) throw new Error(r.details.join("; "));
    expect(r.version).toBe(CURRENT_VERSION);
    expect(r.state).toEqual(NIGHT);
    expect(phase(r.state.tick)).toBe("night");
    expect(sleepers(r.state)).toEqual(sleepers(NIGHT));
    expect(r.state.fire).toEqual(NIGHT.fire);
    expect(r.state.night).toEqual(NIGHT.night);
    expect(enc(r.state)).toBe(NIGHT_TEXT);
  });

  it("via le stockage (double slot) puis suite de jeu identique tick par tick jusqu'après l'aube", () => {
    const st = createMemoryStorage();
    expect(writeSave(st, NIGHT, { seed: SEED, savedAt: SAVED_AT }, OWNER).ok).toBe(true);
    const loaded = loadGame(st);
    if (loaded.kind !== "loaded") throw new Error(loaded.kind);
    let a = NIGHT;
    let b = loaded.state;
    expect(b).toEqual(a);
    // Jusqu'à 200 ticks après l'aube suivante : traverse le paiement des dormeurs.
    const end = NIGHT.tick - (NIGHT.tick % 3600) + 3600 + 200;
    while (a.tick < end) {
      a = attentiveStep(a);
      b = attentiveStep(b);
      expect(b).toEqual(a);
    }
    expect(checkInvariants(b)).toEqual([]);
    expect(isNight(b.tick)).toBe(false);
    expect(b.night.sleepersPaid + b.night.coldLeavers).toBeGreaterThan(0);
  });

  it("rechargements répétés en pleine nuit (toutes les 37 ticks) ⇒ même partie qu'en continu", () => {
    let a = NIGHT;
    let b = NIGHT;
    for (let i = 1; i <= 400; i++) {
      a = attentiveStep(a);
      b = attentiveStep(b);
      if (i % 37 === 0) {
        const r = decodeSave(enc(b));
        if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
        b = r.state;
      }
    }
    expect(b).toEqual(a);
  });
});

describe("forme v2", () => {
  it("validateSavedState accepte un état de nuit, refuse fire/night mal formés", () => {
    const { map: _m, ...saved } = cloneState(NIGHT);
    expect(validateSavedState(saved)).toEqual([]);
    const bad = JSON.parse(JSON.stringify(saved)) as S;
    bad.fire.extra = 1;
    delete bad.night.woodBurned;
    const errs = validateSavedState(bad);
    expect(errs).toContain("state.fire.extra: clé inconnue");
    expect(errs).toContain("state.night.woodBurned: clé manquante");
  });
});

describe("valeurs de nuit trafiquées puis RE-SIGNÉES ⇒ refusées", () => {
  const cases: [string, () => string, (s: S) => void, DecodeError, RegExp?][] = [
    ["feu au-delà de la capacité", () => NIGHT_TEXT, (s) => void (s.fire.wood = FIRE.capacity + 1), "invariants", /fire\.wood/],
    ["feu négatif", () => NIGHT_TEXT, (s) => void (s.fire.wood = -1), "invariants", /fire\.wood/],
    ["burnedTotal énorme", () => NIGHT_TEXT, (s) => void (s.fire.burnedTotal = 1e9), "invariants", /burnedTotal/],
    ["woodEarned au-dessus de la borne", () => NIGHT_TEXT, (s) => void (s.night.woodEarned = (s.night.woodEarned as number) + 100), "invariants", /woodEarned/],
    ["sleepersPaid > 0 pendant la nuit", () => NIGHT_TEXT, (s) => void (s.night.sleepersPaid = 1), "invariants", /sleepersPaid/],
    ["bilan non nul au tick 10", () => enc(createInitialState(SEED)), (s) => {
      s.tick = 10;
      s.night.coldLeavers = 1;
    }, "invariants", /avant la première nuit/],
    ["dormeurs avec le feu éteint", () => NIGHT_TEXT, (s) => void (s.fire.wood = 0), "invariants", /feu éteint/],
    ["dormeur de jour", () => MID_TEXT, (s) => {
      const v = s.survivors.find((x) => x.status === "resting")!;
      v.status = "sleeping";
      v.restTicksLeft = 0;
    }, "invariants", /endormi de jour/],
    ["resting la nuit", () => NIGHT_TEXT, (s) => {
      const v = s.survivors.find((x) => x.status === "sleeping")!;
      v.status = "resting";
      v.restTicksLeft = 10;
    }, "invariants", /la nuit/],
    ["statut inconnu", () => NIGHT_TEXT, (s) => void (s.survivors[0]!.status = "dreaming"), "bad_shape", /status/],
    ["fire manquant", () => NIGHT_TEXT, (s) => void delete (s as Raw).fire, "bad_shape", /state\.fire: clé manquante/],
    ["clé en trop dans night", () => NIGHT_TEXT, (s) => void (s.night.bonus = 1), "bad_shape", /night\.bonus: clé inconnue/],
    ["fire.wood non entier", () => NIGHT_TEXT, (s) => void (s.fire.wood = 1.5), "bad_shape", /fire\.wood/],
  ];

  it.each(cases)("%s ⇒ %s", (_n, text, mutate, error, detail) => {
    expectError(decodeSave(resign(text(), (st) => mutate(st as S))), error, detail);
  });

  it("contrôle : re-signer sans trafic ⇒ accepté", () => {
    const r = decodeSave(resign(NIGHT_TEXT, () => {}));
    expect(r.ok && r.state).toEqual(NIGHT);
  });

  it("version 3 ⇒ future_version", () => {
    expectError(decodeSave(resign(NIGHT_TEXT, (_s, env) => void (env.version = 3))), "future_version");
  });
});
