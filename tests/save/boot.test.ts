// Table de décision de l'orchestration de la sauvegarde (src/save/boot.ts) : démarrage, quarantaine,
// verrou multi-onglets, autosave, import / nouvelle partie, résultats d'écriture. Puis intégration avec
// MemoryStorage + verrou par bail (horloge injectée) : deux « onglets » sur le même stockage.

import { createInitialState, tick, type GameState } from "../../src/core/index";
import {
  APP_MESSAGES,
  autosaveEnabled,
  bootUsesStorage,
  commitFresh,
  createLeaseLock,
  createMemoryStorage,
  damagedExportFileName,
  encodeSave,
  initialSession,
  isPersistent,
  listQuarantine,
  loadGame,
  ownerChangeNeedsLoad,
  planAutosave,
  planBoot,
  planOwnerChange,
  planQuarantineResult,
  planReplaceResult,
  planWriteResult,
  quarantine,
  replaceBlockedReason,
  replaceSuccessMessage,
  runStorageSteps,
  SAVE_KEYS,
  SAVE_MESSAGES,
  writeErrorMessage,
  writeSave,
  type BootContext,
  type InvalidSlotReport,
  type LeaseLock,
  type LoadResult,
  type MemoryStorage,
  type SaveBannerKey,
  type SaveEffect,
  type SaveSession,
  type StorageIo,
  type StorageSteps,
  type WriteResult,
} from "../../src/save/index";
import { SAVED_AT, SEED, signed } from "./helpers";

// --- Données de test -------------------------------------------------------------------------

const S0 = createInitialState(SEED);
const S1 = tick(S0, 50);
const RANDOM = 777;
const SEED_PARAM = 31337;

function enc(s: GameState, savedAt = SAVED_AT, seed = SEED): string {
  const r = encodeSave(s, { seed, savedAt });
  if (!r.ok) throw new Error(r.error);
  return r.text;
}

/** LoadResult réel obtenu par `loadGame` sur un stockage préparé. */
function load(content: Partial<Record<"A" | "B" | "current", string>>, opts: { failGet?: boolean } = {}): LoadResult {
  const st = createMemoryStorage();
  for (const [k, v] of Object.entries(content)) st.raw.set(SAVE_KEYS[k as "A" | "B" | "current"], v);
  if (opts.failGet) st.configure({ failGet: true });
  return loadGame(st);
}

const LOADED = (): LoadResult => load({ A: enc(S1), current: "A" });
const LOADED_DAMAGED = (): LoadResult => load({ A: enc(S1), B: "pas une sauvegarde", current: "A" });
const FRESH = (): LoadResult => load({});
const CORRUPT_ONE = (): LoadResult => load({ A: "abîmé" });
const CORRUPT_BOTH = (): LoadResult => load({ A: "abîmé A", B: "abîmé B", current: "B" });
const FUTURE = (): LoadResult => load({ A: enc(S1), B: signed({}, 99), current: "A" });
const UNAVAILABLE = (): LoadResult => load({ A: enc(S1) }, { failGet: true });

const ctx = (over: Partial<BootContext> = {}): BootContext => ({
  seedParam: null,
  isOwner: true,
  randomSeed: RANDOM,
  ...over,
});

const OK_WRITE: WriteResult = { ok: true, slot: "A", chars: 10 };
const fail = (error: Extract<WriteResult, { ok: false }>["error"]): WriteResult => ({ ok: false, error, details: [error] });

type Banners = Map<SaveBannerKey, { text: string; dismissible: boolean }>;

/** Applique les effets « bandeau » sur un état de bandeaux (comme src/ui/notices.ts). */
function foldBanners(effects: readonly SaveEffect[], init: Banners = new Map()): Banners {
  const out: Banners = new Map(init);
  for (const e of effects) {
    if (e.kind !== "banner") continue;
    if (e.text === null) out.delete(e.key);
    else out.set(e.key, { text: e.text, dismissible: e.dismissible });
  }
  return out;
}
const bannerTexts = (effects: readonly SaveEffect[], init?: Banners): Record<string, string> =>
  Object.fromEntries([...foldBanners(effects, init)].map(([k, v]) => [k, v.text]));
const toasts = (effects: readonly SaveEffect[]): string[] =>
  effects.flatMap((e) => (e.kind === "toast" ? [e.text] : []));
const releases = (effects: readonly SaveEffect[]): boolean => effects.some((e) => e.kind === "releaseLock");

/** E/S espionnes pour runStorageSteps. */
function spyIo(quarantineOk: boolean, write: WriteResult = OK_WRITE) {
  const calls = { quarantine: [] as (readonly InvalidSlotReport[])[], commit: [] as [GameState, number][] };
  const io: StorageIo = {
    quarantine: (d) => {
      calls.quarantine.push(d);
      return quarantineOk;
    },
    commitFresh: (s, seed) => {
      calls.commit.push([s, seed]);
      return write;
    },
  };
  return { io, calls };
}

function steps(plan: { storage: StorageSteps | null }): StorageSteps {
  if (!plan.storage) throw new Error("étapes de stockage attendues");
  return plan.storage;
}

// --- Démarrage ---------------------------------------------------------------------------------

