// Effets visuels de récolte (présentation pure, LECTURE SEULE de l'état).
// - Détection : à chaque tick, comparaison état précédent / état courant (nœud passé de ready à depleted).
//   Appelé une fois par tick par la boucle (pas par image) ⇒ un seul effet par récolte, même si plusieurs
//   ticks passent dans une image ; jamais au premier rendu (aucun tick comparé).
// - Animation en temps réel d'affichage (ms), pool fixe préalloué : aucune allocation par image.
// - Quantité et ressource lues dans NODES[kind] ; « stock plein » via le sélecteur isStockFull du core.
//   Rien n'est écrit dans l'état.

import { isStockFull, tileCenter, tileOf, type DropResource, type GameState, type Vec } from "../core";
import { NODES } from "../data/balance";
import { drawResourceIcon, RESOURCE_STYLE } from "./icons";

// Durées / amplitudes d'animation (présentation, pas du gameplay).
const LOOT_MS = 500; // vol du butin du nœud vers le joueur
const TEXT_MS = 900; // texte flottant après l'arrivée
const TOTAL_MS = LOOT_MS + TEXT_MS;
const ARC_HEIGHT_TILES = 0.9;
const TEXT_START_TILES = 0.55; // au-dessus du centre du joueur
const TEXT_RISE_TILES = 0.6;
const MAX_FX = 16;

const TEXT_COLOR_OK = "#fff6c8";
const TEXT_COLOR_GROUNDED = "#d9d9d9";
const TEXT_STROKE = "rgba(0, 0, 0, 0.75)";

interface HarvestFx {
  active: boolean;
  start: number;
  fromX: number;
  fromY: number;
  /**
   * Butin resté au sol (stock plein, rien crédité) : pas de vol (le drop est déjà dessiné par le
   * renderer), seulement le texte gris ancré sur la tuile du drop.
   */
  grounded: boolean;
  /** Texte en gris : stock plein après le tick (y compris ramassage partiel). */
  muted: boolean;
  groundX: number;
  groundY: number;
  resource: DropResource;
  text: string;
}

/** Projection monde → écran fournie par le renderer. */
export interface FxView {
  sx(x: number): number;
  sy(y: number): number;
  readonly tilePx: number;
}

export interface FxLayer {
  /** À appeler une fois par tick avec (état avant, état après). */
  onTick(prev: Readonly<GameState>, curr: Readonly<GameState>, nowMs: number): void;
  /** Dessine les effets actifs ; `player` = position interpolée affichée. */
  draw(ctx: CanvasRenderingContext2D, view: FxView, player: Readonly<Vec>, nowMs: number): void;
  /** Nombre d'effets actifs (débogage). */
  activeCount(): number;
  /** Efface tous les effets (l'état a été remplacé : chargement, import, nouvelle partie). */
  reset(): void;
}

