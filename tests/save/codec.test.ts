import { checkInvariants, cloneState, createInitialState, type GameState } from "../../src/core/index";
import {
  CURRENT_VERSION,
  decodeSave,
  encodeSave,
  SAVE_CONFIG,
  validateSavedStateV1,
  type DecodeError,
  type DecodeResult,
} from "../../src/save/index";
import { midgame, resign, SAVED_AT, SEED, signed } from "./helpers";

const META = { seed: SEED, savedAt: SAVED_AT };

function enc(s: GameState, meta = META): string {
  const r = encodeSave(s, meta);
  if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
  return r.text;
}

function expectError(r: DecodeResult, error: DecodeError, detail?: RegExp): void {
  if (r.ok) throw new Error(`accepté alors que ${error} attendu`);
  expect(r.error, r.details.join("; ")).toBe(error);
  if (detail) expect(r.details.some((d) => detail.test(d)), r.details.join("; ")).toBe(true);
}

let MID: GameState;
let MID_TEXT: string;
beforeAll(() => {
  MID = midgame();
  MID_TEXT = enc(MID);
});

describe("aller-retour", () => {
  it("état mi-partie riche : drops, nœud épuisé, survivants en marche/au repos, slot partiel, commande en attente", () => {
    expect(MID.drops.length).toBeGreaterThan(0);
    expect(MID.nodes.some((n) => n.status === "depleted")).toBe(true);
    expect(MID.survivors.some((v) => v.path.length > 0)).toBe(true);
    expect(MID.survivors.some((v) => v.status === "resting")).toBe(true);
    expect(MID.buildSlots.some((b) => b.paid > 0 && b.paid < b.cost)).toBe(true);
    expect(MID.commandsThisTick).toBeGreaterThan(0);
    expect(MID.player.input).not.toEqual({ dx: 0, dy: 0 });
  });

  it.each([
    ["initial", () => createInitialState(SEED)],
    ["mi-partie", () => MID],
  ])("%s : decode(encode(s)) toEqual s, seed/savedAt/version restitués", (_n, make) => {
    const s = make();
    const r = decodeSave(enc(s));
    if (!r.ok) throw new Error(r.details.join("; "));
    expect(r.state).toEqual(s);
    expect(r.seed).toBe(SEED);
    expect(r.savedAt).toBe(SAVED_AT);
    expect(r.version).toBe(CURRENT_VERSION);
    expect(checkInvariants(r.state)).toEqual([]);
    // Ré-encoder donne exactement le même texte (canonique).
    expect(enc(r.state)).toBe(enc(s));
  });

  it("la carte n'est pas sérialisée ; elle est reconstruite (instance de référence)", () => {
    const env = JSON.parse(MID_TEXT) as { state: Record<string, unknown> };
    expect(Object.hasOwn(env.state, "map")).toBe(false);
    const r = decodeSave(MID_TEXT);
    expect(r.ok && r.state.map).toBe(createInitialState(1).map);
  });

  it("ordre des clés de l'état sans effet sur le texte ; enveloppe canonique", () => {
    const shuffled = { ...cloneState(MID) };
    const reordered = Object.fromEntries(Object.entries(shuffled).reverse()) as unknown as GameState;
    expect(enc(reordered)).toBe(MID_TEXT);
    expect(MID_TEXT.startsWith('{"checksum":"')).toBe(true);
    expect(MID_TEXT).toMatch(/"version":1}$/);
  });

  it("encodeSave refuse NaN / Infinity / seed ou savedAt invalides sans lever", () => {
    const nan = cloneState(MID);
    nan.resources.wood = NaN;
    expect(encodeSave(nan, META)).toMatchObject({ ok: false, error: "serialize_error" });
    const inf = cloneState(MID);
    inf.player.pos.x = Infinity;
    expect(encodeSave(inf, META)).toMatchObject({ ok: false, error: "serialize_error" });
    expect(encodeSave(MID, { seed: -1, savedAt: 0 })).toMatchObject({ ok: false, error: "serialize_error" });
    expect(encodeSave(MID, { seed: 2 ** 32, savedAt: 0 })).toMatchObject({ ok: false, error: "serialize_error" });
    expect(encodeSave(MID, { seed: 1, savedAt: 1.5 })).toMatchObject({ ok: false, error: "serialize_error" });
  });
});

