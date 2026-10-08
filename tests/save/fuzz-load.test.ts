// Fuzz du chargeur (docs/design/save.md §6, exigence explicite). RNG seedé du core : entièrement
// déterministe. À partir de sauvegardes valides de plusieurs moments de partie, des milliers de
// mutations du texte (octets, troncature, insertion) et de la structure JSON (suppression / ajout de
// champ, changement de type, NaN-like, nombres énormes, tableaux géants, ids dupliqués, valeurs
// négatives, enums), avec ET sans re-signature du checksum.
//
// Propriétés :
// - decodeSave / importSave ne lèvent JAMAIS ;
// - soit ok : l'état passe checkInvariants, sa carte est referenceMap(), il n'a pas été « réparé »
//   (identique à ce qui est stocké), et il supporte 100 tick() sans exception en restant valide ;
// - soit un refus typé (error ∈ DecodeError, details non vide) ;
// - loadGame sur un stockage dont les deux slots sont mutés ne lève jamais, n'écrit rien, renvoie un
//   résultat cohérent avec le décodage de chaque slot, et la suite (quarantaine, écriture) fonctionne.

import { checkInvariants, createInitialState, referenceMap, tick, type GameState } from "../../src/core/index";
import { nextRandom, type RngState } from "../../src/core/rng";
import {
  canonicalStringify,
  commitFresh,
  computeChecksum,
  createMemoryStorage,
  CURRENT_VERSION,
  decodeSave,
  encodeSave,
  importSave,
  listQuarantine,
  loadGame,
  quarantine,
  SAVE_CONFIG,
  SAVE_KEYS,
  toSavedState,
  writeSave,
  type DecodeError,
  type DecodeResult,
  type LoadResult,
} from "../../src/save/index";
import { botStep, midgame, OWNER, SAVED_AT } from "./helpers";

const ALL_ERRORS: ReadonlySet<DecodeError> = new Set<DecodeError>([
  "too_large",
  "empty",
  "not_json",
  "bad_envelope",
  "unsupported_version",
  "future_version",
  "bad_checksum",
  "migration_failed",
  "bad_shape",
  "invariants",
]);

const CASES = 6000;
const STORAGE_CASES = 1200;
const TICKS_AFTER_LOAD = 100;

// --- RNG du fuzz (core, seedé) ----------------------------------------------------------------

class Fuzz {
  constructor(private s: RngState) {}
  float(): number {
    const [r, n] = nextRandom(this.s);
    this.s = n;
    return r;
  }
  int(n: number): number {
    return Math.floor(this.float() * n);
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(xs.length)] as T;
  }
  chance(p: number): boolean {
    return this.float() < p;
  }
}

// --- Sauvegardes de base -----------------------------------------------------------------------

interface Base {
  name: string;
  text: string;
}

function encode(s: GameState, seed: number): string {
  const r = encodeSave(s, { seed, savedAt: SAVED_AT + s.tick });
  if (!r.ok) throw new Error(r.error);
  return r.text;
}

function makeBases(): Base[] {
  const bases: Base[] = [];
  for (const seed of [7, 4242, 31_337, 0xffffffff]) {
    const marks = new Set([0, 37, 400, 1200, 2500]);
    let s = createInitialState(seed);
    for (let t = 0; t <= 2500; t++) {
      if (marks.has(t)) bases.push({ name: `seed ${seed} tick ${t}`, text: encode(s, seed) });
      s = botStep(s);
    }
  }
  bases.push({ name: "mi-partie riche", text: encode(midgame(), 4242) });
  return bases;
}

// --- Mutations ----------------------------------------------------------------------------------

type Json = unknown;
type Container = Record<string, Json> | Json[];
interface Slot {
  parent: Container;
  key: string | number;
}

