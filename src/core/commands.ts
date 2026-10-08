// Commandes joueur : validation complète AVANT application. Un refus renvoie la même référence d'état.

import { LIMITS } from "../data/balance";
import type { Axis, GameState } from "./state";

export type Command = { type: "setMoveInput"; dx: number; dy: number };
export type CommandError = "unknown_command" | "invalid_payload" | "rate_limited";
export type CommandResult =
  | { ok: true; state: GameState }
  | { ok: false; error: CommandError; state: GameState };

function isAxis(v: unknown): v is Axis {
  return v === -1 || v === 0 || v === 1;
}

function validate(state: GameState, cmd: unknown): CommandError | null {
  if (typeof cmd !== "object" || cmd === null) return "unknown_command";
  const c = cmd as { type?: unknown; dx?: unknown; dy?: unknown };
  if (c.type !== "setMoveInput") return "unknown_command";
  if (!isAxis(c.dx) || !isAxis(c.dy)) return "invalid_payload";
  if (state.commandsThisTick >= LIMITS.maxCommandsPerTick) return "rate_limited";
  return null;
}

/** Ne mute jamais `state`. */
export function applyCommand(state: GameState, cmd: Command): CommandResult {
  const error = validate(state, cmd);
  if (error !== null) return { ok: false, error, state };
  const dx = cmd.dx as Axis;
  const dy = cmd.dy as Axis;
  return {
    ok: true,
    state: {
      ...state,
      player: { pos: { ...state.player.pos }, input: { dx, dy } },
      commandsThisTick: state.commandsThisTick + 1,
    },
  };
}
