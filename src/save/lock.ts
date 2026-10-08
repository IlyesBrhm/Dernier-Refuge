// Verrou multi-onglets (docs/design/save.md §3.5) : un seul onglet propriétaire écrit la sauvegarde.
// Deux implémentations : Web Locks (si `navigator.locks`) et bail en stockage (secours).
// Horloge, identifiant d'onglet et stockage sont injectés ⇒ testable sans timer ni DOM.

import { SAVE_CONFIG, SAVE_KEYS } from "./config";
import type { StorageAdapter } from "./storage";

export interface SaveLock {
  isOwner(): boolean;
  /** Appelé à chaque changement de propriété (acquisition / perte). */
  onChange(cb: (owner: boolean) => void): void;
  release(): void;
}

function notifier(): { add(cb: (o: boolean) => void): void; emit(o: boolean): void } {
  const cbs: ((o: boolean) => void)[] = [];
  return {
    add: (cb) => void cbs.push(cb),
    emit(o) {
      for (const cb of cbs) {
        try {
          cb(o);
        } catch {
          // un abonné défaillant ne casse pas le verrou
        }
      }
    },
  };
}

// --- Bail en stockage -------------------------------------------------------------------------

export interface LeaseLock extends SaveLock {
  /** Tente d'acquérir (absent, expiré ou déjà à moi). Renvoie la propriété après tentative. */
  tryAcquire(): boolean;
  /** À appeler toutes les `lockHeartbeatMs` : prolonge si propriétaire, détecte la perte, sinon retente. */
  heartbeat(): void;
}

interface LeaseRecord {
  owner: string;
  expiresAt: number;
}

function parseLease(text: string | null): LeaseRecord | null {
  if (text === null) return null;
  try {
    const v = JSON.parse(text) as Partial<LeaseRecord> | null;
    if (v && typeof v.owner === "string" && typeof v.expiresAt === "number" && Number.isFinite(v.expiresAt)) {
      return { owner: v.owner, expiresAt: v.expiresAt };
    }
  } catch {
    // illisible ⇒ considéré absent
  }
  return null;
}

export function createLeaseLock(opts: {
  storage: StorageAdapter;
  tabId: string;
  now: () => number;
  ttlMs?: number;
}): LeaseLock {
  const { storage, tabId, now } = opts;
  const ttl = opts.ttlMs ?? SAVE_CONFIG.lockTtlMs;
  const listeners = notifier();
  let owned = false;

  function read(): LeaseRecord | null | "error" {
    try {
      const r = storage.getItem(SAVE_KEYS.lock);
      return r.ok ? parseLease(r.value) : "error";
    } catch {
      return "error";
    }
  }
  function writeMine(): boolean {
    const rec: LeaseRecord = { owner: tabId, expiresAt: now() + ttl };
    try {
      if (!storage.setItem(SAVE_KEYS.lock, JSON.stringify(rec)).ok) return false;
    } catch {
      return false;
    }
    const back = read();
    return back !== "error" && back !== null && back.owner === tabId;
  }
  function setOwned(next: boolean): void {
    if (next !== owned) {
      owned = next;
      listeners.emit(next);
    }
  }

  const lock: LeaseLock = {
    isOwner() {
      if (!owned) return false;
      const rec = read();
      return rec !== "error" && rec !== null && rec.owner === tabId && rec.expiresAt > now();
    },
    onChange: listeners.add,
    tryAcquire() {
      const rec = read();
      if (rec === "error") {
        setOwned(false);
        return false;
      }
      const free = rec === null || rec.owner === tabId || rec.expiresAt <= now();
      setOwned(free && writeMine());
      return owned;
    },
    heartbeat() {
      if (!owned) {
        lock.tryAcquire();
        return;
      }
      const rec = read();
      // Toujours à moi (même expiré si personne ne l'a pris, ex. onglet gelé) ⇒ prolonger.
      if (rec !== "error" && rec !== null && rec.owner === tabId) setOwned(writeMine());
      else setOwned(false);
    },
    release() {
      const rec = read();
      if (rec !== "error" && rec !== null && rec.owner === tabId) {
        try {
          storage.removeItem(SAVE_KEYS.lock);
        } catch {
          // rien : le bail expirera
        }
      }
      owned = false;
    },
  };
  return lock;
}

// --- Web Locks --------------------------------------------------------------------------------

/** Sous-ensemble de `LockManager` utilisé (permet un faux en test). */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => unknown,
  ): Promise<unknown>;
}

export interface WebLock extends SaveLock {
  /** Résolue après la première réponse (true = propriétaire immédiatement). */
  ready: Promise<boolean>;
}

/**
 * Verrou Web Locks : tentative immédiate (`ifAvailable`) ; si refusée, requête en attente, obtenue quand
 * l'autre onglet se ferme ⇒ `onChange(true)`. Le verrou est tenu par une promesse résolue par `release()`.
 */
export function createWebLock(locks: LockManagerLike, name: string = SAVE_CONFIG.webLockName): WebLock {
  const listeners = notifier();
  let owned = false;
  let released = false;
  let unlock: (() => void) | null = null;
  const abort = new AbortController();
  let resolveReady: (v: boolean) => void = () => {};
  const ready = new Promise<boolean>((r) => (resolveReady = r));

  function hold(): Promise<void> {
    owned = true;
    listeners.emit(true);
    return new Promise<void>((res) => {
      unlock = res;
      if (released) res();
    });
  }

  function wait(): void {
    if (released) return;
    locks
      .request(name, { signal: abort.signal }, (l) => (l && !released ? hold() : undefined))
      .catch(() => {
        // annulé par release() ou refusé : rien
      });
  }

  locks
    .request(name, { ifAvailable: true }, (l) => {
      if (l && !released) {
        resolveReady(true);
        return hold();
      }
      resolveReady(false);
      wait();
      return undefined;
    })
    .catch(() => resolveReady(false));

  return {
    ready,
    isOwner: () => owned && !released,
    onChange: listeners.add,
    release() {
      released = true;
      owned = false;
      abort.abort();
      unlock?.();
      unlock = null;
    },
  };
}