describe("planBoot", () => {
  it("?seed= : partie temporaire rejouable, ni verrou ni stockage, bandeau, pas d'autosave", () => {
    expect(bootUsesStorage(SEED_PARAM)).toBe(false);
    expect(bootUsesStorage(null)).toBe(true);
    // load et isOwner ignorés (l'app ne les obtient même pas).
    for (const l of [null, LOADED(), CORRUPT_BOTH()]) {
      const p = planBoot(l, ctx({ seedParam: SEED_PARAM, isOwner: false }));
      expect(p.game).toEqual({ kind: "temporary", reason: "seed", state: createInitialState(SEED_PARAM), seed: SEED_PARAM });
      expect(p.effects).toEqual([{ kind: "banner", key: "temporary", text: APP_MESSAGES.seedMode, dismissible: false }]);
      expect(p.storage).toBeNull();
      expect(p.persistent).toBe(false);
      expect(p.autosave).toBe(false);
      expect(p.session).toMatchObject({ temporary: "seed", storageOk: true, suspended: false, seed: SEED_PARAM, lastSaved: null });
    }
  });

  it("pas de sauvegarde, propriétaire : nouvelle partie (seed aléatoire) puis commitFresh, aucun message", () => {
    const p = planBoot(FRESH(), ctx());
    expect(p.game).toEqual({ kind: "new", state: createInitialState(RANDOM), seed: RANDOM });
    expect(p.effects).toEqual([]);
    expect(p.storage).toEqual({ quarantine: [], quarantineFailMessage: "", commitFresh: p.game.state, effectsAfter: [] });
    expect(p.persistent).toBe(true);
    expect(p.autosave).toBe(true);

    const { io, calls } = spyIo(true);
    const out = runStorageSteps(p.session, steps(p), io);
    expect(calls.quarantine).toEqual([]); // rien à mettre de côté ⇒ quarantaine non appelée
    expect(calls.commit).toEqual([[p.game.state, RANDOM]]);
    expect(out.quarantined).toBeNull();
    expect(out.session.lastSaved).toBe(p.game.state);
    expect(bannerTexts(out.effects)).toEqual({});
  });

  it("pas de sauvegarde, onglet secondaire : nouvelle partie non écrite, bandeau non-propriétaire", () => {
    const p = planBoot(FRESH(), ctx({ isOwner: false }));
    expect(p.game.kind).toBe("new");
    expect(p.storage).toBeNull();
    expect(bannerTexts(p.effects)).toEqual({ notOwner: SAVE_MESSAGES.notOwner });
    expect(p.persistent).toBe(true);
    expect(p.autosave).toBe(false);
  });

  it("sauvegarde valide : chargée telle quelle, seed de l'enveloppe, rien à écrire", () => {
    const p = planBoot(LOADED(), ctx());
    expect(p.game).toEqual({ kind: "load", state: S1, seed: SEED });
    expect(p.session.lastSaved).toBe(p.game.state); // l'autosave ne réécrit pas l'état chargé
    expect(p.session.seed).toBe(SEED);
    expect(p.storage).toBeNull();
    expect(p.effects).toEqual([]);
    expect(p.autosave).toBe(true);
  });

  it("sauvegarde valide en onglet secondaire : chargée en lecture seule, bandeau", () => {
    const p = planBoot(LOADED_DAMAGED(), ctx({ isOwner: false }));
    expect(p.game.kind).toBe("load");
    expect(p.storage).toBeNull(); // la quarantaine est l'affaire du propriétaire
    expect(bannerTexts(p.effects)).toEqual({ notOwner: SAVE_MESSAGES.notOwner });
    expect(p.autosave).toBe(false);
  });

  describe("valide + un slot abîmé (propriétaire)", () => {
    it("quarantaine OK : partie chargée, autosave active, aucun message", () => {
      const p = planBoot(LOADED_DAMAGED(), ctx());
      expect(p.game).toEqual({ kind: "load", state: S1, seed: SEED });
      const s = steps(p);
      expect(s.quarantine.map((d) => d.slot)).toEqual(["B"]);
      expect(s.commitFresh).toBeNull();
      const { io, calls } = spyIo(true);
      const out = runStorageSteps(p.session, s, io);
      expect(calls.quarantine).toHaveLength(1);
      expect(calls.commit).toEqual([]);
      expect(out.effects).toEqual([]);
      expect(autosaveEnabled(out.session, true)).toBe(true);
    });

    it("quarantaine KO : partie chargée quand même, autosave suspendue, export proposé, bandeau", () => {
      const p = planBoot(LOADED_DAMAGED(), ctx());
      const { io, calls } = spyIo(false);
      const out = runStorageSteps(p.session, steps(p), io);
      expect(calls.commit).toEqual([]);
      expect(out.quarantined).toBe(false);
      expect(out.session.suspended).toBe(true);
      expect(out.session.pendingDamaged.map((d) => d.slot)).toEqual(["B"]);
      expect(bannerTexts(out.effects)).toEqual({ quarantine: APP_MESSAGES.damagedNotQuarantined });
      expect(autosaveEnabled(out.session, true)).toBe(false);
      expect(planAutosave(out.session, { attached: true, isOwner: true, state: S0 })).toEqual({
        kind: "skip",
        reason: "suspended",
      });
    });
  });

  describe.each([
    ["un slot abîmé", CORRUPT_ONE, ["A"]],
    ["les deux slots abîmés", CORRUPT_BOTH, ["A", "B"]],
  ] as const)("aucun slot valide (%s), propriétaire", (_n, corrupt, slots) => {
    it("quarantaine OK : nouvelle partie écrite + bandeau fermable « endommagée »", () => {
      const p = planBoot(corrupt(), ctx());
      expect(p.game).toEqual({ kind: "new", state: createInitialState(RANDOM), seed: RANDOM });
      expect(p.effects).toEqual([]);
      const s = steps(p);
      expect(s.quarantine.map((d) => d.slot)).toEqual(slots);
      const { io, calls } = spyIo(true);
      const out = runStorageSteps(p.session, s, io);
      expect(calls.commit).toEqual([[p.game.state, RANDOM]]);
      expect(out.write).toEqual(OK_WRITE);
      const b = foldBanners(out.effects);
      expect(b.get("corrupt")).toEqual({ text: SAVE_MESSAGES.corrupt, dismissible: true });
      expect(b.size).toBe(1);
      expect(out.session.lastSaved).toBe(p.game.state);
    });

    it("quarantaine OK mais écriture échouée : bandeau « endommagée » ET « indisponible »", () => {
      const p = planBoot(corrupt(), ctx());
      const out = runStorageSteps(p.session, steps(p), spyIo(true, fail("quota")).io);
      expect(bannerTexts(out.effects)).toEqual({ corrupt: SAVE_MESSAGES.corrupt, unavailable: SAVE_MESSAGES.quota });
      expect(out.session.lastSaved).toBeNull();
      expect(out.warn).toEqual({ error: "quota", details: ["quota"] });
    });

    it("quarantaine KO : nouvelle partie NON écrite, autosave suspendue, export de la donnée abîmée", () => {
      const p = planBoot(corrupt(), ctx());
      const { io, calls } = spyIo(false);
      const out = runStorageSteps(p.session, steps(p), io);
      expect(calls.commit).toEqual([]);
      expect(bannerTexts(out.effects)).toEqual({ quarantine: SAVE_MESSAGES.corruptQuarantineFailed });
      expect(out.session.suspended).toBe(true);
      expect(out.session.pendingDamaged.map((d) => d.slot)).toEqual(slots);
      expect(autosaveEnabled(out.session, true)).toBe(false);
    });

    it("onglet secondaire : nouvelle partie, rien écrit ni mis en quarantaine", () => {
      const p = planBoot(corrupt(), ctx({ isOwner: false }));
      expect(p.game.kind).toBe("new");
      expect(p.storage).toBeNull();
      expect(bannerTexts(p.effects)).toEqual({ notOwner: SAVE_MESSAGES.notOwner });
    });
  });

  it.each([true, false])("version future (propriétaire=%s) : partie temporaire, verrou rendu, rien écrit", (owner) => {
    const p = planBoot(FUTURE(), ctx({ isOwner: owner }));
    expect(p.game).toEqual({ kind: "temporary", reason: "future", state: createInitialState(RANDOM), seed: RANDOM });
    expect(p.storage).toBeNull();
    expect(releases(p.effects)).toBe(true);
    expect(bannerTexts(p.effects)).toEqual({ temporary: SAVE_MESSAGES.future }); // « non-propriétaire » retiré
    expect(p.session.temporary).toBe("future");
    expect(p.persistent).toBe(false);
    expect(p.autosave).toBe(false);
    expect(replaceBlockedReason(p.session, owner)).toBe(APP_MESSAGES.blockedFuture);
  });

  it.each([true, false])("stockage indisponible (propriétaire=%s) : jouable sans sauvegarde, bandeau", (owner) => {
    for (const l of [UNAVAILABLE(), null]) {
      const p = planBoot(l, ctx({ isOwner: owner }));
      expect(p.game).toMatchObject({ kind: "temporary", reason: "unavailable", seed: RANDOM });
      expect(p.storage).toBeNull();
      expect(releases(p.effects)).toBe(true);
      expect(bannerTexts(p.effects)).toEqual({ unavailable: SAVE_MESSAGES.unavailable });
      expect(p.session).toMatchObject({ temporary: null, storageOk: false });
      expect(p.persistent).toBe(false);
      expect(p.autosave).toBe(false);
      expect(p.devWarning).toBe("stockage indisponible : unavailable");
    }
  });
});

