import { applyCommand, cloneState, createInitialState, tick, type GameState } from "../../src/core/index";
import {
  commitFresh,
  createMemoryStorage,
  encodeSave,
  listQuarantine,
  loadGame,
  quarantine,
  SAVE_CONFIG,
  SAVE_KEYS,
  writeSave,
  type LoadResult,
  type MemoryStorage,
  type SlotReport,
} from "../../src/save/index";
import { botGoal, steer } from "../core/helpers";
import { botStep, midgame, NOT_OWNER, OWNER, SAVED_AT, SEED, signed } from "./helpers";

let MID: GameState;
beforeAll(() => {
  MID = midgame();
});

const meta = (savedAt = SAVED_AT) => ({ seed: SEED, savedAt });

function text(s: GameState, savedAt = SAVED_AT): string {
  const r = encodeSave(s, meta(savedAt));
  if (!r.ok) throw new Error(r.error);
  return r.text;
}

function loaded(r: LoadResult): Extract<LoadResult, { kind: "loaded" }> {
  if (r.kind !== "loaded") throw new Error(`chargement attendu, reçu ${JSON.stringify(r).slice(0, 300)}`);
  return r;
}

/** Deux états valides distincts. */
function twoStates(): [GameState, GameState] {
  const a = createInitialState(SEED);
  return [a, tick(a, 50)];
}

/** Stockage avec A et B valides, pointeur sur `current`. */
function filled(current: "A" | "B" = "B"): { st: MemoryStorage; a: GameState; b: GameState } {
  const [a, b] = twoStates();
  const st = createMemoryStorage();
  st.raw.set(SAVE_KEYS.A, text(a, SAVED_AT));
  st.raw.set(SAVE_KEYS.B, text(b, SAVED_AT + 10));
  st.raw.set(SAVE_KEYS.current, current);
  return { st, a, b };
}