describe("checksum", () => {
  it("checksum faux ⇒ bad_checksum", () => {
    const env = JSON.parse(MID_TEXT) as Record<string, unknown>;
    env.checksum = "0123456789abcdef";
    expectError(decodeSave(JSON.stringify(env)), "bad_checksum");
  });

  it("1 octet changé dans state (sans re-signer) ⇒ bad_checksum", () => {
    const tampered = MID_TEXT.replace(`"tick":${MID.tick}`, `"tick":${MID.tick + 1}`);
    expect(tampered).not.toBe(MID_TEXT);
    expectError(decodeSave(tampered), "bad_checksum");
    const wood = MID_TEXT.replace(/"wood":(\d+)}/, (_m, n: string) => `"wood":${Number(n) + 1}}`);
    expect(wood).not.toBe(MID_TEXT);
    expectError(decodeSave(wood), "bad_checksum");
  });

  it("savedAt ou seed changés ⇒ bad_checksum (ils sont signés)", () => {
    expectError(decodeSave(MID_TEXT.replace(`"savedAt":${SAVED_AT}`, `"savedAt":${SAVED_AT + 1}`)), "bad_checksum");
    expectError(decodeSave(MID_TEXT.replace(`"seed":${SEED}`, `"seed":${SEED + 1}`)), "bad_checksum");
  });

  it("1e999 (Infinity après JSON.parse) ⇒ refusé sans exception", () => {
    expectError(decodeSave(MID_TEXT.replace(`"tick":${MID.tick}`, `"tick":1e999`)), "bad_checksum");
  });

  it("checksum calculé avec un autre sel ⇒ refusé (le sel compte)", () => {
    // Un tricheur qui recalcule un hash sans le sel : hash64 de l'état seul.
    const env = JSON.parse(MID_TEXT) as Record<string, unknown>;
    env.checksum = "ffffffffffffffff";
    expectError(decodeSave(JSON.stringify(env)), "bad_checksum");
  });
});

