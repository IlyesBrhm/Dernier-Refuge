// Utilitaires des tests de sauvegarde (pas un fichier de test).

import { applyCommand, checkInvariants, tick, type GameState } from "../../src/core/index";
import { canonicalStringify, computeChecksum, CURRENT_VERSION, SAVE_CONFIG } from "../../src/save/index";
import type { SaveOwner } from "../../src/save/index";
import { botGoal, fresh, steer } from "../core/helpers";

export const SEED = 4242;
export const SAVED_AT = 1_760_000_000_000;
export const OWNER: SaveOwner = { isOwner: () => true };
export const NOT_OWNER: SaveOwner = { isOwner: () => false };

/** Caractéristiques « mi-partie » d'un état (pour choisir un état de test riche). */
export function features(s: GameState): Record<string, boolean> {
  return {
    drops: s.drops.length > 0,
    depletedNode: s.nodes.some((n) => n.status === "depleted"),
    resting: s.survivors.some((v) => v.status === "resting"),
    walking: s.survivors.some((v) => v.path.length > 0),
    queued: s.queue.length > 0,
    builtSlot: s.buildSlots.some((b) => b.builtTentId !== null),
    partialSlot: s.buildSlots.some((b) => b.paid > 0 && b.paid < b.cost),
  };
}

/** Un pas du bot utile : commande de déplacement si besoin, puis tick. */
export function botStep(s: GameState): GameState {
  const want = steer(s, botGoal(s));
  let cur = s;
  if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) {
    const r = applyCommand(s, { type: "setMoveInput", ...want });
    if (!r.ok) throw new Error(`commande refusée ${r.error}`);
    cur = r.state;
  }
  return tick(cur);
}

/**
 * État de mi-partie riche, déterministe : bot utile jusqu'au premier tick (≥ minTicks) qui réunit
 * le plus de caractéristiques, puis une commande de déplacement sans tick (commandsThisTick > 0, input ≠ 0).
 */
export function midgame(seed = SEED, minTicks = 600, maxTicks = 4000): GameState {
  let s = fresh(seed);
  let best: GameState = s;
  let bestScore = -1;
  for (let i = 0; i < maxTicks; i++) {
    s = botStep(s);
    if (s.tick < minTicks) continue;
    const score = Object.values(features(s)).filter(Boolean).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
      if (score === Object.keys(features(s)).length) break;
    }
  }
  const dx = best.player.input.dx === 1 ? -1 : 1;
  const r = applyCommand(best, { type: "setMoveInput", dx, dy: 0 });
  if (!r.ok) throw new Error("commande refusée");
  if (checkInvariants(r.state).length > 0) throw new Error("état mi-partie invalide");
  return r.state;
}

/**
 * Modifie l'état d'un texte de sauvegarde puis RE-SIGNE (checksum recalculé avec le vrai sel) : sert à
 * tester la validation (forme, invariants) et pas seulement le checksum, comme le ferait un tricheur
 * qui a lu le code.
 */
export function resign(
  text: string,
  mutate: (state: Record<string, unknown>, env: Record<string, unknown>) => void,
): string {
  const env = JSON.parse(text) as Record<string, unknown>;
  const state = env.state as Record<string, unknown>;
  mutate(state, env);
  env.checksum = computeChecksum(env.version as number, env.savedAt as number, env.seed as number, env.state);
  return canonicalStringify(env, SAVE_CONFIG.maxDepth + 4);
}

/** Construit une enveloppe signée arbitraire (version libre). */
export function signed(state: unknown, version = CURRENT_VERSION, savedAt = SAVED_AT, seed = SEED): string {
  const checksum = computeChecksum(version, savedAt, seed, state);
  return canonicalStringify({ version, savedAt, seed, checksum, state }, SAVE_CONFIG.maxDepth + 4);
}
