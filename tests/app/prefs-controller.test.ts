// Contrôleur de préférences (src/app/prefs-controller.ts) face à des préférences abîmées : démarrage sur
// les défauts sans rien réécrire, `storage` sur la clé sans effet tant que rien ne change, puis une seule
// écriture (JSON valide) après un changement réel et l'échéance du minuteur.

import { createPrefsController } from "../../src/app/prefs-controller";
import { DEFAULT_PREFS, PREFS_KEY, PREFS_MAX_CHARS, type Prefs } from "../../src/save/prefs";

type Listener = (e: unknown) => void;

interface FakeWin {
  win: Window;
  writes: { key: string; value: string }[];
  store: Map<string, string>;
  timers: (() => void)[];
  listeners: Map<string, Listener[]>;
  dataset: Record<string, string | undefined>;
  fire(type: string, e: unknown): void;
  runTimers(): void;
}

function fakeWindow(initial: Record<string, string>): FakeWin {
  const store = new Map(Object.entries(initial));
  const writes: { key: string; value: string }[] = [];
  const timers: (() => void)[] = [];
  const listeners = new Map<string, Listener[]>();
  const dataset: Record<string, string | undefined> = {};
  const addTo = (map: Map<string, Listener[]>) => (type: string, fn: Listener) => {
    map.set(type, [...(map.get(type) ?? []), fn]);
  };
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes.push({ key: k, value: v });
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };
  const win = {
    localStorage,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    document: {
      documentElement: { dataset },
      visibilityState: "visible",
      addEventListener: addTo(new Map()),
    },
    addEventListener: addTo(listeners),
    setTimeout: (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => {},
    performance: { now: () => 0 },
  };
  return {
    win: win as unknown as Window,
    writes,
    store,
    timers,
    listeners,
    dataset,
    fire(type, e) {
      for (const fn of listeners.get(type) ?? []) fn(e);
    },
    runTimers() {
      const pending = timers.splice(0);
      for (const fn of pending) fn();
    },
  };
}

const DAMAGED: [string, string][] = [
  ["JSON invalide", "{oops"],
  ["volume 999", JSON.stringify({ ...DEFAULT_PREFS, sfxVolume: 999 })],
  ["version future", JSON.stringify({ ...DEFAULT_PREFS, version: 2 })],
  ["clé géante", JSON.stringify({ ...DEFAULT_PREFS, junk: "x".repeat(PREFS_MAX_CHARS + 10) })],
];

describe("createPrefsController : préférences abîmées", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const [name, raw] of DAMAGED) {
    it(`${name} : défauts, data-motion=full, aucune écriture ; storage sans effet ; muted ⇒ une écriture`, () => {
      const f = fakeWindow({ [PREFS_KEY]: raw });
      const ctl = createPrefsController(f.win, false);

      // Défauts, sans réécriture à la création.
      expect(ctl.get()).toEqual(DEFAULT_PREFS);
      expect(f.dataset.motion).toBe("full");
      expect(f.writes).toEqual([]);
      expect(f.timers).toHaveLength(0);

      // Un autre onglet « touche » la clé (texte toujours abîmé) : rien ne change.
      const sub = vi.fn();
      ctl.subscribe(sub);
      f.fire("storage", { key: PREFS_KEY, newValue: raw, oldValue: null });
      expect(sub).not.toHaveBeenCalled();
      expect(f.writes).toEqual([]);
      expect(f.timers).toHaveLength(0);
      expect(ctl.get()).toEqual(DEFAULT_PREFS);

      // Changement réel : une seule écriture à l'échéance du minuteur, JSON valide, muted: true.
      ctl.update({ muted: true });
      expect(f.writes).toEqual([]);
      expect(f.timers).toHaveLength(1);
      f.runTimers();
      expect(f.writes).toHaveLength(1);
      const w = f.writes[0];
      expect(w?.key).toBe(PREFS_KEY);
      const saved = JSON.parse(w?.value ?? "") as Prefs;
      expect(saved.muted).toBe(true);
      expect(saved).toEqual({ ...DEFAULT_PREFS, muted: true });
      expect(sub).toHaveBeenCalledTimes(1);
      ctl.flush();
      expect(f.writes).toHaveLength(1);
    });
  }
});