// --- Quarantaine et écriture -----------------------------------------------------------------

describe("planQuarantineResult", () => {
  const damaged = (LOADED_DAMAGED() as Extract<LoadResult, { kind: "loaded" }>).damaged;

  it("rien d'abîmé ⇒ on peut écrire, quel que soit ok", () => {
    expect(planQuarantineResult(initialSession(), [], false, "x")).toEqual({
      session: initialSession(),
      effects: [],
      proceed: true,
    });
  });
  it("OK ⇒ on peut écrire, session inchangée", () => {
    const s = initialSession(5);
    expect(planQuarantineResult(s, damaged, true, "x")).toEqual({ session: s, effects: [], proceed: true });
  });
  it("KO ⇒ ne rien écrire, suspension, données gardées pour l'export, bandeau", () => {
    const r = planQuarantineResult(initialSession(), damaged, false, "msg");
    expect(r.proceed).toBe(false);
    expect(r.session.suspended).toBe(true);
    expect(r.session.pendingDamaged).toEqual(damaged);
    expect(r.session.pendingDamaged).not.toBe(damaged); // copie
    expect(r.effects).toEqual([{ kind: "banner", key: "quarantine", text: "msg", dismissible: false }]);
  });
});

describe("planWriteResult", () => {
  it("succès ⇒ lastSaved, erreur oubliée, bandeau « indisponible » retiré", () => {
    const s = { ...initialSession(), lastWriteError: "quota" as const };
    const r = planWriteResult(s, OK_WRITE, S1);
    expect(r.session.lastSaved).toBe(S1);
    expect(r.session.lastWriteError).toBeNull();
    expect(r.effects).toEqual([{ kind: "banner", key: "unavailable", text: null, dismissible: false }]);
    expect(r.warn).toBeNull();
  });

  it("succès alors que suspendu ⇒ suspension levée, données en attente oubliées, bandeau quarantaine retiré", () => {
    const damaged = (CORRUPT_ONE() as Extract<LoadResult, { kind: "corrupt" }>).damaged;
    const s: SaveSession = { ...initialSession(), suspended: true, pendingDamaged: damaged };
    const r = planWriteResult(s, OK_WRITE, S1);
    expect(r.session).toMatchObject({ suspended: false, pendingDamaged: [] });
    expect(bannerTexts(r.effects, foldBanners([{ kind: "banner", key: "quarantine", text: "q", dismissible: false }]))).toEqual({});
  });

  it("not_owner ⇒ rien (le bandeau vient de l'événement du verrou)", () => {
    const r = planWriteResult(initialSession(), fail("not_owner"), S1);
    expect(r.effects).toEqual([]);
    expect(r.session.lastWriteError).toBe("not_owner");
  });

  it("future_version ⇒ partie temporaire, verrou rendu, bandeau", () => {
    const r = planWriteResult(initialSession(), fail("future_version"), S1);
    expect(r.session.temporary).toBe("future");
    expect(releases(r.effects)).toBe(true);
    expect(bannerTexts(r.effects)).toEqual({ temporary: SAVE_MESSAGES.future });
    expect(isPersistent(r.session)).toBe(false);
  });

  it("quarantine_failed ⇒ suspension, bandeau quarantaine", () => {
    const r = planWriteResult(initialSession(), fail("quarantine_failed"), S1);
    expect(r.session.suspended).toBe(true);
    expect(bannerTexts(r.effects)).toEqual({ quarantine: APP_MESSAGES.damagedNotQuarantined });
  });

  it.each(["quota", "unavailable", "readback_mismatch", "too_large", "serialize_error", "invalid_state"] as const)(
    "%s ⇒ bandeau « indisponible » adapté, non bloquant (réessai à l'intervalle suivant)",
    (error) => {
      const r = planWriteResult(initialSession(), fail(error), S1);
      expect(bannerTexts(r.effects)).toEqual({ unavailable: writeErrorMessage(error) });
      expect(r.session.suspended).toBe(false);
      expect(r.session.lastSaved).toBeNull();
      expect(autosaveEnabled(r.session, true)).toBe(true);
    },
  );

  it("erreur répétée ⇒ journalisée une seule fois", () => {
    const a = planWriteResult(initialSession(), fail("quota"), S1);
    expect(a.warn).not.toBeNull();
    const b = planWriteResult(a.session, fail("quota"), S1);
    expect(b.warn).toBeNull();
    expect(planWriteResult(b.session, fail("unavailable"), S1).warn).not.toBeNull();
  });
});

