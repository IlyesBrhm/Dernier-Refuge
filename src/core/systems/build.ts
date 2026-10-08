// Construction : joueur sur un emplacement non construit ⇒ versement progressif du bois.
// Le bois versé reste acquis (paid conservé), jamais au-delà du coût ni deux fois.

import { BUILD } from "../../data/balance";
import { sameTile, tileOf } from "../map";
import type { GameState } from "../state";
import { pure } from "./helpers";

export function mutateBuild(draft: GameState): void {
  const here = tileOf(draft.player.pos);
  const slot = draft.buildSlots.find((b) => b.builtTentId === null && sameTile(b.tile, here));
  if (!slot) return;
  if (slot.paid < slot.cost) {
    if (slot.payCooldown > 0) {
      slot.payCooldown -= 1;
    } else if (draft.resources.wood > 0) {
      const amount = Math.min(BUILD.payPerStep, draft.resources.wood, slot.cost - slot.paid);
      draft.resources.wood -= amount;
      slot.paid += amount;
      slot.payCooldown = Math.max(0, BUILD.payIntervalTicks - 1);
    }
  }
  if (slot.paid >= slot.cost) {
    slot.paid = slot.cost;
    slot.payCooldown = 0;
    const id = draft.nextId++;
    slot.builtTentId = id;
    draft.tents.push({ id, tile: { ...slot.tile }, status: "free", occupantId: null, cleanProgress: 0 });
  }
}

export const buildSystem = pure(mutateBuild);
