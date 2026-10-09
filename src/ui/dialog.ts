// Dialogue modal générique (docs/design/ui-polish.md §4.2, ui-style.md §5 « Dialogue », §7) :
// - panneau + fond `scrim`, role="dialog" (ou "alertdialog" pour une confirmation), aria-modal,
//   aria-labelledby ;
// - focus placé sur le premier élément utile à l'ouverture (Annuler pour une confirmation), rendu à
//   l'élément d'origine à la fermeture, Tab / Maj+Tab piégés dans le panneau ;
// - Échap : géré par l'app (src/app/keys.ts ⇒ machine d'écrans ⇒ fermeture du panneau du sommet) ;
// - anti double clic : `setBusy(true)` ⇒ aria-busy + clics ignorés (`guard`).
// Le reste de l'app est rendu `inert` par le contrôleur d'écrans (src/app/screen-controller.ts).

import { icon } from "./icons";

export interface DialogSpec {
  /** Identifiant stable (data-dialog, ids aria). */
  id: string;
  title: string;
  role?: "dialog" | "alertdialog";
  /** Classe supplémentaire du panneau (ex. « panel--wide »). */
  className?: string;
  /** Bouton « Retour » (chevron) dans l'en-tête. */
  onBack?: () => void;
  /** Élément à focaliser à l'ouverture (défaut : premier focalisable). */
  initialFocus?: () => HTMLElement | null;
}

export interface DialogView {
  readonly layer: HTMLElement;
  readonly panel: HTMLElement;
  /** Contenu (sous le titre). */
  readonly body: HTMLElement;
  readonly titleEl: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Recouvert par un autre panneau de la pile : masqué et inerte (reste ouvert). */
  setCovered(covered: boolean): void;
  setBusy(busy: boolean): void;
  isBusy(): boolean;
}

const FOCUSABLE =
  'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

function isVisible(el: HTMLElement): boolean {
  if (el.closest("[hidden]")) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  return el.getClientRects().length > 0;
}

export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

