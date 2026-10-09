// Calque 2D superposé (canvas #game, transparent) : barres, coûts, montants et textes flottants,
// placés par projection 3D → écran. Taille de référence en px bornée (lisibilité mobile garantie).
// Rien n'est dessiné sous le HUD ni sous le bouton Menu (zones mesurées par l'app, setInsets) :
// un libellé / une barre ancré(e) au-dessus d'un élément est alors redessiné(e) en miroir sous
// l'élément ; masqué(e) seulement si les deux positions sont couvertes.

import * as THREE from "three";
import { drawBar, drawLabel, fontFor } from "../canvas-kit";
import { FX_TEXT_COLORS, FX_TEXT_START_TILES, type FxSample } from "../fx";
import type { ScreenInsets } from "../renderer";
import { BAR_COLORS, OVERLAY, TILE_METERS, toMeters } from "./config";
import type { SceneFrame } from "./scene-model";

export interface Overlay {
  /** Dessine le calque de l'image ; `welcomeAt` = centre du tapis d'accueil (m). */
  draw(frame: SceneFrame, fx: readonly FxSample[], camera: THREE.Camera, welcomeAt: { x: number; z: number } | null): void;
  clear(): void;
  /** Zones couvertes par le DOM : aucun libellé / barre dont l'emprise (et pas seulement l'ancrage) les touche. */
  setInsets(insets: ScreenInsets): void;
  /** Qualité réduite : plafond de DPR abaissé. */
  degrade(): void;
  dispose(): void;
}

