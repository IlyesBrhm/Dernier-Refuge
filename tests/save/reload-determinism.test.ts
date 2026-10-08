// Reprise exacte (docs/design/save.md §1.2 et §6) : une partie pilotée par un bot, avec une suite de
// commandes FIGÉE (enregistrée lors d'un premier passage), donne exactement le même état final qu'on
// sauvegarde/recharge ou non, quel que soit le moment du rechargement (entre une commande acceptée et le
// tick suivant, pendant une récolte, pendant un paiement de chantier, avec des drops au sol…), et même
// avec de nombreux rechargements successifs.

import {
  applyCommand,
  checkInvariants,
  createInitialState,
  findHarvestTarget,
  referenceMap,
  sameTile,
  tick,
  tileOf,
  type Command,
  type GameState,
} from "../../src/core/index";
import { nextRandom, type RngState } from "../../src/core/rng";
import {
  createMemoryStorage,
  encodeSave,
  exportSave,
  importSave,
  loadGame,
  SAVE_KEYS,
  writeSave,
  type MemoryStorage,
} from "../../src/save/index";
import { botGoal, steer } from "../core/helpers";
import { OWNER, SAVED_AT } from "./helpers";

/** 3 600 ticks = 6 min de jeu (1 tick = 100 ms). */
const TICKS = 3600;
const SEEDS = [1, 4242, 99_991, 0xdeadbeef];

type Phase = "afterCommands" | "afterTick";
const key = (i: number, phase: Phase): string => `${i}:${phase}`;

/** Moments « intéressants » où sauvegarder (évalués sur l'état au point considéré). */
const MOMENTS: Record<string, (s: GameState, phase: Phase) => boolean> = {
  "commande acceptée, tick pas encore joué": (s, phase) => phase === "afterCommands" && s.commandsThisTick > 0,
  "récolte en cours": (s) => (findHarvestTarget(s)?.progress ?? 0) > 0,
  "paiement de chantier en cours": (s) => {
    const here = tileOf(s.player.pos);
    return s.buildSlots.some((b) => b.builtTentId === null && b.paid > 0 && b.paid < b.cost && sameTile(b.tile, here));
  },
  "drops au sol": (s) => s.drops.length > 0,
  "survivant en marche": (s) => s.survivors.some((v) => v.path.length > 0),
  "accueil en cours": (s) => s.welcomeProgress > 0,
  "nettoyage de tente en cours": (s) => s.tents.some((t) => t.status === "messy" && t.cleanProgress > 0),
  "nœud épuisé en repousse": (s) => s.nodes.some((n) => n.status === "depleted"),
  "survivant au repos": (s) => s.survivors.some((v) => v.status === "resting"),
};

interface RunA {
  /** Commandes envoyées avant le tick i (certaines sont volontairement refusées). */
  script: Command[][];
  /** rng après chaque tick. */
  rngs: number[];
  final: GameState;
  /** Points de rechargement choisis → texte canonique de l'état de A à ce point. */
  points: Map<string, string>;
  /** Moments couverts → nombre de points choisis. */
  covered: Record<string, number>;
  refused: number;
}

function canonicalText(s: GameState): string {
  const r = encodeSave(s, { seed: 0, savedAt: 0 });
  if (!r.ok) throw new Error(`encodage impossible : ${r.error}`);
  return r.text;
}

/**
 * Passage A (sans rechargement) : bot utile + bruit déterministe (commandes aléatoires, commandes
 * invalides, rafales au-delà de la limite par tick, inactivité). Enregistre la suite de commandes et
 * choisit les points de rechargement.
 */
