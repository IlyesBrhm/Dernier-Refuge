// Menu de partie (docs/design/save.md §4) : bouton discret en haut à droite + panneau modal.
// Entrées : Exporter, Importer, Nouvelle partie, Exporter la sauvegarde endommagée (si elle existe).
// L'UI émet des callbacks vers l'app : elle ne touche ni au stockage ni à l'état.
// Accessibilité : bouton aria-expanded / aria-controls, panneau role="dialog" aria-modal, focus placé
// dans le panneau à l'ouverture et rendu au bouton à la fermeture, Tab cyclique, Échap ferme (ou annule
// une confirmation) et ouvre le menu quand il est fermé. Le reste de l'app (jeu, HUD) est `inert` tant
// que le panneau est ouvert. Import / Nouvelle partie peuvent être désactivés (raison fournie par l'app,
// affichée dans le panneau) ; l'app appelle `refresh()` quand cette raison change.

export interface MenuCallbacks {
  /** Menu ouvert : l'app met le jeu en pause et coupe les entrées. */
  onOpen(): void;
  onClose(): void;
  onExport(): void | Promise<void>;
  onImport(file: File): void | Promise<void>;
  onNewGame(): void | Promise<void>;
  onExportDamaged(): void | Promise<void>;
  /** Une copie de sauvegarde endommagée existe-t-elle (entrée d'export visible) ? */
  hasDamaged(): boolean;
  /** Raison pour laquelle Importer / Nouvelle partie sont indisponibles (null = disponibles). */
  replaceBlockedReason(): string | null;
}

export interface Menu {
  /** Demande confirmation dans le panneau (ouvert si besoin). Échap / Annuler ⇒ false. */
  confirm(message: string, confirmLabel: string): Promise<boolean>;
  isOpen(): boolean;
  close(): void;
  /** Relit `replaceBlockedReason` (ex. : propriété du verrou multi-onglets changée). */
  refresh(): void;
}

function button(label: string, className: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  return b;
}

/**
 * @param inertWhileOpen éléments rendus `inert` (ni focus ni clic ni lecteur d'écran) quand le panneau
 *   est ouvert : typiquement le canvas du jeu et le HUD.
 */
