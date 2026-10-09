// Préférences (docs/design/ui-polish.md §2.2) : clé séparée, validation champ par champ, ne lève jamais,
// stockage défaillant toléré, et isolement total vis-à-vis des slots / quarantaine / verrou.

import { describe, expect, it } from "vitest";
import { createInitialState } from "../../src/core/index";
import {
  commitFresh,
  createLeaseLock,
  createMemoryStorage,
  DEFAULT_PREFS,
  defaultPrefs,
  defaultQuality,
  effectiveReducedMotion,
  listQuarantine,
  loadGame,
  loadPrefs,
  parsePrefs,
  PREFS_KEY,
  PREFS_MAX_CHARS,
  quarantine,
  resolveQuality,
  SAVE_CONFIG,
  SAVE_KEYS,
  savePrefs,
  serializePrefs,
  writeSave,
  type Prefs,
  type StorageAdapter,
  type StorageResult,
} from "../../src/save/index";
import { OWNER, SAVED_AT, SEED } from "./helpers";

/** Préférences valides, toutes différentes des défauts. */
const CUSTOM: Prefs = {
  version: 1,
  quality: "low",
  fullscreen: true,
  muted: true,
  sfxVolume: 35,
  ambienceVolume: 0,
  reducedMotion: "on",
  tutorial: { status: "active", done: 0b101011 },
};

function withField(patch: Record<string, unknown>): string {
  return JSON.stringify({ ...CUSTOM, ...patch });
}
function withTutorial(patch: Record<string, unknown>): string {
  return JSON.stringify({ ...CUSTOM, tutorial: { ...CUSTOM.tutorial, ...patch } });
}

describe("défauts", () => {
  it("valeurs du plan", () => {
    expect(defaultPrefs()).toEqual({
      version: 1,
      quality: null,
      fullscreen: false,
      muted: false,
      sfxVolume: 80,
      ambienceVolume: 60,
      reducedMotion: "system",
      tutorial: { status: "pending", done: 0 },
    });
    expect(PREFS_KEY).toBe("dernier-refuge.prefs");
  });

  it("DEFAULT_PREFS est gelé, defaultPrefs() renvoie une copie neuve", () => {
    expect(Object.isFrozen(DEFAULT_PREFS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFS.tutorial)).toBe(true);
    const a = defaultPrefs();
    a.tutorial.done = 5;
    a.sfxVolume = 1;
    expect(defaultPrefs().tutorial.done).toBe(0);
    expect(DEFAULT_PREFS.sfxVolume).toBe(80);
  });

  it("aides : mouvement réduit effectif et qualité de l'appareil", () => {
    expect(effectiveReducedMotion("on", false)).toBe(true);
    expect(effectiveReducedMotion("off", true)).toBe(false);
    expect(effectiveReducedMotion("system", true)).toBe(true);
    expect(effectiveReducedMotion("system", false)).toBe(false);
    expect(defaultQuality(true)).toBe("medium");
    expect(defaultQuality(false)).toBe("high");
    expect(resolveQuality(null, true)).toBe("medium");
    expect(resolveQuality("low", false)).toBe("low");
  });
});

describe("aller-retour", () => {
  it("serializePrefs → parsePrefs redonne les mêmes valeurs (ok)", () => {
    for (const p of [defaultPrefs(), CUSTOM]) {
      const r = parsePrefs(serializePrefs(p));
      expect(r.status).toBe("ok");
      expect(r.prefs).toEqual(p);
    }
  });

  it("chaque valeur d'énumération survit à l'aller-retour", () => {
    for (const quality of [null, "low", "medium", "high"] as const) {
      for (const reducedMotion of ["system", "on", "off"] as const) {
        for (const status of ["pending", "active", "done", "skipped"] as const) {
          const p: Prefs = { ...CUSTOM, quality, reducedMotion, tutorial: { status, done: 63 } };
          expect(parsePrefs(serializePrefs(p))).toEqual({ prefs: p, status: "ok" });
        }
      }
    }
  });

  it("sérialisation canonique : ordre des clés indifférent", () => {
    const shuffled = { tutorial: { done: 3, status: "done" }, muted: true, version: 1 } as unknown as Prefs;
    const ordered = { version: 1, muted: true, tutorial: { status: "done", done: 3 } } as unknown as Prefs;
    expect(serializePrefs(shuffled)).toBe(serializePrefs(ordered));
    const text = serializePrefs(CUSTOM);
    const keys = Object.keys(JSON.parse(text) as object);
    expect(keys).toEqual([...keys].sort());
  });

  it("serializePrefs normalise un objet en mémoire abîmé, sans lever", () => {
    const bad = { ...CUSTOM, sfxVolume: Number.NaN, ambienceVolume: Infinity, extra: 1 } as unknown as Prefs;
    const text = serializePrefs(bad);
    const r = parsePrefs(text);
    expect(r.status).toBe("ok");
    expect(r.prefs).toEqual({ ...CUSTOM, sfxVolume: 80, ambienceVolume: 60 });
    expect(text).not.toContain("extra");
    expect(() => serializePrefs(null as unknown as Prefs)).not.toThrow();
    expect(parsePrefs(serializePrefs(null as unknown as Prefs)).prefs).toEqual(defaultPrefs());
  });
});