// --- Autosave ----------------------------------------------------------------------------------

describe("planAutosave", () => {
  const base: SaveSession = { ...initialSession(), lastSaved: S0 };
  const at = { attached: true, isOwner: true, state: S1 };

  it("écrit si attachée, propriétaire, persistante, non suspendue et état changé", () => {
    expect(planAutosave(base, at)).toEqual({ kind: "write" });
  });
  it.each([
    ["not_attached", base, { ...at, attached: false }],
    ["suspended", { ...base, suspended: true }, at],
    ["temporary", { ...base, temporary: "seed" as const }, at],
    ["temporary", { ...base, temporary: "future" as const }, at],
    ["unavailable", { ...base, storageOk: false }, at],
    ["not_owner", base, { ...at, isOwner: false }],
    ["unchanged", base, { ...at, state: S0 }],
  ] as const)("saute : %s", (reason, session, c) => {
    expect(planAutosave(session, c)).toEqual({ kind: "skip", reason });
  });
  it("même contenu mais autre référence ⇒ écrit (comparaison par référence)", () => {
    expect(planAutosave(base, { ...at, state: structuredClone(S0) })).toEqual({ kind: "write" });
  });
});

// --- Import / nouvelle partie -------------------------------------------------------------------

describe("replaceBlockedReason / planReplaceResult", () => {
  it("autorisé / bloqué selon la session et le verrou", () => {
    const s = initialSession();
    expect(replaceBlockedReason(s, true)).toBeNull();
    expect(replaceBlockedReason(s, false)).toBe(APP_MESSAGES.blockedNotOwner);
    expect(replaceBlockedReason({ ...s, storageOk: false }, true)).toBe(APP_MESSAGES.blockedUnavailable);
    expect(replaceBlockedReason({ ...s, temporary: "future" }, true)).toBe(APP_MESSAGES.blockedFuture);
    // ?seed= : toujours autorisé (partie de test, non sauvegardée), même sans verrou.
    expect(replaceBlockedReason({ ...s, temporary: "seed" }, false)).toBeNull();
    // Quarantaine échouée : n'empêche pas (commitFresh retentera la quarantaine).
    expect(replaceBlockedReason({ ...s, suspended: true }, true)).toBeNull();
  });

  it("bloqué pendant la confirmation ⇒ toast, rien ne change", () => {
    const s = initialSession(1);
    const r = planReplaceResult(s, false, "import", S1, 9, null);
    expect(r).toEqual({ kind: "blocked", session: s, effects: [{ kind: "toast", text: APP_MESSAGES.blockedNotOwner }] });
  });

  it("?seed= ⇒ remplace sans écrire, seed mis à jour, toasts « partie de test »", () => {
    const s: SaveSession = { ...initialSession(SEED_PARAM), temporary: "seed" };
    const imp = planReplaceResult(s, false, "import", S1, 9, null);
    expect(imp.kind).toBe("replace_without_write");
    expect(imp.session.seed).toBe(9);
    expect(toasts(imp.effects)).toEqual([APP_MESSAGES.importedSeedMode]);
    expect(imp.effects).toContainEqual({ kind: "banner", key: "corrupt", text: null, dismissible: false });
    expect(toasts(planReplaceResult(s, false, "newGame", S1, 9, null).effects)).toEqual([APP_MESSAGES.newGameSeedMode]);
  });

  it("persistant ⇒ écrire d'abord ; succès ⇒ remplacé, seed, lastSaved, bandeau corrupt retiré, toast", () => {
    const s = initialSession(1);
    expect(planReplaceResult(s, true, "import", S1, 9, null)).toEqual({ kind: "commit_then_replace", session: s, effects: [] });
    const r = planReplaceResult(s, true, "import", S1, 9, OK_WRITE);
    expect(r.kind).toBe("replaced");
    expect(r.session).toMatchObject({ seed: 9, lastSaved: S1 });
    expect(toasts(r.effects)).toEqual([SAVE_MESSAGES.imported]);
    expect(bannerTexts(r.effects, foldBanners([{ kind: "banner", key: "corrupt", text: "c", dismissible: true }]))).toEqual({});
    expect(toasts(planReplaceResult(s, true, "newGame", S0, 9, OK_WRITE).effects)).toEqual([SAVE_MESSAGES.newGame]);
    expect(replaceSuccessMessage(s, "newGame")).toBe(SAVE_MESSAGES.newGame);
  });

  it("écriture échouée ⇒ état NON remplacé, seed d'origine, toast d'erreur", () => {
    const s = initialSession(1);
    const q = planReplaceResult(s, true, "import", S1, 9, fail("quota"));
    expect(q.kind).toBe("write_failed");
    expect(q.session.seed).toBe(1);
    expect(q.session.lastSaved).toBeNull();
    expect(toasts(q.effects)).toEqual([SAVE_MESSAGES.quota]);
    expect(bannerTexts(q.effects)).toEqual({ unavailable: SAVE_MESSAGES.quota });

    const qf = planReplaceResult(s, true, "newGame", S1, 9, fail("quarantine_failed"));
    expect(toasts(qf.effects)).toEqual([APP_MESSAGES.damagedNotQuarantined]); // pas « nouvelle partie lancée »
    expect(qf.session.suspended).toBe(true);

    const fut = planReplaceResult(s, true, "import", S1, 9, fail("future_version"));
    expect(fut.session).toMatchObject({ temporary: "future", seed: 1 });
    expect(releases(fut.effects)).toBe(true);
  });
});

