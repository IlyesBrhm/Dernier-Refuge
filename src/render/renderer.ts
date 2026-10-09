// Rendu Canvas 2D (`?render=2d` et repli automatique de la 3D). LECTURE SEULE : ne modifie jamais l'état.
// Caméra : la carte est centrée si elle tient à l'écran ; sinon (petit écran / mobile, taille
// de tuile minimale pour rester lisible) la caméra suit le joueur, bornée aux limites de la carte.
// Jour/nuit (docs/design/day-night.md §4.9) : même courbe `lightingAt` que la 3D ; la nuit, voile
// bleuté percé d'un halo autour du feu (∝ bois restant) et du joueur, collé AVANT barres et textes.

import {
  feedZone,
  fireRatio,
  harvestTarget,
  isFireLit,
  isFireLow,
  isPlayerOn,
  playerTile,
  sameTile,
  slotRemaining,
  welcomeBlockReason,
  type GameState,
  type ResourceNode,
  type Survivor,
  type SurvivorStatus,
  type Tent,
  type TentStatus,
  type TilePos,
  type Vec,
} from "../core";
import { SURVIVOR, TENT, WELCOME, WORLD, PLAYER } from "../data/balance";
import { drawBar, drawLabel, fontFor } from "./canvas-kit";
import { fireFlicker, lightingAt, stepLitFade } from "./daylight";
import { createFxLayer, FX_TEXT_COLORS, type FxView } from "./fx";
import { drawResourceIcon } from "./icons";
import { interpolate } from "./interpolate";
import { prevNodeOf, shownFeedRatio, shownHarvestRatio, shownRegrowRatio } from "./ratios";
import { BERRIES } from "./shapes";
import { welcomeBlockLines } from "./welcome-block";

const U = WORLD.unitsPerTile;
const MIN_TILE_PX = 44; // en px CSS : lisibilité au doigt sur mobile
const MAX_TILE_PX = 96;

const COLORS = {
  background: "#1b2a17",
  grassA: "#7cb85a",
  grassB: "#75b153",
  treeGround: "#4e8a3b",
  treeTop: "#2c6127",
  treeTopLight: "#3c7a32",
  rock: "#8e9196",
  rockDark: "#5f6266",
  entrance: "#c7a46c",
  welcome: "rgba(255, 221, 87, 0.45)",
  welcomeActive: "rgba(255, 221, 87, 0.8)",
  queue: "rgba(255, 255, 255, 0.55)",
  slotFill: "rgba(255, 255, 255, 0.14)",
  slotFillActive: "rgba(255, 240, 180, 0.35)",
  slotStroke: "rgba(255, 255, 255, 0.85)",
  // Nœuds récoltables : houppier nettement plus clair que les arbres de bordure (#).
  nodeShadow: "rgba(0, 0, 0, 0.22)",
  nodeTrunk: "#7a4a22",
  nodeCrown: "#5aac3c",
  nodeCrownLight: "#8ad062",
  nodeCrownStroke: "#2a5a1c",
  stump: "#a8763f",
  stumpRing: "#6d4523",
  stumpStroke: "#4e3015",
  bush: "#3f8f3a",
  bushLight: "#62b356",
  bushStroke: "#24561f",
  bushEmpty: "#8a9a7c",
  bushEmptyStroke: "#55624b",
  berryRed: "#d81b3c",
  berryPurple: "#8e3bb5",
  targetStroke: "#ffe066",
  harvestBar: "#ffd23f",
  harvestBarPaused: "#9a9a7a",
  regrowBar: "#c4c8cc",
  player: "#2e86de",
  playerStroke: "#ffffff",
  outline: "#1d1d1d",
  barBack: "rgba(0, 0, 0, 0.55)",
  text: "#ffffff",
  textStroke: "rgba(0, 0, 0, 0.75)",
} as const;

const TENT_COLORS: Record<TentStatus, string> = {
  free: "#a8672f", // libre : brun
  assigned: "#e8c34a", // assignée (survivant en route) : jaune
  occupied: "#efe1bd", // occupée : beige
  messy: "#d0412f", // en désordre : rouge
};