describe("parsePrefs : enveloppe", () => {
  it.each([[null], [undefined], [""], [42], [{}], [[]], [true]])("non-chaîne ou vide %j ⇒ missing", (raw) => {
    expect(parsePrefs(raw)).toEqual({ prefs: defaultPrefs(), status: "missing" });
  });

  it.each([
    ["JSON invalide", "{oops"],
    ["tableau", "[]"],
    ["nombre", "42"],
    ["null JSON", "null"],
    ["chaîne JSON", '"x"'],
    ["version future", withField({ version: 2 })],
    ["version ancienne", withField({ version: 0 })],
    ["version en chaîne", withField({ version: "1" })],
    ["version absente", JSON.stringify({ ...CUSTOM, version: undefined })],
    ["version NaN (null en JSON)", withField({ version: null })],
  ])("%s ⇒ tous les défauts (invalid)", (_label, raw) => {
    expect(parsePrefs(raw)).toEqual({ prefs: defaultPrefs(), status: "invalid" });
  });

  it("texte > PREFS_MAX_CHARS ⇒ invalid, même s'il est du JSON valide", () => {
    const huge = JSON.stringify({ ...CUSTOM, pad: "x".repeat(PREFS_MAX_CHARS) });
    expect(huge.length).toBeGreaterThan(PREFS_MAX_CHARS);
    expect(parsePrefs(huge)).toEqual({ prefs: defaultPrefs(), status: "invalid" });
    expect(parsePrefs("x".repeat(5_000_000)).status).toBe("invalid");
  });

  it("clés inconnues ignorées (ok) puis supprimées à la réécriture", () => {
    const raw = withField({ futureOption: true, nested: { a: 1 } });
    const r = parsePrefs(raw);
    expect(r).toEqual({ prefs: CUSTOM, status: "ok" });
    expect(serializePrefs(r.prefs)).not.toContain("futureOption");
  });

  it("ne lève jamais (entrées variées)", () => {
    const inputs: unknown[] = [
      "{", "}", "\u0000", "[1,2", '{"version":1,"tutorial":[]}', '{"version":1,"tutorial":null}',
      '{"version":1,"__proto__":{"muted":true}}', Symbol("x"), () => 1, 10n,
      "{".repeat(3000), "[".repeat(4000),
    ];
    for (const raw of inputs) expect(() => parsePrefs(raw)).not.toThrow();
  });
});

