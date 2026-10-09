// Utilitaires de test pour le modèle de scène 3D (pas un fichier de test).

import { applyCommand } from "../../src/core/commands";
import { checkInvariants } from "../../src/core/invariants";
import type { GameState } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { botGoal, fresh, steer } from "../core/helpers";

/**
 * Simulation par le bot « utile » de tests/core (commandes uniquement). Renvoie la suite des états
 * consécutifs : `states[0]` = état initial, `states[i + 1]` = après le i-ème tick.
 */
export function simulate(seed: number, ticks: number): GameState[] {
  let s = fresh(seed);
  const out: GameState[] = [s];
  for (let i = 0; i < ticks; i++) {
    const want = steer(s, botGoal(s));
    if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) {
      const r = applyCommand(s, { type: "setMoveInput", ...want });
      if (!r.ok) throw new Error(`commande refusée au tick ${s.tick}`);
      s = r.state;
    }
    s = tick(s);
    const errors = checkInvariants(s);
    if (errors.length > 0) throw new Error(`tick ${s.tick}: ${errors.join("; ")}`);
    out.push(s);
  }
  return out;
}

/** Première paire (prev, curr) consécutive vérifiant `pred`, ou erreur explicite. */
export function findPair(
  states: readonly GameState[],
  pred: (prev: GameState, curr: GameState) => boolean,
  what: string,
): [GameState, GameState] {
  for (let i = 1; i < states.length; i++) {
    const p = states[i - 1] as GameState;
    const c = states[i] as GameState;
    if (pred(p, c)) return [p, c];
  }
  throw new Error(`aucune paire d'états : ${what}`);
}

/** Toutes les valeurs numériques (récursivement) d'une valeur JSON-like. */
export function numbersIn(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number") out.push(v);
  else if (Array.isArray(v)) for (const x of v) numbersIn(x, out);
  else if (v !== null && typeof v === "object") for (const x of Object.values(v)) numbersIn(x, out);
  return out;
}
