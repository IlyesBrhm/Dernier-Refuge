import {
  classifyStorageError,
  createLeaseLock,
  createLocalStorageAdapter,
  createMemoryStorage,
  createWebLock,
  loadGame,
  SAVE_CONFIG,
  SAVE_KEYS,
  writeSave,
  type LockManagerLike,
} from "../../src/save/index";
import { createInitialState } from "../../src/core/index";
import { SAVED_AT, SEED } from "./helpers";

/** Faux `Storage` du navigateur, avec erreurs injectables. */
class FakeStorage implements Storage {
  data = new Map<string, string>();
  failSet: Error | null = null;
  failGet: Error | null = null;
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  key(i: number): string | null {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    if (this.failGet) throw this.failGet;
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.failSet) throw this.failSet;
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    if (this.failSet) throw this.failSet;
    this.data.delete(k);
  }
}

function named(name: string, code?: number): Error {
  const e = new Error(name);
  e.name = name;
  if (code !== undefined) Object.assign(e, { code });
  return e;
}

describe("createLocalStorageAdapter (ne lève jamais)", () => {
  it("fonctionne avec un Storage sain (aller-retour complet de sauvegarde)", () => {
    const ls = new FakeStorage();
    const st = createLocalStorageAdapter({ localStorage: ls });
    const s = createInitialState(SEED);
    expect(writeSave(st, s, { seed: SEED, savedAt: SAVED_AT }, { isOwner: () => true }).ok).toBe(true);
    expect(st.keys()).toEqual({ ok: true, value: expect.arrayContaining([SAVE_KEYS.A, SAVE_KEYS.current]) });
    const r = loadGame(st);
    expect(r.kind === "loaded" && r.state).toEqual(s);
    expect(st.removeItem(SAVE_KEYS.A)).toEqual({ ok: true, value: undefined });
  });

  it("localStorage absent ⇒ toutes les opérations renvoient unavailable ; loadGame ⇒ unavailable", () => {
    const st = createLocalStorageAdapter({});
    expect(st.getItem("x")).toMatchObject({ ok: false, error: "unavailable" });
    expect(st.setItem("x", "y")).toMatchObject({ ok: false, error: "unavailable" });
    expect(st.removeItem("x")).toMatchObject({ ok: false, error: "unavailable" });
    expect(st.keys()).toMatchObject({ ok: false, error: "unavailable" });
    expect(loadGame(st)).toEqual({ kind: "unavailable", error: "unavailable" });
  });

  it("accès à window.localStorage qui lève SecurityError ⇒ security, sans exception", () => {
    const win = {} as { localStorage?: Storage };
    Object.defineProperty(win, "localStorage", {
      get() {
        throw named("SecurityError", 18);
      },
    });
    const st = createLocalStorageAdapter(win);
    expect(st.getItem("x")).toMatchObject({ ok: false, error: "security" });
    expect(loadGame(st)).toEqual({ kind: "unavailable", error: "security" });
  });

  it("premier accès qui lève ⇒ indisponible", () => {
    const ls = new FakeStorage();
    ls.failGet = named("SecurityError");
    const st = createLocalStorageAdapter({ localStorage: ls });
    ls.failGet = null;
    expect(st.getItem("x")).toMatchObject({ ok: false, error: "security" });
  });

  it("stockage plein : lecture possible, écriture ⇒ quota (nom ou code 22/1014)", () => {
    for (const err of [named("QuotaExceededError"), named("NS_ERROR_DOM_QUOTA_REACHED"), named("Error", 22), named("Error", 1014)]) {
      const ls = new FakeStorage();
      ls.data.set("k", "v");
      ls.failSet = err;
      const st = createLocalStorageAdapter({ localStorage: ls });
      expect(st.getItem("k")).toEqual({ ok: true, value: "v" });
      expect(st.setItem("k", "w")).toMatchObject({ ok: false, error: "quota" });
      const w = writeSave(st, createInitialState(1), { seed: 1, savedAt: 1 }, { isOwner: () => true });
      expect(w).toMatchObject({ ok: false, error: "quota" });
    }
  });

  it("exception quelconque en lecture ⇒ unavailable", () => {
    const ls = new FakeStorage();
    const st = createLocalStorageAdapter({ localStorage: ls });
    ls.failGet = new Error("disque");
    expect(st.getItem("x")).toMatchObject({ ok: false, error: "unavailable" });
    expect(classifyStorageError(null)).toBe("unavailable");
    expect(classifyStorageError("x")).toBe("unavailable");
  });
});