const SURVIVOR_COLORS: Record<SurvivorStatus, string> = {
  toQueue: "#f39c12",
  queued: "#e67e22",
  walkingToTent: "#f7c948",
  resting: "#d35400",
  sleeping: "#8e6fbf",
  leaving: "#9aa3a8",
};

const FIRE_COLORS = {
  dirt: "#8a6a45",
  stone: "#8e9196",
  stoneDark: "#5f6266",
  log: "#7a4a22",
  flameOuter: "#ff7a1a",
  flameInner: "#ffd23f",
  ember: "#5a4a44",
  bar: "#ff9a3c",
  barLow: "#e53935",
  barOut: "#8a8a8a",
} as const;

/** Décalage horizontal (fraction de tuile) quand bois et nourriture partagent une tuile. */
export const SHARED_DROP_OFFSET = 0.15;

/** Rectangle en px CSS, relatif au canvas #game. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Zones de l'écran couvertes par l'interface DOM (HUD, bouton Menu), mesurées par l'app. */
export interface ScreenInsets {
  /** Bas du HUD (px CSS depuis le haut du canvas) : rien n'est étiqueté au-dessus. */
  safeTopPx: number;
  /** Zones d'exclusion supplémentaires (ex. bouton Menu). */
  exclude: readonly ScreenRect[];
}

export interface Renderer {
  /** À appeler une fois par tick simulé (détection d'événements visuels, ex. récolte). */
  onTick(prev: Readonly<GameState>, curr: Readonly<GameState>): void;
  draw(prev: Readonly<GameState>, curr: Readonly<GameState>, alpha: number): void;
  /** Oublie les effets en cours (l'état vient d'être remplacé). */
  reset(): void;
  /** Libère les ressources (GPU, écouteurs) avant remplacement par un autre renderer. Optionnel. */
  dispose?(): void;
  /** Zones couvertes par le DOM (libellés masqués dessous). Optionnel : le 2D les ignore. */
  setScreenInsets?(insets: ScreenInsets): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const maybeCtx = canvas.getContext("2d", { alpha: false });
  if (!maybeCtx) throw new Error("Canvas 2D indisponible");
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  // Transformation monde (unités) -> écran (px CSS) : px = off + unités * scale.
  let scale = 1;
  let offX = 0;
  let offY = 0;
  let tilePx = 1;

  function resizeIfNeeded(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const r = Math.min(window.devicePixelRatio || 1, 3);
    if (w === cssW && h === cssH && r === dpr) return;
    cssW = w;
    cssH = h;
    dpr = r;
    canvas.width = Math.max(1, Math.round(w * r));
    canvas.height = Math.max(1, Math.round(h * r));
  }

  function updateCamera(state: Readonly<GameState>, focus: Vec): void {
    const mapW = state.map.width * U;
    const mapH = state.map.height * U;
    const fitPx = Math.min(cssW / state.map.width, cssH / state.map.height);
    tilePx = Math.min(MAX_TILE_PX, Math.max(MIN_TILE_PX, fitPx));
    scale = tilePx / U;
    offX = axisOffset(cssW, mapW, focus.x);
    offY = axisOffset(cssH, mapH, focus.y);
  }

  function axisOffset(viewPx: number, mapUnits: number, focus: number): number {
    const mapPx = mapUnits * scale;
    if (mapPx <= viewPx) return (viewPx - mapPx) / 2;
    const viewUnits = viewPx / scale;
    const cam = Math.min(mapUnits - viewUnits, Math.max(0, focus - viewUnits / 2));
    return -cam * scale;
  }

  const sx = (x: number): number => offX + x * scale;
  const sy = (y: number): number => offY + y * scale;
  const tileX = (t: TilePos): number => offX + t.tx * tilePx;
  const tileY = (t: TilePos): number => offY + t.ty * tilePx;

  const fx = createFxLayer();
  const fxView: FxView = {
    sx,
    sy,
    get tilePx() {
      return tilePx;
    },
  };