const ENUM_STRINGS = [
  "toQueue",
  "queued",
  "walkingToTent",
  "resting",
  "leaving",
  "free",
  "assigned",
  "occupied",
  "messy",
  "ready",
  "depleted",
  "tree",
  "bush",
  "wood",
  "food",
  "stone",
  "water",
  "coins",
  "",
  "réstîng",
  "__proto__",
];
const KEY_NAMES = ["map", "godMode", "__proto__", "id", "x", "tick", "constructor", "wood", "gold", "path"];

function containersOf(root: Json): Container[] {
  const out: Container[] = [];
  const stack: Json[] = [root];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v !== "object" || v === null) continue;
    out.push(v as Container);
    for (const c of Object.values(v)) stack.push(c);
  }
  return out;
}

function slotsOf(root: Json): Slot[] {
  const out: Slot[] = [];
  for (const c of containersOf(root)) {
    if (Array.isArray(c)) c.forEach((_v, i) => out.push({ parent: c, key: i }));
    else for (const k of Object.keys(c)) out.push({ parent: c, key: k });
  }
  return out;
}

function get(sl: Slot): Json {
  return (sl.parent as Record<string | number, Json>)[sl.key];
}

/** Affectation sûre (y compris pour la clé "__proto__", qui doit rester une propriété propre). */
function setOwn(obj: Container, key: string | number, value: Json): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function randomValue(f: Fuzz, old: Json): Json {
  const n = typeof old === "number" ? old : 0;
  return f.pick<() => Json>([
    () => 0,
    () => -1,
    () => 1,
    () => n + 1,
    () => n - 1,
    () => -n,
    () => n * 1000,
    () => 2 ** 31,
    () => 2 ** 32,
    () => Number.MAX_SAFE_INTEGER,
    () => -Number.MAX_SAFE_INTEGER,
    () => 2 ** 53 + 2, // non sûr
    () => 1.5,
    () => 1e308,
    () => -0,
    () => null,
    () => true,
    () => false,
    () => "",
    () => "NaN",
    () => "Infinity",
    () => "1",
    () => f.pick(ENUM_STRINGS),
    () => [],
    () => ({}),
    () => [1, 2, 3],
    () => ({ x: 1, y: 2 }),
    () => ({ tx: f.int(20) - 2, ty: f.int(16) - 2 }),
  ])();
}

const ARRAY_SIZES = [0, 1, 5, 16, 17, 64, 65, 192, 193, 512, 513];

