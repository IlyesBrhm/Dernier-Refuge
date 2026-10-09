// Stockage indisponible / plein / défaillant à CHAQUE étape (lecture des slots, du pointeur, écriture,
// relecture, écriture et relecture du pointeur, quarantaine, rotation) : aucune exception, résultat
// typé, et le slot courant est préservé (on ne perd jamais la dernière sauvegarde valide).
//
// Méthode : un adaptateur trace les appels d'une exécution réussie ; on rejoue ensuite l'opération en
// faisant échouer l'appel n° k (une seule fois, ou à partir de k), pour chaque k et chaque mode.

import { type GameState } from "../../src/core/index";
import {
  commitFresh,
  createMemoryStorage,
  encodeSave,
  listQuarantine,
  loadGame,
  quarantine,
  SAVE_KEYS,
  writeSave,
  type InvalidSlotReport,
  type MemoryStorage,
  type StorageAdapter,
  type StorageResult,
  type WriteError,
  type WriteResult,
} from "../../src/save/index";
import { createInitialState } from "../../src/core/index";
import { botStep, midgame, OWNER, SAVED_AT, SEED } from "./helpers";

type Op = "getItem" | "setItem" | "removeItem" | "keys";
/** Modes « erreur » : l'appel échoue (renvoie une erreur ou lève). */
const ERROR_MODES = ["unavailable", "quota", "security", "throwQuota", "throwSecurity", "throwOther"] as const;
/** Modes « lecture faussée » : getItem répond, mais mal (donnée évincée ou abîmée en lecture). */
const READ_MODES = ["nullRead", "garbageRead"] as const;
type Mode = (typeof ERROR_MODES)[number] | (typeof READ_MODES)[number];

const WRITE_ERRORS: ReadonlySet<WriteError> = new Set<WriteError>([
  "not_owner",
  "unavailable",
  "quota",
  "too_large",
  "serialize_error",
  "invalid_state",
  "readback_mismatch",
  "future_version",
  "quarantine_failed",
]);

function named(name: string, msg: string): Error {
  const e = new Error(msg);
  e.name = name;
  return e;
}

/** Adaptateur qui délègue à `inner` mais fait échouer l'appel n° `failAt` (ou tous à partir de lui). */
function faulty(
  inner: StorageAdapter,
  opts: { failAt: number; mode: Mode; persistent: boolean } | null,
  trace?: { op: Op; key: string | undefined }[],
): StorageAdapter {
  let n = 0;
  function call<T>(op: Op, key: string | undefined, real: () => StorageResult<T>): StorageResult<T> {
    const i = n++;
    trace?.push({ op, key });
    if (!opts || (opts.persistent ? i < opts.failAt : i !== opts.failAt)) return real();
    switch (opts.mode) {
      case "unavailable":
      case "quota":
      case "security":
        return { ok: false, error: opts.mode, message: `faute injectée (${opts.mode})` };
      case "throwQuota":
        throw named("QuotaExceededError", "quota");
      case "throwSecurity":
        throw named("SecurityError", "refusé");
      case "throwOther":
        throw new TypeError("boom");
      case "nullRead":
        return op === "getItem" ? ({ ok: true, value: null } as StorageResult<T>) : real();
      case "garbageRead":
        return op === "getItem" ? ({ ok: true, value: "{garbage" } as StorageResult<T>) : real();
    }
  }
  return {
    getItem: (k) => call("getItem", k, () => inner.getItem(k)),
    setItem: (k, v) => call("setItem", k, () => inner.setItem(k, v)),
    removeItem: (k) => call("removeItem", k, () => inner.removeItem(k)),
    keys: () => call("keys", undefined, () => inner.keys()),
  };
}

// --- États et scénarios ----------------------------------------------------------------------------

let OLDER: GameState;
let OLD: GameState;
let NEW: GameState;
const text = (s: GameState, savedAt: number): string => {
  const r = encodeSave(s, { seed: SEED, savedAt });
  if (!r.ok) throw new Error(r.error);
  return r.text;
};

