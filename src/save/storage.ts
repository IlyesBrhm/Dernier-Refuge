// Abstraction du stockage (docs/design/save.md §3.2), injectable pour les tests.
// Les méthodes renvoient des résultats typés au lieu de lever. src/save se protège quand même contre un
// adaptateur tiers qui lèverait (cf. `safeGet`/`safeSet` dans slots.ts).

import { SAVE_CONFIG } from "./config";

export type StorageError = "unavailable" | "quota" | "security";
export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: StorageError; message?: string };

export interface StorageAdapter {
  getItem(key: string): StorageResult<string | null>;
  setItem(key: string, value: string): StorageResult<void>;
  removeItem(key: string): StorageResult<void>;
  keys(): StorageResult<string[]>;
}

const OK_VOID: StorageResult<void> = { ok: true, value: undefined };

/** Classe une exception du stockage navigateur. */
export function classifyStorageError(e: unknown): StorageError {
  const err = e as { name?: unknown; code?: unknown } | null;
  const name = typeof err?.name === "string" ? err.name : "";
  const code = typeof err?.code === "number" ? err.code : -1;
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014) {
    return "quota";
  }
  if (name === "SecurityError" || code === 18) return "security";
  return "unavailable";
}

function failure<T>(e: unknown): StorageResult<T> {
  return { ok: false, error: classifyStorageError(e), message: e instanceof Error ? e.message : String(e) };
}

// --- localStorage ---------------------------------------------------------------------------------

/**
 * Adaptateur localStorage qui NE LÈVE JAMAIS. `win.localStorage` absent ou dont l'accès lève
 * (SecurityError : cookies bloqués, iframe sandbox…) ⇒ toutes les opérations renvoient l'erreur.
 * Un stockage plein reste lisible : seules les écritures renvoient `quota`.
 */
export function createLocalStorageAdapter(win: { localStorage?: Storage }): StorageAdapter {
  let ls: Storage | null = null;
  let initError: StorageResult<never> | null = null;
  try {
    const candidate = win.localStorage;
    if (candidate === undefined || candidate === null) {
      initError = { ok: false, error: "unavailable", message: "localStorage absent" };
    } else {
      candidate.getItem(`${SAVE_CONFIG.keyPrefix}probe`); // certains navigateurs ne lèvent qu'au premier accès
      ls = candidate;
    }
  } catch (e) {
    initError = failure<never>(e) as StorageResult<never>;
  }
  const store = ls;
  const unavailable = initError ?? { ok: false, error: "unavailable" };

  return {
    getItem(key) {
      if (!store) return unavailable;
      try {
        return { ok: true, value: store.getItem(key) };
      } catch (e) {
        return failure(e);
      }
    },
    setItem(key, value) {
      if (!store) return unavailable;
      try {
        store.setItem(key, value);
        return OK_VOID;
      } catch (e) {
        return failure(e);
      }
    },
    removeItem(key) {
      if (!store) return unavailable;
      try {
        store.removeItem(key);
        return OK_VOID;
      } catch (e) {
        return failure(e);
      }
    },
    keys() {
      if (!store) return unavailable;
      try {
        const out: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k !== null) out.push(k);
        }
        return { ok: true, value: out };
      } catch (e) {
        return failure(e);
      }
    },
  };
}

// --- Mémoire (tests) --------------------------------------------------------------------------

export interface MemoryStorageOptions {
  /** Taille max totale (Σ longueur clé + valeur) ; dépassement ⇒ `quota`. */
  quotaChars?: number;
  /** Toute lecture (getItem, keys) échoue avec `unavailable`. */
  failGet?: boolean;
  /** Toute écriture (setItem, removeItem) échoue avec l'erreur donnée. */
  failSet?: "quota" | "security" | "unavailable" | false;
  /** Transforme la valeur réellement stockée (simule une écriture abîmée). */
  corruptOnWrite?: ((key: string, value: string) => string) | null;
  /** Les méthodes LÈVENT au lieu de renvoyer une erreur (simule un adaptateur tiers mal élevé). */
  throws?: boolean;
}

export interface MemoryStorage extends StorageAdapter {
  /** Copie du contenu (clé → valeur). */
  snapshot(): Record<string, string>;
  /** Change les modes de défaillance en cours de test. */
  configure(opts: MemoryStorageOptions): void;
  /** Écrit directement, sans quota ni défaillance (préparation des tests). */
  raw: Map<string, string>;
}

export function createMemoryStorage(initial: MemoryStorageOptions = {}): MemoryStorage {
  const data = new Map<string, string>();
  let opts: MemoryStorageOptions = { ...initial };

  function error<T>(kind: StorageError): StorageResult<T> {
    if (opts.throws) {
      const e = new Error(`stockage mémoire : ${kind}`);
      e.name = kind === "quota" ? "QuotaExceededError" : kind === "security" ? "SecurityError" : "Error";
      throw e;
    }
    return { ok: false, error: kind, message: `stockage mémoire : ${kind}` };
  }
  function used(exceptKey?: string): number {
    let n = 0;
    for (const [k, v] of data) if (k !== exceptKey) n += k.length + v.length;
    return n;
  }

  return {
    raw: data,
    snapshot: () => Object.fromEntries(data),
    configure(next) {
      opts = { ...opts, ...next };
    },
    getItem(key) {
      if (opts.failGet) return error("unavailable");
      return { ok: true, value: data.get(key) ?? null };
    },
    setItem(key, value) {
      if (opts.failSet) return error(opts.failSet);
      const stored = opts.corruptOnWrite ? opts.corruptOnWrite(key, value) : value;
      if (opts.quotaChars !== undefined && used(key) + key.length + stored.length > opts.quotaChars) {
        return error("quota");
      }
      data.set(key, stored);
      return OK_VOID;
    },
    removeItem(key) {
      if (opts.failSet) return error(opts.failSet);
      data.delete(key);
      return OK_VOID;
    },
    keys() {
      if (opts.failGet) return error("unavailable");
      return { ok: true, value: [...data.keys()] };
    },
  };
}