export function createFxLayer(): FxLayer {
  const pool: HarvestFx[] = [];
  for (let i = 0; i < MAX_FX; i++) {
    pool.push({
      active: false,
      start: 0,
      fromX: 0,
      fromY: 0,
      grounded: false,
      muted: false,
      groundX: 0,
      groundY: 0,
      resource: "wood",
      text: "",
    });
  }
  let fontPx = -1;
  let fontStr = "";

  function acquire(): HarvestFx {
    let oldest = pool[0] as HarvestFx;
    for (const fx of pool) {
      if (!fx.active) return fx;
      if (fx.start < oldest.start) oldest = fx;
    }
    return oldest; // pool plein : on recycle le plus ancien
  }

  function spawn(
    prev: Readonly<GameState>,
    curr: Readonly<GameState>,
    kind: keyof typeof NODES,
    from: Vec,
    nowMs: number,
  ): void {
    const def = NODES[kind];
    const resource: DropResource = def.resource;
    const name = RESOURCE_STYLE[resource].name;
    // Stock plein après le tick ⇒ le butin (ou son reste) demeure au sol (sélecteur du core).
    const fullAfter = isStockFull(curr, resource);
    // Gain crédité ce tick, borné au rendement du nœud (sert au ramassage partiel).
    const gained = Math.max(0, Math.min(def.yield, curr.resources[resource] - prev.resources[resource]));
    // Le drop est posé sur la tuile du joueur (après déplacement, même tick).
    const ground = tileCenter(tileOf(curr.player.pos));
    const fx = acquire();
    fx.active = true;
    fx.start = nowMs;
    fx.fromX = from.x;
    fx.fromY = from.y;
    fx.groundX = ground.x;
    fx.groundY = ground.y;
    fx.resource = resource;
    if (!fullAfter) {
      fx.grounded = false;
      fx.muted = false;
      fx.text = `+${def.yield} ${name}`;
    } else if (!isStockFull(prev, resource) && gained > 0) {
      // Ramassage partiel : la part créditée vole vers le joueur, le reste est dessiné au sol.
      fx.grounded = false;
      fx.muted = true;
      fx.text = `+${gained} ${name}`;
    } else {
      // Rien crédité : pas de vol (le drop est déjà dessiné), texte immédiat.
      fx.grounded = true;
      fx.muted = true;
      fx.start = nowMs - LOOT_MS;
      fx.text = `Stock de ${name} plein`;
    }
  }

  return {
    onTick(prev, curr, nowMs): void {
      const n = curr.nodes.length;
      for (let i = 0; i < n; i++) {
        const c = curr.nodes[i];
        const p = prev.nodes[i];
        if (!c || !p || p.id !== c.id) continue;
        if (p.status === "ready" && c.status === "depleted") spawn(prev, curr, c.kind, tileCenter(c.tile), nowMs);
      }
    },

    draw(ctx, view, player, nowMs): void {
      const tilePx = view.tilePx;
      const px = Math.max(12, Math.round(tilePx * 0.28));
      if (px !== fontPx) {
        fontPx = px;
        fontStr = `bold ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      }
      for (const fx of pool) {
        if (!fx.active) continue;
        const t = Math.max(0, nowMs - fx.start);
        if (t >= TOTAL_MS) {
          fx.active = false;
          continue;
        }
        const toX = fx.grounded ? fx.groundX : player.x;
        const toY = fx.grounded ? fx.groundY : player.y;
        if (t < LOOT_MS) {
          // Vol en arc : position linéaire + bosse sinusoïdale, lissage smoothstep.
          const k = t / LOOT_MS;
          const e = k * k * (3 - 2 * k);
          const wx = fx.fromX + (toX - fx.fromX) * e;
          const wy = fx.fromY + (toY - fx.fromY) * e;
          const lift = Math.sin(Math.PI * k) * ARC_HEIGHT_TILES * tilePx;
          const size = tilePx * (0.3 - 0.08 * k);
          // Ombre au sol.
          ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
          ctx.beginPath();
          ctx.ellipse(view.sx(wx), view.sy(wy) + size * 0.4, size * 0.5, size * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
          drawResourceIcon(ctx, fx.resource, view.sx(wx), view.sy(wy) - lift, size, Math.max(1, tilePx * 0.03));
        } else {
          const k = (t - LOOT_MS) / TEXT_MS;
          const alpha = 1 - k * k;
          const x = view.sx(toX);
          const y = view.sy(toY) - (TEXT_START_TILES + TEXT_RISE_TILES * k) * tilePx;
          ctx.globalAlpha = alpha;
          ctx.font = fontStr;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineJoin = "round";
          ctx.lineWidth = Math.max(2, tilePx * 0.06);
          ctx.strokeStyle = TEXT_STROKE;
          ctx.strokeText(fx.text, x, y);
          ctx.fillStyle = fx.muted ? TEXT_COLOR_GROUNDED : TEXT_COLOR_OK;
          ctx.fillText(fx.text, x, y);
          ctx.globalAlpha = 1;
        }
      }
    },

    activeCount(): number {
      let c = 0;
      for (const fx of pool) if (fx.active) c++;
      return c;
    },

    reset(): void {
      for (const fx of pool) fx.active = false;
    },
  };
}