beforeAll(() => {
  let s = createInitialState(SEED);
  for (let i = 0; i < 150; i++) s = botStep(s);
  OLDER = s;
  for (let i = 0; i < 150; i++) s = botStep(s);
  OLD = s;
  NEW = midgame();
});

interface Scenario {
  name: string;
  build: () => MemoryStorage;
  /** État chargé avant l'opération (null : stockage sans sauvegarde valide). */
  before: () => GameState | null;
  /** Slot courant avant l'opération. */
  currentSlot: "A" | "B" | null;
  /** Slot abîmé présent avant l'opération (à mettre en quarantaine avant d'être écrasé). */
  damagedSlot?: "A" | "B";
}

const GARBAGE = '{"version":1,"abîmé":true';

const SCENARIOS: Scenario[] = [
  {
    name: "deux slots valides, pointeur sur A",
    build: () => {
      const st = createMemoryStorage();
      st.raw.set(SAVE_KEYS.A, text(OLD, SAVED_AT + 20));
      st.raw.set(SAVE_KEYS.B, text(OLDER, SAVED_AT + 10));
      st.raw.set(SAVE_KEYS.current, "A");
      return st;
    },
    before: () => OLD,
    currentSlot: "A",
  },
  {
    name: "A valide courant, B abîmé (quarantaine nécessaire)",
    build: () => {
      const st = createMemoryStorage();
      st.raw.set(SAVE_KEYS.A, text(OLD, SAVED_AT + 20));
      st.raw.set(SAVE_KEYS.B, GARBAGE);
      st.raw.set(SAVE_KEYS.current, "A");
      // Quarantaines existantes : force la rotation (suppression des plus anciennes).
      for (let i = 0; i < 3; i++) st.raw.set(`${SAVE_KEYS.quarantinePrefix}${100 + i}-0`, JSON.stringify({ quarantinedAt: 100 + i, reports: [] }));
      return st;
    },
    before: () => OLD,
    currentSlot: "A",
    damagedSlot: "B",
  },
  {
    name: "pointeur absent, B plus récent",
    build: () => {
      const st = createMemoryStorage();
      st.raw.set(SAVE_KEYS.A, text(OLDER, SAVED_AT + 10));
      st.raw.set(SAVE_KEYS.B, text(OLD, SAVED_AT + 20));
      return st;
    },
    before: () => OLD,
    currentSlot: "B",
  },
  {
    name: "stockage vide (première sauvegarde)",
    build: () => createMemoryStorage(),
    before: () => null,
    currentSlot: null,
  },
];

// Balayages exhaustifs (chaque appel × chaque mode × ponctuel/durable, ou chaque quota) : délai
// explicite et large pour rester fiable sous charge (suite complète en parallèle).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

function loadedState(st: StorageAdapter): GameState | null {
  const l = loadGame(st);
  return l.kind === "loaded" ? l.state : null;
}

/**
 * Comme `loadedState`, mais mémoïsé sur le contenu brut du stockage : de nombreuses exécutions
 * (quotas voisins, fautes sur des appels équivalents) aboutissent au même contenu ; loadGame est pur
 * vis-à-vis du contenu (vérifié par fuzz-load : il n'écrit jamais), on ne le rejoue donc pas.
 */