describe("écriture A/B", () => {
  it("stockage vide ⇒ fresh ; puis l'écriture alterne A, B, A et bascule le pointeur", () => {
    const st = createMemoryStorage();
    expect(loadGame(st)).toEqual({ kind: "fresh" });
    const states = [createInitialState(SEED), tick(createInitialState(SEED), 10), tick(createInitialState(SEED), 20)];
    const slots = states.map((s, i) => {
      const r = writeSave(st, s, meta(SAVED_AT + i), OWNER);
      if (!r.ok) throw new Error(r.error);
      expect(st.raw.get(SAVE_KEYS.current)).toBe(r.slot);
      expect(loaded(loadGame(st)).state).toEqual(s);
      return r.slot;
    });
    expect(slots).toEqual(["A", "B", "A"]);
    // L'autre slot contient toujours l'avant-dernière sauvegarde, valide.
    expect(st.raw.get(SAVE_KEYS.B)).toBe(text(states[1]!, SAVED_AT + 1));
  });

  it("aller-retour par le stockage : état mi-partie identique (deep equal), seed et savedAt restitués", () => {
    const st = createMemoryStorage();
    expect(writeSave(st, MID, meta(), OWNER).ok).toBe(true);
    const r = loaded(loadGame(st));
    expect(r.state).toEqual(MID);
    expect(r.seed).toBe(SEED);
    expect(r.savedAt).toBe(SAVED_AT);
    expect(r.damaged).toEqual([]);
  });

  it("relecture différente (écriture abîmée) ⇒ readback_mismatch, pointeur inchangé, ancien slot chargé", () => {
    const { st, b } = filled("B");
    st.configure({ corruptOnWrite: (k, v) => (k === SAVE_KEYS.A ? v.slice(0, -5) : v) });
    const r = writeSave(st, MID, meta(SAVED_AT + 100), OWNER);
    expect(r).toMatchObject({ ok: false, error: "readback_mismatch" });
    expect(st.raw.get(SAVE_KEYS.current)).toBe("B");
    const l = loaded(loadGame(st));
    expect(l.slot).toBe("B");
    expect(l.state).toEqual(b);
  });

  it("échec d'écriture (stockage en erreur) ⇒ slot courant intact et toujours chargé", () => {
    const { st, b } = filled("B");
    const before = st.snapshot();
    for (const failSet of ["quota", "security", "unavailable"] as const) {
      st.configure({ failSet });
      const r = writeSave(st, MID, meta(SAVED_AT + 100), OWNER);
      expect(r).toMatchObject({ ok: false, error: failSet === "quota" ? "quota" : "unavailable" });
      expect(st.snapshot()).toEqual(before);
    }
    st.configure({ failSet: false });
    expect(loaded(loadGame(st)).state).toEqual(b);
  });

  it("pointeur abîmé à l'écriture ⇒ erreur, et le chargement retombe sur le plus grand savedAt (valide)", () => {
    const { st } = filled("B");
    st.configure({ corruptOnWrite: (k, v) => (k === SAVE_KEYS.current ? "Z" : v) });
    const r = writeSave(st, MID, meta(SAVED_AT + 100), OWNER);
    expect(r).toMatchObject({ ok: false, error: "readback_mismatch" });
    const l = loaded(loadGame(st));
    expect(l.slot).toBe("A");
    expect(l.state).toEqual(MID);
  });

  it("quota : stockage trop petit ⇒ quota, aucune exception, rien de cassé", () => {
    const st = createMemoryStorage({ quotaChars: 1000 });
    const r = writeSave(st, MID, meta(), OWNER);
    expect(r).toMatchObject({ ok: false, error: "quota" });
    expect(loadGame(st)).toEqual({ kind: "fresh" });
  });

  it("non propriétaire ⇒ not_owner, rien d'écrit ; owner qui lève ⇒ not_owner", () => {
    const st = createMemoryStorage();
    expect(writeSave(st, MID, meta(), NOT_OWNER)).toMatchObject({ ok: false, error: "not_owner" });
    const throwing = {
      isOwner: (): boolean => {
        throw new Error("x");
      },
    };
    expect(writeSave(st, MID, meta(), throwing)).toMatchObject({ ok: false, error: "not_owner" });
    expect(st.snapshot()).toEqual({});
  });

  it("état invalide ⇒ invalid_state, rien d'écrit (la copie de secours n'est pas détruite)", () => {
    const { st } = filled("B");
    const before = st.snapshot();
    const bad = cloneState(MID);
    bad.resources.wood = -1;
    expect(writeSave(st, bad, meta(), OWNER)).toMatchObject({ ok: false, error: "invalid_state" });
    const nan = cloneState(MID);
    nan.tick = NaN;
    expect(writeSave(st, nan, meta(), OWNER)).toMatchObject({ ok: false, error: "serialize_error" });
    expect(st.snapshot()).toEqual(before);
  });

  it("état trop gros ⇒ too_large", () => {
    const big = cloneState(MID);
    big.drops = Array.from({ length: 6000 }, (_, i) => ({ id: 100 + i, pos: { x: 500, y: 500 }, resource: "wood", amount: 1 }));
    expect(writeSave(createMemoryStorage(), big, meta(), OWNER)).toMatchObject({ ok: false, error: "too_large" });
  });

  it("commitFresh (nouvelle partie / import) ⇒ A et B identiques ; l'ancienne partie a disparu", () => {
    const { st } = filled("A");
    const neo = createInitialState(777);
    const r = commitFresh(st, neo, { seed: 777, savedAt: SAVED_AT + 50 }, OWNER);
    expect(r.ok).toBe(true);
    expect(st.raw.get(SAVE_KEYS.A)).toBe(st.raw.get(SAVE_KEYS.B));
    const l = loaded(loadGame(st));
    expect(l.state).toEqual(neo);
    expect(l.seed).toBe(777);
    // Même si le slot courant s'abîme, le repli ne ressuscite pas l'ancienne partie.
    st.raw.set(SAVE_KEYS[l.slot], "abîmé");
    expect(loaded(loadGame(st)).state).toEqual(neo);
  });
});