/** Une mutation structurelle, en place, sur l'enveloppe parsée. */
function mutateStructure(f: Fuzz, env: Record<string, Json>): string {
  const op = f.int(11);
  const slots = slotsOf(env);
  const containers = containersOf(env);
  switch (op) {
    case 0:
    case 1: {
      // Changement de valeur / de type (nombre voisin, négatif, énorme, NaN-like, autre type…).
      const sl = f.pick(slots);
      setOwn(sl.parent, sl.key, randomValue(f, get(sl)));
      return "valeur";
    }
    case 2: {
      // Suppression d'un champ / d'un élément.
      const sl = f.pick(slots);
      if (Array.isArray(sl.parent)) sl.parent.splice(sl.key as number, 1);
      else delete sl.parent[sl.key as string];
      return "suppression";
    }
    case 3: {
      // Ajout d'un champ (inconnu, ou "__proto__", ou "map") / d'un élément.
      const c = f.pick(containers);
      if (Array.isArray(c)) c.splice(f.int(c.length + 1), 0, c.length > 0 && f.chance(0.7) ? structuredClone(f.pick(c)) : randomValue(f, 0));
      else setOwn(c, f.pick(KEY_NAMES), randomValue(f, 0));
      return "ajout";
    }
    case 4: {
      // Tableau géant (dans ou juste au-delà des limites du schéma).
      const arrays = containers.filter((c): c is Json[] => Array.isArray(c));
      const a = f.pick(arrays);
      if (!a) return "aucun tableau";
      const size = f.pick(ARRAY_SIZES);
      const model = a.length > 0 ? a[f.int(a.length)] : randomValue(f, 0);
      a.length = 0;
      for (let i = 0; i < size; i++) a.push(structuredClone(model));
      return "tableau géant";
    }
    case 5: {
      // Ids dupliqués.
      const withId = containers.filter((c): c is Record<string, Json> => !Array.isArray(c) && typeof c.id === "number");
      if (withId.length < 2) return "pas d'ids";
      f.pick(withId).id = f.pick(withId).id;
      return "id dupliqué";
    }
    case 6: {
      // Échange de deux éléments d'un tableau (ordre des ids, file…).
      const arrays = containers.filter((c): c is Json[] => Array.isArray(c) && c.length >= 2);
      const a = f.pick(arrays);
      if (!a) return "aucun tableau";
      const i = f.int(a.length);
      const j = f.int(a.length);
      [a[i], a[j]] = [a[j], a[i]];
      return "échange";
    }
    case 7: {
      // Enum changé.
      const strs = slots.filter((sl) => typeof get(sl) === "string" && sl.key !== "checksum");
      if (strs.length === 0) return "pas de chaîne";
      const sl = f.pick(strs);
      setOwn(sl.parent, sl.key, f.pick(ENUM_STRINGS));
      return "enum";
    }
    case 8: {
      // Valeur négative ciblée sur un nombre.
      const nums = slots.filter((sl) => typeof get(sl) === "number");
      if (nums.length === 0) return "pas de nombre";
      const sl = f.pick(nums);
      setOwn(sl.parent, sl.key, -Math.abs(get(sl) as number) - f.int(3));
      return "négatif";
    }
    case 9: {
      // Enveloppe : version, seed, savedAt.
      const k = f.pick(["version", "seed", "savedAt"]);
      env[k] = f.pick<Json>([0, -1, 2, 3, 99, 1.5, "1", null, 2 ** 32, Number.MAX_SAFE_INTEGER, CURRENT_VERSION]);
      return `enveloppe ${k}`;
    }
    default: {
      // Remplacement d'un sous-objet par un autre de l'état (mélange de structures).
      const objs = containers.filter((c) => c !== env);
      const sl = f.pick(slots.filter((s) => typeof get(s) === "object" && get(s) !== null));
      if (!sl || objs.length === 0) return "rien";
      setOwn(sl.parent, sl.key, structuredClone(f.pick(objs)));
      return "greffe";
    }
  }
}

const SNIPPETS = [
  "NaN",
  "Infinity",
  "-Infinity",
  "-0",
  "1e999",
  "-1e999",
  "null",
  ",",
  '"',
  "{",
  "}",
  "[",
  "]",
  ":",
  "{}",
  "[]",
  "\\u0000",
  "\u0000",
  String.fromCharCode(0xfeff), // BOM
  "é",
  "\ud800",
  "  ",
  "\n",
  '"x":1,',
  '"__proto__":{"tick":0},',
  "9".repeat(400),
  "0.5",
  "true",
];

/** Une mutation du texte (sans re-signer). */
function mutateText(f: Fuzz, text: string): string {
  const pos = f.int(text.length + 1);
  switch (f.int(8)) {
    case 0: // octet remplacé
      return text.slice(0, pos) + String.fromCharCode(f.int(256)) + text.slice(pos + 1);
    case 1: // caractère JSON-significatif remplacé
      return text.slice(0, pos) + f.pick(['"', "{", "}", "[", "]", ",", ":", "0", "-", "a"]) + text.slice(pos + 1);
    case 2: // suppression d'une plage
      return text.slice(0, pos) + text.slice(pos + 1 + f.int(40));
    case 3: // troncature (parfois à vide)
      return f.chance(0.05) ? "" : text.slice(0, pos);
    case 4: // insertion
      return text.slice(0, pos) + f.pick(SNIPPETS) + text.slice(pos);
    case 5: {
      // un nombre littéral remplacé par une valeur NaN-like / énorme / non entière
      const nums = [...text.matchAll(/-?\d+/g)];
      const m = nums.length > 0 ? f.pick(nums) : undefined;
      if (!m || m.index === undefined) return text;
      const rep = f.pick(["NaN", "1e999", "-1", "99999999999999999999", "0.5", "-0", "1e2", "0x10", "Infinity", "007"]);
      return text.slice(0, m.index) + rep + text.slice(m.index + m[0].length);
    }
    case 6: // duplication d'un segment
      return text.slice(0, pos) + text.slice(pos, pos + 1 + f.int(200)) + text.slice(pos);
    default: // au-delà de la limite de taille (rare : coûteux)
      return f.chance(0.1) ? text + " ".repeat(SAVE_CONFIG.maxSaveChars) : text.slice(0, pos) + "\t" + text.slice(pos);
  }
}

