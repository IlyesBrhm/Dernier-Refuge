// Rendu Canvas 2D provisoire (formes simples). LECTURE SEULE : ne modifie jamais l'état.
// Caméra : la carte est centrée si elle tient à l'écran ; sinon (petit écran / mobile, taille
// de tuile minimale pour rester lisible) la caméra suit le joueur, bornée aux limites de la carte.

import {
  isPlayerOn,
  slotRemaining,
  type GameState,
  type Survivor,
  type SurvivorStatus,
  type Tent,
  type TentStatus,
  type TilePos,
  type Vec,
} from "../core";
import { SURVIVOR, TENT, WELCOME, WORLD, PLAYER } from "../data/balance";
import { interpolate } from "./interpolate";

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
  drop: "#8b5a2b",
  dropStroke: "#4a2e12",
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
  leaving: "#9aa3a8",
};

export interface Renderer {
  draw(prev: Readonly<GameState>, curr: Readonly<GameState>, alpha: number): void;
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

  function font(sizeRatio: number, bold = true): string {
    const px = Math.max(11, Math.round(tilePx * sizeRatio));
    return `${bold ? "bold " : ""}${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  }

  function label(text: string, x: number, y: number, sizeRatio = 0.3): void {
    ctx.font = font(sizeRatio);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, tilePx * 0.06);
    ctx.strokeStyle = COLORS.textStroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(text, x, y);
  }

  /** Barre de progression centrée en (cx, y), ratio dans [0, 1]. */
  function bar(cx: number, y: number, ratio: number, color: string, widthRatio = 0.8): void {
    const w = tilePx * widthRatio;
    const h = Math.max(4, tilePx * 0.1);
    const x = cx - w / 2;
    const r = Math.min(1, Math.max(0, ratio));
    ctx.fillStyle = COLORS.barBack;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * r, h);
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
          if (tile === "rock") {
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
    label("Entrée", tileX(e) + tilePx / 2, tileY(e) + tilePx / 2, 0.2);

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
    label("Accueil", tileX(w) + tilePx / 2, tileY(w) + tilePx * 0.3, 0.2);
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
      label(String(slotRemaining(slot)), x + tilePx / 2, y + tilePx * 0.4, 0.32);
      label("bois", x + tilePx / 2, y + tilePx * 0.64, 0.17);
      bar(x + tilePx / 2, y + tilePx * 0.78, slot.cost > 0 ? slot.paid / slot.cost : 0, "#f0b43c", 0.76);
    }
  }

  function drawTent(state: Readonly<GameState>, tent: Readonly<Tent>): void {
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

    if (tent.status === "messy") {
      label("!", cx, cy - tilePx * 0.08, 0.32);
      const highlight = isPlayerOn(state,tent.tile);
      bar(cx, tileY(tent.tile) + tilePx * 0.84, tent.cleanProgress / TENT.cleanTicks, highlight ? "#7ee081" : "#57b45a");
    }
  }

  function drawDrops(state: Readonly<GameState>, positions: Map<number, Vec>): void {
    const size = tilePx * 0.3;
    for (const d of state.drops) {
      const p = positions.get(d.id) ?? d.pos;
      const x = sx(p.x);
      const y = sy(p.y);
      ctx.fillStyle = COLORS.drop;
      ctx.strokeStyle = COLORS.dropStroke;
      ctx.lineWidth = Math.max(1, tilePx * 0.03);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);
      label(`+${d.amount}`, x, y - size, 0.22);
    }
  }

  function drawSurvivor(s: Readonly<Survivor>, p: Vec): void {
    const x = sx(p.x);
    const y = sy(p.y);
    const r = tilePx * (s.status === "resting" ? 0.16 : 0.24);
    ctx.fillStyle = SURVIVOR_COLORS[s.status];
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = Math.max(1, tilePx * 0.03);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (s.status === "resting") {
      const done = 1 - s.restTicksLeft / SURVIVOR.restTicks;
      bar(x, y - tilePx * 0.52, done, "#5dade2", 0.6);
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

  return {
    draw(prev, curr, alpha): void {
      resizeIfNeeded();
      const pos = interpolate(prev, curr, alpha);
      updateCamera(curr, pos.player);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, cssW, cssH);

      drawGround(curr);
      drawZones(curr);
      drawSlots(curr);
      for (const t of curr.tents) drawTent(curr, t);
      drawDrops(curr, pos.drops);
      // Survivants au repos d'abord (sous les autres), puis les autres.
      for (const s of curr.survivors) if (s.status === "resting") drawSurvivor(s, pos.survivors.get(s.id) ?? s.pos);
      for (const s of curr.survivors) if (s.status !== "resting") drawSurvivor(s, pos.survivors.get(s.id) ?? s.pos);
      drawPlayer(pos.player);

      // Barre d'accueil par-dessus le joueur pour rester visible.
      if (curr.welcomeProgress > 0) {
        const w = curr.map.welcome;
        bar(tileX(w) + tilePx / 2, tileY(w) + tilePx * 0.84, curr.welcomeProgress / WELCOME.ticks, "#ffd23f");
      }
    },
  };
}