// --- Changement de propriétaire du verrou --------------------------------------------------------

describe("planOwnerChange", () => {
  const LOCAL = tick(S0, 7); // partie locale (non sauvegardée) de l'onglet secondaire
  const cur = (over: Partial<SaveSession> = {}, notOwnerBanner = true) => ({
    session: { ...initialSession(RANDOM), ...over },
    state: LOCAL,
    notOwnerBanner,
  });

  it("perte du verrou ⇒ bandeau non-propriétaire, autosave coupée (not_owner)", () => {
    expect(ownerChangeNeedsLoad(false, initialSession())).toBe(false);
    const p = planOwnerChange(false, null, cur({}, false));
    expect(p.kind).toBe("lost");
    expect(p.effects[0]).toEqual({ kind: "notifyPersistence" });
    expect(bannerTexts(p.effects)).toEqual({ notOwner: SAVE_MESSAGES.notOwner });
    expect(planAutosave(p.session, { attached: true, isOwner: false, state: LOCAL })).toMatchObject({ reason: "not_owner" });
  });

  it("perte du verrou en partie non persistante ⇒ pas de bandeau", () => {
    for (const over of [{ temporary: "future" as const }, { storageOk: false }]) {
      const p = planOwnerChange(false, null, cur(over));
      expect(p.kind).toBe("lost");
      expect(bannerTexts(p.effects)).toEqual({});
    }
  });

  it("verrou obtenu en partie non persistante ⇒ bandeau retiré, rien d'autre (pas de lecture)", () => {
    for (const over of [{ temporary: "future" as const }, { storageOk: false }]) {
      expect(ownerChangeNeedsLoad(true, cur(over).session)).toBe(false);
      const p = planOwnerChange(true, null, cur(over));
      expect(p.kind).toBe("acquired_not_persistent");
      expect(bannerTexts(p.effects, foldBanners([{ kind: "banner", key: "notOwner", text: "n", dismissible: false }]))).toEqual({});
    }
  });

  it("reprise, sauvegarde valide ⇒ RECHARGÉE (partie locale abandonnée), toast « Partie reprise »", () => {
    expect(ownerChangeNeedsLoad(true, initialSession())).toBe(true);
    const p = planOwnerChange(true, LOADED(), cur());
    if (p.kind !== "resume") throw new Error(p.kind);
    expect(p.state).toEqual(S1);
    expect(p.seed).toBe(SEED);
    expect(p.session).toMatchObject({ seed: SEED, lastSaved: p.state });
    expect(p.storage).toBeNull();
    expect(toasts(p.effects)).toEqual([SAVE_MESSAGES.resumed]);
    expect(bannerTexts(p.effects, foldBanners([{ kind: "banner", key: "notOwner", text: "n", dismissible: false }]))).toEqual({});
    expect(planAutosave(p.session, { attached: true, isOwner: true, state: p.state })).toMatchObject({ reason: "unchanged" });
  });

  it("reprise sans bandeau non-propriétaire affiché (ex. retour bfcache) ⇒ rechargée, sans toast", () => {
    const p = planOwnerChange(true, LOADED(), cur({}, false));
    expect(p.kind).toBe("resume");
    expect(toasts(p.effects)).toEqual([]);
  });

  it("reprise, sauvegarde valide + slot abîmé ⇒ rechargée ; quarantaine KO ⇒ suspendue mais reprise quand même", () => {
    const p = planOwnerChange(true, LOADED_DAMAGED(), cur());
    if (p.kind !== "resume" || !p.storage) throw new Error("reprise avec quarantaine attendue");
    expect(p.storage.commitFresh).toBeNull();
    const out = runStorageSteps(p.session, p.storage, spyIo(false).io);
    expect(out.session.suspended).toBe(true);
    expect(out.session.lastSaved).toBe(p.state);
    expect(bannerTexts(out.effects)).toEqual({ quarantine: APP_MESSAGES.damagedNotQuarantined });
  });

  it("reprise, aucune sauvegarde ⇒ la partie en cours est écrite", () => {
    const p = planOwnerChange(true, FRESH(), cur());
    if (p.kind !== "commit_current") throw new Error(p.kind);
    expect(p.storage.commitFresh).toBe(LOCAL);
    expect(toasts(p.effects)).toEqual([]);
    const { io, calls } = spyIo(true);
    runStorageSteps(p.session, p.storage, io);
    expect(calls.commit).toEqual([[LOCAL, RANDOM]]);
  });

  it("reprise, sauvegarde abîmée ⇒ quarantaine puis écriture de la partie en cours ; KO ⇒ rien écrit", () => {
    const p = planOwnerChange(true, CORRUPT_BOTH(), cur());
    if (p.kind !== "commit_current") throw new Error(p.kind);
    expect(p.storage.quarantine.map((d) => d.slot)).toEqual(["A", "B"]);
    expect(p.storage.effectsAfter).toEqual([]); // pas de bandeau « nouvelle partie lancée » ici
    const ok = spyIo(true);
    runStorageSteps(p.session, p.storage, ok.io);
    expect(ok.calls.commit).toEqual([[LOCAL, RANDOM]]);
    const ko = spyIo(false);
    const out = runStorageSteps(p.session, p.storage, ko.io);
    expect(ko.calls.commit).toEqual([]);
    expect(bannerTexts(out.effects)).toEqual({ quarantine: SAVE_MESSAGES.corruptQuarantineFailed });
  });

  it("reprise, version future ⇒ partie temporaire, verrou rendu", () => {
    const p = planOwnerChange(true, FUTURE(), cur());
    expect(p.kind).toBe("enter_future");
    expect(p.session.temporary).toBe("future");
    expect(releases(p.effects)).toBe(true);
    expect(bannerTexts(p.effects)).toEqual({ temporary: SAVE_MESSAGES.future });
  });

  it("reprise, stockage indisponible (ou load manquant) ⇒ jeu sans sauvegarde, verrou rendu", () => {
    for (const l of [UNAVAILABLE(), null]) {
      const p = planOwnerChange(true, l, cur());
      expect(p.kind).toBe("enter_unavailable");
      expect(p.session.storageOk).toBe(false);
      expect(releases(p.effects)).toBe(true);
      expect(bannerTexts(p.effects)).toEqual({ unavailable: SAVE_MESSAGES.unavailable });
    }
  });
});

