// HUD DOM : lit l'état via les sélecteurs du core, ne le modifie jamais.
// Le DOM n'est touché que lorsque le texte change (pas de reflow à chaque image).
//
// Jour/nuit (docs/design/day-night.md §4.8) : « Jour N » + icône soleil/lune, jauge du feu
// (role="meter", valeur lue par les lecteurs d'écran), dormeurs la nuit, alertes (role="status").

import {
  clockInfo,
  freeTentCount,
  isFireLow,
  isFireOutAtNight,
  queueLength,
  sleepersCount,
  welcomeBlockReason,
  type GameState,
} from "../core";
import { FIRE, QUEUE, RESOURCES } from "../data/balance";

export interface Hud {
  update(state: Readonly<GameState>): void;
  /** État remplacé (nouvelle partie, import, chargement) : oublie ce qui dépend de la partie. */
  reset?(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Ticks de déplacement cumulés (clavier) avant de masquer la ligne d'aide. Sur écran tactile, elle
 * disparaît dès la première utilisation du joystick.
 */
const HELP_HIDE_MOVE_TICKS = 20;

/** Message complet (alerte) quand le froid a fait fuir des survivants (accueil fermé jusqu'à l'aube). */
const COLD_LEAVERS_ALERT = "Le froid a fait fuir des survivants : plus personne ne viendra cette nuit";

/**
 * Libellé : texte complet + abréviation. Écran étroit (CSS, ≤ 480 px) : seule l'abréviation est
 * visible, le texte complet reste lu par les lecteurs d'écran (masqué visuellement, pas `display:none`).
 */
function labelEl(full: string, short?: string): HTMLSpanElement {
  const label = document.createElement("span");
  label.className = "hud-label";
  if (!short || short === full) {
    label.textContent = full;
    return label;
  }
  const long = document.createElement("span");
  long.className = "hud-label-full";
  long.textContent = full;
  const abbr = document.createElement("span");
  abbr.className = "hud-label-short";
  abbr.setAttribute("aria-hidden", "true");
  abbr.textContent = short;
  label.append(long, abbr);
  return label;
}

/** Valeur « n<sep>max ». */
interface StatValue {
  set(value: number, max?: number): void;
}

/**
 * `minorCap` : le « / max » (plafond de stockage, peu utile) est masqué visuellement sur écran étroit
 * (toujours lu par les lecteurs d'écran). Sinon il reste visible (file, tentes).
 */
function stat(
  parent: HTMLElement,
  name: string,
  opts: { short?: string; sep?: string; minorCap?: boolean } = {},
): StatValue {
  const { short, sep = " / ", minorCap = false } = opts;
  const item = document.createElement("div");
  item.className = minorCap ? "hud-stat hud-stat-minor-cap" : "hud-stat";
  const value = document.createElement("span");
  value.className = "hud-value";
  const num = document.createElement("span");
  const cap = document.createElement("span");
  cap.className = "hud-cap";
  value.append(num, cap);
  item.append(labelEl(name, short), value);
  parent.appendChild(item);
  return {
    set(v, max) {
      setText(num, String(v));
      setText(cap, max === undefined ? "" : `${sep}${max}`);
    },
  };
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Icône soleil / lune (SVG en ligne, décrite par aria-label). */
function createSkyIcon(): { root: SVGSVGElement; set(night: boolean): void } {
  const root = document.createElementNS(SVG_NS, "svg");
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("width", "18");
  root.setAttribute("height", "18");
  root.setAttribute("role", "img");
  root.classList.add("hud-sky");
  const sun = document.createElementNS(SVG_NS, "g");
  const disc = document.createElementNS(SVG_NS, "circle");
  disc.setAttribute("cx", "12");
  disc.setAttribute("cy", "12");
  disc.setAttribute("r", "5");
  disc.setAttribute("fill", "#ffd23f");
  sun.appendChild(disc);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ray = document.createElementNS(SVG_NS, "line");
    ray.setAttribute("x1", String(12 + Math.cos(a) * 7.5));
    ray.setAttribute("y1", String(12 + Math.sin(a) * 7.5));
    ray.setAttribute("x2", String(12 + Math.cos(a) * 10.5));
    ray.setAttribute("y2", String(12 + Math.sin(a) * 10.5));
    ray.setAttribute("stroke", "#ffd23f");
    ray.setAttribute("stroke-width", "2");
    ray.setAttribute("stroke-linecap", "round");
    sun.appendChild(ray);
  }
  const moon = document.createElementNS(SVG_NS, "path");
  moon.setAttribute("d", "M15.5 3.5a8.5 8.5 0 1 0 5 15.2A7 7 0 0 1 15.5 3.5z");
  moon.setAttribute("fill", "#cfd8ff");
  root.append(sun, moon);
  let shown: boolean | null = null;
  return {
    root,
    set(night) {
      if (night === shown) return;
      shown = night;
      sun.style.display = night ? "none" : "";
      moon.style.display = night ? "" : "none";
      root.setAttribute("aria-label", night ? "Nuit" : "Jour");
    },
  };
}

export function createHud(root: HTMLElement, touchHint: boolean): Hud {
  root.replaceChildren();

  // --- Ligne du temps : jour, jauge du feu, dormeurs ---
  const time = document.createElement("div");
  time.className = "hud-bar hud-time";
  root.appendChild(time);

  const day = document.createElement("div");
  day.className = "hud-stat hud-day";
  const sky = createSkyIcon();
  const dayText = document.createElement("span");
  dayText.className = "hud-value";
  day.append(sky.root, dayText);
  time.appendChild(day);

  const fire = document.createElement("div");
  fire.className = "hud-stat hud-fire";
  const fireLabel = document.createElement("span");
  fireLabel.className = "hud-label";
  fireLabel.id = "hud-fire-label";
  fireLabel.textContent = "Feu";
  const meter = document.createElement("div");
  meter.className = "hud-meter";
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-labelledby", "hud-fire-label");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", String(FIRE.capacity));
  const meterFill = document.createElement("div");
  meterFill.className = "hud-meter-fill";
  meter.appendChild(meterFill);
  const fireValue = document.createElement("span");
  fireValue.className = "hud-value";
  fireValue.setAttribute("aria-hidden", "true"); // déjà annoncé par le meter
  fire.append(fireLabel, meter, fireValue);
  time.appendChild(fire);

  const sleepers = document.createElement("div");
  sleepers.className = "hud-stat hud-sleepers";
  const sleepersLabel = labelEl("Dormeurs", "Zz");
  const sleepersValue = document.createElement("span");
  sleepersValue.className = "hud-value";
  sleepers.append(sleepersLabel, sleepersValue);
  sleepers.hidden = true;
  time.appendChild(sleepers);

  // --- Ressources ---
  const bar = document.createElement("div");
  bar.className = "hud-bar";
  root.appendChild(bar);
  const wood = stat(bar, "Bois", { minorCap: true });
  const food = stat(bar, "Nourriture", { short: "Nourr.", minorCap: true });
  const queue = stat(bar, "File", { sep: "/" });
  const tents = stat(bar, "Tentes libres", { short: "Tentes" });

  // --- Alerte (feu qui faiblit / éteint, accueil fermé) : annoncée poliment, mise à jour seulement si le texte change ---
  const alert = document.createElement("div");
  alert.className = "hud-alert";
  alert.setAttribute("role", "status");
  alert.setAttribute("aria-live", "polite");
  root.appendChild(alert);

  const help = document.createElement("div");
  help.className = "hud-help";
  help.textContent = touchHint
    ? "Glisser le doigt pour se déplacer"
    : "ZQSD / flèches pour se déplacer";
  root.appendChild(help);

  let fireState = "";
  // Ligne d'aide : masquée après les premiers déplacements (définitivement pour la session).
  let movedTicks = 0;
  let lastTick: number | null = null;

  function trackHelp(state: Readonly<GameState>): void {
    if (help.hidden) return;
    const moving = state.player.input.dx !== 0 || state.player.input.dy !== 0;
    if (moving && lastTick !== null && state.tick > lastTick) movedTicks += state.tick - lastTick;
    lastTick = state.tick;
    if ((touchHint && moving) || movedTicks >= HELP_HIDE_MOVE_TICKS) help.hidden = true;
  }

  return {
    reset(): void {
      // Le compteur de déplacement repart de l'état chargé (le tick peut reculer) ; l'aide déjà
      // masquée le reste.
      lastTick = null;
    },
    update(state): void {
      const s = state as GameState;
      trackHelp(state);
      const clock = clockInfo(s);
      const night = clock.phase === "night";
      sky.set(night);
      setText(dayText, `Jour ${clock.day}`);

      // Jauge du feu.
      const w = state.fire.wood;
      const low = isFireLow(s);
      const out = w <= 0;
      setText(fireValue, `${w}/${FIRE.capacity}`);
      setAttr(meter, "aria-valuenow", String(w));
      setAttr(meter, "aria-valuetext", `${w} bois sur ${FIRE.capacity}${out ? ", éteint" : low ? ", faible" : ""}`);
      const pct = `${Math.round((Math.min(FIRE.capacity, Math.max(0, w)) / FIRE.capacity) * 100)}%`;
      if (meterFill.style.width !== pct) meterFill.style.width = pct;
      const st = out ? "out" : low ? "low" : "ok";
      if (st !== fireState) {
        fireState = st;
        fire.classList.toggle("is-low", st === "low");
        fire.classList.toggle("is-out", st === "out");
      }

      // Dormeurs (la nuit).
      const n = sleepersCount(s);
      if (sleepers.hidden === night) sleepers.hidden = !night;
      setText(sleepersValue, String(n));

      // Ressources.
      wood.set(state.resources.wood, RESOURCES.cap);
      food.set(state.resources.food, RESOURCES.cap);
      queue.set(queueLength(s), QUEUE.maxLength);
      tents.set(freeTentCount(s), state.tents.length);

      // Alerte : feu qui faiblit (urgent, des dormeurs peuvent partir) > accueil fermé (raison du core).
      const block = welcomeBlockReason(s);
      let text = "";
      if (low) {
        text =
          n > 0
            ? `Le feu faiblit — ${n} ${n > 1 ? "dormeurs risquent" : "dormeur risque"} de partir`
            : "Le feu faiblit";
      } else if (block === "coldLeavers") {
        text = COLD_LEAVERS_ALERT;
      } else if (block === "fireOut") {
        text = "Le feu est éteint — accueil suspendu";
      } else if (isFireOutAtNight(s)) {
        text = "Le feu est éteint";
      }
      setText(alert, text);
      const hidden = text === "";
      if (alert.classList.contains("is-empty") !== hidden) alert.classList.toggle("is-empty", hidden);
      if (!hidden) {
        const cls = low ? "is-low" : "is-out";
        if (!alert.classList.contains(cls)) {
          alert.classList.remove("is-low", "is-out");
          alert.classList.add(cls);
        }
      }
    },
  };
}