describe("chargement et repli", () => {
  it("pointeur sur A valide ⇒ A, même si B a un savedAt plus grand (ordre de commit prioritaire)", () => {
    const { st, a } = filled("A");
    const l = loaded(loadGame(st));
    expect(l.slot).toBe("A");
    expect(l.state).toEqual(a);
  });

  it("slot A abîmé (pointeur A) ⇒ B chargé, A signalé damaged avec son contenu brut", () => {
    const { st, b } = filled("A");
    const broken = st.raw.get(SAVE_KEYS.A)!.replace('"tick":0', '"tick":5');
    st.raw.set(SAVE_KEYS.A, broken);
    const l = loaded(loadGame(st));
    expect(l.slot).toBe("B");
    expect(l.state).toEqual(b);
    expect(l.damaged).toEqual([expect.objectContaining({ slot: "A", kind: "invalid", error: "bad_checksum", raw: broken })]);
  });

  it("A abîmé : l'écriture suivante met A en quarantaine PUIS l'écrase ; B (seul valide) n'est jamais touché", () => {
    const { st } = filled("A");
    st.raw.set(SAVE_KEYS.A, "{corrompu");
    const bText = st.raw.get(SAVE_KEYS.B);
    const r = writeSave(st, MID, meta(SAVED_AT + 100), OWNER);
    expect(r).toMatchObject({ ok: true, slot: "A" });
    expect(st.raw.get(SAVE_KEYS.B)).toBe(bText);
    const q = listQuarantine(st);
    expect(q).toHaveLength(1);
    expect(JSON.parse(q[0]!.text)).toMatchObject({ reports: [{ slot: "A", error: "not_json", raw: "{corrompu" }] });
  });

  it("A abîmé et quarantaine impossible ⇒ quarantine_failed, A non écrasé", () => {
    const { st } = filled("A");
    st.raw.set(SAVE_KEYS.A, "{corrompu");
    const used = [...st.raw].reduce((n, [k, v]) => n + k.length + v.length, 0);
    st.configure({ quotaChars: used + 10 });
    const r = writeSave(st, MID, meta(SAVED_AT + 100), OWNER);
    expect(r).toMatchObject({ ok: false, error: "quarantine_failed" });
    expect(st.raw.get(SAVE_KEYS.A)).toBe("{corrompu");
  });

  it("pointeur absent ⇒ plus grand savedAt ; égalité ⇒ A ; pointeur illisible traité comme absent", () => {
    const { st, b } = filled("A");
    st.raw.delete(SAVE_KEYS.current);
    expect(loaded(loadGame(st)).state).toEqual(b);
    st.raw.set(SAVE_KEYS.current, "C");
    expect(loaded(loadGame(st)).slot).toBe("B");
    const [a2, b2] = twoStates();
    st.raw.set(SAVE_KEYS.A, text(a2, 5));
    st.raw.set(SAVE_KEYS.B, text(b2, 5));
    expect(loaded(loadGame(st)).slot).toBe("A");
  });

  it("pointeur vers un slot vide ⇒ l'autre", () => {
    const { st, a } = filled("B");
    st.raw.delete(SAVE_KEYS.B);
    expect(loaded(loadGame(st)).state).toEqual(a);
  });

  it("les deux abîmés ⇒ corrupt (données conservées pour la quarantaine), puis nouvelle partie", () => {
    const st = createMemoryStorage();
    st.raw.set(SAVE_KEYS.A, "garbage-A");
    st.raw.set(SAVE_KEYS.B, text(MID).replace('"wood":0', '"wood":9'));
    st.raw.set(SAVE_KEYS.current, "B");
    const r = loadGame(st);
    if (r.kind !== "corrupt") throw new Error(r.kind);
    expect(r.damaged.map((d) => [d.slot, d.error])).toEqual([
      ["A", "not_json"],
      ["B", "bad_checksum"],
    ]);
    // Flux de l'app : quarantaine, puis commitFresh.
    expect(quarantine(st, r.damaged, 1000)).toBe(true);
    const neo = createInitialState(9);
    expect(commitFresh(st, neo, { seed: 9, savedAt: 1001 }, OWNER).ok).toBe(true);
    expect(loaded(loadGame(st)).state).toEqual(neo);
    // Pas de doublon : writeSave n'a pas remis en quarantaine ce qui l'était déjà.
    const q = listQuarantine(st);
    expect(q).toHaveLength(1);
    const content = JSON.parse(q[0]!.text) as { quarantinedAt: number; reports: { slot: string; raw: string }[] };
    expect(content.quarantinedAt).toBe(1000);
    expect(content.reports.map((x) => x.slot)).toEqual(["A", "B"]);
    expect(content.reports[0]!.raw).toBe("garbage-A");
  });

  it("slot de version future ⇒ future (sans repli sur l'autre slot), et rien n'est jamais écrit", () => {
    const { st } = filled("A");
    st.raw.set(SAVE_KEYS.B, signed({ anything: true }, 7));
    expect(loadGame(st)).toEqual({ kind: "future", version: 7 });
    const before = st.snapshot();
    expect(writeSave(st, MID, meta(), OWNER)).toMatchObject({ ok: false, error: "future_version" });
    expect(commitFresh(st, MID, meta(), OWNER)).toMatchObject({ ok: false, error: "future_version" });
    expect(st.snapshot()).toEqual(before);
  });

  it("chaîne vide traitée comme slot vide", () => {
    const st = createMemoryStorage();
    st.raw.set(SAVE_KEYS.A, "");
    expect(loadGame(st)).toEqual({ kind: "fresh" });
  });
});

