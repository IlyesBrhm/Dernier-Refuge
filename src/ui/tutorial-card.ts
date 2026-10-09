// Carte du tutoriel (docs/design/ui-polish.md §1.6, §4.6) : parchemin dans #tutorial.
// « Objectif N sur 6 : … » dans une région live polie, annoncée seulement au changement d'étape ; l'aide
// variable (compte à rebours, bois manquant) est hors de la région live. Bouton « Passer le tutoriel ».
// Les données (étape, aide) viennent de la logique pure src/app/tutorial.ts via l'app.

import { guard, makeButton } from "./dialog";
import { icon, type IconName } from "./icons";

export type TutorialCardStep = "welcome" | "pickupWood" | "cleanTent" | "harvestTree" | "buildTent" | "feedFire";

export interface TutorialCardHint {
  waitingForPay: boolean;
  missingWood: number;
  secondsToNight: number | null;
}

export interface TutorialCard {
  /** step = null ⇒ carte masquée. */
  update(step: TutorialCardStep | null, number: number, total: number, hint: TutorialCardHint | null): void;
}

const TEXT: Record<TutorialCardStep, string> = {
  welcome: "Accueillez le survivant : arrêtez-vous sur le tapis d'accueil",
  pickupWood: "Ramassez le bois laissé par le survivant",
  cleanTent: "Nettoyez la tente : restez dessus",
  harvestTree: "Récoltez un arbre : arrêtez-vous à côté",
  buildTent: "Construisez une tente : restez sur l'emplacement",
  feedFire: "Alimentez le feu avant la nuit : arrêtez-vous à côté",
};

const ICON: Record<TutorialCardStep, IconName> = {
  welcome: "users",
  pickupWood: "wood",
  cleanTent: "sparkles",
  harvestTree: "axe",
  buildTent: "hammer",
  feedFire: "flame",
};

/** « 1 min 20 », « 45 s », « 2 min ». */
export function formatDelay(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} s`;
  return r === 0 ? `${m} min` : `${m} min ${r}`;
}

export function createTutorialCard(root: HTMLElement, touch: boolean, onSkip: () => void | Promise<unknown>): TutorialCard {
  root.replaceChildren();
  const card = document.createElement("div");
  card.className = "tutorial-card parchment";
  const head = document.createElement("div");
  head.className = "tutorial-card__head";
  const iconHost = document.createElement("span");
  iconHost.className = "tutorial-card__icon parchment__accent";
  const live = document.createElement("div");
  live.className = "tutorial-card__live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  const counter = document.createElement("p");
  counter.className = "parchment__meta tutorial-card__count";
  const text = document.createElement("p");
  text.className = "tutorial-card__text";
  live.append(counter, text);
  head.append(iconHost, live);
  const hint = document.createElement("p");
  hint.className = "parchment__meta tutorial-card__hint";
  const skip = makeButton("Passer le tutoriel", "ghost", "skip-forward");
  skip.classList.add("tutorial-card__skip");
  skip.dataset.action = "skip-tutorial";
  guard(skip, onSkip);
  card.append(head, hint, skip);
  root.appendChild(card);

  let shownStep: TutorialCardStep | null = null;
  let hintText = "";

  function hintFor(step: TutorialCardStep, h: TutorialCardHint | null): string {
    if (step === "welcome") return touch ? "Glissez le doigt pour vous déplacer" : "ZQSD / flèches pour vous déplacer";
    if (!h) return "";
    if (step === "pickupWood" && h.waitingForPay) return "Il se repose, puis vous paiera en bois";
    if (step === "buildTent" && h.missingWood > 0) return `Il manque ${h.missingWood} bois`;
    if (step === "feedFire" && h.secondsToNight !== null) return `La nuit tombe dans ${formatDelay(h.secondsToNight)}`;
    return "";
  }

  return {
    update(step, n, total, h): void {
      if (step === null) {
        if (!root.hidden) root.hidden = true;
        shownStep = null;
        return;
      }
      if (root.hidden) root.hidden = false;
      if (step !== shownStep) {
        shownStep = step;
        root.dataset.step = step;
        iconHost.replaceChildren(icon(ICON[step], 24));
        counter.textContent = `Objectif ${n} sur ${total}`;
        text.textContent = TEXT[step];
      }
      const ht = hintFor(step, h);
      if (ht !== hintText) {
        hintText = ht;
        hint.textContent = ht;
        hint.hidden = ht === "";
        if (step === "welcome" && !touch) hint.prepend(icon("keyboard", 16));
      }
    },
  };
}
