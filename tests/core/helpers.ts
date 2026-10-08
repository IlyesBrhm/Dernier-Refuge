// Utilitaires de test pour le cœur logique (pas un fichier de test).

import { PLAYER, WORLD } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { checkInvariants } from "../../src/core/invariants";
import { tileCenter, tileOf, sameTile } from "../../src/core/map";
import { findPath } from "../../src/core/path";
import { cloneState, createInitialState, type GameState, type TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";

export const SEED = 12345;

export function fresh(seed = SEED): GameState {
  return createInitialState(seed);
}

/** Fixture : copie de l'état avec le joueur au centre de `tile` (input conservé). */
export function place(state: GameState, tile: TilePos): GameState {
  const s = cloneState(state);
  s.player.pos = tileCenter(tile);
  return s;
}

/** Fixture : modifie une copie de l'état. */
export function edit(state: GameState, fn: (draft: GameState) => void): GameState {
  const s = cloneState(state);
  fn(s);
  return s;
}

export function expectValid(state: GameState): void {
  expect(checkInvariants(state)).toEqual([]);
}

/** Avance de n ticks un par un en vérifiant les invariants après chaque tick. */
export function run(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = tick(s);
    expectValid(s);
  }
  return s;
}

/** Avance jusqu'à ce que `pred` soit vrai (vérifie les invariants) ; échoue après `max` ticks. */
export function runUntil(state: GameState, pred: (s: GameState) => boolean, max = 2000): GameState {
  let s = state;
  for (let i = 0; i < max; i++) {
    if (pred(s)) return s;
    s = tick(s);
    expectValid(s);
  }
  if (pred(s)) return s;
  throw new Error(`condition non atteinte en ${max} ticks`);
}

export function move(state: GameState, dx: number, dy: number): GameState {
  const r = applyCommand(state, { type: "setMoveInput", dx, dy });
  expect(r.ok).toBe(true);
  return r.state;
}

/** État où la tête de file est arrivée à l'emplacement 0 (joueur hors de W). */
export function withHeadQueued(seed = SEED): GameState {
  return runUntil(fresh(seed), (s) => {
    const head = s.survivors.find((v) => v.id === s.queue[0]);
    return head?.status === "queued";
  });
}

export function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

/**
 * Direction de déplacement pour qu'un bot rejoigne `target` via les commandes uniquement :
 * suit le chemin BFS de tuile en tuile en s'alignant sur l'axe perpendiculaire.
 */
export function steer(state: GameState, target: TilePos): { dx: number; dy: number } {
  const here = tileOf(state.player.pos);
  if (sameTile(here, target)) return { dx: 0, dy: 0 };
  const next = findPath(state.map, here, target)?.[0];
  if (!next) return { dx: 0, dy: 0 };
  const c = tileCenter(next);
  const p = state.player.pos;
  const tol = WORLD.unitsPerTile / 2 - PLAYER.halfSize;
  const horizontal = next.tx !== here.tx;
  const dA = horizontal ? c.x - p.x : c.y - p.y;
  const dB = horizontal ? c.y - p.y : c.x - p.x;
  const sA = Math.sign(dA);
  const sB = Math.sign(dB);
  let a = sA;
  let b = 0;
  if (Math.abs(dB) > tol) {
    b = sB;
    if (Math.abs(dB) > PLAYER.diagonalSpeed + tol) a = 0;
  }
  return horizontal ? { dx: a, dy: b } : { dx: b, dy: a };
}