describe("createMemoryStorage", () => {
  it("modes indisponible et plein", () => {
    const st = createMemoryStorage({ failGet: true });
    expect(st.getItem("a")).toMatchObject({ ok: false, error: "unavailable" });
    const full = createMemoryStorage({ quotaChars: 5 });
    expect(full.setItem("ab", "cd")).toEqual({ ok: true, value: undefined });
    expect(full.setItem("ab", "cde")).toEqual({ ok: true, value: undefined }); // 5 = limite
    expect(full.setItem("ab", "cdef")).toMatchObject({ ok: false, error: "quota" });
    expect(full.snapshot()).toEqual({ ab: "cde" }); // échec ⇒ ancienne valeur conservée
    expect(full.setItem("ab", "c")).toEqual({ ok: true, value: undefined }); // remplacement compté une fois
    expect(full.snapshot()).toEqual({ ab: "c" });
  });
});

describe("verrou par bail (horloge et onglets injectés, sans timer)", () => {
  function setup() {
    const storage = createMemoryStorage();
    let t = 1000;
    const now = (): number => t;
    const advance = (ms: number): void => void (t += ms);
    const tab1 = createLeaseLock({ storage, tabId: "tab1", now });
    const tab2 = createLeaseLock({ storage, tabId: "tab2", now });
    return { storage, tab1, tab2, advance };
  }

  it("1er onglet propriétaire, 2e non", () => {
    const { tab1, tab2 } = setup();
    expect(tab1.tryAcquire()).toBe(true);
    expect(tab2.tryAcquire()).toBe(false);
    expect(tab1.isOwner()).toBe(true);
    expect(tab2.isOwner()).toBe(false);
  });

  it("le heartbeat prolonge le bail", () => {
    const { tab1, tab2, advance } = setup();
    tab1.tryAcquire();
    for (let i = 0; i < 10; i++) {
      advance(SAVE_CONFIG.lockHeartbeatMs);
      tab1.heartbeat();
      expect(tab2.tryAcquire()).toBe(false);
    }
    expect(tab1.isOwner()).toBe(true);
  });

  it("propriétaire silencieux > TTL ⇒ l'autre acquiert ; perte détectée au heartbeat ⇒ onChange(false)", () => {
    const { tab1, tab2, advance } = setup();
    const events: boolean[] = [];
    tab1.onChange((o) => events.push(o));
    tab1.tryAcquire();
    advance(SAVE_CONFIG.lockTtlMs + 1);
    expect(tab1.isOwner()).toBe(false); // expiré
    expect(tab2.tryAcquire()).toBe(true);
    tab1.heartbeat();
    expect(events).toEqual([true, false]);
    expect(tab1.isOwner()).toBe(false);
    expect(tab2.isOwner()).toBe(true);
  });

  it("onglet gelé mais personne n'a pris le bail ⇒ le heartbeat le reprend", () => {
    const { tab1, advance } = setup();
    tab1.tryAcquire();
    advance(SAVE_CONFIG.lockTtlMs * 3);
    tab1.heartbeat();
    expect(tab1.isOwner()).toBe(true);
  });

  it("release ⇒ acquisition immédiate par l'autre (via son heartbeat) ⇒ onChange(true)", () => {
    const { tab1, tab2, storage } = setup();
    const events: boolean[] = [];
    tab2.onChange((o) => events.push(o));
    tab1.tryAcquire();
    tab2.heartbeat();
    expect(tab2.isOwner()).toBe(false);
    tab1.release();
    expect(storage.raw.has(SAVE_KEYS.lock)).toBe(false);
    tab2.heartbeat();
    expect(tab2.isOwner()).toBe(true);
    expect(events).toEqual([true]);
    // release d'un non-propriétaire ne supprime pas le bail des autres.
    tab1.release();
    expect(tab2.isOwner()).toBe(true);
  });

  it("writeSave d'un non-propriétaire ⇒ not_owner", () => {
    const { tab1, tab2, storage } = setup();
    tab1.tryAcquire();
    tab2.tryAcquire();
    const s = createInitialState(SEED);
    expect(writeSave(storage, s, { seed: SEED, savedAt: 1 }, tab2)).toMatchObject({ ok: false, error: "not_owner" });
    expect(writeSave(storage, s, { seed: SEED, savedAt: 1 }, tab1).ok).toBe(true);
  });

  it("bail illisible ⇒ considéré libre ; stockage indisponible ⇒ jamais propriétaire, sans exception", () => {
    const { tab1, storage } = setup();
    storage.raw.set(SAVE_KEYS.lock, "{pas du json");
    expect(tab1.tryAcquire()).toBe(true);
    const dead = createLeaseLock({ storage: createMemoryStorage({ failGet: true, throws: true }), tabId: "x", now: () => 0 });
    expect(() => dead.tryAcquire()).not.toThrow();
    expect(dead.isOwner()).toBe(false);
    expect(() => dead.heartbeat()).not.toThrow();
    expect(() => dead.release()).not.toThrow();
  });
});