/** Re-signe (vrai sel) : force le passage jusqu'à la forme et aux invariants. Ne lève pas. */
function resignEnv(env: Record<string, Json>): void {
  try {
    env.checksum = computeChecksum(env.version as number, env.savedAt as number, env.seed as number, env.state);
  } catch {
    // état non canonisable (nombre non sûr, trop profond…) : checksum laissé tel quel
  }
}

function serialize(env: Json): string {
  try {
    return canonicalStringify(env, SAVE_CONFIG.maxDepth + 8);
  } catch {
    return JSON.stringify(env);
  }
}

interface Case {
  text: string;
  resigned: boolean;
  ops: string[];
}

function makeCase(f: Fuzz, bases: readonly Base[]): Case {
  const base = f.pick(bases);
  const ops: string[] = [base.name];
  let text = base.text;
  let resigned = false;
  const structural = f.int(4); // 0..3
  const textual = structural === 0 ? 1 + f.int(2) : f.int(2);
  if (structural > 0) {
    const env = JSON.parse(text) as Record<string, Json>;
    for (let i = 0; i < structural; i++) ops.push(mutateStructure(f, env));
    if (f.chance(0.65)) {
      resignEnv(env);
      resigned = true;
      ops.push("re-signé");
    }
    text = serialize(env);
  }
  for (let i = 0; i < textual; i++) {
    text = mutateText(f, text);
    ops.push("texte");
  }
  // Parfois : mutation du texte puis re-signature si le texte reste du JSON avec un état.
  if (textual > 0 && f.chance(0.3) && text.length <= SAVE_CONFIG.maxSaveChars) {
    try {
      const env = JSON.parse(text) as unknown;
      if (typeof env === "object" && env !== null && !Array.isArray(env)) {
        resignEnv(env as Record<string, Json>);
        text = serialize(env);
        resigned = true;
        ops.push("texte re-signé");
      }
    } catch {
      // pas du JSON : laissé tel quel
    }
  }
  return { text, resigned, ops };
}

// --- Propriétés ---------------------------------------------------------------------------------

/** Vérifie un résultat de décodage ; renvoie la liste des violations (vide = conforme). */
function checkResult(text: string, r: DecodeResult): string[] {
  const v: string[] = [];
  if (r.ok) {
    const inv = checkInvariants(r.state);
    if (inv.length > 0) v.push(`ok mais invariants violés : ${inv.slice(0, 3).join("; ")}`);
    if (r.state.map !== referenceMap()) v.push("ok mais carte différente de referenceMap()");
    // Jamais réparé : l'état chargé est exactement l'état stocké.
    try {
      const stored = (JSON.parse(text) as { state: unknown }).state;
      if (canonicalStringify(toSavedState(r.state), 64) !== canonicalStringify(stored, 64)) v.push("état chargé ≠ état stocké (réparé ?)");
    } catch (e) {
      v.push(`ok mais texte non relisible : ${String(e)}`);
    }
  } else {
    if (!ALL_ERRORS.has(r.error)) v.push(`erreur hors union : ${String(r.error)}`);
    if (!Array.isArray(r.details) || r.details.length === 0 || r.details.some((d) => typeof d !== "string")) {
      v.push("details vide ou mal typé");
    }
    if (r.error === "future_version" && !(typeof r.version === "number" && r.version > CURRENT_VERSION)) {
      v.push("future_version sans version lue");
    }
  }
  return v;
}

