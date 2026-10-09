// Hôte de rendu : délègue à l'implémentation courante et permet de la remplacer à chaud (repli 2D
// si le contexte WebGL est perdu) sans toucher à la boucle de jeu (game.ts reçoit l'hôte).

import type { GameState } from "../core";
import type { Renderer, ScreenInsets } from "../render/renderer";

export interface RenderHost extends Renderer {
  /** Libère l'implémentation courante (dispose?) puis bascule sur `next` (reset). */
  swap(next: Renderer): void;
  /** Mémorise les zones couvertes et les transmet à l'implémentation courante (et aux suivantes). */
  setScreenInsets(insets: ScreenInsets): void;
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
  return {
    setScreenInsets(next: ScreenInsets): void {
      insets = next;
      current.setScreenInsets?.(next);
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
        if (insets) next.setScreenInsets?.(insets);
      }
    },
  };
}