describe("noms de fichiers", () => {
  it("export d'une sauvegarde endommagée", () => {
    expect(damagedExportFileName()).toBe("dernier-refuge-endommagee.json");
    expect(damagedExportFileName(123)).toBe("dernier-refuge-endommagee-123.json");
    expect(damagedExportFileName(null)).toBe("dernier-refuge-endommagee-inconnue.json");
  });
});

// --- Intégration : deux onglets sur le même stockage -----------------------------------------------

/** Onglet simulé : même orchestration que src/app/save-controller.ts, sans DOM ni timer. */
class Tab {
  readonly lock: LeaseLock;
  session: SaveSession;
  state: GameState;
  banners: Banners = new Map();
  toasts: string[] = [];
  released = false;

  constructor(
    readonly storage: MemoryStorage,
    id: string,
    readonly clock: { now: () => number },
    randomSeed: number,
  ) {
    this.lock = createLeaseLock({ storage, tabId: id, now: clock.now });
    const owner = this.lock.tryAcquire();
    const plan = planBoot(loadGame(storage), { seedParam: null, isOwner: owner, randomSeed });
    this.session = plan.session;
    this.state = plan.game.state;
    this.apply(plan.effects);
    if (plan.storage) this.run(plan.storage);
    this.lock.onChange((o) => this.onOwnerChange(o));
  }

