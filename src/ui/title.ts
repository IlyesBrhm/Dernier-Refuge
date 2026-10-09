// Écran titre (docs/design/ui-polish.md §1.2, §1.3). DOM seulement : l'app fournit les informations
// (Continuer, raison de blocage, son) et reçoit les clics. Aucun accès au stockage ni à l'état.

import { guard, makeButton, makeIconButton, setDisabled } from "./dialog";
import { setIcon } from "./icons";

export interface TitleInfo {
  /** null ⇔ pas de « Continuer ». */
  continueInfo: { day: number; night: boolean; readOnly: boolean } | null;
  /** Raison de blocage de « Nouvelle partie » (appliquée seulement si Continuer existe). */
  replaceBlockedReason: string | null;
}

export interface TitleCallbacks {
  onContinue(): void | Promise<unknown>;
  onNewGame(): void | Promise<unknown>;
  onSettings(): void;
  onCredits(): void;
  onToggleMute(): void;
}

export interface TitleScreen {
  show(): void;
  hide(): void;
  refresh(info: TitleInfo): void;
  setMuted(muted: boolean): void;
}

export function createTitleScreen(root: HTMLElement, cb: TitleCallbacks): TitleScreen {
  root.replaceChildren();
  root.classList.add("title-screen");

  const sound = makeIconButton("Couper le son", "volume-2");
  sound.classList.add("title-sound");
  sound.setAttribute("aria-pressed", "false");

  const content = document.createElement("div");
  content.className = "title-content";

  const h1 = document.createElement("h1");
  h1.className = "title-heading";
  h1.textContent = "Dernier Refuge";
  const tagline = document.createElement("p");
  tagline.className = "title-tagline";
  tagline.textContent = "Un feu, un camp, une nuit de plus.";

  const actions = document.createElement("div");
  actions.className = "title-actions";

  const continueBtn = makeButton("Continuer", "primary", "play");
  continueBtn.dataset.action = "continue";
  const continueLine = document.createElement("span");
  continueLine.className = "title-continue-line";
  continueBtn.appendChild(continueLine);
  const readOnlyNote = document.createElement("p");
  readOnlyNote.className = "btn-note title-note";
  readOnlyNote.id = "title-readonly-note";
  readOnlyNote.textContent = "Ouvert dans un autre onglet : partie non sauvegardée";

  const newBtn = makeButton("Nouvelle partie", "primary");
  newBtn.dataset.action = "new-game";
  const blockedNote = document.createElement("p");
  blockedNote.className = "btn-note title-note";
  blockedNote.id = "title-blocked-note";

  const settingsBtn = makeButton("Paramètres", "secondary", "settings");
  settingsBtn.dataset.action = "settings";
  const creditsBtn = makeButton("Crédits", "secondary", "scroll-text");
  creditsBtn.dataset.action = "credits";

  actions.append(continueBtn, readOnlyNote, newBtn, blockedNote, settingsBtn, creditsBtn);
  content.append(h1, tagline, actions);
  root.append(sound, content);

  let muted = false;
  let hideTimer: number | null = null;

  guard(continueBtn, () => cb.onContinue());
  guard(newBtn, () => cb.onNewGame());
  settingsBtn.addEventListener("click", () => cb.onSettings());
  creditsBtn.addEventListener("click", () => cb.onCredits());
  sound.addEventListener("click", () => cb.onToggleMute());

  function firstButton(): HTMLButtonElement {
    return continueBtn.hidden ? newBtn : continueBtn;
  }

  return {
    show(): void {
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
      root.classList.remove("is-leaving");
      root.inert = false;
      root.hidden = false;
      firstButton().focus();
    },
    hide(): void {
      if (root.hidden) return;
      // Inerte tout de suite (anti double clic), masqué après le fondu.
      root.inert = true;
      if (document.documentElement.dataset.motion === "reduce") {
        root.hidden = true;
        return;
      }
      root.classList.add("is-leaving");
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        root.hidden = true;
        root.classList.remove("is-leaving");
      }, 300);
    },
    refresh(info): void {
      const c = info.continueInfo;
      continueBtn.hidden = c === null;
      readOnlyNote.hidden = !(c?.readOnly ?? false);
      if (c) {
        continueLine.textContent = `Jour ${c.day} · ${c.night ? "nuit" : "jour"}`;
        if (c.readOnly) continueBtn.setAttribute("aria-describedby", readOnlyNote.id);
        else continueBtn.removeAttribute("aria-describedby");
      }
      // Nouvelle partie : primaire sans Continuer, secondaire sinon.
      newBtn.classList.toggle("btn--primary", c === null);
      newBtn.classList.toggle("btn--secondary", c !== null);
      const blocked = c !== null ? info.replaceBlockedReason : null;
      blockedNote.textContent = blocked ?? "";
      blockedNote.hidden = blocked === null;
      setDisabled(newBtn, blocked !== null, blockedNote);
      // Le focus ne reste pas sur un bouton masqué.
      if (!root.hidden && (document.activeElement === continueBtn && continueBtn.hidden)) firstButton().focus();
    },
    setMuted(m: boolean): void {
      if (m === muted && sound.getAttribute("aria-pressed") === String(m)) return;
      muted = m;
      sound.setAttribute("aria-pressed", String(m));
      setIcon(sound, m ? "volume-x" : "volume-2", 24);
    },
  };
}
