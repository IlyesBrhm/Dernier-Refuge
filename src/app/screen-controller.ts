// Câblage des écrans (docs/design/ui-polish.md §1.1). Tout est DÉRIVÉ de `ScreensState` (src/app/screens.ts) :
// - jeu en pause et entrées coupées ssi !isTicking (seule source de setPaused / setEnabled) ;
// - HUD, tutoriel, boutons Pause / Son visibles ssi showsHud ;
// - présentation du rendu (titre / jeu), scène sonore, gel des toasts ;
// - éléments sous un panneau `inert`, panneaux recouverts masqués ;
// - confirmation (`confirm`) = panneau « confirm » de la pile, résolue une seule fois.

import type { Presentation } from "../render/renderer";
import type { AudioScene } from "./audio-config";
import {
  INITIAL_SCREENS,
  isTicking,
  reduceScreens,
  showsHud,
  topPanel,
  type PanelId,
  type ScreenEvent,
  type ScreensState,
} from "./screens";

/** Vue d'un panneau (dialogue) pilotée par le contrôleur. */
export interface PanelView {
  open(): void;
  close(): void;
  setCovered(covered: boolean): void;
}

export interface ConfirmPanel extends PanelView {
  set(message: string, confirmLabel: string, opts?: { danger?: boolean; title?: string }): void;
  onAnswer(fn: (ok: boolean) => void): void;
}

export interface ScreenControllerDeps {
  game: { setPaused(paused: boolean): void };
  input: { setEnabled(enabled: boolean): void };
  renderer: { setPresentation(p: Presentation): void };
  audio: { setScene(scene: AudioScene): void };
  notify: { setFrozen(frozen: boolean): void; setCovered(covered: boolean): void; hideCard(): void };
  app: HTMLElement;
  /** Visibles ssi showsHud (HUD, tutoriel, boutons). */
  hudElements: readonly HTMLElement[];
  /** Rendus inertes quand un panneau est ouvert (canvas, HUD, tutoriel, boutons, titre). */
  underPanels: readonly HTMLElement[];
  title: { show(): void; hide(): void };
  panels: Record<Exclude<PanelId, "confirm">, PanelView>;
  confirm: ConfirmPanel;
  /** Après chaque changement appliqué. */
  onChange?(next: ScreensState, prev: ScreensState): void;
}

export interface ScreenController {
  state(): ScreensState;
  /** Applique un événement ; false si refusé (état inchangé). */
  dispatch(e: ScreenEvent): boolean;
  /** Confirmation modale ; false si refusée (Annuler, Échap, ou impossible d'empiler). */
  confirm(message: string, confirmLabel: string, opts?: { danger?: boolean; title?: string }): Promise<boolean>;
}

export function createScreenController(deps: ScreenControllerDeps): ScreenController {
  let state: ScreensState = INITIAL_SCREENS;
  let pendingConfirm: ((ok: boolean) => void) | null = null;

  const viewOf = (p: PanelId): PanelView => (p === "confirm" ? deps.confirm : deps.panels[p]);

  deps.confirm.onAnswer((ok) => {
    const resolve = pendingConfirm;
    pendingConfirm = null;
    // Fermeture d'abord (le focus revient au bouton d'origine), puis résolution.
    if (topPanel(state) === "confirm") dispatch({ type: "back" });
    resolve?.(ok);
  });

  function applyDerived(next: ScreensState, prev: ScreensState): void {
    const ticking = isTicking(next);
    const hud = showsHud(next);
    const hasPanel = next.panels.length > 0;
    deps.game.setPaused(!ticking);
    deps.input.setEnabled(ticking);
    deps.renderer.setPresentation(next.screen === "title" || next.screen === "boot" ? "title" : "play");
    deps.audio.setScene(next.screen === "game" ? (ticking ? "play" : "pause") : "title");
    deps.notify.setFrozen(!ticking && next.screen === "game");
    deps.notify.setCovered(hasPanel);
    if (!hud) deps.notify.hideCard();
    for (const el of deps.hudElements) {
      if (el.hidden === hud) el.hidden = !hud;
    }
    deps.app.dataset.screen = next.screen;
    if (hasPanel) deps.app.dataset.panel = topPanel(next) ?? "";
    else delete deps.app.dataset.panel;

    if (next.screen !== prev.screen) {
      if (next.screen === "title") deps.title.show();
      else deps.title.hide();
    }
  }

  function applyPanels(next: ScreensState, prev: ScreensState): void {
    const removed = prev.panels.filter((p) => !next.panels.includes(p));
    const added = next.panels.filter((p) => !prev.panels.includes(p));
    // 1. Ouvrir d'abord (le dialogue mémorise l'élément d'origine avant que le reste devienne inerte).
    for (const p of added) viewOf(p).open();
    // 2. Fond inerte ssi un panneau est ouvert.
    const inert = next.panels.length > 0;
    for (const el of deps.underPanels) if (el.inert !== inert) el.inert = inert;
    // 3. Seul le sommet est visible et actif.
    next.panels.forEach((p, i) => viewOf(p).setCovered(i < next.panels.length - 1));
    // 4. Fermer ensuite (le focus revient à l'élément d'origine, désormais actif).
    for (const p of removed.reverse()) {
      viewOf(p).close();
      if (p === "confirm" && pendingConfirm) {
        const resolve = pendingConfirm;
        pendingConfirm = null;
        resolve(false);
      }
    }
  }

  function dispatch(e: ScreenEvent): boolean {
    const prev = state;
    const next = reduceScreens(prev, e);
    if (next === prev) return false;
    state = next;
    applyDerived(next, prev);
    applyPanels(next, prev);
    deps.onChange?.(next, prev);
    return true;
  }

  applyDerived(state, state);

  return {
    state: () => state,
    dispatch,
    confirm(message, confirmLabel, opts): Promise<boolean> {
      if (pendingConfirm) return Promise.resolve(false);
      deps.confirm.set(message, confirmLabel, opts);
      return new Promise<boolean>((resolve) => {
        pendingConfirm = resolve;
        if (!dispatch({ type: "open", panel: "confirm" })) {
          pendingConfirm = null;
          resolve(false);
        }
      });
    },
  };
}