describe("parsePrefs : champ par champ (repaired)", () => {
  const cases: [string, string, Partial<Prefs>][] = [
    ["volume effets 150", withField({ sfxVolume: 150 }), { sfxVolume: 80 }],
    ["volume effets −1", withField({ sfxVolume: -1 }), { sfxVolume: 80 }],
    ["volume effets 33,5", withField({ sfxVolume: 33.5 }), { sfxVolume: 80 }],
    ["volume effets \"80\"", withField({ sfxVolume: "80" }), { sfxVolume: 80 }],
    ["volume effets null (NaN sérialisé)", withField({ sfxVolume: Number.NaN }), { sfxVolume: 80 }],
    ["volume effets 1e999 (Infinity)", '{"version":1,"sfxVolume":1e999}', {}],
    ["volume ambiance 101", withField({ ambienceVolume: 101 }), { ambienceVolume: 60 }],
    ["volume ambiance booléen", withField({ ambienceVolume: true }), { ambienceVolume: 60 }],
    ["qualité \"ultra\"", withField({ quality: "ultra" }), { quality: null }],
    ["qualité \"LOW\"", withField({ quality: "LOW" }), { quality: null }],
    ["qualité nombre", withField({ quality: 2 }), { quality: null }],
    ["plein écran \"true\"", withField({ fullscreen: "true" }), { fullscreen: false }],
    ["son coupé 1", withField({ muted: 1 }), { muted: false }],
    ["mouvement réduit true", withField({ reducedMotion: true }), { reducedMotion: "system" }],
    ["mouvement réduit inconnu", withField({ reducedMotion: "reduce" }), { reducedMotion: "system" }],
    ["tutoriel.done 64", withTutorial({ done: 64 }), { tutorial: { status: "active", done: 0 } }],
    ["tutoriel.done −1", withTutorial({ done: -1 }), { tutorial: { status: "active", done: 0 } }],
    ["tutoriel.done 1,5", withTutorial({ done: 1.5 }), { tutorial: { status: "active", done: 0 } }],
    ["tutoriel.status inconnu", withTutorial({ status: "finished" }), { tutorial: { status: "pending", done: 43 } }],
    ["tutoriel non objet", withField({ tutorial: "done" }), { tutorial: { status: "pending", done: 0 } }],
    ["tutoriel tableau", withField({ tutorial: ["done", 63] }), { tutorial: { status: "pending", done: 0 } }],
    ["tutoriel null", withField({ tutorial: null }), { tutorial: { status: "pending", done: 0 } }],
  ];

  it.each(cases)("%s ⇒ défaut de ce champ seulement", (_label, raw, expectedPatch) => {
    const r = parsePrefs(raw);
    expect(r.status).toBe("repaired");
    if (Object.keys(expectedPatch).length > 0) expect(r.prefs).toEqual({ ...CUSTOM, ...expectedPatch });
  });

  it("Infinity (1e999) : seul le champ concerné revient au défaut", () => {
    const r = parsePrefs('{"version":1,"sfxVolume":1e999,"muted":true}');
    expect(r.status).toBe("repaired");
    expect(r.prefs.sfxVolume).toBe(80);
    expect(r.prefs.muted).toBe(true);
  });

  it("champ absent ⇒ défaut de ce champ, autres conservés", () => {
    const r = parsePrefs(JSON.stringify({ version: 1, muted: true }));
    expect(r.status).toBe("repaired");
    expect(r.prefs).toEqual({ ...defaultPrefs(), muted: true });
  });

  it("bornes acceptées : 0 et 100, done 0 et 63", () => {
    expect(parsePrefs(withField({ sfxVolume: 0, ambienceVolume: 100 })).status).toBe("ok");
    expect(parsePrefs(withTutorial({ done: 0 })).status).toBe("ok");
    expect(parsePrefs(withTutorial({ done: 63 })).status).toBe("ok");
  });

  it("plusieurs champs abîmés : chacun réparé indépendamment", () => {
    const r = parsePrefs(withField({ sfxVolume: 999, quality: "ultra", fullscreen: null }));
    expect(r).toEqual({
      status: "repaired",
      prefs: { ...CUSTOM, sfxVolume: 80, quality: null, fullscreen: false },
    });
  });

  it("__proto__ : aucune valeur héritée, aucune pollution du prototype", () => {
    const top = parsePrefs('{"version":1,"__proto__":{"muted":true,"sfxVolume":5}}');
    expect(top.status).toBe("repaired");
    expect(top.prefs).toEqual(defaultPrefs());

    const tut = parsePrefs(
      '{"version":1,"quality":"low","fullscreen":false,"muted":false,"sfxVolume":80,"ambienceVolume":60,' +
        '"reducedMotion":"system","tutorial":{"__proto__":{"status":"skipped","done":63}}}',
    );
    expect(tut.status).toBe("repaired");
    expect(tut.prefs.tutorial).toEqual({ status: "pending", done: 0 });
    expect(tut.prefs.quality).toBe("low");

    // `__proto__` avec des champs propres valides : ceux-ci sont gardés, statut repaired (clé dangereuse).
    const mixed = parsePrefs(withField({}).replace("{", '{"__proto__":{"x":1},'));
    expect(mixed.status).toBe("repaired");
    expect(mixed.prefs).toEqual(CUSTOM);

    expect(({} as Record<string, unknown>).muted).toBeUndefined();
    expect(({} as Record<string, unknown>).status).toBeUndefined();
  });

  it("le résultat est un objet neuf, sans clé en trop", () => {
    const r = parsePrefs(withField({ zzz: 1 }));
    expect(Object.keys(r.prefs).sort()).toEqual(Object.keys(DEFAULT_PREFS).sort());
    expect(Object.keys(r.prefs.tutorial).sort()).toEqual(["done", "status"]);
  });
});

