// Hôte de rendu : délègue à l'implémentation courante et permet de la remplacer à chaud (repli 2D
// si le contexte WebGL est perdu) sans toucher à la boucle de jeu (game.ts reçoit l'hôte).
// Les réglages de présentation (zones couvertes, écran titre, flèche du tutoriel, qualité, mouvement
// réduit) sont mémorisés et réappliqués à l'implémentation suivante après un swap.

import type { GameState } from "../core";
import type { GuideTarget, Presentation, Quality, Renderer, ScreenInsets } from "../render/renderer";

/** Réglages de présentation mémorisés par l'hôte (lecture seule, aucune référence à l'état du jeu). */
export interface RenderHostInfo {
  readonly presentation: Presentation;
  /** Une cible de flèche est fournie (null ⇒ false). */
  readonly guide: boolean;
  /** Dernière qualité demandée ; null = jamais appelée (défaut de l'appareil + adaptation). */
  readonly quality: Quality | null;
  readonly reducedMotion: boolean;
}

export interface RenderHost extends Renderer {
  /** Libère l'implémentation courante (dispose?) puis bascule sur `next` (reset + réglages réappliqués). */
  swap(next: Renderer): void;
  /** Mémorise les zones couvertes et les transmet à l'implémentation courante (et aux suivantes). */
  setScreenInsets(insets: ScreenInsets): void;
  /** Écran titre / jeu (mémorisé, réappliqué après swap). */
  setPresentation(p: Presentation): void;
  /** Flèche du tutoriel (null = masquée) ; appelable à chaque image. */
  setGuide(g: GuideTarget | null): void;
  /** Qualité choisie par le joueur. Ne pas appeler pour « défaut » (laisse l'adaptation automatique). */
  setQuality(q: Quality): void;
  setReducedMotion(on: boolean): void;
  /** Réglages courants, figés (copie). */
  info(): RenderHostInfo;
}

export interface RenderHostOptions {
  /** Appelé après la première image dessinée par chaque implémentation. */
  onFirstDraw?: () => void;
}

export function createRenderHost(initial: Renderer, opts: RenderHostOptions = {}): RenderHost {
  let current = initial;
  let drawn = false;
  /** Dernières zones couvertes par le DOM, retransmises à l'implémentation suivante après un swap. */
  let insets: ScreenInsets | null = null;
  let presentation: Presentation | null = null;
  let guide: GuideTarget | null = null;
  let guideSet = false;
  let quality: Quality | null = null;
  let reducedMotion: boolean | null = null;

  /** Réapplique les réglages mémorisés (seulement ceux qui ont été fixés). */
  function reapply(r: Renderer): void {
    if (insets) r.setScreenInsets?.(insets);
    if (presentation !== null) r.setPresentation?.(presentation);
    if (guideSet) r.setGuide?.(guide);
    if (quality !== null) r.setQuality?.(quality);
    if (reducedMotion !== null) r.setReducedMotion?.(reducedMotion);
  }

  return {
    setScreenInsets(next: ScreenInsets): void {
      insets = next;
      current.setScreenInsets?.(next);
    },
    setPresentation(p: Presentation): void {
      presentation = p;
      current.setPresentation?.(p);
    },
    setGuide(g: GuideTarget | null): void {
      guide = g ? { x: g.x, y: g.y } : null;
      guideSet = true;
      current.setGuide?.(guide);
    },
    setQuality(q: Quality): void {
      quality = q;
      current.setQuality?.(q);
    },
    setReducedMotion(on: boolean): void {
      reducedMotion = on;
      current.setReducedMotion?.(on);
    },
    info(): RenderHostInfo {
      return Object.freeze({
        presentation: presentation ?? "play",
        guide: guide !== null,
        quality,
        reducedMotion: reducedMotion ?? false,
      });
    },
    onTick(prev: Readonly<GameState>, curr: Readonly<GameState>): void {
      current.onTick(prev, curr);
    },
    draw(prev: Readonly<GameState>, curr: Readonly<GameState>, alpha: number): void {
      current.draw(prev, curr, alpha);
      if (!drawn) {
        drawn = true;
        opts.onFirstDraw?.();
      }
    },
    reset(): void {
      current.reset();
    },
    dispose(): void {
      current.dispose?.();
    },
    swap(next: Renderer): void {
      if (next === current) return;
      const old = current;
      current = next;
      drawn = false;
      try {
        old.dispose?.();
      } finally {
        next.reset();
        reapply(next);
      }
    },
  };
}
