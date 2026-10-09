// Mesure des zones de l'écran couvertes par l'interface DOM (bas du HUD, boutons, tutoriel,
// notifications), relativement au canvas #game, à la création puis à chaque redimensionnement. Le
// renderer s'en sert pour ne pas dessiner de libellés ni la flèche de bord dessous. Aucune lecture du
// DOM par image : uniquement sur ResizeObserver (apparition / disparition comprises).

import type { ScreenInsets, ScreenRect } from "../render/renderer";

export interface ScreenInsetsWatcher {
  /** Remesure immédiatement. */
  measure(): void;
  dispose(): void;
}

export function watchScreenInsets(
  canvas: HTMLElement,
  hud: HTMLElement,
  apply: (insets: ScreenInsets) => void,
  /** Autres éléments DOM à exclure quand ils sont visibles (boutons, tutoriel, notifications). */
  extra: readonly HTMLElement[] = [],
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
    for (const el of extra) {
      // Boîtes réelles des enfants visibles (un conteneur pleine largeur ne doit pas tout exclure).
      const kids = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
      const targets = kids.length > 0 ? kids : [el];
      for (const t of targets) {
        const r = t.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) exclude.push(rel(r));
      }
    }
    apply({ safeTopPx: hudBottom(base), exclude });
  }

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

  function schedule(): void {
    if (raf === 0) raf = window.requestAnimationFrame(measure);
  }

  const ro = new ResizeObserver(schedule);
  ro.observe(canvas);
  ro.observe(hud);
  for (const el of extra) {
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
  }
  // Enfants ajoutés / retirés (toasts, carte) : réobservés.
  const mo = new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => n instanceof Element && ro.observe(n));
    schedule();
  });
  for (const el of extra) mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  mo.observe(hud, { attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("resize", schedule);
  measure();

  return {
    measure,
    dispose(): void {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      if (raf !== 0) window.cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