describe("stockage indisponible : aucune exception", () => {
  it("getItem en échec ⇒ unavailable ; writeSave ⇒ unavailable", () => {
    const st = createMemoryStorage({ failGet: true });
    expect(loadGame(st)).toEqual({ kind: "unavailable", error: "unavailable" });
    expect(writeSave(st, MID, meta(), OWNER)).toMatchObject({ ok: false, error: "unavailable" });
    expect(listQuarantine(st)).toEqual([]);
    expect(quarantine(st, [{ slot: "A", kind: "invalid", error: "not_json", details: [], raw: "x" }], 1)).toBe(false);
  });

  it("adaptateur qui LÈVE (tiers mal élevé) ⇒ résultats typés", () => {
    const st = createMemoryStorage({ throws: true, failGet: true });
    expect(() => loadGame(st)).not.toThrow();
    expect(loadGame(st)).toMatchObject({ kind: "unavailable" });
    const st2 = createMemoryStorage({ throws: true, failSet: "quota" });
    expect(() => writeSave(st2, MID, meta(), OWNER)).not.toThrow();
    expect(writeSave(st2, MID, meta(), OWNER)).toMatchObject({ ok: false, error: "quota" });
    expect(commitFresh(st2, MID, meta(), OWNER)).toMatchObject({ ok: false, error: "quota" });
  });
});