export function createMenu(root: HTMLElement, cb: MenuCallbacks, inertWhileOpen: readonly HTMLElement[] = []): Menu {
  root.replaceChildren();

  const toggle = button("☰", "menu-toggle");
  toggle.setAttribute("aria-label", "Menu");
  toggle.setAttribute("aria-haspopup", "dialog");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "menu-panel");

  const backdrop = document.createElement("div");
  backdrop.className = "menu-backdrop";
  backdrop.hidden = true;

  const panel = document.createElement("div");
  panel.className = "menu-panel";
  panel.id = "menu-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "menu-title");
  panel.tabIndex = -1;

  const title = document.createElement("h2");
  title.id = "menu-title";
  title.className = "menu-title";
  title.textContent = "Menu";

  const actions = document.createElement("div");
  actions.className = "menu-actions";
  const exportBtn = button("Exporter la partie", "menu-item");
  const importBtn = button("Importer une partie", "menu-item");
  const newGameBtn = button("Nouvelle partie", "menu-item");
  const damagedBtn = button("Exporter la sauvegarde endommagée", "menu-item");
  const closeBtn = button("Fermer", "menu-item menu-secondary");
  // Explication visible quand Importer / Nouvelle partie sont désactivés.
  const blockedNote = document.createElement("p");
  blockedNote.className = "menu-note";
  blockedNote.id = "menu-blocked-note";
  blockedNote.hidden = true;
  actions.append(exportBtn, importBtn, newGameBtn, blockedNote, damagedBtn, closeBtn);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.hidden = true;
  fileInput.tabIndex = -1;
  fileInput.setAttribute("aria-hidden", "true");

  const confirmBox = document.createElement("div");
  confirmBox.className = "menu-confirm";
  confirmBox.hidden = true;
  const confirmText = document.createElement("p");
  confirmText.className = "menu-confirm-text";
  confirmText.id = "menu-confirm-text";
  const confirmRow = document.createElement("div");
  confirmRow.className = "menu-confirm-row";
  const confirmOk = button("Confirmer", "menu-item menu-danger");
  const confirmCancel = button("Annuler", "menu-item menu-secondary");
  confirmRow.append(confirmCancel, confirmOk);
  confirmBox.append(confirmText, confirmRow);

  panel.append(title, actions, confirmBox, fileInput);
  backdrop.appendChild(panel);
  root.append(toggle, backdrop);

  let open = false;
  let busy = false;
  let blockedReason: string | null = null;
  let pendingConfirm: ((ok: boolean) => void) | null = null;

  function focusables(): HTMLElement[] {
    return Array.from(panel.querySelectorAll<HTMLElement>("button")).filter(
      (el) => !el.hidden && !el.closest("[hidden]") && !(el as HTMLButtonElement).disabled,
    );
  }

  function setDisabled(el: HTMLButtonElement, disabled: boolean): void {
    // Le focus ne doit pas rester sur un bouton qui devient désactivé (il serait perdu vers <body>).
    if (disabled && document.activeElement === el) panel.focus();
    el.disabled = disabled;
    el.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  /** Applique `busy` et `blockedReason` aux boutons et à la note explicative. */
  function applyState(): void {
    const blocked = blockedReason !== null;
    for (const el of [exportBtn, damagedBtn, closeBtn]) setDisabled(el, busy);
    for (const el of [importBtn, newGameBtn]) {
      setDisabled(el, busy || blocked);
      if (blocked) el.setAttribute("aria-describedby", blockedNote.id);
      else el.removeAttribute("aria-describedby");
    }
    blockedNote.textContent = blockedReason ?? "";
    blockedNote.hidden = !blocked;
    panel.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function refresh(): void {
    blockedReason = cb.replaceBlockedReason();
    applyState();
  }

  function setBusy(b: boolean): void {
    busy = b;
    applyState();
  }

  function setInert(on: boolean): void {
    for (const el of inertWhileOpen) el.inert = on;
  }

  function openMenu(): void {
    if (open) return;
    open = true;
    damagedBtn.hidden = !cb.hasDamaged();
    refresh();
    backdrop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    setInert(true);
    cb.onOpen();
    (focusables()[0] ?? panel).focus();
  }

  function closeMenu(): void {
    if (!open) return;
    if (pendingConfirm) settleConfirm(false);
    open = false;
    backdrop.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    setInert(false);
    cb.onClose();
    toggle.focus();
  }

  function settleConfirm(ok: boolean): void {
    const resolve = pendingConfirm;
    pendingConfirm = null;
    confirmBox.hidden = true;
    actions.hidden = false;
    panel.removeAttribute("aria-describedby");
    resolve?.(ok);
  }

  /** Lance une action ; le menu se ferme ensuite (sauf si elle a déjà été fermée). */
  async function run(action: () => void | Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      if (import.meta.env.DEV) console.error("[menu] action en échec", e);
    } finally {
      setBusy(false);
      closeMenu();
    }
  }

  toggle.addEventListener("click", () => (open ? closeMenu() : openMenu()));
  closeBtn.addEventListener("click", () => closeMenu());
  exportBtn.addEventListener("click", () => void run(() => cb.onExport()));
  newGameBtn.addEventListener("click", () => void run(() => cb.onNewGame()));
  damagedBtn.addEventListener("click", () => void run(() => cb.onExportDamaged()));
  importBtn.addEventListener("click", () => {
    if (busy || blockedReason !== null) return;
    fileInput.value = "";
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void run(() => cb.onImport(file));
  });
  confirmOk.addEventListener("click", () => settleConfirm(true));
  confirmCancel.addEventListener("click", () => settleConfirm(false));
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop && !busy) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!open) openMenu();
      else if (pendingConfirm) settleConfirm(false);
      else if (!busy) closeMenu();
      return;
    }
    if (!open || e.key !== "Tab") return;
    // Focus piégé dans le panneau (dialogue modal).
    const list = focusables();
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  });

  return {
    confirm(message, confirmLabel): Promise<boolean> {
      if (pendingConfirm) settleConfirm(false);
      openMenu();
      confirmText.textContent = message;
      confirmOk.textContent = confirmLabel;
      actions.hidden = true;
      confirmBox.hidden = false;
      panel.setAttribute("aria-describedby", confirmText.id);
      // Défaut sûr : le focus va sur « Annuler ».
      confirmCancel.focus();
      return new Promise<boolean>((resolve) => {
        pendingConfirm = resolve;
      });
    },
    isOpen: () => open,
    close: closeMenu,
    refresh,
  };
}
