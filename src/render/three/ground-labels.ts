// Textures procédurales (CanvasTexture) des tapis au sol : accueil, file numérotée, chemin d'entrée,
// emplacement de construction. Le haut du canvas correspond au « nord » (z décroissant, haut de l'écran).

import * as THREE from "three";
import { COLORS3D } from "./config";
import { hash32, hashUnit } from "./hash";

const PX_PER_TILE = 256;
const FONT = `system-ui, -apple-system, "Segoe UI", sans-serif`;

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible pour les textures du sol");
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number): void {
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = px * 0.2;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

/** Tapis d'accueil : arrondi jaune, liseré blanc, texte « Accueil » (1 × 1 tuile). */
export function welcomeTexture(anisotropy: number): THREE.CanvasTexture {
  const s = PX_PER_TILE;
  const { canvas, ctx } = makeCanvas(s, s);
  const inset = s * 0.05;
  roundRect(ctx, inset, inset, s - 2 * inset, s - 2 * inset, s * 0.18);
  ctx.fillStyle = COLORS3D.welcome;
  ctx.fill();
  ctx.lineWidth = s * 0.05;
  ctx.strokeStyle = COLORS3D.welcomeBorder;
  ctx.stroke();
  outlinedText(ctx, "Accueil", s / 2, s * 0.5, Math.round(s * 0.2));
  return toTexture(canvas, anisotropy);
}

/** Bande de file : cases pointillées numérotées. `cells` en coordonnées de case (col, row) dans la bande. */
export function queueTexture(
  cols: number,
  rows: number,
  cells: readonly { col: number; row: number; label: string }[],
  anisotropy: number,
): THREE.CanvasTexture {
  const s = PX_PER_TILE / 2; // la bande est longue : demi-résolution suffit
  const { canvas, ctx } = makeCanvas(cols * s, rows * s);
  roundRect(ctx, s * 0.04, s * 0.04, cols * s - s * 0.08, rows * s - s * 0.08, s * 0.16);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = COLORS3D.queue;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.setLineDash([s * 0.08, s * 0.07]);
  ctx.lineWidth = s * 0.035;
  ctx.strokeStyle = COLORS3D.queueLine;
  for (const c of cells) {
    const inset = s * 0.14;
    ctx.strokeRect(c.col * s + inset, c.row * s + inset, s - 2 * inset, s - 2 * inset);
  }
  ctx.setLineDash([]);
  for (const c of cells) {
    ctx.font = `bold ${Math.round(s * 0.26)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS3D.queueLine;
    ctx.fillText(c.label, c.col * s + s / 2, c.row * s + s / 2);
  }
  return toTexture(canvas, anisotropy);
}

/** Chemin de terre (cols × rows tuiles) avec texte « Entrée » dans la case (labelCol, labelRow). */
export function entranceTexture(
  cols: number,
  rows: number,
  labelCol: number,
  labelRow: number,
  anisotropy: number,
): THREE.CanvasTexture {
  const s = PX_PER_TILE / 2;
  const { canvas, ctx } = makeCanvas(cols * s, rows * s);
  const w = cols * s;
  const h = rows * s;
  roundRect(ctx, s * 0.08, 0, w - s * 0.16, h, s * 0.2);
  ctx.fillStyle = COLORS3D.entrance;
  ctx.fill();
  // Mouchetures déterministes (pas de Math.random).
  ctx.fillStyle = COLORS3D.entranceDark;
  for (let i = 0; i < cols * rows * 14; i++) {
    const x = s * 0.15 + hashUnit(hash32(i, 11)) * (w - s * 0.3);
    const y = hashUnit(hash32(i, 23)) * h;
    const r = 1.5 + hashUnit(hash32(i, 37)) * 3.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  outlinedText(ctx, "Entrée", labelCol * s + s / 2, labelRow * s + s / 2, Math.round(s * 0.22));
  return toTexture(canvas, anisotropy);
}

/** Emplacement de construction : remplissage translucide + contour pointillé (1 × 1 tuile). */
export function slotTexture(anisotropy: number): THREE.CanvasTexture {
  const s = PX_PER_TILE;
  const { canvas, ctx } = makeCanvas(s, s);
  const inset = s * 0.06;
  ctx.fillStyle = COLORS3D.slotFill;
  ctx.fillRect(inset, inset, s - 2 * inset, s - 2 * inset);
  ctx.setLineDash([s * 0.12, s * 0.08]);
  ctx.lineWidth = s * 0.04;
  ctx.strokeStyle = COLORS3D.slotLine;
  ctx.strokeRect(inset, inset, s - 2 * inset, s - 2 * inset);
  return toTexture(canvas, anisotropy);
}