const LOAD_CACHE = new Map<string, GameState | null>();
function loadedStateOf(st: MemoryStorage): GameState | null {
  const key = JSON.stringify(Object.entries(st.snapshot()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  if (!LOAD_CACHE.has(key)) LOAD_CACHE.set(key, loadedState(st));
  return LOAD_CACHE.get(key) as GameState | null;
}

/** Égalité profonde (toEqual), mémoïsée par paire d'objets (les états chargés sont partagés par le cache). */
const SAME_CACHE = new WeakMap<GameState, WeakMap<GameState, boolean>>();
function same(a: GameState | null, b: GameState | null): boolean {
  if (a === null || b === null) return a === b;
  let inner = SAME_CACHE.get(a);
  if (!inner) SAME_CACHE.set(a, (inner = new WeakMap()));
  const known = inner.get(b);
  if (known !== undefined) return known;
  let eq: boolean;
  try {
    expect(a).toEqual(b);
    eq = true;
  } catch {
    eq = false;
  }
  inner.set(b, eq);
  return eq;
}

/** Vérifie un appel en échec ; renvoie les violations. */
function checkWrite(sc: Scenario, st: MemoryStorage, beforeSnap: Record<string, string>, r: WriteResult, mode: Mode, isCommit: boolean): string[] {
  const v: string[] = [];
  if (r.ok === false && !WRITE_ERRORS.has(r.error)) v.push(`erreur hors union ${String(r.error)}`);
  const strict = (ERROR_MODES as readonly string[]).includes(mode);
  const after = loadedStateOf(st);
  const allowed = [sc.before(), NEW];
  if (r.ok) {
    if (!same(after, NEW)) v.push("ok mais le nouvel état n'est pas chargé");
    // Règle 9 : commitFresh ok ⇒ les deux slots contiennent le nouvel état, y compris sous lecture faussée.
    if (isCommit && st.raw.get(SAVE_KEYS.A) !== st.raw.get(SAVE_KEYS.B)) v.push("commitFresh ok mais A ≠ B");
  } else if (!allowed.some((s) => same(after, s))) {
    v.push(`échec ${r.error} : l'état chargé n'est ni l'ancien ni le nouveau`);
  }
  // Slot courant préservé : writeSave n'écrit jamais le slot courant. Garanti pour les fautes « erreur » ;
  // une lecture faussée peut faire croire le slot courant abîmé/vide, mais l'état chargé reste alors
  // l'ancien ou le nouveau (vérifié plus haut). commitFresh, lui, écrase légitimement l'ancien slot
  // courant au second passage, une fois le premier commit réussi : seul `allowed` s'applique.
  if (strict && !isCommit && sc.currentSlot !== null) {
    const key = SAVE_KEYS[sc.currentSlot];
    if (st.raw.get(key) !== beforeSnap[key]) v.push("slot courant modifié");
  }
  // Une donnée abîmée n'est jamais écrasée sans avoir été mise en quarantaine.
  if (sc.damagedSlot && strict) {
    const key = SAVE_KEYS[sc.damagedSlot];
    if (st.raw.get(key) !== GARBAGE && !listQuarantine(st).some((q) => q.text.includes(JSON.stringify(GARBAGE).slice(1, -1)))) {
      v.push("slot abîmé écrasé sans quarantaine");
    }
  }
  return v;
}

function traceOf(sc: Scenario, run: (s: StorageAdapter) => unknown): { op: Op; key: string | undefined }[] {
  const trace: { op: Op; key: string | undefined }[] = [];
  run(faulty(sc.build(), null, trace));
  return trace;
}

describe.each(SCENARIOS)("$name", (sc) => {
  it("contrôle : sans faute, writeSave puis commitFresh réussissent", () => {
    const st = sc.build();
    expect(writeSave(st, NEW, { seed: SEED, savedAt: SAVED_AT + 99 }, OWNER).ok).toBe(true);
    expect(loadedState(st)).toEqual(NEW);
    const st2 = sc.build();
    expect(commitFresh(st2, NEW, { seed: SEED, savedAt: SAVED_AT + 99 }, OWNER).ok).toBe(true);
  });

  for (const [label, isCommit] of [
    ["writeSave", false],
    ["commitFresh", true],
  ] as const) {
    it(`${label} : faute à chaque appel du stockage, chaque mode, ponctuelle ou durable ⇒ jamais d'exception, sauvegarde préservée`, () => {
      const op = (s: StorageAdapter): WriteResult =>
        (isCommit ? commitFresh : writeSave)(s, NEW, { seed: SEED, savedAt: SAVED_AT + 99 }, OWNER);
      const trace = traceOf(sc, op);
      expect(trace.length).toBeGreaterThan(3);
      const violations: string[] = [];
      let runs = 0;
      for (let k = 0; k < trace.length; k++) {
        for (const mode of [...ERROR_MODES, ...READ_MODES]) {
          if ((READ_MODES as readonly string[]).includes(mode) && trace[k]!.op !== "getItem") continue;
          for (const persistent of [false, true]) {
            const st = sc.build();
            const before = st.snapshot();
            let r: WriteResult;
            try {
              r = op(faulty(st, { failAt: k, mode, persistent }));
            } catch (e) {
              violations.push(`EXCEPTION ${String(e)} @${k} ${trace[k]!.op}(${trace[k]!.key}) ${mode}`);
              continue;
            }
            runs++;
            for (const v of checkWrite(sc, st, before, r, mode, isCommit)) {
              violations.push(`${v} @${k} ${trace[k]!.op}(${trace[k]!.key}) ${mode}${persistent ? " durable" : ""} ⇒ ${r.ok ? "ok" : r.error}`);
            }
          }
        }
      }
      expect(runs).toBeGreaterThan(trace.length * 2);
      expect(violations).toEqual([]);
    });
  }

  it("loadGame : faute à chaque lecture ⇒ jamais d'exception, jamais d'écriture ; erreur ⇒ unavailable", () => {
    const trace = traceOf(sc, (s) => loadGame(s));
    for (let k = 0; k < trace.length; k++) {
      for (const mode of [...ERROR_MODES, ...READ_MODES]) {
        const st = sc.build();
        const before = st.snapshot();
        const r = loadGame(faulty(st, { failAt: k, mode, persistent: false }));
        expect(st.snapshot()).toEqual(before);
        if ((ERROR_MODES as readonly string[]).includes(mode)) expect(r.kind, `${k} ${mode}`).toBe("unavailable");
        else expect(["loaded", "corrupt", "fresh"]).toContain(r.kind);
      }
    }
  });
});

describe("commitFresh : les deux slots doivent contenir le nouvel état (règle 9)", () => {
  // Régression : l'ancienne implémentation (writeSave deux fois) pouvait, sur une lecture faussée du slot
  // fraîchement écrit, réécrire deux fois le même slot et renvoyer ok avec l'ancienne partie dans l'autre.
  // commitFresh écrit désormais explicitement A et B puis relit les deux slots et le pointeur.
  for (const mode of ["nullRead", "garbageRead"] as const) {
    it(`${mode} sur chaque lecture de B ⇒ ok seulement si A = B ; l'ancienne partie ne revient jamais`, () => {
      const sc = SCENARIOS[0]!;
      const trace = traceOf(sc, (s) => commitFresh(s, NEW, { seed: SEED, savedAt: SAVED_AT + 99 }, OWNER));
      const readsOfB = trace.flatMap((c, i) => (c.op === "getItem" && c.key === SAVE_KEYS.B ? [i] : []));
      expect(readsOfB.length).toBeGreaterThanOrEqual(3);
      for (const failAt of readsOfB) {
        const st = sc.build();
        const r = commitFresh(faulty(st, { failAt, mode, persistent: false }), NEW, { seed: SEED, savedAt: SAVED_AT + 99 }, OWNER);
        // Soit commitFresh signale l'échec, soit les deux slots contiennent le nouvel état.
        if (r.ok) expect(st.raw.get(SAVE_KEYS.A)).toBe(st.raw.get(SAVE_KEYS.B));
        else expect([sc.before(), NEW].some((s) => same(loadedState(st), s)), `@${failAt} ${r.error}`).toBe(true);
        if (r.ok) {
          // B s'abîme ensuite ⇒ le repli sur A donne le nouvel état, jamais l'ancienne partie.
          st.raw.set(SAVE_KEYS.B, "abîmé");
          expect(loadedState(st), `@${failAt}`).toEqual(NEW);
        }
      }
    });
  }
});

describe("quarantaine et listQuarantine sous fautes", () => {
  const report: InvalidSlotReport = { slot: "B", kind: "invalid", error: "not_json", details: [], raw: GARBAGE };
  const build = SCENARIOS[1]!.build;

  it("faute à chaque appel ⇒ booléen, jamais d'exception ; slots et pointeur intacts ; true ⇒ donnée bien conservée", () => {
    const trace = traceOf(SCENARIOS[1]!, (s) => quarantine(s, [report], 5000));
    expect(trace.some((c) => c.op === "removeItem")).toBe(true); // la rotation est bien exercée
    for (let k = 0; k < trace.length; k++) {
      for (const mode of [...ERROR_MODES, ...READ_MODES]) {
        for (const persistent of [false, true]) {
          const st = build();
          const before = st.snapshot();
          let ok = false;
          expect(() => (ok = quarantine(faulty(st, { failAt: k, mode, persistent }), [report], 5000))).not.toThrow();
          for (const key of [SAVE_KEYS.A, SAVE_KEYS.B, SAVE_KEYS.current]) expect(st.raw.get(key)).toBe(before[key]);
          if (ok) {
            expect(
              listQuarantine(st).some((q) => q.text.includes("abîmé")),
              `${k} ${trace[k]!.op} ${mode}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("listQuarantine : faute à chaque appel ⇒ tableau, jamais d'exception", () => {
    const st0 = build();
    quarantine(st0, [report], 5000);
    const snap = st0.snapshot();
    const trace: { op: Op; key: string | undefined }[] = [];
    listQuarantine(faulty(st0, null, trace));
    for (let k = 0; k < trace.length; k++) {
      for (const mode of [...ERROR_MODES, ...READ_MODES]) {
        const st = createMemoryStorage();
        for (const [key, v] of Object.entries(snap)) st.raw.set(key, v);
        let out: unknown;
        expect(() => (out = listQuarantine(faulty(st, { failAt: k, mode, persistent: false })))).not.toThrow();
        expect(Array.isArray(out)).toBe(true);
      }
    }
  });
});

describe("stockage plein à chaque étape (quota croissant)", () => {
  it.each(SCENARIOS.map((s) => [s.name, s] as const))("%s : pour tout quota, jamais d'exception ; ok ou quota/quarantine_failed ; sauvegarde préservée", (_n, sc) => {
    const base = sc.build();
    const used = [...base.raw].reduce((n, [k, v]) => n + k.length + v.length, 0);
    const newLen = text(NEW, SAVED_AT + 99).length;
    const results = new Set<string>();
    for (let extra = 0; extra <= newLen * 3 + 2000; extra += Math.max(1, Math.floor(newLen / 40))) {
      for (const isCommit of [false, true]) {
        const st = sc.build();
        const before = st.snapshot();
        st.configure({ quotaChars: used + extra });
        let r: WriteResult | undefined;
        expect(() => {
          r = (isCommit ? commitFresh : writeSave)(st, NEW, { seed: SEED, savedAt: SAVED_AT + 99 }, OWNER);
        }).not.toThrow();
        const res = r!;
        results.add(res.ok ? "ok" : res.error);
        st.configure({ quotaChars: Number.MAX_SAFE_INTEGER });
        const v = checkWrite(sc, st, before, res, "quota", isCommit);
        expect(v, `quota +${extra} ${isCommit ? "commitFresh" : "writeSave"}`).toEqual([]);
      }
    }
    expect(results.has("ok")).toBe(true);
    expect(results.has("quota") || results.has("quarantine_failed")).toBe(true);
  });
});