describe("valeurs trafiquées puis RE-SIGNÉES (le checksum ne suffit pas : forme + invariants)", () => {
  type S = Record<string, unknown> & {
    resources: Record<string, unknown>;
    drops: Record<string, unknown>[];
    survivors: Record<string, unknown>[];
    buildSlots: Record<string, unknown>[];
    tents: Record<string, unknown>[];
    player: Record<string, unknown> & { pos: Record<string, unknown> };
  };
  const cases: [string, (s: S) => void, DecodeError, RegExp?][] = [
    ["bois 999 999", (s) => void (s.resources.wood = 999_999), "invariants", /ressource wood/],
    ["bois -1", (s) => void (s.resources.wood = -1), "invariants", /ressource wood/],
    ['"NaN" à la place d\'un nombre', (s) => void (s.resources.food = "NaN"), "bad_shape", /resources\.food/],
    ["null à la place d'un nombre", (s) => void (s.tick = null), "bad_shape", /state\.tick/],
    ["1.5 (non entier)", (s) => void (s.player.pos.x = 1.5), "bad_shape", /player\.pos\.x/],
    ["booléen à la place d'un nombre", (s) => void (s.nextId = true), "bad_shape", /nextId/],
    ["ids en double", (s) => void (s.drops[0]!.id = s.survivors[0]!.id), "invariants", /id dupliqué/],
    ["champ manquant", (s) => void delete s.spawnTimer, "bad_shape", /spawnTimer: clé manquante/],
    ["champ imbriqué manquant", (s) => void delete s.player.input, "bad_shape", /player\.input: clé manquante/],
    ["champ en trop", (s) => void (s.godMode = 1), "bad_shape", /godMode: clé inconnue/],
    ["ressource en trop", (s) => void (s.resources.gold = 5), "bad_shape", /resources\.gold/],
    ["carte présente", (s) => void (s.map = createInitialState(1).map), "bad_shape", /state\.map: clé inconnue/],
    [
      "__proto__",
      (s) => void Object.defineProperty(s, "__proto__", { value: { tick: 0 }, enumerable: true, writable: true, configurable: true }),
      "bad_shape",
      /__proto__/,
    ],
    ["coût de slot modifié", (s) => void (s.buildSlots[2]!.cost = 1), "invariants", /coût/],
    ["slot payé au-delà du coût", (s) => void (s.buildSlots[2]!.paid = 999), "invariants", /paid/],
    ["rng -1", (s) => void (s.rng = -1), "bad_shape", /state\.rng/],
    ["rng 2^32", (s) => void (s.rng = 2 ** 32), "bad_shape", /state\.rng/],
    ["chaîne non ASCII dans un enum", (s) => void (s.survivors[0]!.status = "réstîng"), "bad_shape", /status/],
    ["statut inconnu", (s) => void (s.tents[0]!.status = "palace"), "bad_shape", /tents\[0\]\.status/],
    ["position hors carte", (s) => void (s.player.pos.x = 999_999), "bad_shape", /player\.pos\.x/],
    ["input hors axes", (s) => void ((s.player.input as Record<string, unknown>).dx = 5), "bad_shape", /input\.dx/],
    ["tableau trop long", (s) => void (s.drops = Array.from({ length: 513 }, () => s.drops[0]!)), "bad_shape", /drops: 513/],
    [
      "tableau à la place d'un objet",
      (s) => void ((s as Record<string, unknown>).resources = [1, 2]),
      "bad_shape",
      /resources/,
    ],
    ["commandsThisTick au-delà de la limite", (s) => void (s.commandsThisTick = 999), "invariants", /commandsThisTick/],
  ];

  it.each(cases)("%s ⇒ %s", (_name, mutate, error, detail) => {
    const text = resign(MID_TEXT, (st) => mutate(st as S));
    expectError(decodeSave(text), error, detail);
  });

  it("drop de 999 999 au tick 10 ⇒ invariants (plausibilité ; un tas au sol n'a pas de plafond)", () => {
    const text = resign(enc(createInitialState(SEED)), (st) => {
      const s = st as S;
      s.tick = 10;
      s.drops = [{ id: 10, pos: { x: 7500, y: 7500 }, resource: "wood", amount: 999_999 }];
      s.nextId = 11;
    });
    expectError(decodeSave(text), "invariants", /plausibilité wood/);
  });

  it("sans trafic, re-signer ne change rien (contrôle du helper)", () => {
    const r = decodeSave(resign(MID_TEXT, () => {}));
    expect(r.ok && r.state).toEqual(MID);
  });
});

