// Horloge du HUD (docs/design/ui-polish.md §1.8) : arc SVG 44 × 24 sur lequel avance le soleil (jour,
// cyclePos 0 → 2400) ou la lune (nuit, 2400 → 3600). Purement visuel (aria-hidden) : le libellé
// accessible est porté par la pilule (« Jour N, nuit, 1 min avant l'aube »).

import { TIME } from "../data/balance";

const SVG_NS = "http://www.w3.org/2000/svg";
const W = 44;
const H = 24;
const CX = 22;
const CY = 21;
const R = 17;

export interface ClockArc {
  readonly el: SVGSVGElement;
  /** Position dans le cycle (ticks, éventuellement interpolée). */
  update(cyclePos: number): void;
}

/** Avancement [0, 1] du corps céleste sur l'arc et phase. */
export function arcProgress(cyclePos: number): { night: boolean; t: number } {
  const day = TIME.dayTicks;
  const cycle = TIME.dayTicks + TIME.nightTicks;
  const p = Number.isFinite(cyclePos) ? ((cyclePos % cycle) + cycle) % cycle : 0;
  if (p < day) return { night: false, t: p / day };
  return { night: true, t: (p - day) / TIME.nightTicks };
}

export function createClockArc(): ClockArc {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", `0 0 ${W} ${H}`);
  el.setAttribute("width", String(W));
  el.setAttribute("height", String(H));
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("focusable", "false");
  el.setAttribute("class", "clock-arc");

  const track = document.createElementNS(SVG_NS, "path");
  track.setAttribute("d", `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`);
  track.setAttribute("class", "clock-arc__track");
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "currentColor");
  track.setAttribute("stroke-width", "2");
  track.setAttribute("stroke-linecap", "round");
  track.setAttribute("stroke-dasharray", "2 3");

  const body = document.createElementNS(SVG_NS, "g");
  body.setAttribute("class", "clock-arc__body");
  const sun = document.createElementNS(SVG_NS, "circle");
  sun.setAttribute("r", "4.5");
  sun.setAttribute("class", "clock-arc__sun");
  sun.setAttribute("fill", "currentColor");
  // Croissant : disque moins un disque décalé (chemin unique, rempli).
  const moon = document.createElementNS(SVG_NS, "path");
  moon.setAttribute("d", "M1.5 -4.5 A4.5 4.5 0 1 0 4.5 1.5 A3.5 3.5 0 0 1 1.5 -4.5 Z");
  moon.setAttribute("class", "clock-arc__moon");
  moon.setAttribute("fill", "currentColor");
  body.append(sun, moon);
  el.append(track, body);

  let night: boolean | null = null;
  let lastTransform = "";

  return {
    el,
    update(cyclePos: number): void {
      const a = arcProgress(cyclePos);
      if (a.night !== night) {
        night = a.night;
        sun.style.display = a.night ? "none" : "";
        moon.style.display = a.night ? "" : "none";
        el.classList.toggle("is-night", a.night);
      }
      const ang = Math.PI * (1 - a.t);
      const x = CX + R * Math.cos(ang);
      const y = CY - R * Math.sin(ang);
      const tr = `translate(${x.toFixed(1)} ${y.toFixed(1)})`;
      if (tr !== lastTransform) {
        lastTransform = tr;
        body.setAttribute("transform", tr);
      }
    },
  };
}