export function createOverlay(canvas: HTMLCanvasElement, coarsePointer: boolean): Overlay {
  const maybe = canvas.getContext("2d", { alpha: true });
  if (!maybe) throw new Error("Canvas 2D indisponible pour le calque");
  const ctx: CanvasRenderingContext2D = maybe;
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let maxDpr: number = coarsePointer ? OVERLAY.maxDprCoarse : OVERLAY.maxDprFine;
  let tilePx: number = OVERLAY.minTilePx;
  const v = new THREE.Vector3();
  const pt = { x: 0, y: 0 };
  let fontPx = -1;
  let fontStr = "";
  let insets: ScreenInsets = { safeTopPx: 0, exclude: [] };

  // Taille CSS relue uniquement quand le ResizeObserver la signale (pas de lecture du DOM par image).
  let sizeDirty = true;
  const ro = new ResizeObserver(() => {
    sizeDirty = true;
  });
  ro.observe(canvas);

  function resizeIfNeeded(): void {
    if (sizeDirty) {
      sizeDirty = false;
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      dpr = -1; // force la réallocation
    }
    const r = Math.min(window.devicePixelRatio || 1, maxDpr);
    if (r === dpr) return;
    dpr = r;
    canvas.width = Math.max(1, Math.round(cssW * r));
    canvas.height = Math.max(1, Math.round(cssH * r));
  }

  /**
   * Rectangle (px CSS) qui touche une zone couverte par le DOM ? Le HUD entier (pastilles ET ligne
   * d'aide) est sous `safeTopPx` ; le bouton Menu dans `exclude`.
   */
  function coveredRect(left: number, top: number, right: number, bottom: number): boolean {
    const pad = OVERLAY.exclusionPadPx;
    if (top < insets.safeTopPx + pad) return true;
    for (const r of insets.exclude) {
      if (right >= r.left - pad && left <= r.right + pad && bottom >= r.top - pad && top <= r.bottom + pad) return true;
    }
    return false;
  }

  /**
   * Projette (x, y, z) m ⇒ `pt` en px CSS ; false si derrière la caméra ou loin hors écran.
   * L'exclusion HUD / Menu est vérifiée ensuite sur l'emprise réelle de ce qui est dessiné.
   */
  function project(camera: THREE.Camera, x: number, y: number, z: number): boolean {
    v.set(x, y, z).project(camera);
    if (v.z < -1 || v.z > 1) return false;
    pt.x = ((v.x + 1) / 2) * cssW;
    pt.y = ((1 - v.y) / 2) * cssH;
    const m = tilePx * OVERLAY.offscreenMarginTiles;
    return pt.x > -m && pt.y > -m && pt.x < cssW + m && pt.y < cssH + m;
  }

  function barHeight(): number {
    return Math.max(OVERLAY.barMinHeightPx, tilePx * OVERLAY.barHeightRatio);
  }

  /**
   * Y écran (px CSS) du pivot au sol (x, 0, z) m, sans toucher `pt` ; NaN si derrière la caméra
   * (pas de repli miroir alors).
   */
  function groundY(camera: THREE.Camera, x: number, z: number): number {
    v.set(x, 0, z).project(camera);
    if (v.z < -1 || v.z > 1) return NaN;
    return ((1 - v.y) / 2) * cssH;
  }

  /**
   * Décalage vertical qui amène le bloc [top, bottom] en position miroir par rapport à `pivotY`
   * (même taille, ordre interne conservé) : nouveau haut = 2·pivot − bas.
   */
  function mirrorShift(top: number, bottom: number, pivotY: number): number {
    return 2 * pivotY - bottom - top;
  }

  /** Emprise d'une barre w×h centrée en (pt.x, cy) couverte par le DOM ? */
  function barCovered(w: number, h: number, cy: number): boolean {
    return coveredRect(pt.x - w / 2 - 1, cy - h / 2 - 1, pt.x + w / 2 + 1, cy + h / 2 + 1);
  }

  /**
   * Barre centrée sur `pt` ; si son emprise touche le HUD / le Menu, repli en miroir par rapport à
   * `pivotY` (NaN = pas de repli). false si non dessinée.
   */
  function bar(ratio: number, color: string, widthRatio: number = OVERLAY.barWidthRatio, pivotY = NaN): boolean {
    const h = barHeight();
    const w = tilePx * widthRatio;
    let cy = pt.y;
    if (barCovered(w, h, cy)) {
      if (!Number.isFinite(pivotY)) return false;
      cy += mirrorShift(cy - h / 2, cy + h / 2, pivotY);
      if (barCovered(w, h, cy)) return false;
    }
    drawBar(ctx, tilePx, pt.x, cy - h / 2, ratio, color, widthRatio, OVERLAY.barMinHeightPx);
    return true;
  }

  /** Emprise (px CSS) d'un libellé centré en (pt.x, pt.y + dy) : glyphes + contour. */
  const box = { left: 0, top: 0, right: 0, bottom: 0 };
  function labelBox(text: string, sizeRatio: number, dy: number): typeof box {
    ctx.font = fontFor(tilePx, sizeRatio);
    const px = Math.max(11, Math.round(tilePx * sizeRatio));
    const stroke = Math.max(2, tilePx * 0.06);
    const halfW = ctx.measureText(text).width / 2 + stroke;
    const halfH = px * 0.6 + stroke / 2;
    box.left = pt.x - halfW;
    box.right = pt.x + halfW;
    box.top = pt.y + dy - halfH;
    box.bottom = pt.y + dy + halfH;
    return box;
  }

  function labelCovered(text: string, sizeRatio: number, dy = 0): boolean {
    const b = labelBox(text, sizeRatio, dy);
    return coveredRect(b.left, b.top, b.right, b.bottom);
  }

  function label(text: string, sizeRatio: number, dy = 0): void {
    drawLabel(ctx, tilePx, text, pt.x, pt.y + dy, sizeRatio);
  }

  function clear(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return {
    clear,

    setInsets(next): void {
      insets = next;
    },

    degrade(): void {
      maxDpr = Math.min(maxDpr, OVERLAY.maxDprDegraded);
    },

    dispose(): void {
      ro.disconnect();
      clear();
    },

    draw(frame, fx, camera, welcomeAt): void {
      resizeIfNeeded();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Taille de référence : largeur projetée d'une tuile au point visé, bornée comme en 2D.
      // (Projection brute : la mesure ne dépend pas des zones couvertes.)
      const f = frame.focus;
      v.set(f.x - TILE_METERS / 2, 0, f.z).project(camera);
      const x0 = v.x;
      v.set(f.x + TILE_METERS / 2, 0, f.z).project(camera);
      const w = (Math.abs(v.x - x0) / 2) * cssW;
      tilePx = Math.min(OVERLAY.maxTilePx, Math.max(OVERLAY.minTilePx, Number.isFinite(w) ? w : OVERLAY.minTilePx));

      for (const item of frame.items) {
        switch (item.type) {
          case "tree":
          case "bush": {
            const h =
              item.type === "tree"
                ? item.ready
                  ? OVERLAY.treeBarHeight
                  : OVERLAY.treeRegrowBarHeight
                : item.ready
                  ? OVERLAY.bushBarHeight
                  : OVERLAY.bushRegrowBarHeight;
            if (!project(camera, item.x, h, item.z)) break;
            const pivot = groundY(camera, item.x, item.z);
            if (item.ready) {
              if (item.harvest > 0) {
                bar(
                  item.harvest,
                  item.targeted ? BAR_COLORS.harvest : BAR_COLORS.harvestPaused,
                  OVERLAY.barWidthRatio,
                  pivot,
                );
              }
            } else bar(item.regrow, BAR_COLORS.regrow, OVERLAY.regrowBarWidthRatio, pivot);
            break;
          }
          case "tent": {
            const pivot = groundY(camera, item.x, item.z);
            if (item.status === "occupied" && item.rest !== null) {
              if (project(camera, item.x, OVERLAY.tentBarHeight, item.z)) {
                bar(item.rest, BAR_COLORS.rest, OVERLAY.regrowBarWidthRatio, pivot);
              }
            } else if (item.status === "messy") {
              if (project(camera, item.x, OVERLAY.tentBarHeight + OVERLAY.tentAlertRise, item.z)) {
                if (!labelCovered("!", OVERLAY.alertSize)) label("!", OVERLAY.alertSize);
                else if (Number.isFinite(pivot)) {
                  const b = labelBox("!", OVERLAY.alertSize, 0);
                  const dy = mirrorShift(b.top, b.bottom, pivot);
                  if (!labelCovered("!", OVERLAY.alertSize, dy)) label("!", OVERLAY.alertSize, dy);
                }
              }
              if (project(camera, item.x, OVERLAY.tentBarHeight, item.z)) {
                bar(item.clean, item.playerOn ? BAR_COLORS.cleanActive : BAR_COLORS.clean, OVERLAY.barWidthRatio, pivot);
              }
            }
            break;
          }
          case "slot": {
            if (!project(camera, item.x, OVERLAY.slotLabelHeight, item.z)) break;
            // Le coût et son unité forment un bloc : tout ou rien (jamais coupé par le HUD).
            // S'il touche le HUD / le Menu au-dessus de l'emplacement : miroir sous son bord bas.
            const cost = String(item.remaining);
            const costDy = tilePx * OVERLAY.slotCostDy;
            const unitDy = tilePx * OVERLAY.slotUnitDy;
            let shift = 0;
            if (labelCovered(cost, OVERLAY.slotCostSize, costDy) || labelCovered("bois", OVERLAY.slotUnitSize, unitDy)) {
              const pivot = groundY(camera, item.x, item.z + TILE_METERS * OVERLAY.slotMirrorPivotTiles);
              if (!Number.isFinite(pivot)) break;
              const top = labelBox(cost, OVERLAY.slotCostSize, costDy).top;
              const bottom = labelBox("bois", OVERLAY.slotUnitSize, unitDy).bottom;
              shift = mirrorShift(top, bottom, pivot);
              if (
                labelCovered(cost, OVERLAY.slotCostSize, costDy + shift) ||
                labelCovered("bois", OVERLAY.slotUnitSize, unitDy + shift)
              ) {
                break;
              }
            }
            label(cost, OVERLAY.slotCostSize, costDy + shift);
            label("bois", OVERLAY.slotUnitSize, unitDy + shift);
            break;
          }
          case "drop": {
            if (!project(camera, item.x, OVERLAY.dropLabelHeight, item.z)) break;
            const text = `+${item.amount}`;
            if (!labelCovered(text, OVERLAY.dropAmountSize)) label(text, OVERLAY.dropAmountSize);
            break;
          }
          case "character":
            break;
        }
      }

      if (
        frame.welcome.ratio > 0 &&
        welcomeAt &&
        project(camera, welcomeAt.x, 0, welcomeAt.z + TILE_METERS * OVERLAY.welcomeBarOffsetTiles)
      ) {
        bar(frame.welcome.ratio, BAR_COLORS.welcome);
      }

      // Textes flottants de récolte (le butin en vol est en 3D, cf. loot-fx.ts).
      const px = Math.max(OVERLAY.fxTextMinPx, Math.round(tilePx * OVERLAY.fxTextSize));
      if (px !== fontPx) {
        fontPx = px;
        fontStr = `bold ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      }
      for (const s of fx) {
        if (s.phase !== "text") continue;
        if (!project(camera, toMeters(s.x), OVERLAY.fxTextHeight, toMeters(s.y))) continue;
        const y = pt.y - (s.rise - FX_TEXT_START_TILES) * tilePx;
        // Le texte monte : emprise vérifiée à sa position réelle.
        ctx.font = fontStr;
        const halfW = ctx.measureText(s.text).width / 2 + px * OVERLAY.fxStrokeRatio + OVERLAY.fxStrokeMinPx;
        const halfH = px * 0.6 + OVERLAY.fxStrokeMinPx;
        if (coveredRect(pt.x - halfW, y - halfH, pt.x + halfW, y + halfH)) continue;
        ctx.globalAlpha = s.alpha;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(OVERLAY.fxStrokeMinPx, tilePx * OVERLAY.fxStrokeRatio);
        ctx.strokeStyle = FX_TEXT_COLORS.stroke;
        ctx.strokeText(s.text, pt.x, y);
        ctx.fillStyle = s.muted ? FX_TEXT_COLORS.muted : FX_TEXT_COLORS.ok;
        ctx.fillText(s.text, pt.x, y);
        ctx.globalAlpha = 1;
      }
    },
  };
}
