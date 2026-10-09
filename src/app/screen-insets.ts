// Mesure des zones de l'écran couvertes par l'interface DOM (bas du HUD, bouton Menu), relativement
// au canvas #game, à la création puis à chaque redimensionnement. Le renderer s'en sert pour ne pas
// dessiner de libellés dessous. Aucune lecture du DOM par image : uniquement sur ResizeObserver.

import type { ScreenInsets, ScreenRect } from "../render/renderer";

export interface ScreenInsetsWatcher {
  /** Remesure immédiatement (ex. après création du bouton Menu). */
  measure(): void;
  dispose(): void;
}

export function watchScreenInsets(
  canvas: HTMLElement,
  hud: HTMLElement,
  menuRoot: HTMLElement,
  apply: (insets: ScreenInsets) => void,
): ScreenInsetsWatcher {
  let raf = 0;

  function measure(): void {
    raf = 0;
    const base = canvas.getBoundingClientRect();
    const rel = (r: DOMRect): ScreenRect => ({
      left: r.left - base.left,
      top: r.top - base.top,
      right: r.right - base.left,
      bottom: r.bottom - base.top,
    });
    const exclude: ScreenRect[] = [];
    const toggle = menuRoot.querySelector<HTMLElement>(".menu-toggle");
    if (toggle) {
      const r = toggle.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) exclude.push(rel(r));
    }
    apply({ safeTopPx: hudBottom(base), exclude });
  }

  /**
   * Bas de TOUT le HUD (pastilles + ligne d'aide), relatif au canvas : max du conteneur et de chaque
   * enfant visible (un enfant qui déborderait du conteneur reste couvert).
   */
  function hudBottom(base: DOMRect): number {
    let bottom = -Infinity;
    const take = (el: Element): void => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom);
    };
    take(hud);
    for (const child of Array.from(hud.children)) take(child);
    return Number.isFinite(bottom) ? Math.max(0, bottom - base.top) : 0;
  }

  /** Regroupe les notifications d'une même image (HUD + canvas + fenêtre). */
  function schedule(): void {
    if (raf === 0) raf = window.requestAnimationFrame(measure);
  }

  const ro = new ResizeObserver(schedule);
  ro.observe(canvas);
  ro.observe(hud);
  window.addEventListener("resize", schedule);
  measure();

  return {
    measure,
    dispose(): void {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      if (raf !== 0) window.cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