describe("quarantaine", () => {
  const report = (raw: string, slot: "A" | "B" = "A"): SlotReport => ({
    slot,
    kind: "invalid",
    error: "bad_checksum",
    details: [],
    raw,
  });

  it("contenu brut conservé, relu, listé du plus récent au plus ancien", () => {
    const st = createMemoryStorage();
    expect(quarantine(st, [report("raw-1")], 100)).toBe(true);
    expect(quarantine(st, [report("raw-2", "B")], 200)).toBe(true);
    const q = listQuarantine(st);
    expect(q.map((e) => e.quarantinedAt)).toEqual([200, 100]);
    expect(q.map((e) => e.key)).toEqual([`${SAVE_KEYS.quarantinePrefix}200-0`, `${SAVE_KEYS.quarantinePrefix}100-0`]);
    expect(JSON.parse(q[1]!.text)).toEqual({
      quarantinedAt: 100,
      reports: [{ slot: "A", error: "bad_checksum", raw: "raw-1" }],
    });
  });

  it(`rotation bornée à ${SAVE_CONFIG.maxQuarantine} copies : les plus anciennes sont supprimées`, () => {
    const st = createMemoryStorage();
    for (let i = 1; i <= 6; i++) expect(quarantine(st, [report(`raw-${i}`)], i * 100)).toBe(true);
    const q = listQuarantine(st);
    expect(q).toHaveLength(SAVE_CONFIG.maxQuarantine);
    expect(q.map((e) => e.quarantinedAt)).toEqual([600, 500, 400]);
  });

  it("même horodatage ⇒ clés distinctes ; horloge qui recule ⇒ la nouvelle copie est conservée", () => {
    const st = createMemoryStorage();
    quarantine(st, [report("x1")], 500);
    quarantine(st, [report("x2")], 500);
    quarantine(st, [report("x3")], 500);
    expect(listQuarantine(st).map((e) => e.key.slice(SAVE_KEYS.quarantinePrefix.length))).toEqual([
      "500-2",
      "500-1",
      "500-0",
    ]);
    expect(quarantine(st, [report("recul")], 10)).toBe(true);
    const texts = listQuarantine(st).map((e) => e.text);
    expect(texts).toHaveLength(3);
    expect(texts.some((t) => t.includes("recul"))).toBe(true);
  });

  it("même donnée déjà en quarantaine ⇒ pas de doublon ; rien d'abîmé ⇒ true sans écrire", () => {
    const st = createMemoryStorage();
    quarantine(st, [report("same")], 1);
    expect(quarantine(st, [report("same")], 2)).toBe(true);
    expect(listQuarantine(st)).toHaveLength(1);
    expect(quarantine(st, [{ slot: "A", kind: "empty" }], 3)).toBe(true);
    expect(quarantine(st, [{ ...report("v9"), error: "future_version" } as SlotReport], 3)).toBe(true);
    expect(listQuarantine(st)).toHaveLength(1);
  });

  it("écriture impossible ⇒ false, et les slots sont intacts", () => {
    const { st } = filled("A");
    const before = st.snapshot();
    st.configure({ failSet: "quota" });
    expect(quarantine(st, [report("x")], 1)).toBe(false);
    expect(st.snapshot()).toEqual(before);
  });

  it("relecture différente ⇒ false et entrée retirée", () => {
    const st = createMemoryStorage({ corruptOnWrite: (k, v) => (k.startsWith(SAVE_KEYS.quarantinePrefix) ? "x" : v) });
    expect(quarantine(st, [report("raw")], 1)).toBe(false);
    st.configure({ corruptOnWrite: null });
    expect(listQuarantine(st)).toEqual([]);
  });

  it("donnée énorme tronquée à maxSaveChars", () => {
    const st = createMemoryStorage();
    const huge = "z".repeat(SAVE_CONFIG.maxSaveChars + 1000);
    expect(quarantine(st, [report(huge)], 1)).toBe(true);
    const parsed = JSON.parse(listQuarantine(st)[0]!.text) as { reports: { raw: string }[] };
    expect(parsed.reports[0]!.raw).toHaveLength(SAVE_CONFIG.maxSaveChars);
  });
});

describe("reprise exacte : même suite de jeu avec ou sans sauvegarde/rechargement", () => {
  it("bot 1500 ticks ; rechargements à 4 moments (dont entre une commande et le tick) ⇒ même rng à chaque tick, même état final", () => {
    const TICKS = 1500;
    const RELOAD_AFTER_TICK = new Set([150, 777, 1100]);
    const RELOAD_AFTER_COMMAND = new Set([400]);
    const st = createMemoryStorage();

    // Run A : sans sauvegarde.
    const rngA: number[] = [];
    let a = createInitialState(SEED);
    for (let i = 0; i < TICKS; i++) {
      a = botStep(a);
      rngA.push(a.rng);
    }

    // Run B : mêmes décisions, avec sauvegarde + rechargement par le stockage.
    let reloads = 0;
    const reload = (s: GameState, i: number): GameState => {
      const w = writeSave(st, s, meta(SAVED_AT + i), OWNER);
      if (!w.ok) throw new Error(w.error);
      reloads++;
      const l = loaded(loadGame(st));
      expect(l.state).toEqual(s);
      return l.state;
    };
    let b = createInitialState(SEED);
    for (let i = 0; i < TICKS; i++) {
      const want = steer(b, botGoal(b));
      if (want.dx !== b.player.input.dx || want.dy !== b.player.input.dy) {
        const r = applyCommand(b, { type: "setMoveInput", ...want });
        if (!r.ok) throw new Error(r.error);
        b = r.state;
      }
      if (RELOAD_AFTER_COMMAND.has(i)) b = reload(b, i);
      b = tick(b);
      expect(b.rng).toBe(rngA[i]);
      if (RELOAD_AFTER_TICK.has(i)) b = reload(b, i);
    }
    expect(reloads).toBe(4);
    expect(b).toEqual(a);
  }, 30_000);
});
