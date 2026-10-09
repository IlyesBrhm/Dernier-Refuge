// Placement de la flèche de bord du tutoriel (src/render/guide-edge.ts, docs/design/ui-polish.md §4.6).
// Fonction pure : px CSS, cible projetée (éventuellement hors écran), zones exclues.

import { edgeArrowPlacement, type EdgeArrow } from "../../src/render/guide-edge";
import { GUIDE } from "../../src/render/presentation";
import type { ScreenInsets, ScreenRect } from "../../src/render/renderer";

const W = 1000;
const H = 600;
const SIZE = GUIDE.edgeSizePx;
const MARGIN = GUIDE.edgeMarginPx;
const HALF = SIZE / 2;
const NONE: ScreenInsets = { safeTopPx: 0, exclude: [] };

function insets(safeTopPx: number, exclude: ScreenRect[] = []): ScreenInsets {
  return { safeTopPx, exclude };
}

/** Contraintes de toute flèche renvoyée : entièrement dans la vue (marge), sous le HUD, hors des zones exclues, pointant vers la cible. */
function checkArrow(a: EdgeArrow, tx: number, ty: number, w: number, h: number, ins: ScreenInsets, ctx: string): void {
  const top = Math.max(0, ins.safeTopPx);
  expect(a.x - HALF, ctx).toBeGreaterThanOrEqual(MARGIN - 1e-6);
  expect(a.x + HALF, ctx).toBeLessThanOrEqual(w - MARGIN + 1e-6);
  expect(a.y - HALF, ctx).toBeGreaterThanOrEqual(top + MARGIN - 1e-6);
  expect(a.y + HALF, ctx).toBeLessThanOrEqual(h - MARGIN + 1e-6);
  for (const r of ins.exclude) {
    const overlaps = a.x + HALF > r.left - MARGIN && a.x - HALF < r.right + MARGIN && a.y + HALF > r.top - MARGIN && a.y - HALF < r.bottom + MARGIN;
    expect(overlaps, `${ctx} : chevauche ${JSON.stringify(r)}`).toBe(false);
  }
  expect(Number.isFinite(a.angle), ctx).toBe(true);
  const vx = tx - a.x;
  const vy = ty - a.y;
  if (Math.hypot(vx, vy) > 1) {
    // La flèche pointe vers la cible (angle de la direction flèche → cible).
    const dot = (Math.cos(a.angle) * vx + Math.sin(a.angle) * vy) / Math.hypot(vx, vy);
    expect(dot, `${ctx} : angle ${a.angle}`).toBeGreaterThan(0.999);
  }
}

describe("cible visible ⇒ pas de flèche de bord", () => {
  it("dans la vue, sous le HUD, hors zones exclues ⇒ null", () => {
    expect(edgeArrowPlacement(500, 300, W, H, NONE)).toBeNull();
    expect(edgeArrowPlacement(0, 0, W, H, NONE)).toBeNull(); // bord inclus
    expect(edgeArrowPlacement(W, H, W, H, NONE)).toBeNull();
    expect(edgeArrowPlacement(500, 100, W, H, insets(60))).toBeNull();
  });
});

describe("cible hors écran", () => {
  const cases: readonly [string, number, number, number][] = [
    ["à droite", 2000, 300, 0],
    ["à gauche", -800, 300, Math.PI],
    ["en bas", 500, 1500, Math.PI / 2],
    ["en haut", 500, -900, -Math.PI / 2],
  ];
  for (const [name, tx, ty, angle] of cases) {
    it(`${name} : flèche au bord, orientée vers la cible`, () => {
      const a = edgeArrowPlacement(tx, ty, W, H, NONE);
      expect(a).not.toBeNull();
      if (!a) return;
      checkArrow(a, tx, ty, W, H, NONE, name);
      expect(Math.cos(a.angle)).toBeCloseTo(Math.cos(angle), 6);
      expect(Math.sin(a.angle)).toBeCloseTo(Math.sin(angle), 6);
    });
  }

  it("à droite : collée au bord droit (marge + demi-taille), à la hauteur du centre", () => {
    const a = edgeArrowPlacement(2000, 300, W, H, NONE);
    expect(a?.x).toBeCloseTo(W - MARGIN - HALF, 6);
    expect(a?.y).toBeCloseTo(300, 6);
  });

  it("en diagonale (coin) : flèche dans le coin utile, orientée vers la cible", () => {
    const a = edgeArrowPlacement(3000, -2000, W, H, NONE);
    expect(a).not.toBeNull();
    if (a) checkArrow(a, 3000, -2000, W, H, NONE, "coin");
  });
});

