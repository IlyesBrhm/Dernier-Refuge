// Entrées clavier (+ joystick tactile) ⇒ direction voulue (dx, dy ∈ {-1, 0, 1}).
// Utilise `event.code` (position PHYSIQUE de la touche, indépendante de la disposition) :
//   KeyW/KeyA/KeyS/KeyD = touches Z/Q/S/D sur AZERTY, W/A/S/D sur QWERTY.
// On ne mappe volontairement PAS KeyZ / KeyQ : sur QWERTY ce seraient d'autres touches
// (Z en bas à gauche, Q à la place de A sur AZERTY) et cela créerait des conflits.
// Ce module ne fait que lire le matériel ; l'envoi de `setMoveInput` (uniquement quand la
// direction change) est fait par la boucle de jeu (src/app/game.ts).

import type { Axis } from "../core";
import type { Joystick } from "../ui/joystick";

const UP = new Set(["KeyW", "ArrowUp"]);
const DOWN = new Set(["KeyS", "ArrowDown"]);
const LEFT = new Set(["KeyA", "ArrowLeft"]);
const RIGHT = new Set(["KeyD", "ArrowRight"]);
const HANDLED = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT]);

export interface MoveInput {
  dx: Axis;
  dy: Axis;
}

export interface InputController {
  /** Direction voulue à cet instant (joystick prioritaire s'il est actif). */
  read(): MoveInput;
  /** Relâche toutes les touches (perte de focus, onglet caché). */
  releaseAll(): void;
  /**
   * Désactivé (menu ouvert) : touches et joystick ignorés, direction nulle, aucune touche interceptée
   * (les flèches restent utilisables dans le menu).
   */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

function anyIn(pressed: Set<string>, keys: Set<string>): boolean {
  for (const k of keys) if (pressed.has(k)) return true;
  return false;
}

function axisOf(neg: boolean, pos: boolean): Axis {
  return neg === pos ? 0 : pos ? 1 : -1;
}

export function createInput(target: Window, joystick: Joystick | null): InputController {
  const pressed = new Set<string>();
  let enabled = true;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!enabled || !HANDLED.has(e.code)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); // pas de défilement de page avec les flèches
    pressed.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (!HANDLED.has(e.code)) return;
    e.preventDefault();
    pressed.delete(e.code);
  };
  const releaseAll = (): void => {
    pressed.clear();
    joystick?.release();
  };
  const onVisibility = (): void => {
    if (document.hidden) releaseAll();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", onVisibility);

  return {
    read(): MoveInput {
      if (!enabled) return { dx: 0, dy: 0 };
      const touch = joystick?.readAxis();
      if (touch) return touch;
      return {
        dx: axisOf(anyIn(pressed, LEFT), anyIn(pressed, RIGHT)),
        dy: axisOf(anyIn(pressed, UP), anyIn(pressed, DOWN)),
      };
    },
    releaseAll,
    setEnabled(next: boolean): void {
      enabled = next;
      releaseAll();
    },
    dispose(): void {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
