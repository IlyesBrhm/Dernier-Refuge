// Événements d'interface détectés PAR TICK (docs/design/ui-polish.md §1.7) : notifications et sons.
// Pur : compare deux états consécutifs via les sélecteurs du core, ne mute rien, ne lit ni DOM ni horloge.
// Jamais appelé sur un remplacement d'état (chargement, import) : seulement depuis GameDeps.onTick.

import {
  isFireLow,
  isFireOutAtNight,
  isNight,
  cyclePos,
  sleepersCount,
  type DropResource,
  type GameState,
} from "../core";
import { TIME } from "../data/balance";

export type UiEvent =
  | { type: "tentBuilt"; slotId: number }
  | { type: "fireLow"; sleepers: number }
  | { type: "fireOut" }
  | { type: "coldLeavers"; count: number }
  | { type: "nightSoon"; seconds: number }
  | { type: "fireRelit" }
  | { type: "pickup"; resource: DropResource };

/** Début du crépuscule (position dans le cycle) : « La nuit tombe dans 30 s ». */
export const DUSK_START = TIME.dayTicks - TIME.duskTicks;

function droppedAmount(s: Readonly<GameState>, resource: DropResource): number {
  let n = 0;
  for (const d of s.drops) if (d.resource === resource) n += d.amount;
  return n;
}

export function detectUiEvents(prev: Readonly<GameState>, curr: Readonly<GameState>): UiEvent[] {
  const out: UiEvent[] = [];
  if (prev === curr) return out;
  const p = prev as GameState;
  const c = curr as GameState;

  // Tente construite (emplacement apparié par id).
  for (const slot of curr.buildSlots) {
    if (slot.builtTentId === null) continue;
    const before = prev.buildSlots.find((b) => b.id === slot.id);
    if (before && before.builtTentId === null) out.push({ type: "tentBuilt", slotId: slot.id });
  }

  if (!isFireLow(p) && isFireLow(c)) out.push({ type: "fireLow", sleepers: sleepersCount(c) });
  if (!isFireOutAtNight(p) && isFireOutAtNight(c)) out.push({ type: "fireOut" });

  if (curr.night.coldLeavers > prev.night.coldLeavers) {
    out.push({ type: "coldLeavers", count: curr.night.coldLeavers - prev.night.coldLeavers });
  }

  // Franchissement du début du crépuscule dans le même cycle (pas de retour en arrière).
  const pp = cyclePos(prev.tick);
  const cp = cyclePos(curr.tick);
  if (curr.tick > prev.tick && pp < DUSK_START && cp >= DUSK_START && cp >= pp) {
    out.push({ type: "nightSoon", seconds: Math.round((TIME.dayTicks - cp) / TIME.ticksPerSecond) });
  }

  if (isNight(curr.tick) && prev.fire.wood === 0 && curr.fire.wood > 0) out.push({ type: "fireRelit" });

  // Ramassage : stock en hausse ET moins de cette ressource au sol (une dépense fait baisser le stock).
  for (const resource of ["wood", "food"] as const) {
    if (curr.resources[resource] > prev.resources[resource] && droppedAmount(curr, resource) < droppedAmount(prev, resource)) {
      out.push({ type: "pickup", resource });
    }
  }
  return out;
}
