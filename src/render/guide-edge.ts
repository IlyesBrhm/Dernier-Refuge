// Flèche du tutoriel sur le calque 2D (docs/design/ui-polish.md §4.6), partagée par le rendu 2D et le
// calque de la 3D : placement de la flèche de BORD d'écran (fonction pure, testable sous node) et
// primitives de dessin Canvas 2D. Présentation pure : aucune règle, aucun accès à l'état.

import { GUIDE, GUIDE_ARROW_SHAPE, GUIDE_COLORS } from "./presentation";
import type { ScreenInsets } from "./renderer";

/** Flèche de bord : centre (px CSS) et direction (rad, 0 = vers la droite, y écran vers le bas). */
export interface EdgeArrow {
  x: number;
  y: number;
  angle: number;
}

function inRect(x: number, y: number, r: { left: number; top: number; right: number; bottom: number }): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/**
 * Placement de la flèche de bord pour une cible projetée en (tx, ty) px CSS (peut être hors écran).
 * - Cible visible (dans la vue, sous le HUD, hors des zones exclues) ⇒ null (le chevron suffit).
 * - Sinon : premier point du segment cible → centre de la zone utile où une flèche de `size` px tient
 *   entièrement dans la vue (marge `margin`, sous le HUD) sans toucher une zone exclue (contrôles,
 *   notifications, carte du tutoriel). La flèche pointe vers la cible.
 * - Aucune place libre ⇒ null. Pure et déterministe ; ne lève jamais.
 */
export function edgeArrowPlacement(
  tx: number,
  ty: number,
  width: number,
  height: number,
  insets: Readonly<ScreenInsets>,
  size: number = GUIDE.edgeSizePx,
  margin: number = GUIDE.edgeMarginPx,
): EdgeArrow | null {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;
  const safeTop = Number.isFinite(insets.safeTopPx) ? Math.max(0, insets.safeTopPx) : 0;
  const exclude = insets.exclude;

  // Cible visible : rien à faire.
  if (tx >= 0 && tx <= width && ty >= safeTop && ty <= height && !exclude.some((r) => inRect(tx, ty, r))) {
    return null;
  }

  const half = size / 2;
  const left = margin + half;
  const right = width - margin - half;
  const top = safeTop + margin + half;
  const bottom = height - margin - half;
  if (left > right || top > bottom) return null;

  const covered = (x: number, y: number): boolean =>
    exclude.some(
      (r) => x + half >= r.left - margin && x - half <= r.right + margin && y + half >= r.top - margin && y - half <= r.bottom + margin,
    );

  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = cx - tx;
  const dy = cy - ty;
  // Liang-Barsky : paramètre d'entrée du segment cible → centre dans la zone utile.
  let t0 = 0;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t0) t0 = r;
    } else if (r < t0) {
      return false;
    }
    return true;
  };
  if (!clip(-dx, tx - left) || !clip(dx, right - tx) || !clip(-dy, ty - top) || !clip(dy, bottom - ty)) return null;
  t0 = Math.min(1, Math.max(0, t0));

  const len = Math.hypot(dx, dy) * (1 - t0);
  const steps = Math.min(2000, Math.max(1, Math.ceil(len / GUIDE.edgeStepPx)));
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((1 - t0) * i) / steps;
    const x = tx + dx * t;
    const y = ty + dy * t;
    if (x < left - 1e-6 || x > right + 1e-6 || y < top - 1e-6 || y > bottom + 1e-6) continue;
    if (covered(x, y)) continue;
    const angle = x === tx && y === ty ? Math.PI / 2 : Math.atan2(ty - y, tx - x);
    return { x, y, angle };
  }
  return null;
}

/**
 * Flèche pleine (silhouette GUIDE_ARROW_SHAPE) de longueur `size` px centrée en (x, y), pointant vers
 * `angle` (rad, repère écran). Remplissage ember-500 + contour night-900 épais + liseré clair :
 * lisible sur l'herbe de jour comme sous le voile de nuit ; la FORME porte l'information.
 */
export function drawGuideArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number): void {
  const s = Math.max(8, size);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  GUIDE_ARROW_SHAPE.forEach(([px, py], i) => {
    // y de la silhouette vers le haut ⇒ écran vers le bas (silhouette symétrique : sans effet).
    if (i === 0) ctx.moveTo(px * s, -py * s);
    else ctx.lineTo(px * s, -py * s);
  });
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, s * 0.12);
  ctx.strokeStyle = GUIDE_COLORS.stroke;
  ctx.stroke();
  ctx.fillStyle = GUIDE_COLORS.fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.strokeStyle = GUIDE_COLORS.shine;
  ctx.stroke();
  ctx.restore();
}

/**
 * Flèche de bord : dessinée si la cible est hors champ (ou sous l'interface). `nudge` ∈ [−1, 1] =
 * va-et-vient vers la cible (0 en mouvement réduit). Renvoie true si une flèche a été dessinée.
 */
export function drawEdgeArrow(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  width: number,
  height: number,
  insets: Readonly<ScreenInsets>,
  nudge: number,
): boolean {
  const a = edgeArrowPlacement(tx, ty, width, height, insets);
  if (!a) return false;
  const n = GUIDE.edgeNudgePx * (Number.isFinite(nudge) ? Math.max(-1, Math.min(1, nudge)) : 0);
  drawGuideArrow(ctx, a.x + Math.cos(a.angle) * n, a.y + Math.sin(a.angle) * n, a.angle, GUIDE.edgeSizePx);
  return true;
}