function runA(seed: number, extraPoints: (i: number) => Phase[]): RunA {
  let noise: RngState = (seed ^ 0x9e3779b9) >>> 0;
  const rand = (): number => {
    const [r, n] = nextRandom(noise);
    noise = n;
    return r;
  };
  const script: Command[][] = [];
  const rngs: number[] = [];
  const points = new Map<string, string>();
  const covered: Record<string, number> = Object.fromEntries(Object.keys(MOMENTS).map((m) => [m, 0]));
  // Pour chaque moment : au plus un point dans chacune de ces fenêtres (répartit les rechargements).
  const windows = [100, 900, 1800, 2700];
  const taken = new Set<string>();
  let refused = 0;

  const consider = (s: GameState, i: number, phase: Phase): void => {
    const w = windows.filter((x) => i >= x).length - 1;
    for (const [name, pred] of Object.entries(MOMENTS)) {
      if (w < 0 || taken.has(`${name}#${w}`) || !pred(s, phase)) continue;
      taken.add(`${name}#${w}`);
      covered[name] = (covered[name] ?? 0) + 1;
      points.set(key(i, phase), canonicalText(s));
    }
    if (extraPoints(i).includes(phase)) points.set(key(i, phase), canonicalText(s));
  };

  let s = createInitialState(seed);
  for (let i = 0; i < TICKS; i++) {
    const cmds: Command[] = [];
    const r = rand();
    if (r < 0.03) cmds.push({ type: "setMoveInput", dx: Math.floor(rand() * 3) - 1, dy: Math.floor(rand() * 3) - 1 });
    else if (r < 0.04) cmds.push({ type: "setMoveInput", dx: 2, dy: 0 }); // invalide ⇒ refusée
    else if (r < 0.045) for (let k = 0; k < 10; k++) cmds.push({ type: "setMoveInput", dx: k % 2, dy: 0 }); // rafale
    const idle = rand() < 0.02;
    for (const c of cmds) {
      const res = applyCommand(s, c);
      if (!res.ok) refused++;
      s = res.state;
    }
    if (!idle) {
      const want = steer(s, botGoal(s));
      if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) {
        const c: Command = { type: "setMoveInput", ...want };
        cmds.push(c);
        const res = applyCommand(s, c);
        if (!res.ok) refused++;
        s = res.state;
      }
    }
    script.push(cmds);
    consider(s, i, "afterCommands");
    s = tick(s);
    rngs.push(s.rng);
    consider(s, i, "afterTick");
  }
  return { script, rngs, final: s, points, covered, refused };
}

/** Rechargeur : alterne stockage A/B (writeSave + loadGame) et export/import. */
function makeReloader(seed: number): { reload: (s: GameState, n: number) => GameState; storage: MemoryStorage; count: () => number } {
  const storage = createMemoryStorage();
  let n = 0;
  let lastSlot: string | undefined;
  const reload = (s: GameState, savedAtOffset: number): GameState => {
    n++;
    const meta = { seed, savedAt: SAVED_AT + savedAtOffset };
    if (n % 3 === 0) {
      const e = exportSave(s, meta);
      if (!e.ok) throw new Error(`export : ${e.error}`);
      const r = importSave(e.text);
      if (!r.ok) throw new Error(`import : ${r.error} ${r.details.join("; ")}`);
      expect(r.state).toEqual(s);
      expect(r.state.map).toBe(referenceMap());
      return r.state;
    }
    const w = writeSave(storage, s, meta, OWNER);
    if (!w.ok) throw new Error(`writeSave : ${w.error} ${w.details.join("; ")}`);
    // Alternance A/B : jamais deux fois de suite le même slot.
    expect(w.slot).not.toBe(lastSlot);
    lastSlot = w.slot;
    const l = loadGame(storage);
    if (l.kind !== "loaded") throw new Error(`loadGame : ${l.kind}`);
    expect(l.slot).toBe(w.slot);
    expect(l.damaged).toEqual([]);
    expect(l.state).toEqual(s);
    expect(l.state).not.toBe(s);
    expect(l.state.map).toBe(referenceMap());
    return l.state;
  };
  return { reload, storage, count: () => n };
}

/** Rejoue la suite de commandes ; `reloadAt(i, phase)` = nombre de rechargements à enchaîner à ce point. */
function replay(
  seed: number,
  a: RunA,
  reloadAt: (i: number, phase: Phase) => number,
  reload: (s: GameState, n: number) => GameState,
): GameState {
  let s = createInitialState(seed);
  const at = (i: number, phase: Phase): void => {
    const n = reloadAt(i, phase);
    if (n === 0) return;
    const expected = a.points.get(key(i, phase));
    if (expected !== undefined) expect(canonicalText(s), `état au point ${key(i, phase)}`).toBe(expected);
    for (let k = 0; k < n; k++) s = reload(s, i * 2 + (phase === "afterTick" ? 1 : 0));
    expect(checkInvariants(s)).toEqual([]);
  };
  for (let i = 0; i < TICKS; i++) {
    for (const c of a.script[i] ?? []) s = applyCommand(s, c).state;
    at(i, "afterCommands");
    s = tick(s);
    if (s.rng !== a.rngs[i]) throw new Error(`rng divergent au tick ${i} : ${s.rng} ≠ ${a.rngs[i]}`);
    at(i, "afterTick");
  }
  return s;
}

