// HUD DOM (docs/design/ui-polish.md §1.8, ui-style.md §5, §8) : barre compacte de pilules. Lit l'état via
// les sélecteurs du core, ne le modifie jamais. DOM touché seulement si un texte / attribut change.
// Contrat pour les tests : chaque pilule porte `data-hud` = clock | fire | wood | food | queue | tents.
// Deux groupes (2 rangées au plus sur écran étroit, 1 rangée sinon) : HUD ≤ 12 % de la hauteur.
// Les alertes du feu ne sont plus ici (toasts) : l'état reste lisible en continu par la jauge du feu
// (icône + hachures + « ! ») et la pastille File (`lock` + « fermé »).

import {
  clockInfo,
  freeTentCount,
  isFireLow,
  isNight,
  queueLength,
  sleepersCount,
  welcomeBlockReason,
  type GameState,
} from "../core";
import { FIRE, QUEUE, TIME } from "../data/balance";
import { createClockArc } from "./clock-arc";
import { createCounter, type Counter } from "./counter";
import { formatExact } from "./format";
import { icon, setIcon } from "./icons";

export interface Hud {
  update(state: Readonly<GameState>): void;
  /** État remplacé (nouvelle partie, import, chargement) : oublie ce qui dépend de la partie. */
  reset?(): void;
}

function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function chip(key: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `hud-chip hud-chip--${key}`;
  el.dataset.hud = key;
  return el;
}

function span(className: string, text = ""): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = className;
  if (text) s.textContent = text;
  return s;
}

/** Minutes (arrondies au supérieur) avant la prochaine bascule jour/nuit. */
function minutesToSwitch(cyclePos: number): { minutes: number; toNight: boolean } {
  const toNight = cyclePos < TIME.dayTicks;
  const left = toNight ? TIME.dayTicks - cyclePos : TIME.dayTicks + TIME.nightTicks - cyclePos;
  return { minutes: Math.max(1, Math.ceil(left / (60 * TIME.ticksPerSecond))), toNight };
}

function isReduced(): boolean {
  return document.documentElement.dataset.motion === "reduce";
}

