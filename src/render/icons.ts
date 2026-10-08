// Icônes de ressources partagées par le rendu des drops et les effets (lecture seule, aucune règle).

import type { DropResource } from "../core";

export const RESOURCE_STYLE: Record<DropResource, { fill: string; stroke: string; name: string }> = {
  wood: { fill: "#8b5a2b", stroke: "#4a2e12", name: "bois" },
  food: { fill: "#d0342c", stroke: "#6e1410", name: "nourriture" },
};

/** Bois = carré marron, nourriture = disque rouge. `size` = côté / diamètre en px. */
export function drawResourceIcon(
  ctx: CanvasRenderingContext2D,
  resource: DropResource,
  x: number,
  y: number,
  size: number,
  lineWidth: number,
): void {
  const style = RESOURCE_STYLE[resource];
  ctx.fillStyle = style.fill;
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = lineWidth;
  if (resource === "wood") {
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  } else {
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Reflet pour suggérer une baie.
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.beginPath();
    ctx.arc(x - size * 0.15, y - size * 0.15, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}