  private io(): StorageIo {
    return {
      quarantine: (d) => quarantine(this.storage, d, this.clock.now()),
      commitFresh: (s, seed) => commitFresh(this.storage, s, { seed, savedAt: this.clock.now() }, this.lock),
    };
  }
  private run(steps: StorageSteps): void {
    const out = runStorageSteps(this.session, steps, this.io());
    this.session = out.session;
    this.apply(out.effects);
  }
  private apply(effects: readonly SaveEffect[]): void {
    this.banners = foldBanners(effects, this.banners);
    this.toasts.push(...toasts(effects));
    if (releases(effects)) this.release();
  }
  private onOwnerChange(owner: boolean): void {
    const load = ownerChangeNeedsLoad(owner, this.session) ? loadGame(this.storage) : null;
    const p = planOwnerChange(owner, load, {
      session: this.session,
      state: this.state,
      notOwnerBanner: this.banners.has("notOwner"),
    });
    this.session = p.session;
    if (p.kind === "resume") this.state = p.state;
    this.apply(p.effects);
    if ((p.kind === "resume" || p.kind === "commit_current") && p.storage) this.run(p.storage);
  }

  isOwner(): boolean {
    return !this.released && this.lock.isOwner();
  }
  play(ticks: number): void {
    this.state = tick(this.state, ticks);
  }
  autosave(): ReturnType<typeof planAutosave> {
    const d = planAutosave(this.session, { attached: true, isOwner: this.isOwner(), state: this.state });
    if (d.kind === "write") {
      const r = writeSave(this.storage, this.state, { seed: this.session.seed, savedAt: this.clock.now() }, this.lock);
      const w = planWriteResult(this.session, r, this.state);
      this.session = w.session;
      this.apply(w.effects);
    }
    return d;
  }
  heartbeat(): void {
    if (!this.released) this.lock.heartbeat();
  }
  release(): void {
    this.released = true;
    this.lock.release();
  }
  /** pagehide : sauvegarde puis verrou rendu. */
  close(): void {
    this.autosave();
    this.release();
  }
}