/** Faux LockManager : un verrou exclusif, file d'attente FIFO, ifAvailable et AbortSignal. */
function fakeLockManager(): LockManagerLike {
  let held = false;
  const waiting: { cb: (l: unknown) => unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
  function grant(cb: (l: unknown) => unknown, resolve: (v: unknown) => void, reject: (e: unknown) => void): void {
    held = true;
    Promise.resolve()
      .then(() => cb({ name: "lock" }))
      .then(resolve, reject)
      .finally(() => {
        held = false;
        const next = waiting.shift();
        if (next) grant(next.cb, next.resolve, next.reject);
      });
  }
  return {
    request(_name, options, cb) {
      return new Promise((resolve, reject) => {
        if (!held) return grant(cb, resolve, reject);
        if (options.ifAvailable) {
          Promise.resolve()
            .then(() => cb(null))
            .then(resolve, reject);
          return;
        }
        const w = { cb, resolve, reject };
        waiting.push(w);
        options.signal?.addEventListener("abort", () => {
          const i = waiting.indexOf(w);
          if (i >= 0) waiting.splice(i, 1);
          reject(new Error("AbortError"));
        });
      });
    },
  };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("verrou Web Locks (faux LockManager)", () => {
  it("1er onglet propriétaire, 2e en attente ; release du 1er ⇒ le 2e devient propriétaire (onChange(true))", async () => {
    const locks = fakeLockManager();
    const tab1 = createWebLock(locks);
    expect(await tab1.ready).toBe(true);
    const tab2 = createWebLock(locks);
    const events: boolean[] = [];
    tab2.onChange((o) => events.push(o));
    expect(await tab2.ready).toBe(false);
    expect(tab1.isOwner()).toBe(true);
    expect(tab2.isOwner()).toBe(false);
    tab1.release();
    expect(tab1.isOwner()).toBe(false);
    await flush();
    expect(tab2.isOwner()).toBe(true);
    expect(events).toEqual([true]);
    tab2.release();
  });

  it("release d'un onglet en attente annule sa requête : le verrou va au suivant", async () => {
    const locks = fakeLockManager();
    const tab1 = createWebLock(locks);
    await tab1.ready;
    const tab2 = createWebLock(locks);
    const tab3 = createWebLock(locks);
    await tab2.ready;
    await tab3.ready;
    tab2.release();
    tab1.release();
    await flush();
    expect(tab2.isOwner()).toBe(false);
    expect(tab3.isOwner()).toBe(true);
  });

  it("LockManager qui rejette ⇒ jamais propriétaire, ready = false, pas de rejet non géré", async () => {
    const broken: LockManagerLike = { request: () => Promise.reject(new Error("refusé")) };
    const lock = createWebLock(broken);
    expect(await lock.ready).toBe(false);
    expect(lock.isOwner()).toBe(false);
  });
});