describe("enveloppe et versions", () => {
  it("version future ⇒ future_version (avec la version lue), avant le checksum", () => {
    const r = decodeSave(signed({}, CURRENT_VERSION + 1));
    expectError(r, "future_version");
    expect(!r.ok && r.version).toBe(CURRENT_VERSION + 1);
    const env = JSON.parse(MID_TEXT) as Record<string, unknown>;
    env.version = 99;
    expectError(decodeSave(JSON.stringify(env)), "future_version");
  });

  it("version 0 ou négative ⇒ unsupported_version ; non entière ⇒ bad_envelope", () => {
    expectError(decodeSave(signed(JSON.parse(MID_TEXT).state, 0)), "unsupported_version");
    expectError(decodeSave(signed({}, -3)), "unsupported_version");
    const env = JSON.parse(MID_TEXT) as Record<string, unknown>;
    env.version = 1.5;
    expectError(decodeSave(JSON.stringify(env)), "bad_envelope");
  });

  it.each([
    ["clé en trop", (e: Record<string, unknown>) => void (e.extra = 1)],
    ["clé manquante", (e: Record<string, unknown>) => void delete e.seed],
    ["seed négatif", (e: Record<string, unknown>) => void (e.seed = -1)],
    ["savedAt chaîne", (e: Record<string, unknown>) => void (e.savedAt = "hier")],
    ["checksum mal formé", (e: Record<string, unknown>) => void (e.checksum = "XYZ")],
    ["state tableau", (e: Record<string, unknown>) => void (e.state = [])],
    ["state null", (e: Record<string, unknown>) => void (e.state = null)],
  ])("%s ⇒ bad_envelope", (_n, mutate) => {
    const env = JSON.parse(MID_TEXT) as Record<string, unknown>;
    mutate(env);
    expectError(decodeSave(JSON.stringify(env)), "bad_envelope");
  });

  it.each([
    ["chaîne vide", "", "empty"],
    ['"null"', "null", "bad_envelope"],
    ['"[]"', "[]", "bad_envelope"],
    ['"{}"', "{}", "bad_envelope"],
    ['"42"', "42", "bad_envelope"],
    ["texte aléatoire", "x7#é%{]¤ not json at all", "not_json"],
    ["JSON tronqué", "", "not_json"],
    ["300 Ko", "x".repeat(300 * 1024), "too_large"],
  ] as [string, string, DecodeError][])("%s ⇒ %s, sans exception", (_n, text, error) => {
    const input = _n === "JSON tronqué" ? MID_TEXT.slice(0, MID_TEXT.length / 2) : text;
    expect(() => decodeSave(input)).not.toThrow();
    expectError(decodeSave(input), error);
  });

  it("entrée non chaîne ⇒ not_json, sans exception", () => {
    for (const v of [undefined, null, 42, {}, [], Symbol("x")]) {
      expect(() => decodeSave(v)).not.toThrow();
      expectError(decodeSave(v), "not_json");
    }
  });

  it("maxBytes personnalisé respecté", () => {
    expectError(decodeSave(MID_TEXT, { maxBytes: 100 }), "too_large");
    expect(decodeSave(MID_TEXT, { maxBytes: SAVE_CONFIG.maxSaveChars }).ok).toBe(true);
  });

  it("JSON très imbriqué signé ⇒ refusé sans exception", () => {
    const deep = `${"[".repeat(5000)}${"]".repeat(5000)}`;
    const text = MID_TEXT.replace(`"tick":${MID.tick}`, `"tick":${deep}`);
    expect(() => decodeSave(text)).not.toThrow();
    expect(decodeSave(text).ok).toBe(false);
  });
});

describe("validateSavedStateV1 (forme seule)", () => {
  it("état valide ⇒ aucune erreur", () => {
    const { map: _m, ...saved } = MID;
    expect(validateSavedStateV1(saved)).toEqual([]);
  });

  it("NaN et Infinity refusés même s'ils ne viennent pas de JSON", () => {
    const { map: _m, ...saved } = cloneState(MID);
    saved.resources.wood = NaN;
    saved.player.pos.y = Infinity;
    const errs = validateSavedStateV1(saved);
    expect(errs.some((e) => e.includes("resources.wood"))).toBe(true);
    expect(errs.some((e) => e.includes("player.pos.y"))).toBe(true);
  });

  it("chemins d'erreur précis et nombre d'erreurs borné", () => {
    const { map: _m, ...saved } = cloneState(MID);
    (saved.survivors[1]!.pos as unknown as Record<string, unknown>).x = "a";
    expect(validateSavedStateV1(saved)).toContain('state.survivors[1].pos.x: entier sûr attendu ("a")');
    const many = { ...saved, drops: Array.from({ length: 500 }, () => ({ bad: 1 })) };
    expect(validateSavedStateV1(many).length).toBeLessThanOrEqual(SAVE_CONFIG.maxShapeErrors + 1);
  });

  it("non-objets ⇒ erreur, sans exception", () => {
    for (const v of [null, undefined, 1, "s", [], new Date()]) expect(validateSavedStateV1(v).length).toBeGreaterThan(0);
  });
});