/** Points supplémentaires : périodiques, et une fenêtre de rechargements à CHAQUE point consécutif. */
const PERIOD = 97;
const WINDOW: [number, number] = [1234, 1264];
function extraPoints(i: number): Phase[] {
  if (i >= WINDOW[0] && i < WINDOW[1]) return ["afterCommands", "afterTick"];
  if (i % PERIOD === 0) return [i % 2 === 0 ? "afterTick" : "afterCommands"];
  return [];
}

describe.each(SEEDS)("seed %i : même suite de commandes ⇒ même état, avec ou sans rechargement", (seed) => {
  let A: RunA;
  beforeAll(() => {
    A = runA(seed, extraPoints);
  });

  it("le passage de référence est riche : tous les moments visés sont rencontrés, des commandes sont refusées", () => {
    for (const [moment, n] of Object.entries(A.covered)) expect(n, moment).toBeGreaterThan(0);
    expect(A.refused).toBeGreaterThan(0);
    expect(A.final.tick).toBe(TICKS);
    expect(checkInvariants(A.final)).toEqual([]);
    // La partie a réellement progressé (sinon le test serait trivial).
    expect(A.final.buildSlots.some((b) => b.builtTentId !== null)).toBe(true);
    expect(A.final.nodes.some((n) => n.status === "depleted") || A.final.drops.length > 0 || A.final.resources.food > 5).toBe(true);
  });

  it("rejouer la suite figée sans rechargement redonne exactement A (la suite détermine tout)", () => {
    const s = replay(seed, A, () => 0, () => {
      throw new Error("pas de rechargement attendu");
    });
    expect(s).toEqual(A.final);
  });

  it("un rechargement à chaque moment visé (un à la fois) ⇒ même état final", () => {
    // Un passage par moment : un seul rechargement, au premier point choisi pour ce moment.
    const firstByMoment = new Map<string, string>();
    let sA = createInitialState(seed);
    for (let i = 0; i < TICKS && firstByMoment.size < Object.keys(MOMENTS).length; i++) {
      for (const c of A.script[i] ?? []) sA = applyCommand(sA, c).state;
      for (const phase of ["afterCommands", "afterTick"] as const) {
        if (phase === "afterTick") sA = tick(sA);
        for (const [name, pred] of Object.entries(MOMENTS)) {
          if (i >= 100 && !firstByMoment.has(name) && pred(sA, phase)) firstByMoment.set(name, key(i, phase));
        }
      }
    }
    expect(firstByMoment.size).toBe(Object.keys(MOMENTS).length);
    for (const [moment, point] of firstByMoment) {
      const { reload, count } = makeReloader(seed);
      const s = replay(seed, A, (i, phase) => (key(i, phase) === point ? 1 : 0), reload);
      expect(count(), moment).toBe(1);
      expect(s, moment).toEqual(A.final);
    }
  });

  it("rechargements successifs (tous les points choisis, fenêtre à chaque tick, doubles rechargements) ⇒ même état final", () => {
    const { reload, count, storage } = makeReloader(seed);
    const s = replay(
      seed,
      A,
      (i, phase) => {
        if (!A.points.has(key(i, phase))) return 0;
        return i % 5 === 0 ? 2 : 1; // parfois deux rechargements d'affilée sans tick entre eux
      },
      reload,
    );
    expect(count()).toBeGreaterThanOrEqual(A.points.size);
    expect(A.points.size).toBeGreaterThan(80);
    expect(s).toEqual(A.final);
    // Les deux slots contiennent des sauvegardes valides et le pointeur vise la dernière.
    expect(storage.raw.get(SAVE_KEYS.A)).toBeTruthy();
    expect(storage.raw.get(SAVE_KEYS.B)).toBeTruthy();
  });

  it("enchaînement d'états rechargés : continuer depuis la sauvegarde puis re-sauvegarder ne dérive pas", () => {
    // Variante sans suite figée côté B : on recharge à chaque tick pendant 300 ticks à partir d'un état
    // de mi-partie, en rejouant les commandes de A ; l'état doit coller à A tick par tick.
    const start = 1500;
    const { reload } = makeReloader(seed);
    let a = createInitialState(seed);
    for (let i = 0; i < start; i++) {
      for (const c of A.script[i] ?? []) a = applyCommand(a, c).state;
      a = tick(a);
    }
    let b = reload(a, 0);
    for (let i = start; i < start + 300; i++) {
      for (const c of A.script[i] ?? []) {
        a = applyCommand(a, c).state;
        b = applyCommand(b, c).state;
      }
      b = reload(b, i);
      a = tick(a);
      b = tick(b);
      expect(b.rng).toBe(A.rngs[i]);
    }
    expect(b).toEqual(a);
  });
});
