// Joystick tactile flottant : on pose le doigt n'importe où sur la zone, on glisse.
// Ne produit qu'une direction quantifiée sur 8 directions (dx, dy ∈ {-1, 0, 1}) ;
// la conversion en commande est faite par src/app/input.ts.

import type { Axis } from "../core";

export interface Joystick {
  /** Direction courante, ou null si aucun doigt n'est posé. */
  readAxis(): { dx: Axis; dy: Axis } | null;
  release(): void;
  dispose(): void;
}

const DEAD_ZONE_PX = 12;
const MAX_RADIUS_PX = 48;
const AXIS_THRESHOLD = 0.38; // ≈ sin(22,5°) : découpage en 8 secteurs

function quantize(v: number): Axis {
  return v > AXIS_THRESHOLD ? 1 : v < -AXIS_THRESHOLD ? -1 : 0;
}

export function createJoystick(surface: HTMLElement, overlayParent: HTMLElement): Joystick {
  const base = document.createElement("div");
  base.className = "joystick-base";
  const knob = document.createElement("div");
  knob.className = "joystick-knob";
  base.appendChild(knob);
  base.hidden = true;
  overlayParent.appendChild(base);

  let pointerId: number | null = null;
  let originX = 0;
  let originY = 0;
  let axis: { dx: Axis; dy: Axis } = { dx: 0, dy: 0 };

  const release = (): void => {
    pointerId = null;
    axis = { dx: 0, dy: 0 };
    base.hidden = true;
  };

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" || pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    axis = { dx: 0, dy: 0 };
    base.style.left = `${originX}px`;
    base.style.top = `${originY}px`;
    knob.style.transform = "translate(-50%, -50%)";
    base.hidden = false;
    surface.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    const vx = e.clientX - originX;
    const vy = e.clientY - originY;
    const len = Math.hypot(vx, vy);
    const k = len > MAX_RADIUS_PX ? MAX_RADIUS_PX / len : 1;
    knob.style.transform = `translate(calc(-50% + ${vx * k}px), calc(-50% + ${vy * k}px))`;
    axis = len < DEAD_ZONE_PX ? { dx: 0, dy: 0 } : { dx: quantize(vx / len), dy: quantize(vy / len) };
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId === pointerId) release();
  };

  surface.addEventListener("pointerdown", onDown);
  surface.addEventListener("pointermove", onMove);
  surface.addEventListener("pointerup", onUp);
  surface.addEventListener("pointercancel", onUp);

  return {
    readAxis: () => (pointerId === null ? null : axis),
    release,
    dispose(): void {
      surface.removeEventListener("pointerdown", onDown);
      surface.removeEventListener("pointermove", onMove);
      surface.removeEventListener("pointerup", onUp);
      surface.removeEventListener("pointercancel", onUp);
      base.remove();
    },
  };
}
