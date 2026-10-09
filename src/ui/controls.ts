// Boutons de jeu en haut à droite (#controls) : Pause (toujours) et Son (largeur ≥ 560 px, CSS).
// Boutons icône du guide (§5) : 44 × 44, aria-label + title ; Son en aria-pressed (= son coupé).

import { makeIconButton } from "./dialog";
import { setIcon } from "./icons";

export interface GameControls {
  setMuted(muted: boolean): void;
}

export function createGameControls(
  root: HTMLElement,
  cb: { onPause(): void; onToggleMute(): void },
): GameControls {
  root.replaceChildren();
  root.classList.add("game-controls");
  const sound = makeIconButton("Couper le son", "volume-2");
  sound.classList.add("controls-sound");
  sound.setAttribute("aria-pressed", "false");
  const pause = makeIconButton("Pause", "pause");
  pause.classList.add("controls-pause");
  pause.dataset.action = "pause";
  root.append(sound, pause);
  sound.addEventListener("click", () => cb.onToggleMute());
  pause.addEventListener("click", () => cb.onPause());
  return {
    setMuted(m: boolean): void {
      if (sound.getAttribute("aria-pressed") === String(m)) return;
      sound.setAttribute("aria-pressed", String(m));
      setIcon(sound, m ? "volume-x" : "volume-2", 24);
    },
  };
}