describe("loadPrefs / savePrefs : stockage", () => {
  it("rien de stocké ⇒ défauts (missing), sans erreur de stockage", () => {
    const r = loadPrefs(createMemoryStorage());
    expect(r).toEqual({ prefs: defaultPrefs(), status: "missing" });
  });

  it("savePrefs puis loadPrefs : aller-retour par PREFS_KEY uniquement", () => {
    const s = createMemoryStorage();
    expect(savePrefs(s, CUSTOM)).toBe(true);
    expect(Object.keys(s.snapshot())).toEqual([PREFS_KEY]);
    expect(loadPrefs(s)).toEqual({ prefs: CUSTOM, status: "ok" });
  });

  it("valeur abîmée en stockage ⇒ réparée champ par champ", () => {
    const s = createMemoryStorage();
    s.raw.set(PREFS_KEY, withField({ ambienceVolume: 999 }));
    expect(loadPrefs(s)).toEqual({ prefs: { ...CUSTOM, ambienceVolume: 60 }, status: "repaired" });
  });

  it("lecture indisponible ⇒ défauts + storageError, sans exception", () => {
    const s = createMemoryStorage({ failGet: true });
    const r = loadPrefs(s);
    expect(r.prefs).toEqual(defaultPrefs());
    expect(r.status).toBe("missing");
    expect(r.storageError).toBe("unavailable");
  });

  it("adaptateur qui LÈVE en lecture ⇒ défauts, sans exception", () => {
    const s = createMemoryStorage({ failGet: true, throws: true });
    expect(() => loadPrefs(s)).not.toThrow();
    expect(loadPrefs(s).prefs).toEqual(defaultPrefs());
    const exploding = { getItem: () => { throw new Error("boom"); } } as unknown as StorageAdapter;
    expect(loadPrefs(exploding).prefs).toEqual(defaultPrefs());
  });

  it.each(["quota", "security", "unavailable"] as const)("écriture refusée (%s) ⇒ false, sans exception", (kind) => {
    const s = createMemoryStorage({ failSet: kind });
    expect(savePrefs(s, CUSTOM)).toBe(false);
    s.configure({ throws: true });
    expect(() => savePrefs(s, CUSTOM)).not.toThrow();
    expect(savePrefs(s, CUSTOM)).toBe(false);
  });

  it("stockage plein (quota) ⇒ false ; l'ancienne valeur reste intacte", () => {
    const s = createMemoryStorage();
    expect(savePrefs(s, CUSTOM)).toBe(true);
    s.configure({ quotaChars: 10 });
    expect(savePrefs(s, { ...CUSTOM, muted: false })).toBe(false);
    expect(loadPrefs(s).prefs).toEqual(CUSTOM);
  });

  it("savePrefs n'écrit jamais un objet abîmé tel quel", () => {
    const s = createMemoryStorage();
    expect(savePrefs(s, { ...CUSTOM, sfxVolume: 1e9 })).toBe(true);
    expect(loadPrefs(s)).toEqual({ prefs: { ...CUSTOM, sfxVolume: 80 }, status: "ok" });
  });
});

// --- Isolement de la clé -------------------------------------------------------------------------

type Touch = { op: "get" | "set" | "remove"; key: string };

/** Adaptateur qui trace toutes les clés lues / écrites / supprimées. */
function traced(inner: StorageAdapter, log: Touch[]): StorageAdapter {
  return {
    getItem(key): StorageResult<string | null> {
      log.push({ op: "get", key });
      return inner.getItem(key);
    },
    setItem(key, value) {
      log.push({ op: "set", key });
      return inner.setItem(key, value);
    },
    removeItem(key) {
      log.push({ op: "remove", key });
      return inner.removeItem(key);
    },
    keys: () => inner.keys(),
  };
}