  function font(sizeRatio: number, bold = true): string {
    return fontFor(tilePx, sizeRatio, bold);
  }

  function label(text: string, x: number, y: number, sizeRatio = 0.3): void {
    drawLabel(ctx, tilePx, text, x, y, sizeRatio);
  }

  /** Barre de progression centrée en (cx, y), ratio dans [0, 1]. */
  function bar(cx: number, y: number, ratio: number, color: string, widthRatio = 0.8): void {
    drawBar(ctx, tilePx, cx, y, ratio, color, widthRatio);
  }

  function drawGround(state: Readonly<GameState>): void {
    const { map } = state;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const tile = map.tiles[ty * map.width + tx];
        const x = offX + tx * tilePx;
        const y = offY + ty * tilePx;
        if (x > cssW || y > cssH || x + tilePx < 0 || y + tilePx < 0) continue;
        // +0.5 px pour éviter les liserés entre tuiles avec une échelle non entière.
        if (tile === "tree") {
          ctx.fillStyle = COLORS.treeGround;
          ctx.fillRect(x, y, tilePx + 0.5, tilePx + 0.5);
          ctx.fillStyle = COLORS.treeTop;
          ctx.beginPath();
          ctx.arc(x + tilePx / 2, y + tilePx / 2, tilePx * 0.44, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = COLORS.treeTopLight;
          ctx.beginPath();
          ctx.arc(x + tilePx * 0.42, y + tilePx * 0.4, tilePx * 0.22, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? COLORS.grassA : COLORS.grassB;
          ctx.fillRect(x, y, tilePx + 0.5, tilePx + 0.5);
          if (tile === "fire") {
            // Terre battue autour du foyer.
            ctx.fillStyle = FIRE_COLORS.dirt;
            ctx.beginPath();
            ctx.arc(x + tilePx / 2, y + tilePx / 2, tilePx * 0.46, 0, Math.PI * 2);
            ctx.fill();
          } else if (tile === "rock") {
            ctx.fillStyle = COLORS.rockDark;
            roundRect(x + tilePx * 0.08, y + tilePx * 0.12, tilePx * 0.84, tilePx * 0.8, tilePx * 0.2);
            ctx.fill();
            ctx.fillStyle = COLORS.rock;
            roundRect(x + tilePx * 0.1, y + tilePx * 0.08, tilePx * 0.8, tilePx * 0.72, tilePx * 0.2);
            ctx.fill();
          }
        }
      }
    }
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawZones(state: Readonly<GameState>): void {
    const { map } = state;
    // Entrée / sortie
    const e = map.entrance;
    ctx.fillStyle = COLORS.entrance;
    ctx.fillRect(tileX(e), tileY(e), tilePx, tilePx);

    // Places de file (tête = 1)
    ctx.save();
    ctx.setLineDash([tilePx * 0.08, tilePx * 0.08]);
    ctx.lineWidth = Math.max(1, tilePx * 0.03);
    ctx.strokeStyle = COLORS.queue;
    map.queueTiles.forEach((q, i) => {
      const inset = tilePx * 0.12;
      ctx.strokeRect(tileX(q) + inset, tileY(q) + inset, tilePx - 2 * inset, tilePx - 2 * inset);
      ctx.fillStyle = COLORS.queue;
      ctx.font = font(0.2);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(String(i + 1), tileX(q) + inset + 3, tileY(q) + inset + 2);
    });
    ctx.restore();

    // Zone d'accueil : surbrillance (plus forte quand le joueur est dessus)
    const w = map.welcome;
    const active = isPlayerOn(state,w);
    ctx.fillStyle = active ? COLORS.welcomeActive : COLORS.welcome;
    ctx.fillRect(tileX(w), tileY(w), tilePx, tilePx);
    ctx.strokeStyle = "#fff3b0";
    ctx.lineWidth = Math.max(1.5, tilePx * 0.05);
    ctx.strokeRect(tileX(w) + 1, tileY(w) + 1, tilePx - 2, tilePx - 2);
  }

  /** Libellés des zones (après le voile de nuit : toujours lisibles). */
  function drawZoneLabels(state: Readonly<GameState>): void {
    const { map } = state;
    const e = map.entrance;
    label("Entrée", tileX(e) + tilePx / 2, tileY(e) + tilePx / 2, 0.2);
    const w = map.welcome;
    label("Accueil", tileX(w) + tilePx / 2, tileY(w) + tilePx * 0.3, 0.2);
    const lines = welcomeBlockLines(welcomeBlockReason(state as GameState));
    if (lines.length > 0) {
      // Accueil fermé (core : welcomeBlockReason) : feu éteint, ou froid ayant fait fuir des survivants.
      ctx.font = font(0.18);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, tilePx * 0.06);
      ctx.strokeStyle = FX_TEXT_COLORS.stroke;
      ctx.fillStyle = FX_TEXT_COLORS.cold;
      const cx = tileX(w) + tilePx / 2;
      const lineH = tilePx * 0.2;
      const cy0 = tileY(w) + tilePx * 0.65 - ((lines.length - 1) * lineH) / 2;
      lines.forEach((t, i) => {
        ctx.strokeText(t, cx, cy0 + i * lineH);
        ctx.fillText(t, cx, cy0 + i * lineH);
      });
    }
  }

