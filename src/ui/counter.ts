// Compteur animé du HUD (docs/design/ui-polish.md §1.8, ui-style.md §6). Piloté par l'image (temps passé
// par l'appelant) : aucune minuterie, indépendant de la mise en page (le texte seul change).
// - défilement `dur-3` (350 ms, ease-out) vers la cible ; cible changée en cours ⇒ repart de la valeur
//   affichée ;
// - gains cumulés sur 500 ms dans un badge « +N » qui saute ; dépense : valeur en `--c-spend` 600 ms +
//   badge « −N » ;
// - mouvement réduit : valeur immédiate, badge fixe 1,2 s ;
// - DOM touché seulement quand un texte ou une classe change.

import { formatCount } from "./format";

const ROLL_MS = 350;
const GAIN_WINDOW_MS = 500;
const SPEND_MS = 600;
const BADGE_MS = 700;
const BADGE_REDUCED_MS = 1200;
const MINUS = "−";

export interface Counter {
  readonly el: HTMLElement;
  /** Nouvelle cible ; `now` en ms (performance.now()). */
  update(target: number, now: number, reducedMotion: boolean): void;
  /** Affiche la valeur sans animation ni badge (état remplacé). */
  reset(value: number): void;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function createCounter(className = ""): Counter {
  const el = document.createElement("span");
  el.className = className ? `counter ${className}` : "counter";
  const value = document.createElement("span");
  value.className = "counter__value hud-value";
  const badge = document.createElement("span");
  badge.className = "counter__badge";
  badge.setAttribute("aria-hidden", "true");
  value.setAttribute("aria-hidden", "true");
  el.append(value, badge);

  let initialized = false;
  let target = 0;
  let from = 0;
  let shown = 0;
  let rollStart = 0;
  let text = "";
  // Badge
  let badgeSum = 0;
  let badgeSign: 1 | -1 = 1;
  let badgeLastAt = -Infinity;
  let badgeHideAt = -Infinity;
  let badgeOn = false;
  let spendUntil = -Infinity;
  let spending = false;

  function setText(t: string): void {
    if (t !== text) {
      text = t;
      value.textContent = t;
    }
  }

  function showBadge(delta: number, now: number, reduced: boolean): void {
    const sign: 1 | -1 = delta > 0 ? 1 : -1;
    if (sign === badgeSign && now - badgeLastAt <= GAIN_WINDOW_MS && badgeOn) badgeSum += Math.abs(delta);
    else badgeSum = Math.abs(delta);
    badgeSign = sign;
    badgeLastAt = now;
    badgeHideAt = now + (reduced ? BADGE_REDUCED_MS : BADGE_MS);
    badge.textContent = `${sign > 0 ? "+" : MINUS}${formatCount(badgeSum)}`;
    badge.classList.toggle("is-spend", sign < 0);
    // Relance de l'animation « qui saute ».
    badge.classList.remove("is-on");
    if (!reduced) void badge.offsetWidth;
    badge.classList.add("is-on");
    badgeOn = true;
  }

  function reset(v: number): void {
    initialized = true;
    target = from = shown = v;
    setText(formatCount(v));
    badge.classList.remove("is-on");
    badgeOn = false;
    badgeHideAt = -Infinity;
    if (spending) {
      spending = false;
      el.classList.remove("is-spending");
    }
  }

  return {
    el,
    reset,
    update(next: number, now: number, reduced: boolean): void {
      if (!initialized) {
        reset(next);
        return;
      }
      if (next !== target) {
        const delta = next - target;
        from = shown;
        target = next;
        rollStart = now;
        showBadge(delta, now, reduced);
        if (delta < 0) {
          spendUntil = now + SPEND_MS;
          if (!spending) {
            spending = true;
            el.classList.add("is-spending");
          }
        }
      }
      if (reduced) {
        shown = target;
      } else {
        const t = Math.min(1, Math.max(0, (now - rollStart) / ROLL_MS));
        shown = t >= 1 ? target : from + (target - from) * easeOut(t);
      }
      // Valeur intermédiaire tronquée vers la valeur de départ : jamais d'arrondi au-delà de la cible.
      const display = shown === target ? target : target > from ? Math.floor(shown) : Math.ceil(shown);
      setText(formatCount(display));
      if (badgeOn && now >= badgeHideAt) {
        badgeOn = false;
        badge.classList.remove("is-on");
      }
      if (spending && now >= spendUntil) {
        spending = false;
        el.classList.remove("is-spending");
      }
    },
  };
}
