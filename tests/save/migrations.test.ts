import { createInitialState } from "../../src/core/index";
import { CURRENT_VERSION, decodeSave, encodeSave, migrate, migrations, type MigrationRegistry } from "../../src/save/index";
import { SAVED_AT, SEED, signed } from "./helpers";

describe("registre officiel", () => {
  it("une migration pour chaque version 1..CURRENT_VERSION-1, rien au-delà", () => {
    for (let v = 1; v < CURRENT_VERSION; v++) expect(typeof migrations[v]).toBe("function");
    const keys = Object.keys(migrations).map(Number);
    expect(keys.every((k) => k >= 1 && k < CURRENT_VERSION)).toBe(true);
  });

  it("version courante ⇒ aucune étape, état inchangé (même référence)", () => {
    const raw = { a: 1 };
    expect(migrate(raw, CURRENT_VERSION)).toEqual({ ok: true, raw });
  });
});

describe("migrate avec un registre factice", () => {
  const calls: string[] = [];
  const registry: MigrationRegistry = {
    1: (raw) => {
      calls.push("1→2");
      return { ...(raw as object), added: true };
    },
    2: (raw) => {
      calls.push("2→3");
      const r = raw as { added: boolean };
      return { ...r, added: undefined, renamed: r.added };
    },
  };

  beforeEach(() => void (calls.length = 0));

  it("applique les étapes dans l'ordre jusqu'à la cible", () => {
    const r = migrate({ x: 1 }, 1, { registry, target: 3 });
    expect(calls).toEqual(["1→2", "2→3"]);
    expect(r).toEqual({ ok: true, raw: { x: 1, added: undefined, renamed: true } });
  });

  it("part de la version lue (v2 ⇒ seulement 2→3)", () => {
    migrate({ added: false }, 2, { registry, target: 3 });
    expect(calls).toEqual(["2→3"]);
  });

  it("étape manquante ⇒ échec explicite", () => {
    const r = migrate({}, 1, { registry: { 1: registry[1]! }, target: 3 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.details[0]).toMatch(/v2 → v3 manquante/);
  });

  it("étape qui lève ⇒ échec, sans exception", () => {
    const boom: MigrationRegistry = {
      1: () => {
        throw new Error("boom");
      },
    };
    expect(() => migrate({}, 1, { registry: boom, target: 2 })).not.toThrow();
    expect(migrate({}, 1, { registry: boom, target: 2 })).toMatchObject({ ok: false });
  });

  it("version source hors bornes ⇒ échec", () => {
    expect(migrate({}, 0, { registry, target: 3 }).ok).toBe(false);
    expect(migrate({}, 4, { registry, target: 3 }).ok).toBe(false);
  });

  it("une clé héritée du prototype n'est pas une migration", () => {
    const r = migrate({}, 1, { registry: Object.create({ 1: () => ({}) }) as MigrationRegistry, target: 2 });
    expect(r.ok).toBe(false);
  });
});

describe("pipeline decodeSave avec une fausse migration (jeu simulé en v3)", () => {
  // Save produite par le jeu actuel (v2), lue par un « jeu v3 » simulé.
  const v2Text = (() => {
    const r = encodeSave(createInitialState(SEED), { seed: SEED, savedAt: SAVED_AT });
    if (!r.ok) throw new Error(r.error);
    return r.text;
  })();

  it("la save courante est bien en v2", () => {
    expect(CURRENT_VERSION).toBe(2);
    expect(v2Text).toMatch(/"version":2}$/);
  });

  it("une save v2 est migrée v2 → v3 AVANT la validation, puis acceptée", () => {
    let called = 0;
    const registry: MigrationRegistry = {
      2: (raw) => {
        called++;
        return raw; // v3 factice : même forme
      },
    };
    const r = decodeSave(v2Text, { registry, currentVersion: 3 });
    expect(called).toBe(1);
    expect(r.ok && r.version).toBe(2);
    expect(r.ok && r.state).toEqual(createInitialState(SEED));
  });

  it("le checksum est vérifié sur l'état stocké, avant migration", () => {
    let called = 0;
    const registry: MigrationRegistry = { 2: (raw) => (called++, raw) };
    const r = decodeSave(v2Text.replace('"tick":0', '"tick":1'), { registry, currentVersion: 3 });
    expect(r).toMatchObject({ ok: false, error: "bad_checksum" });
    expect(called).toBe(0);
  });

  it("la validation porte sur le RÉSULTAT de la migration (une migration ne peut pas faire passer un état invalide)", () => {
    const registry: MigrationRegistry = { 2: (raw) => ({ ...(raw as object), extra: 1 }) };
    expect(decodeSave(v2Text, { registry, currentVersion: 3 })).toMatchObject({ ok: false, error: "bad_shape" });
    const cheat: MigrationRegistry = {
      2: (raw) => ({ ...(raw as object), resources: { wood: 99_999, food: 5, stone: 0, water: 5, coins: 0 } }),
    };
    expect(decodeSave(v2Text, { registry: cheat, currentVersion: 3 })).toMatchObject({ ok: false, error: "invariants" });
  });

  it("étape manquante ⇒ migration_failed ; étape qui lève ⇒ migration_failed", () => {
    expect(decodeSave(v2Text, { registry: {}, currentVersion: 3 })).toMatchObject({ ok: false, error: "migration_failed" });
    const boom: MigrationRegistry = {
      2: () => {
        throw new Error("boom");
      },
    };
    expect(decodeSave(v2Text, { registry: boom, currentVersion: 3 })).toMatchObject({
      ok: false,
      error: "migration_failed",
      details: [expect.stringMatching(/boom/)],
    });
  });

  it("une save déjà en v3 n'est pas migrée", () => {
    let called = 0;
    const registry: MigrationRegistry = { 2: (raw) => (called++, raw) };
    const state = (JSON.parse(v2Text) as { state: unknown }).state;
    const r = decodeSave(signed(state, 3), { registry, currentVersion: 3 });
    expect(called).toBe(0);
    expect(r.ok && r.version).toBe(3);
  });
});

describe("version 3 (future) avec le vrai jeu", () => {
  it("refusée en future_version, même avec un état v2 valide", () => {
    const enc = encodeSave(createInitialState(SEED), { seed: SEED, savedAt: SAVED_AT });
    if (!enc.ok) throw new Error(enc.error);
    const state = (JSON.parse(enc.text) as { state: unknown }).state;
    expect(decodeSave(signed(state, 3))).toMatchObject({ ok: false, error: "future_version", version: 3 });
  });
});