describe("isolement de PREFS_KEY", () => {
  it("PREFS_KEY n'est aucune clé de sauvegarde et n'a pas le préfixe de quarantaine", () => {
    const saveKeys: string[] = Object.values(SAVE_KEYS);
    expect(saveKeys).not.toContain(PREFS_KEY);
    expect(PREFS_KEY.startsWith(SAVE_KEYS.quarantinePrefix)).toBe(false);
    expect(PREFS_KEY.startsWith(SAVE_CONFIG.keyPrefix)).toBe(true);
  });

  it("slots, nouvelle partie / import, quarantaine + rotation et verrou ne touchent jamais PREFS_KEY", () => {
    const mem = createMemoryStorage();
    const prefsText = serializePrefs(CUSTOM);
    mem.raw.set(PREFS_KEY, prefsText);
    const log: Touch[] = [];
    const s = traced(mem, log);

    const state = createInitialState(SEED);
    // Chargement vide, écriture, rechargement.
    expect(loadGame(s).kind).toBe("fresh");
    expect(writeSave(s, state, { seed: SEED, savedAt: SAVED_AT }, OWNER).ok).toBe(true);
    expect(writeSave(s, state, { seed: SEED, savedAt: SAVED_AT + 1 }, OWNER).ok).toBe(true);
    expect(loadGame(s).kind).toBe("loaded");

    // Données abîmées dans les deux slots ⇒ corrupt ; quarantaine répétée au-delà de la rotation.
    for (let i = 0; i < SAVE_CONFIG.maxQuarantine + 3; i++) {
      mem.raw.set(SAVE_KEYS.A, `abîmé A ${i}`);
      mem.raw.set(SAVE_KEYS.B, `abîmé B ${i}`);
      const r = loadGame(s);
      expect(r.kind).toBe("corrupt");
      if (r.kind === "corrupt") expect(quarantine(s, r.damaged, SAVED_AT + i)).toBe(true);
    }
    expect(listQuarantine(s).length).toBe(SAVE_CONFIG.maxQuarantine);
    expect(listQuarantine(s).some((q) => q.key === PREFS_KEY)).toBe(false);

    // Nouvelle partie / import (commitFresh) par-dessus des slots abîmés.
    mem.raw.set(SAVE_KEYS.A, "encore abîmé");
    expect(commitFresh(s, state, { seed: SEED, savedAt: SAVED_AT + 100 }, OWNER).ok).toBe(true);

    // Verrou multi-onglets.
    let now = SAVED_AT;
    const lock = createLeaseLock({ storage: s, tabId: "tab-1", now: () => now });
    expect(lock.tryAcquire()).toBe(true);
    now += 1000;
    lock.heartbeat();
    expect(lock.isOwner()).toBe(true);
    lock.release();

    expect(log.length).toBeGreaterThan(0);
    expect(log.filter((t) => t.key === PREFS_KEY)).toEqual([]);
    expect(mem.raw.get(PREFS_KEY)).toBe(prefsText);
  });

  it("loadPrefs / savePrefs ne touchent que PREFS_KEY (slots, pointeur, quarantaine, verrou intacts)", () => {
    const mem = createMemoryStorage();
    const state = createInitialState(SEED);
    expect(writeSave(mem, state, { seed: SEED, savedAt: SAVED_AT }, OWNER).ok).toBe(true);
    mem.raw.set(`${SAVE_KEYS.quarantinePrefix}1-0`, "q");
    mem.raw.set(SAVE_KEYS.lock, '{"owner":"x","expiresAt":1}');
    const before = mem.snapshot();

    const log: Touch[] = [];
    const s = traced(mem, log);
    loadPrefs(s);
    savePrefs(s, CUSTOM);
    loadPrefs(s);
    savePrefs(s, defaultPrefs());

    expect(log.every((t) => t.key === PREFS_KEY)).toBe(true);
    const after = mem.snapshot();
    delete after[PREFS_KEY];
    expect(after).toEqual(before);
    expect(loadGame(mem).kind).toBe("loaded");
  });

  it("préférences abîmées n'affectent pas le chargement de la partie (et inversement)", () => {
    const mem = createMemoryStorage();
    expect(writeSave(mem, createInitialState(SEED), { seed: SEED, savedAt: SAVED_AT }, OWNER).ok).toBe(true);
    mem.raw.set(PREFS_KEY, "{oops");
    expect(loadGame(mem).kind).toBe("loaded");
    expect(loadPrefs(mem).status).toBe("invalid");

    mem.raw.set(PREFS_KEY, serializePrefs(CUSTOM));
    mem.raw.set(SAVE_KEYS.A, "abîmé");
    mem.raw.set(SAVE_KEYS.B, "abîmé");
    expect(loadGame(mem).kind).toBe("corrupt");
    expect(loadPrefs(mem)).toEqual({ prefs: CUSTOM, status: "ok" });
  });
});