export function createHud(root: HTMLElement): Hud {
  root.replaceChildren();
  root.classList.add("hud");

  const groupA = document.createElement("div");
  groupA.className = "hud-group";
  const groupB = document.createElement("div");
  groupB.className = "hud-group";
  root.append(groupA, groupB);

  // --- Horloge ---
  const clock = chip("clock");
  clock.setAttribute("role", "img");
  const arc = createClockArc();
  const dayLong = span("hud-value hud-day hud-day--long");
  const dayShort = span("hud-value hud-day hud-day--short");
  dayLong.setAttribute("aria-hidden", "true");
  dayShort.setAttribute("aria-hidden", "true");
  clock.append(arc.el, dayLong, dayShort);

  // --- Feu ---
  const fire = chip("fire");
  fire.setAttribute("role", "meter");
  fire.setAttribute("aria-label", "Feu");
  fire.setAttribute("aria-valuemin", "0");
  fire.setAttribute("aria-valuemax", String(FIRE.capacity));
  const fireIcon = span("hud-fire-icon");
  fireIcon.setAttribute("aria-hidden", "true");
  fireIcon.appendChild(icon("flame", 20));
  const gauge = document.createElement("div");
  gauge.className = "gauge hud-fire-pulse";
  gauge.setAttribute("aria-hidden", "true");
  const fill = document.createElement("div");
  fill.className = "gauge__fill";
  gauge.appendChild(fill);
  const fireValue = span("hud-value hud-fire-value");
  fireValue.setAttribute("aria-hidden", "true");
  const fireBadge = span("badge-alert", "!");
  fireBadge.setAttribute("aria-hidden", "true");
  fireBadge.hidden = true;
  fire.append(fireIcon, gauge, fireValue, fireBadge);

  // --- Ressources ---
  function resourceChip(key: "wood" | "food"): { el: HTMLDivElement; counter: Counter } {
    const el = chip(key);
    el.setAttribute("role", "img");
    el.appendChild(icon(key === "wood" ? "wood" : "cherry", 20));
    const counter = createCounter();
    el.appendChild(counter.el);
    return { el, counter };
  }
  const wood = resourceChip("wood");
  const food = resourceChip("food");

  // --- File ---
  const queue = chip("queue");
  queue.setAttribute("role", "img");
  const queueIcon = span("hud-icon");
  queueIcon.setAttribute("aria-hidden", "true");
  queueIcon.appendChild(icon("users", 20));
  const queueValue = span("hud-value");
  queueValue.setAttribute("aria-hidden", "true");
  queue.append(queueIcon, queueValue);

  // --- Tentes ---
  const tents = chip("tents");
  tents.setAttribute("role", "img");
  tents.appendChild(icon("tent", 20));
  const tentsValue = span("hud-value");
  tentsValue.setAttribute("aria-hidden", "true");
  const sleepers = span("hud-extra");
  sleepers.setAttribute("aria-hidden", "true");
  sleepers.append(span("hud-sep", "·"), icon("moon", 16), span("hud-sleepers"));
  sleepers.hidden = true;
  tents.append(tentsValue, sleepers);
  const sleepersValue = sleepers.querySelector(".hud-sleepers") as HTMLSpanElement;

  groupA.append(clock, fire, wood.el);
  groupB.append(food.el, queue, tents);

  let fireState = "";
  let queueClosed: boolean | null = null;
  let resetPending = false;

  return {
    reset(): void {
      resetPending = true;
    },
    update(state): void {
      const s = state as GameState;
      const now = performance.now();
      const reduced = isReduced();

      // Horloge.
      const c = clockInfo(s);
      const night = c.phase === "night";
      arc.update(c.cyclePos);
      setText(dayLong, `Jour ${c.day}`);
      setText(dayShort, `J ${c.day}`);
      const sw = minutesToSwitch(c.cyclePos);
      setAttr(
        clock,
        "aria-label",
        `Jour ${c.day}, ${night ? "nuit" : "jour"}, ${sw.minutes} min avant ${sw.toNight ? "la nuit" : "l'aube"}`,
      );

      // Feu.
      const w = Math.max(0, state.fire.wood);
      const low = isFireLow(s);
      const out = w <= 0;
      const st = out ? "out" : low ? "low" : "ok";
      setText(fireValue, `${w}/${FIRE.capacity}`);
      setAttr(fire, "aria-valuenow", String(w));
      setAttr(
        fire,
        "aria-valuetext",
        `${w} bois sur ${FIRE.capacity}${out ? ", éteint" : low ? ", faible" : ""}`,
      );
      const ratio = Math.min(1, w / FIRE.capacity);
      const tf = `scaleX(${ratio.toFixed(3)})`;
      if (fill.style.transform !== tf) fill.style.transform = tf;
      if (st !== fireState) {
        fireState = st;
        fire.classList.toggle("is-low", st === "low");
        fire.classList.toggle("is-out", st === "out");
        fire.dataset.state = st;
        fireBadge.hidden = st !== "low";
        setIcon(fireIcon, st === "out" ? "fire-out" : "flame", 20);
      }

      // Ressources.
      if (resetPending) {
        resetPending = false;
        wood.counter.reset(state.resources.wood);
        food.counter.reset(state.resources.food);
      } else {
        wood.counter.update(state.resources.wood, now, reduced);
        food.counter.update(state.resources.food, now, reduced);
      }
      setAttr(wood.el, "aria-label", `Bois : ${formatExact(state.resources.wood)}`);
      setAttr(food.el, "aria-label", `Nourriture : ${formatExact(state.resources.food)}`);

      // File.
      const q = queueLength(s);
      const block = welcomeBlockReason(s);
      const closed = block !== null;
      if (closed !== queueClosed) {
        queueClosed = closed;
        queue.classList.toggle("hud-chip--closed", closed);
        queue.dataset.state = closed ? "closed" : "open";
        setIcon(queueIcon, closed ? "lock" : "users", 20);
      }
      setText(queueValue, closed ? "fermé" : `${q}/${QUEUE.maxLength}`);
      const why =
        block === "coldLeavers"
          ? ", accueil fermé jusqu'à l'aube"
          : block === "fireOut"
            ? ", accueil fermé tant que le feu est éteint"
            : "";
      setAttr(queue, "aria-label", `File : ${q} sur ${QUEUE.maxLength}${why}`);

      // Tentes (+ dormeurs la nuit).
      const free = freeTentCount(s);
      const total = state.tents.length;
      const n = sleepersCount(s);
      const showSleepers = isNight(state.tick);
      setText(tentsValue, `${free}/${total}`);
      if (sleepers.hidden === showSleepers) sleepers.hidden = !showSleepers;
      setText(sleepersValue, String(n));
      setAttr(
        tents,
        "aria-label",
        `Tentes libres : ${free} sur ${total}${showSleepers ? `, ${n} ${n > 1 ? "dormeurs" : "dormeur"}` : ""}`,
      );
    },
  };
}
