// Primitives Canvas 2D partagées (barres, étiquettes) : rendu 2D et calque superposé de la 3D.
// Présentation pure : aucune règle, aucun accès à l'état.

export const OVERLAY_COLORS = {
  barBack: "rgba(0, 0, 0, 0.55)",
  text: "#ffffff",
  textStroke: "rgba(0, 0, 0, 0.75)",
} as const;

/** Police proportionnelle à la taille de tuile à l'écran (px CSS), 11 px minimum. */
export function fontFor(tilePx: number, sizeRatio: number, bold = true): string {
  const px = Math.max(11, Math.round(tilePx * sizeRatio));
  return `${bold ? "bold " : ""}${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
}

/** Texte blanc contouré, centré en (x, y). */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  tilePx: number,
  text: string,
  x: number,
  y: number,
  sizeRatio = 0.3,
): void {
  ctx.font = fontFor(tilePx, sizeRatio);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, tilePx * 0.06);
  ctx.strokeStyle = OVERLAY_COLORS.textStroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = OVERLAY_COLORS.text;
  ctx.fillText(text, x, y);
}

/** Barre de progression centrée en (cx, y) (bord haut), ratio borné à [0, 1]. */
export function drawBar(
  ctx: CanvasRenderingContext2D,
  tilePx: number,
  cx: number,
  y: number,
  ratio: number,
  color: string,
  widthRatio = 0.8,
  minHeight = 4,
): void {
  const w = tilePx * widthRatio;
  const h = Math.max(minHeight, tilePx * 0.1);
  const x = cx - w / 2;
  const r = Math.min(1, Math.max(0, ratio));
  ctx.fillStyle = OVERLAY_COLORS.barBack;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * r, h);
}