/** 100 ticks sans exception, invariants vérifiés à chaque tick. */
function tickHundred(s: GameState): string[] {
  let cur = s;
  for (let i = 0; i < TICKS_AFTER_LOAD; i++) {
    try {
      cur = tick(cur);
    } catch (e) {
      return [`tick ${i + 1} a levé : ${String(e)}`];
    }
    const inv = checkInvariants(cur);
    if (inv.length > 0) return [`invariants violés après ${i + 1} ticks : ${inv.slice(0, 3).join("; ")}`];
  }
  return [];
}

function short(c: Case): string {
  return `[${c.ops.join(" > ")}] ${c.text.slice(0, 120)}${c.text.length > 120 ? "…" : ""}`;
}

// --- Tests ----------------------------------------------------------------------------------------

let BASES: Base[];
let CASES_LIST: Case[];
beforeAll(() => {
  BASES = makeBases();
  const f = new Fuzz(0x5eed_f022);
  CASES_LIST = Array.from({ length: CASES }, () => makeCase(f, BASES));
});

describe("fuzz du chargement (déterministe, RNG seedé du core)", () => {
  it("les bases sont des sauvegardes valides et variées", () => {
    expect(BASES.length).toBeGreaterThanOrEqual(20);
    for (const b of BASES) expect(decodeSave(b.text).ok, b.name).toBe(true);
    expect(new Set(BASES.map((b) => b.text)).size).toBe(BASES.length);
  });

  it(`${CASES} sauvegardes mutées : decodeSave et importSave ne lèvent jamais ; ok ⇒ valide et 100 ticks sûrs ; sinon refus typé`, () => {
    const t0 = performance.now();
    const failures: string[] = [];
    const stats: Record<string, number> = {};
    let resignedCases = 0;
    let okCases = 0;
    for (const c of CASES_LIST) {
      if (c.resigned) resignedCases++;
      let r: DecodeResult;
      let r2: DecodeResult;
      try {
        r = decodeSave(c.text);
        r2 = importSave(c.text);
      } catch (e) {
        failures.push(`EXCEPTION ${String(e)} ${short(c)}`);
        continue;
      }
      const label = r.ok ? "ok" : r.error;
      stats[label] = (stats[label] ?? 0) + 1;
      for (const v of checkResult(c.text, r)) failures.push(`${v} ${short(c)}`);
      // L'import suit exactement le même pipeline (même limite de taille par défaut).
      if (r.ok !== r2.ok || (!r.ok && !r2.ok && r.error !== r2.error)) failures.push(`import ≠ decode ${short(c)}`);
      if (r.ok) {
        okCases++;
        for (const v of tickHundred(r.state)) failures.push(`${v} ${short(c)}`);
      }
      if (failures.length > 20) break;
    }
    const ms = performance.now() - t0;
    console.info(
      `[fuzz-load] ${CASES} cas (${resignedCases} re-signés) en ${Math.round(ms)} ms ; résultats : ${JSON.stringify(stats)}`,
    );
    expect(failures).toEqual([]);
    expect(resignedCases).toBeGreaterThan(CASES / 3);
    // Diversité : chaque étape du pipeline est atteinte, et des sauvegardes trafiquées passent quand même.
    expect(okCases).toBeGreaterThan(50);
    for (const e of ["too_large", "empty", "not_json", "bad_envelope", "unsupported_version", "future_version", "bad_checksum", "bad_shape", "invariants"]) {
      expect(stats[e] ?? 0, e).toBeGreaterThan(0);
    }
  }, 60_000);

  it("3000 petites retouches numériques re-signées (±1, 0, voisins) : ok ⇒ 100 ticks sûrs et valides", () => {
    // Ces retouches « plausibles » passent souvent la forme et parfois les invariants : c'est le cas
    // le plus dangereux (un état accepté que tick() ne saurait pas gérer).
    const f = new Fuzz(0xc0ffee);
    const failures: string[] = [];
    const stats: Record<string, number> = {};
    for (let n = 0; n < 3000 && failures.length <= 20; n++) {
      const base = f.pick(BASES);
      const env = JSON.parse(base.text) as Record<string, Json>;
      const nums = slotsOf(env.state).filter((sl) => typeof get(sl) === "number");
      const k = 1 + f.int(2);
      for (let i = 0; i < k; i++) {
        const sl = f.pick(nums);
        const v = get(sl) as number;
        setOwn(sl.parent, sl.key, f.pick([v + 1, v - 1, 0, v + 2, v - 2, v * 2, v + 1000]));
      }
      resignEnv(env);
      const text = serialize(env);
      let r: DecodeResult;
      try {
        r = decodeSave(text);
      } catch (e) {
        failures.push(`EXCEPTION ${String(e)} cas ${n}`);
        continue;
      }
      stats[r.ok ? "ok" : r.error] = (stats[r.ok ? "ok" : r.error] ?? 0) + 1;
      for (const v of checkResult(text, r)) failures.push(`${v} cas ${n}`);
      if (r.ok) for (const v of tickHundred(r.state)) failures.push(`${v} cas ${n} (${base.name})`);
    }
    console.info(`[fuzz-load] retouches numériques : ${JSON.stringify(stats)}`);
    expect(failures).toEqual([]);
    expect(stats.ok ?? 0).toBeGreaterThan(300);
  }, 60_000);

  it("décodage déterministe : même texte ⇒ même résultat (échantillon)", () => {
    for (const c of CASES_LIST.slice(0, 300)) {
      const a = decodeSave(c.text);
      const b = decodeSave(c.text);
      expect(b).toEqual(a);
    }
  });

  it(`${STORAGE_CASES} stockages aux deux slots mutés : loadGame ne lève pas, n'écrit rien, résultat cohérent ; quarantaine puis écriture OK`, () => {
    const f = new Fuzz(0xa11ce);
    const failures: string[] = [];
    const kinds: Record<string, number> = {};
    for (let n = 0; n < STORAGE_CASES && failures.length <= 20; n++) {
      const st = createMemoryStorage();
      const slotText = (): string | null => {
        const r = f.float();
        if (r < 0.08) return null;
        if (r < 0.12) return "";
        if (r < 0.3) return f.pick(BASES).text;
        return f.pick(CASES_LIST).text;
      };
      const a = slotText();
      const b = slotText();
      if (a !== null) st.raw.set(SAVE_KEYS.A, a);
      if (b !== null) st.raw.set(SAVE_KEYS.B, b);
      const ptr = f.pick<string | null>(["A", "B", "A", "B", null, "C", "", `${String.fromCharCode(0xfeff)}A`]);
      if (ptr !== null) st.raw.set(SAVE_KEYS.current, ptr);
      const before = st.snapshot();
      const tag = `cas ${n} (ptr ${String(ptr)})`;

      let r: LoadResult;
      try {
        r = loadGame(st);
      } catch (e) {
        failures.push(`EXCEPTION loadGame ${String(e)} ${tag}`);
        continue;
      }
      kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
      if (JSON.stringify(st.snapshot()) !== JSON.stringify(before)) failures.push(`loadGame a écrit ${tag}`);

      // Résultat attendu, recalculé indépendamment slot par slot.
      const dec = (t: string | null): DecodeResult | null => (t === null || t === "" ? null : decodeSave(t));
      const dA = dec(a);
      const dB = dec(b);
      const fut = [dA, dB].filter((d): d is DecodeResult & { ok: false } => d !== null && !d.ok && d.error === "future_version");
      const valid = { A: dA?.ok ? dA : null, B: dB?.ok ? dB : null };
      const invalidSlots = (["A", "B"] as const).filter((s) => {
        const d = s === "A" ? dA : dB;
        return d !== null && !d.ok;
      });
      if (fut.length > 0) {
        const v = Math.max(...fut.map((d) => d.version ?? 0));
        if (r.kind !== "future" || r.version !== v) failures.push(`future attendu (v${v}), reçu ${r.kind} ${tag}`);
        // Rien n'est jamais écrit par-dessus une version future.
        const w = writeSave(st, createInitialState(1), { seed: 1, savedAt: SAVED_AT }, OWNER);
        if (w.ok || w.error !== "future_version") failures.push(`écriture sur version future ${tag}`);
        if (JSON.stringify(st.snapshot()) !== JSON.stringify(before)) failures.push(`stockage modifié malgré future ${tag}`);
        continue;
      }
      if (valid.A || valid.B) {
        let expectedSlot: "A" | "B";
        if (ptr === "A" || ptr === "B") expectedSlot = valid[ptr] ? ptr : ptr === "A" ? "B" : "A";
        else expectedSlot = valid.A && valid.B ? (valid.B.savedAt > valid.A.savedAt ? "B" : "A") : valid.A ? "A" : "B";
        if (r.kind !== "loaded") {
          failures.push(`loaded attendu, reçu ${r.kind} ${tag}`);
          continue;
        }
        if (r.slot !== expectedSlot) failures.push(`slot ${r.slot} au lieu de ${expectedSlot} ${tag}`);
        const exp = valid[expectedSlot];
        if (exp && canonicalStringify(toSavedState(r.state), 64) !== canonicalStringify(toSavedState(exp.state), 64)) {
          failures.push(`état chargé ≠ slot ${expectedSlot} ${tag}`);
        }
        if (checkInvariants(r.state).length > 0) failures.push(`état chargé invalide ${tag}`);
        if (r.state.map !== referenceMap()) failures.push(`carte non référence ${tag}`);
        if (r.damaged.map((d) => d.slot).join() !== invalidSlots.join()) failures.push(`damaged incohérent ${tag}`);
      } else if (invalidSlots.length > 0) {
        if (r.kind !== "corrupt") {
          failures.push(`corrupt attendu, reçu ${r.kind} ${tag}`);
          continue;
        }
        if (r.damaged.map((d) => d.slot).join() !== invalidSlots.join()) failures.push(`damaged incohérent ${tag}`);
      } else if (r.kind !== "fresh") {
        failures.push(`fresh attendu, reçu ${r.kind} ${tag}`);
        continue;
      }

      // Suite du flux de l'app (onglet propriétaire) : quarantaine des slots abîmés, puis écriture.
      const damaged = r.kind === "loaded" || r.kind === "corrupt" ? r.damaged : [];
      if (!quarantine(st, damaged, 1000 + n)) failures.push(`quarantaine refusée ${tag}`);
      const q = listQuarantine(st).map((e) => e.text);
      for (const d of damaged) {
        if (!q.some((t) => t.includes(JSON.stringify(d.raw.slice(0, SAVE_CONFIG.maxSaveChars)).slice(1, -1)))) {
          failures.push(`slot ${d.slot} absent de la quarantaine ${tag}`);
        }
      }
      const next = r.kind === "loaded" ? tick(r.state, 5) : createInitialState(n);
      const meta = { seed: n, savedAt: SAVED_AT + 10_000 };
      const w = r.kind === "loaded" ? writeSave(st, next, meta, OWNER) : commitFresh(st, next, meta, OWNER);
      if (!w.ok) {
        failures.push(`écriture refusée (${w.error}) ${tag}`);
        continue;
      }
      const again = loadGame(st);
      if (again.kind !== "loaded" || canonicalStringify(toSavedState(again.state), 64) !== canonicalStringify(toSavedState(next), 64)) {
        failures.push(`relecture après écriture : ${again.kind} ${tag}`);
      }
    }
    console.info(`[fuzz-load] ${STORAGE_CASES} stockages : ${JSON.stringify(kinds)}`);
    expect(failures).toEqual([]);
    for (const k of ["loaded", "corrupt", "future", "fresh"]) expect(kinds[k] ?? 0, k).toBeGreaterThan(0);
  }, 60_000);
});