describe("intégration : deux onglets (MemoryStorage + verrou par bail)", () => {
  function setup() {
    const storage = createMemoryStorage();
    let t = 1_000_000;
    const clock = { now: () => t };
    const advance = (ms: number): void => void (t += ms);
    return { storage, clock, advance };
  }

  function loadedState(st: MemoryStorage): GameState {
    const r = loadGame(st);
    if (r.kind !== "loaded") throw new Error(r.kind);
    return r.state;
  }

  function twoTabs() {
    const env = setup();
    const tab1 = new Tab(env.storage, "tab1", env.clock, 111);
    expect(tab1.isOwner()).toBe(true);
    expect(loadedState(env.storage)).toEqual(tab1.state); // nouvelle partie écrite au démarrage
    tab1.play(100);
    expect(tab1.autosave()).toEqual({ kind: "write" });

    const tab2 = new Tab(env.storage, "tab2", env.clock, 222);
    expect(tab2.isOwner()).toBe(false);
    expect(tab2.state).toEqual(tab1.state); // copie de la sauvegarde, en lecture seule
    expect(tab2.banners.get("notOwner")?.text).toBe(SAVE_MESSAGES.notOwner);
    expect(replaceBlockedReason(tab2.session, tab2.isOwner())).toBe(APP_MESSAGES.blockedNotOwner);

    // L'onglet secondaire joue mais n'écrit rien.
    tab2.play(40);
    const before = env.storage.snapshot();
    expect(tab2.autosave()).toEqual({ kind: "skip", reason: "not_owner" });
    expect(env.storage.snapshot()).toEqual(before);

    tab1.play(30);
    return { ...env, tab1, tab2 };
  }

  it("le premier onglet se ferme (release) ⇒ le second reprend la sauvegarde la plus récente", () => {
    const { storage, tab1, tab2 } = twoTabs();
    tab1.close();
    const last = tab1.state;
    expect(loadedState(storage)).toEqual(last);

    tab2.heartbeat(); // le prochain heartbeat (ou l'événement storage) retente le verrou
    expect(tab2.isOwner()).toBe(true);
    expect(tab2.state).toEqual(last); // partie locale abandonnée
    expect(tab2.toasts).toEqual([SAVE_MESSAGES.resumed]);
    expect(tab2.banners.size).toBe(0);
    expect(replaceBlockedReason(tab2.session, tab2.isOwner())).toBeNull();
    expect(tab2.autosave()).toEqual({ kind: "skip", reason: "unchanged" });

    tab2.play(10);
    expect(tab2.autosave()).toEqual({ kind: "write" });
    expect(loadedState(storage)).toEqual(tab2.state);
  });

  it("le premier onglet disparaît sans release (bail expiré) ⇒ le second reprend ; le premier perd le verrou", () => {
    const { storage, tab1, tab2, advance } = twoTabs();
    tab1.autosave();
    const last = tab1.state;
    advance(2_000);
    tab2.heartbeat();
    expect(tab2.isOwner()).toBe(false); // bail encore valide

    advance(6_001); // tab1 gelé / planté : plus de heartbeat
    tab2.heartbeat();
    expect(tab2.isOwner()).toBe(true);
    expect(tab2.state).toEqual(last);
    expect(tab2.toasts).toEqual([SAVE_MESSAGES.resumed]);

    // tab1 se réveille : il découvre la perte au heartbeat, n'écrit plus rien.
    tab1.heartbeat();
    expect(tab1.isOwner()).toBe(false);
    expect(tab1.banners.get("notOwner")?.text).toBe(SAVE_MESSAGES.notOwner);
    tab1.play(5);
    expect(tab1.autosave()).toEqual({ kind: "skip", reason: "not_owner" });
    expect(loadedState(storage)).toEqual(last);
  });

  it("reprise alors que la sauvegarde a été abîmée ⇒ quarantaine puis écriture de la partie locale", () => {
    const { storage, tab1, tab2 } = twoTabs();
    tab1.close();
    storage.raw.set(SAVE_KEYS.A, "abîmé A");
    storage.raw.set(SAVE_KEYS.B, "abîmé B");
    const local = tab2.state;

    tab2.heartbeat();
    expect(tab2.isOwner()).toBe(true);
    expect(tab2.state).toBe(local); // rien à recharger : on garde la partie en cours…
    expect(loadedState(storage)).toEqual(local); // …et on l'écrit
    expect(listQuarantine(storage)).toHaveLength(1); // données abîmées mises de côté avant
    expect(tab2.toasts).toEqual([]);
    expect(tab2.banners.size).toBe(0);
  });

  it("reprise alors qu'une version future est apparue ⇒ partie temporaire, rien écrasé, verrou rendu", () => {
    const { storage, tab1, tab2 } = twoTabs();
    tab1.close();
    const future = signed({}, 99);
    storage.raw.set(SAVE_KEYS.B, future);

    tab2.heartbeat();
    expect(tab2.session.temporary).toBe("future");
    expect(tab2.released).toBe(true);
    expect(tab2.isOwner()).toBe(false);
    expect(storage.raw.has(SAVE_KEYS.lock)).toBe(false);
    expect(tab2.banners.get("temporary")?.text).toBe(SAVE_MESSAGES.future);
    tab2.play(5);
    expect(tab2.autosave()).toEqual({ kind: "skip", reason: "temporary" });
    expect(storage.raw.get(SAVE_KEYS.B)).toBe(future);
  });

  it("démarrage avec un slot abîmé et stockage qui refuse la quarantaine ⇒ rien écrasé, suspendu", () => {
    const { storage, clock } = setup();
    storage.raw.set(SAVE_KEYS.A, enc(S1));
    storage.raw.set(SAVE_KEYS.B, "abîmé");
    storage.raw.set(SAVE_KEYS.current, "A");
    // Assez de place pour le bail, pas pour une copie en quarantaine.
    const used = Object.entries(storage.snapshot()).reduce((n, [k, v]) => n + k.length + v.length, 0);
    storage.configure({ quotaChars: used + 80 });
    const tab = new Tab(storage, "solo", clock, 1);
    expect(tab.isOwner()).toBe(true);
    expect(tab.state).toEqual(S1);
    expect(tab.session.suspended).toBe(true);
    expect(tab.banners.get("quarantine")?.text).toBe(APP_MESSAGES.damagedNotQuarantined);
    tab.play(5);
    expect(tab.autosave()).toEqual({ kind: "skip", reason: "suspended" });
    expect(storage.raw.get(SAVE_KEYS.B)).toBe("abîmé");
  });
});
