// Panneau « Pause » (docs/design/ui-polish.md §1.4) — remplace l'ancien menu.ts.
// Reprendre (primaire, focus initial), Paramètres, Exporter, Importer (<input type=file>), Nouvelle partie
// (confirmation par l'app), Exporter la sauvegarde endommagée (si elle existe), Retour à l'écran titre,
// interrupteur Son. Import / Nouvelle partie désactivés avec la raison affichée (note reliée).
// L'UI émet des callbacks : elle ne touche ni au stockage ni à l'état.

import { createDialog, guard, makeButton, setDisabled, type DialogView } from "./dialog";
import { createSwitch } from "./widgets";

export interface PauseMenuCallbacks {
  onResume(): void;
  onSettings(): void;
  onExport(): void;
  /** true ⇔ partie remplacée. */
  onImport(file: File): Promise<boolean>;
  onNewGame(): Promise<boolean>;
  onExportDamaged(): void;
  hasDamaged(): boolean;
  replaceBlockedReason(): string | null;
  onToTitle(): void;
  onToggleMute(): void;
}

export interface PauseMenu {
  readonly view: DialogView;
  open(): void;
  close(): void;
  setCovered(c: boolean): void;
  /** Relit `replaceBlockedReason` et `hasDamaged`. */
  refresh(): void;
  setMuted(muted: boolean): void;
}

export function createPauseMenu(container: HTMLElement, cb: PauseMenuCallbacks): PauseMenu {
  let resume: HTMLButtonElement | null = null;
  const view = createDialog(container, { id: "pause", title: "Pause", initialFocus: () => resume });

  resume = makeButton("Reprendre", "primary", "play");
  resume.dataset.action = "resume";
  const settings = makeButton("Paramètres", "secondary", "settings");
  settings.dataset.action = "settings";
  const exportBtn = makeButton("Exporter la partie", "secondary", "download");
  exportBtn.dataset.action = "export";
  const importBtn = makeButton("Importer une partie", "secondary", "upload");
  importBtn.dataset.action = "import";
  const newGame = makeButton("Nouvelle partie", "secondary");
  newGame.dataset.action = "new-game";
  const blockedNote = document.createElement("p");
  blockedNote.className = "btn-note";
  blockedNote.id = "pause-blocked-note";
  blockedNote.hidden = true;
  const damaged = makeButton("Exporter la sauvegarde endommagée", "ghost", "download");
  damaged.dataset.action = "export-damaged";
  const toTitle = makeButton("Retour à l'écran titre", "secondary", "house");
  toTitle.dataset.action = "to-title";
  const sound = createSwitch("Son", (on) => {
    // Interrupteur « Son » : activé = son actif.
    if (on === muted) cb.onToggleMute();
  });

  for (const b of [resume, settings, exportBtn, importBtn, newGame, damaged, toTitle]) b.classList.add("btn--block");

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.hidden = true;
  fileInput.tabIndex = -1;
  fileInput.setAttribute("aria-hidden", "true");

  const list = document.createElement("div");
  list.className = "dialog-stack";
  list.append(resume, settings, exportBtn, importBtn, newGame, blockedNote, damaged, toTitle);
  view.body.append(list, sound.row, fileInput);

  let muted = false;
  let busy = false;
  let blocked: string | null = null;

  function applyState(): void {
    view.setBusy(busy);
    setDisabled(importBtn, busy || blocked !== null, blocked !== null ? blockedNote : null);
    setDisabled(newGame, busy || blocked !== null, blocked !== null ? blockedNote : null);
    if (blocked === null) {
      importBtn.removeAttribute("aria-describedby");
      newGame.removeAttribute("aria-describedby");
    }
    blockedNote.textContent = blocked ?? "";
    blockedNote.hidden = blocked === null;
    for (const b of [resume, settings, exportBtn, damaged, toTitle]) {
      if (b) setDisabled(b, busy);
    }
  }

  function refresh(): void {
    blocked = cb.replaceBlockedReason();
    damaged.hidden = !cb.hasDamaged();
    applyState();
  }

  async function run(action: () => Promise<boolean>): Promise<void> {
    if (busy) return;
    busy = true;
    applyState();
    try {
      // Succès ⇒ l'app reprend le jeu (resume) ; échec / annulation ⇒ la pause reste ouverte.
      await action();
    } finally {
      busy = false;
      applyState();
    }
  }

  guard(resume, () => cb.onResume());
  guard(settings, () => cb.onSettings());
  guard(exportBtn, () => cb.onExport());
  guard(damaged, () => cb.onExportDamaged());
  guard(toTitle, () => cb.onToTitle());
  guard(newGame, () => run(() => cb.onNewGame()));
  guard(importBtn, () => {
    if (busy || blocked !== null) return;
    fileInput.value = "";
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void run(() => cb.onImport(file));
  });

  return {
    view,
    open(): void {
      refresh();
      view.open();
    },
    close: () => view.close(),
    setCovered: (c) => view.setCovered(c),
    refresh,
    setMuted(m: boolean): void {
      muted = m;
      sound.set(!m);
    },
  };
}