  /** Feu de camp : anneau de pierres, bûches, flamme ∝ bois restant (vacillement) ou braises grises. */
  function drawFire(state: Readonly<GameState>, ratio: number, fade: number, nowMs: number): void {
    const f = state.map.fire;
    const x = tileX(f);
    const y = tileY(f);
    if (x > cssW || y > cssH || x + tilePx < 0 || y + tilePx < 0) return;
    const cx = x + tilePx / 2;
    const cy = y + tilePx / 2;
    ctx.lineWidth = Math.max(1, tilePx * 0.03);
    // Pierres.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      circle(cx + Math.cos(a) * tilePx * 0.3, cy + Math.sin(a) * tilePx * 0.26, tilePx * 0.08, COLORS.rock, COLORS.rockDark);
    }
    // Bûches croisées.
    ctx.strokeStyle = FIRE_COLORS.log;
    ctx.lineWidth = Math.max(2, tilePx * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - tilePx * 0.18, cy + tilePx * 0.1);
    ctx.lineTo(cx + tilePx * 0.18, cy - tilePx * 0.06);
    ctx.moveTo(cx - tilePx * 0.18, cy - tilePx * 0.06);
    ctx.lineTo(cx + tilePx * 0.18, cy + tilePx * 0.1);
    ctx.stroke();
    ctx.lineCap = "butt";
    if (fade > 0.01) {
      const flick = fireFlicker(nowMs);
      const r = tilePx * (0.1 + 0.22 * ratio) * flick;
      ctx.globalAlpha = fade;
      ctx.fillStyle = FIRE_COLORS.flameOuter;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 1.9);
      ctx.quadraticCurveTo(cx + r, cy - r * 0.2, cx, cy + r * 0.4);
      ctx.quadraticCurveTo(cx - r, cy - r * 0.2, cx, cy - r * 1.9);
      ctx.fill();
      circle(cx, cy - r * 0.2, r * 0.45, FIRE_COLORS.flameInner);
      ctx.globalAlpha = 1;
    }
    if (fade < 0.99) {
      ctx.globalAlpha = 1 - fade;
      circle(cx, cy, tilePx * 0.1, FIRE_COLORS.ember);
      ctx.globalAlpha = 1;
    }
  }

  function drawSlots(state: Readonly<GameState>): void {
    for (const slot of state.buildSlots) {
      if (slot.builtTentId !== null) continue; // la tente construite est dessinée avec les tentes
      const x = tileX(slot.tile);
      const y = tileY(slot.tile);
      const inset = tilePx * 0.06;
      ctx.fillStyle = isPlayerOn(state,slot.tile) ? COLORS.slotFillActive : COLORS.slotFill;
      ctx.fillRect(x + inset, y + inset, tilePx - 2 * inset, tilePx - 2 * inset);
      ctx.save();
      ctx.setLineDash([tilePx * 0.12, tilePx * 0.08]);
      ctx.lineWidth = Math.max(1.5, tilePx * 0.04);
      ctx.strokeStyle = COLORS.slotStroke;
      ctx.strokeRect(x + inset, y + inset, tilePx - 2 * inset, tilePx - 2 * inset);
      ctx.restore();
    }
  }

  function drawSlotLabels(state: Readonly<GameState>): void {
    for (const slot of state.buildSlots) {
      if (slot.builtTentId !== null) continue;
      const x = tileX(slot.tile);
      const y = tileY(slot.tile);
      label(String(slotRemaining(slot)), x + tilePx / 2, y + tilePx * 0.4, 0.32);
      label("bois", x + tilePx / 2, y + tilePx * 0.64, 0.17);
      bar(x + tilePx / 2, y + tilePx * 0.78, slot.cost > 0 ? slot.paid / slot.cost : 0, "#f0b43c", 0.76);
    }
  }

  function drawTent(tent: Readonly<Tent>): void {
    const cx = tileX(tent.tile) + tilePx / 2;
    const cy = tileY(tent.tile) + tilePx / 2;
    const half = tilePx * 0.4;
    ctx.fillStyle = TENT_COLORS[tent.status];
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = Math.max(1.5, tilePx * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx, cy - tilePx * 0.36);
    ctx.lineTo(cx + half, cy + tilePx * 0.3);
    ctx.lineTo(cx - half, cy + tilePx * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Porte
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.moveTo(cx, cy - tilePx * 0.04);
    ctx.lineTo(cx + tilePx * 0.12, cy + tilePx * 0.3);
    ctx.lineTo(cx - tilePx * 0.12, cy + tilePx * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  /** « ! » + barre de nettoyage (désordre), « Zz » (dormeur) : après le voile de nuit. */
  function drawTentLabels(state: Readonly<GameState>, tent: Readonly<Tent>, nowMs: number): void {
    const cx = tileX(tent.tile) + tilePx / 2;
    const cy = tileY(tent.tile) + tilePx / 2;
    if (tent.status === "messy") {
      label("!", cx, cy - tilePx * 0.08, 0.32);
      const highlight = isPlayerOn(state, tent.tile);
      bar(cx, tileY(tent.tile) + tilePx * 0.84, tent.cleanProgress / TENT.cleanTicks, highlight ? "#7ee081" : "#57b45a");
    } else if (tent.status === "occupied" && tent.occupantId !== null) {
      const occupant = state.survivors.find((s) => s.id === tent.occupantId);
      if (occupant?.status === "sleeping") {
        const k = ((nowMs / 1000) * 0.6) % 1;
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(Math.PI * k);
        label("Zz", cx + tilePx * 0.22, cy - tilePx * (0.45 + 0.18 * k), 0.26);
        ctx.globalAlpha = 1;
      }
    }
  }

  function circle(x: number, y: number, r: number, fill: string, stroke?: string): void {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function drawTreeCrown(cx: number, cy: number, g: number): void {
    ctx.lineWidth = Math.max(1, tilePx * 0.03);
    circle(cx, cy - tilePx * 0.1 * g, tilePx * 0.34 * g, COLORS.nodeCrown, COLORS.nodeCrownStroke);
    circle(cx - tilePx * 0.1 * g, cy - tilePx * 0.2 * g, tilePx * 0.13 * g, COLORS.nodeCrownLight);
  }

  function drawNodeBody(node: Readonly<ResourceNode>, regrow: number, isTarget: boolean): void {
    const x = tileX(node.tile);
    const y = tileY(node.tile);
    if (x > cssW || y > cssH || x + tilePx < 0 || y + tilePx < 0) return;
    const cx = x + tilePx / 2;
    const cy = y + tilePx / 2;
    const ready = node.status === "ready";

    ctx.fillStyle = COLORS.nodeShadow;
    ctx.beginPath();
    ctx.ellipse(cx, cy + tilePx * 0.32, tilePx * 0.32, tilePx * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    if (node.kind === "tree") {
      if (ready) {
        ctx.fillStyle = COLORS.nodeTrunk;
        ctx.fillRect(cx - tilePx * 0.07, cy, tilePx * 0.14, tilePx * 0.34);
        drawTreeCrown(cx, cy, 1);
      } else {
        // Souche à cernes + jeune pousse qui regrandit avec la repousse.
        ctx.lineWidth = Math.max(1, tilePx * 0.03);
        circle(cx, cy + tilePx * 0.14, tilePx * 0.2, COLORS.stump, COLORS.stumpStroke);
        ctx.strokeStyle = COLORS.stumpRing;
        ctx.lineWidth = Math.max(1, tilePx * 0.02);
        ctx.beginPath();
        ctx.arc(cx, cy + tilePx * 0.14, tilePx * 0.12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + tilePx * 0.14, tilePx * 0.05, 0, Math.PI * 2);
        ctx.stroke();
        if (regrow > 0.05) {
          ctx.globalAlpha = 0.85;
          drawTreeCrown(cx, cy - tilePx * 0.05, 0.15 + 0.45 * regrow);
          ctx.globalAlpha = 1;
        }
      }
    } else {
      const g = ready ? 1 : 0.6 + 0.35 * regrow;
      const by = cy + tilePx * 0.05;
      ctx.lineWidth = Math.max(1, tilePx * 0.03);
      if (ready) {
        circle(cx, by, tilePx * 0.36, COLORS.bush, COLORS.bushStroke);
        circle(cx - tilePx * 0.12, by - tilePx * 0.12, tilePx * 0.14, COLORS.bushLight);
        for (let i = 0; i < BERRIES.length; i++) {
          const b = BERRIES[i];
          if (!b) continue;
          circle(
            cx + b[0] * tilePx,
            by + b[1] * tilePx,
            tilePx * 0.055,
            i % 2 === 0 ? COLORS.berryRed : COLORS.berryPurple,
          );
        }
      } else {
        circle(cx, by, tilePx * 0.36 * g, COLORS.bushEmpty, COLORS.bushEmptyStroke);
      }
    }

    if (isTarget) {
      ctx.save();
      ctx.strokeStyle = COLORS.targetStroke;
      ctx.lineWidth = Math.max(2, tilePx * 0.05);
      roundRect(x + tilePx * 0.05, y + tilePx * 0.05, tilePx * 0.9, tilePx * 0.9, tilePx * 0.16);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawNodes(
    prev: Readonly<GameState>,
    curr: Readonly<GameState>,
    a: number,
    target: ResourceNode | null,
  ): void {
    const nodes = curr.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      drawNodeBody(n, shownRegrowRatio(prevNodeOf(prev, i, n.id), n, a), target !== null && target.id === n.id);
    }
  }

  /** Barres dessinées après le joueur pour rester visibles. */
  function drawNodeBars(
    prev: Readonly<GameState>,
    curr: Readonly<GameState>,
    a: number,
    target: ResourceNode | null,
  ): void {
    const nodes = curr.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      const p = prevNodeOf(prev, i, n.id);
      const cx = tileX(n.tile) + tilePx / 2;
      const by = tileY(n.tile) + tilePx * 0.86;
      if (n.status === "ready") {
        if (n.progress <= 0) continue;
        const isTarget = target !== null && target.id === n.id;
        bar(cx, by, shownHarvestRatio(p, n, a), isTarget ? COLORS.harvestBar : COLORS.harvestBarPaused);
      } else {
        bar(cx, by, shownRegrowRatio(p, n, a), COLORS.regrowBar, 0.6);
      }
    }
  }

  /** `labels` : false = icônes (sous le voile de nuit), true = montants (au-dessus). */
  function drawDrops(state: Readonly<GameState>, positions: Map<number, Vec>, labels: boolean): void {
    const size = tilePx * 0.3;
    const drops = state.drops;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d) continue;
      // Décalage purement visuel si une autre ressource occupe la même tuile (état courant).
      const tx = Math.floor(d.pos.x / U);
      const ty = Math.floor(d.pos.y / U);
      let shared = false;
      for (let j = 0; j < drops.length; j++) {
        const o = drops[j];
        if (j === i || !o || o.resource === d.resource) continue;
        if (Math.floor(o.pos.x / U) === tx && Math.floor(o.pos.y / U) === ty) {
          shared = true;
          break;
        }
      }
      const p = positions.get(d.id) ?? d.pos;
      const dx = shared ? (d.resource === "food" ? 1 : -1) * SHARED_DROP_OFFSET * tilePx : 0;
      const x = sx(p.x) + dx;
      const y = sy(p.y);
      if (labels) label(`+${d.amount}`, x, y - size, 0.22);
      else drawResourceIcon(ctx, d.resource, x, y, size, Math.max(1, tilePx * 0.03));
    }
  }

  function isInTent(s: Readonly<Survivor>): boolean {
    return s.status === "resting" || s.status === "sleeping";
  }

  function drawSurvivor(s: Readonly<Survivor>, p: Vec): void {
    const x = sx(p.x);
    const y = sy(p.y);
    const r = tilePx * (isInTent(s) ? 0.16 : 0.24);
    ctx.fillStyle = SURVIVOR_COLORS[s.status];
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = Math.max(1, tilePx * 0.03);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /** Barre de repos (jour) ou « z » (dormeur) : après le voile de nuit. */
  function drawSurvivorLabel(s: Readonly<Survivor>, p: Vec): void {
    const x = sx(p.x);
    const y = sy(p.y);
    if (s.status === "resting") {
      const done = 1 - s.restTicksLeft / SURVIVOR.restTicks;
      bar(x, y - tilePx * 0.52, done, "#5dade2", 0.6);
    } else if (s.status === "sleeping") {
      label("z", x, y, 0.2);
    }
  }

  function drawPlayer(p: Vec): void {
    const x = sx(p.x);
    const y = sy(p.y);
    const r = PLAYER.halfSize * scale;
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.75, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.player;
    ctx.strokeStyle = COLORS.playerStroke;
    ctx.lineWidth = Math.max(2, tilePx * 0.06);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // --- Voile de nuit : calque hors écran, halos percés au feu et au joueur ---
  const veil = document.createElement("canvas");
  const vctx = veil.getContext("2d");
  let litFade = -1;
  let lastNow: number | null = null;

  function punch(x: number, y: number, radius: number): void {
    if (!vctx || radius <= 0) return;
    const g = vctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.55, "rgba(0,0,0,0.75)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    vctx.fillStyle = g;
    vctx.beginPath();
    vctx.arc(x, y, radius, 0, Math.PI * 2);
    vctx.fill();
  }

  function drawNight(state: Readonly<GameState>, opacity: number, ratio: number, fade: number, player: Vec, nowMs: number): void {
    if (!vctx || opacity <= 0.001) return;
    if (veil.width !== canvas.width || veil.height !== canvas.height) {
      veil.width = canvas.width;
      veil.height = canvas.height;
    }
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.globalCompositeOperation = "source-over";
    vctx.clearRect(0, 0, veil.width, veil.height);
    vctx.fillStyle = `rgba(10, 18, 48, ${opacity.toFixed(3)})`;
    vctx.fillRect(0, 0, veil.width, veil.height);
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vctx.globalCompositeOperation = "destination-out";
    const f = state.map.fire;
    const fireR = tilePx * (1.5 + (4 - 1.5) * ratio) * fade * (fade > 0 ? fireFlicker(nowMs) : 1);
    punch(tileX(f) + tilePx / 2, tileY(f) + tilePx / 2, fireR);
    punch(sx(player.x), sy(player.y), tilePx * 0.8 * 1.6);
    vctx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(veil, 0, 0);
    ctx.restore();
    // Lueur chaude par-dessus (feu allumé uniquement).
    if (fade > 0.01) {
      const cx = tileX(f) + tilePx / 2;
      const cy = tileY(f) + tilePx / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fireR);
      g.addColorStop(0, `rgba(255, 150, 60, ${(0.28 * fade * opacity).toFixed(3)})`);
      g.addColorStop(1, "rgba(255, 150, 60, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, fireR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Barre du feu : joueur dans la zone d'alimentation, ou feu qui faiblit. */
  function drawFireBar(state: Readonly<GameState>, ratio: number): void {
    const low = isFireLow(state as GameState);
    const pt = playerTile(state as GameState);
    const near = feedZone(state.map as GameState["map"]).some((t) => sameTile(t, pt));
    if (!near && !low) return;
    const f = state.map.fire;
    const lit = isFireLit(state as GameState);
    const color = !lit ? FIRE_COLORS.barOut : low ? FIRE_COLORS.barLow : FIRE_COLORS.bar;
    bar(tileX(f) + tilePx / 2, tileY(f) - tilePx * 0.1, ratio, color);
  }

  return {
    onTick(prev, curr): void {
      fx.onTick(prev, curr, performance.now());
    },

    reset(): void {
      fx.reset();
      litFade = -1;
      lastNow = null;
    },

    draw(prev, curr, alpha): void {
      resizeIfNeeded();
      const now = performance.now();
      const dt = lastNow === null ? 0 : Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
      const pos = interpolate(prev, curr, a);
      const target = harvestTarget(curr);
      updateCamera(curr, pos.player);

      // Feu et lumière (mêmes courbes que la 3D, temps interpolé).
      const lit = isFireLit(curr);
      litFade = litFade < 0 ? (lit ? 1 : 0) : stepLitFade(litFade, lit, dt);
      const r0 = fireRatio(prev);
      const ratio = r0 + (fireRatio(curr) - r0) * a;
      const lighting = lightingAt(prev.tick + (curr.tick > prev.tick ? (curr.tick - prev.tick) * a : a));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, cssW, cssH);

      drawGround(curr);
      drawZones(curr);
      drawSlots(curr);
      for (const t of curr.tents) drawTent(t);
      drawFire(curr, ratio, litFade, now);
      drawNodes(prev, curr, a, target);
      drawDrops(curr, pos.drops, false);
      // Survivants dans leur tente d'abord (sous les autres), puis les autres.
      for (const s of curr.survivors) if (isInTent(s)) drawSurvivor(s, pos.survivors.get(s.id) ?? s.pos);
      for (const s of curr.survivors) if (!isInTent(s)) drawSurvivor(s, pos.survivors.get(s.id) ?? s.pos);
      drawPlayer(pos.player);

      // Nuit : voile + halos, sous les barres et les textes.
      drawNight(curr, lighting.overlay2D, ratio, litFade, pos.player, now);

      drawZoneLabels(curr);
      drawSlotLabels(curr);
      for (const t of curr.tents) drawTentLabels(curr, t, now);
      for (const s of curr.survivors) if (isInTent(s)) drawSurvivorLabel(s, pos.survivors.get(s.id) ?? s.pos);
      drawDrops(curr, pos.drops, true);
      // Barre d'accueil par-dessus le joueur pour rester visible.
      if (curr.welcomeProgress > 0) {
        const w = curr.map.welcome;
        bar(tileX(w) + tilePx / 2, tileY(w) + tilePx * 0.84, curr.welcomeProgress / WELCOME.ticks, "#ffd23f");
      }
      drawNodeBars(prev, curr, a, target);
      drawFireBar(curr, ratio);
      // Jauge d'arrêt près du feu (délai avant alimentation), en bas de la tuile du feu.
      const feed = shownFeedRatio(prev, curr, a);
      if (feed !== null) {
        const f = curr.map.fire;
        bar(tileX(f) + tilePx / 2, tileY(f) + tilePx * 0.9, Math.min(1, Math.max(0, feed)), "#ffd23f", 0.6);
      }
      // Effets (butin en vol, texte flottant) au-dessus de tout.
      fx.draw(ctx, fxView, pos.player, now);
    },
  };
}
