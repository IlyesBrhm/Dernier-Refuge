// HUD DOM : lit l'état via les sélecteurs du core, ne le modifie jamais.
// Le DOM n'est touché que lorsque le texte change (pas de reflow à chaque image).

import { freeTentCount, queueLength, type GameState } from "../core";
import { QUEUE, RESOURCES } from "../data/balance";

export interface Hud {
  update(state: Readonly<GameState>): void;
}

function stat(parent: HTMLElement, name: string): HTMLSpanElement {
  const item = document.createElement("div");
  item.className = "hud-stat";
  const label = document.createElement("span");
  label.className = "hud-label";
  label.textContent = name;
  const value = document.createElement("span");
  value.className = "hud-value";
  item.append(label, value);
  parent.appendChild(item);
  return value;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function createHud(root: HTMLElement, touchHint: boolean): Hud {
  root.replaceChildren();
  const bar = document.createElement("div");
  bar.className = "hud-bar";
  root.appendChild(bar);
  const wood = stat(bar, "Bois");
  const food = stat(bar, "Nourriture");
  const queue = stat(bar, "File");
  const tents = stat(bar, "Tentes libres");

  const help = document.createElement("div");
  help.className = "hud-help";
  help.textContent = touchHint
    ? "Glisser le doigt pour se déplacer"
    : "ZQSD / flèches pour se déplacer";
  root.appendChild(help);

  return {
    update(state): void {
      setText(wood, `${state.resources.wood} / ${RESOURCES.cap}`);
      setText(food, `${state.resources.food} / ${RESOURCES.cap}`);
      setText(queue, `${queueLength(state)}/${QUEUE.maxLength}`);
      setText(tents, `${freeTentCount(state)} / ${state.tents.length}`);
    },
  };
}