describe("zones de l'interface", () => {
  it("cible sous le HUD (au-dessus de safeTop) ⇒ flèche placée SOUS le HUD, pointant vers le haut", () => {
    const ins = insets(80);
    const a = edgeArrowPlacement(500, 40, W, H, ins);
    expect(a).not.toBeNull();
    if (!a) return;
    checkArrow(a, 500, 40, W, H, ins, "sous le HUD");
    expect(a.y - HALF).toBeGreaterThanOrEqual(80 + MARGIN - 1e-6);
    expect(Math.sin(a.angle)).toBeLessThan(-0.99);
  });

  it("cible cachée sous une zone exclue (carte du tutoriel) ⇒ flèche hors de la zone", () => {
    const card: ScreenRect = { left: 20, top: 400, right: 380, bottom: 580 };
    const ins = insets(60, [card]);
    const a = edgeArrowPlacement(200, 500, W, H, ins);
    expect(a).not.toBeNull();
    if (a) checkArrow(a, 200, 500, W, H, ins, "carte");
  });

  it("chemin vers le bord bloqué par les contrôles : la flèche glisse vers l'intérieur sans les toucher", () => {
    const controls: ScreenRect = { left: 880, top: 0, right: 1000, bottom: 600 };
    const ins = insets(0, [controls]);
    const a = edgeArrowPlacement(2000, 300, W, H, ins);
    expect(a).not.toBeNull();
    if (a) checkArrow(a, 2000, 300, W, H, ins, "contrôles");
  });

  it("tout l'écran couvert ⇒ null (aucune place)", () => {
    const all: ScreenRect = { left: -10, top: -10, right: W + 10, bottom: H + 10 };
    expect(edgeArrowPlacement(2000, 300, W, H, insets(0, [all]))).toBeNull();
  });

  it("HUD plus haut que la vue ⇒ null", () => {
    expect(edgeArrowPlacement(500, 2000, W, H, insets(H))).toBeNull();
  });
});

describe("robustesse", () => {
  it("vue nulle, trop petite pour la flèche, cible non finie ⇒ null sans exception", () => {
    expect(edgeArrowPlacement(2000, 300, 0, H, NONE)).toBeNull();
    expect(edgeArrowPlacement(2000, 300, W, 0, NONE)).toBeNull();
    expect(edgeArrowPlacement(2000, 300, Number.NaN, H, NONE)).toBeNull();
    expect(edgeArrowPlacement(200, 30, SIZE, SIZE, NONE)).toBeNull(); // la flèche + marges ne tiennent pas
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(edgeArrowPlacement(v, 300, W, H, NONE)).toBeNull();
      expect(edgeArrowPlacement(300, v, W, H, NONE)).toBeNull();
    }
  });

  it("safeTop non fini ou négatif traité comme 0", () => {
    const a = edgeArrowPlacement(500, -900, W, H, insets(Number.NaN));
    const b = edgeArrowPlacement(500, -900, W, H, insets(-50));
    const c = edgeArrowPlacement(500, -900, W, H, NONE);
    expect(a).toEqual(c);
    expect(b).toEqual(c);
  });

  it("déterministe et entrées non mutées", () => {
    const ins = Object.freeze({ safeTopPx: 70, exclude: Object.freeze([Object.freeze({ left: 900, top: 0, right: 1000, bottom: 60 })]) });
    const a = edgeArrowPlacement(-500, 900, W, H, ins);
    expect(edgeArrowPlacement(-500, 900, W, H, ins)).toEqual(a);
  });

  it("balayage déterministe (cibles, tailles d'écran, zones) : toute flèche renvoyée respecte les contraintes", () => {
    let seed = 2024;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    let placed = 0;
    for (let i = 0; i < 3000; i++) {
      const w = 320 + Math.floor(rand() * 1400);
      const h = 320 + Math.floor(rand() * 900);
      const ins = insets(Math.floor(rand() * 120), [
        { left: w - 120, top: 0, right: w, bottom: 60 }, // contrôles
        { left: 10, top: h - 200 * rand(), right: 10 + 340 * rand(), bottom: h - 10 }, // carte du tutoriel
      ]);
      const tx = (rand() * 4 - 1.5) * w;
      const ty = (rand() * 4 - 1.5) * h;
      const a = edgeArrowPlacement(tx, ty, w, h, ins);
      if (a) {
        placed++;
        checkArrow(a, tx, ty, w, h, ins, `#${i} cible (${tx.toFixed(0)}, ${ty.toFixed(0)}) vue ${w}×${h}`);
      }
    }
    expect(placed).toBeGreaterThan(1500);
  });
});