/** Bouton standard du guide (§5). */
export function makeButton(
  label: string,
  variant: "primary" | "secondary" | "danger" | "ghost",
  iconName?: Parameters<typeof icon>[0],
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn btn--${variant}`;
  if (iconName) b.appendChild(icon(iconName, 24));
  const text = document.createElement("span");
  text.className = "btn__label";
  text.textContent = label;
  b.appendChild(text);
  return b;
}

/** Bouton icône seule (aria-label + title obligatoires). */
export function makeIconButton(label: string, iconName: Parameters<typeof icon>[0]): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn--icon";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.appendChild(icon(iconName, 24));
  return b;
}

/** Désactive un bouton en gardant le focus possible (aria-disabled) avec la raison affichée. */
export function setDisabled(btn: HTMLButtonElement, disabled: boolean, note?: HTMLElement | null): void {
  btn.setAttribute("aria-disabled", disabled ? "true" : "false");
  if (note) {
    if (disabled) btn.setAttribute("aria-describedby", note.id);
    else btn.removeAttribute("aria-describedby");
  }
}

export function isDisabled(btn: HTMLElement): boolean {
  return btn.getAttribute("aria-disabled") === "true" || btn.getAttribute("aria-busy") === "true";
}

/**
 * Exécute une action au clic, une seule à la fois : bouton en aria-busy pendant l'action asynchrone,
 * clics ignorés tant qu'elle n'est pas finie (ni si le bouton est désactivé).
 */
export function guard(btn: HTMLButtonElement, action: () => void | Promise<unknown>): void {
  btn.addEventListener("click", () => {
    if (isDisabled(btn)) return;
    let r: void | Promise<unknown>;
    try {
      r = action();
    } catch (e) {
      console.error("[ui] action en échec", e);
      return;
    }
    if (r && typeof (r as Promise<unknown>).then === "function") {
      btn.setAttribute("aria-busy", "true");
      void (r as Promise<unknown>)
        .catch((e: unknown) => console.error("[ui] action en échec", e))
        .finally(() => btn.removeAttribute("aria-busy"));
    }
  });
}

export interface ConfirmDialog {
  readonly view: DialogView;
  /** Prépare le texte avant l'ouverture. Le bouton d'action répète l'action (« Nouvelle partie »…). */
  set(message: string, confirmLabel: string, opts?: { danger?: boolean; title?: string }): void;
  /** Appelé une seule fois par ouverture : true = action confirmée (clic sur le bouton d'action). */
  onAnswer(fn: (ok: boolean) => void): void;
}

/** Confirmation (alertdialog) : focus initial sur « Annuler » ; Échap = Annuler (fermeture par l'app). */
export function createConfirmDialog(container: HTMLElement): ConfirmDialog {
  let cancel: HTMLButtonElement | null = null;
  const view = createDialog(container, {
    id: "confirm",
    title: "Confirmation",
    role: "alertdialog",
    initialFocus: () => cancel,
  });
  const text = document.createElement("p");
  text.className = "panel__text";
  text.id = "dialog-confirm-text";
  view.panel.setAttribute("aria-describedby", text.id);
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  cancel = makeButton("Annuler", "secondary");
  cancel.dataset.action = "cancel";
  let okBtn = makeButton("Confirmer", "primary");
  okBtn.dataset.action = "confirm";
  actions.append(cancel, okBtn);
  view.body.append(text, actions);

  let listener: ((ok: boolean) => void) | null = null;
  let answered = false;
  function answer(ok: boolean): void {
    if (answered) return;
    answered = true;
    listener?.(ok);
  }
  cancel.addEventListener("click", () => answer(false));
  const bindOk = (b: HTMLButtonElement): void => b.addEventListener("click", () => answer(true));
  bindOk(okBtn);

  return {
    view,
    set(message, confirmLabel, opts = {}): void {
      answered = false;
      text.textContent = message;
      view.titleEl.textContent = opts.title ?? "Confirmation";
      const next = makeButton(confirmLabel, opts.danger ? "danger" : "primary", opts.danger ? "triangle-alert" : undefined);
      next.dataset.action = "confirm";
      bindOk(next);
      okBtn.replaceWith(next);
      okBtn = next;
    },
    onAnswer(fn): void {
      listener = fn;
    },
  };
}

export function createDialog(container: HTMLElement, spec: DialogSpec): DialogView {
  const layer = document.createElement("div");
  layer.className = "dialog-layer";
  layer.dataset.dialog = spec.id;
  layer.hidden = true;

  const panel = document.createElement("div");
  panel.className = spec.className ? `panel dialog ${spec.className}` : "panel dialog";
  panel.setAttribute("role", spec.role ?? "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.tabIndex = -1;
  const titleId = `dialog-${spec.id}-title`;
  panel.setAttribute("aria-labelledby", titleId);

  const header = document.createElement("div");
  header.className = "panel__header";
  if (spec.onBack) {
    const back = makeIconButton("Retour", "chevron-left");
    back.classList.add("dialog-back");
    back.addEventListener("click", () => spec.onBack?.());
    header.appendChild(back);
  }
  const titleEl = document.createElement("h2");
  titleEl.className = "panel__title";
  titleEl.id = titleId;
  titleEl.textContent = spec.title;
  header.appendChild(titleEl);

  const body = document.createElement("div");
  body.className = "panel__body";
  panel.append(header, body);
  layer.appendChild(panel);
  container.appendChild(layer);

  let open = false;
  let busy = false;
  let covered = false;
  let opener: HTMLElement | null = null;
  let leaveTimer: number | null = null;

  function onKeyDown(e: KeyboardEvent): void {
    if (!open || covered || e.key !== "Tab") return;
    const list = focusablesIn(panel);
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panel.contains(active) || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  function focusInitial(): void {
    const target = spec.initialFocus?.() ?? focusablesIn(panel)[0] ?? panel;
    target.focus();
  }

  return {
    layer,
    panel,
    body,
    titleEl,
    open(): void {
      if (open) return;
      open = true;
      if (leaveTimer !== null) {
        window.clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      const active = document.activeElement;
      opener = active instanceof HTMLElement && active !== document.body ? active : null;
      layer.classList.remove("is-leaving", "is-covered");
      layer.inert = false;
      covered = false;
      layer.hidden = false;
      document.addEventListener("keydown", onKeyDown, true);
      focusInitial();
    },
    close(): void {
      if (!open) return;
      open = false;
      busy = false;
      panel.removeAttribute("aria-busy");
      document.removeEventListener("keydown", onKeyDown, true);
      layer.inert = true;
      const reduced = document.documentElement.dataset.motion === "reduce";
      if (reduced) {
        layer.hidden = true;
      } else {
        layer.classList.add("is-leaving");
        leaveTimer = window.setTimeout(() => {
          leaveTimer = null;
          layer.hidden = true;
          layer.classList.remove("is-leaving");
        }, 160);
      }
      const back = opener;
      opener = null;
      if (back && back.isConnected && !back.closest("[inert]")) back.focus();
    },
    isOpen: () => open,
    setCovered(c: boolean): void {
      if (c === covered) return;
      covered = c;
      layer.classList.toggle("is-covered", c);
      layer.inert = c;
      if (!c && open && !panel.contains(document.activeElement)) focusInitial();
    },
    setBusy(b: boolean): void {
      busy = b;
      if (b) panel.setAttribute("aria-busy", "true");
      else panel.removeAttribute("aria-busy");
    },
    isBusy: () => busy,
  };
}
