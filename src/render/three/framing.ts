// Cadrage portrait de la file d'attente (docs/design/day-night.md §4.7). PUR : sans three, testable.
// Près de l'accueil, en portrait, la caméra se décale vers la file pour en montrer la tête (et le plus
// de places occupées possible) tout en gardant le joueur à ≥ 0,75 tuile du bord, et s'élargit d'une
// tuile. L'effet s'efface linéairement entre 2 et 3 tuiles de l'accueil.

import { TILE_METERS } from "./config";

/** Entrées du cadrage, en mètres (fournies par buildScene). */
export interface FramingInput {
  /** Joueur interpolé. */
  player: { x: number; z: number };
  /** Centre de la tuile d'accueil W. */
  welcome: { x: number; z: number };
  /** Centres des places de file OCCUPÉES, tête en premier. */
  queue: readonly { x: number; z: number }[];
}

export interface Framing {
  /** Décalage (m) à ajouter à x de la cible caméra. */
  offsetX: number;
  /** Tuiles de largeur ajoutées à la vue (0..1). */
  extraTilesWide: number;
}

export const FRAMING = {
  /** Plein effet jusqu'à cette distance de Chebyshev (tuiles) de W… */
  fullWithinTiles: 2,
  /** … effacé linéairement jusqu'à celle-ci. */
  noneBeyondTiles: 3,
  /** Marge mini (tuiles) entre le joueur et le bord de la vue. */
  playerMarginTiles: 0.75,
  /** Largeur ajoutée près de l'accueil (tuiles). */
  extraTilesWide: 1,
} as const;

const NONE: Framing = { offsetX: 0, extraTilesWide: 0 };

/** Poids de l'effet selon la distance de Chebyshev (tuiles, réelle) du joueur à W. */
export function framingWeight(player: { x: number; z: number }, welcome: { x: number; z: number }): number {
  const d = Math.max(Math.abs(player.x - welcome.x), Math.abs(player.z - welcome.z)) / TILE_METERS;
  if (d <= FRAMING.fullWithinTiles) return 1;
  if (d >= FRAMING.noneBeyondTiles) return 0;
  return (FRAMING.noneBeyondTiles - d) / (FRAMING.noneBeyondTiles - FRAMING.fullWithinTiles);
}

/**
 * Cadrage portrait. `baseTilesWide` = largeur visible (tuiles) au point visé sans élargissement.
 * File vide ou joueur loin de W ⇒ aucun effet.
 */
export function portraitFraming(input: FramingInput, baseTilesWide: number): Framing {
  if (input.queue.length === 0) return NONE;
  const w = framingWeight(input.player, input.welcome);
  if (w <= 0) return NONE;
  const T = TILE_METERS;
  const extra = FRAMING.extraTilesWide * w;
  const halfW = ((Math.max(1, baseTilesWide) + extra) * T) / 2;
  const px = input.player.x;
  const m = FRAMING.playerMarginTiles * T;
  let lo = px - m;
  let hi = px + m;
  // Places dans l'ordre de la file : on inclut la tête, puis tant que tout tient dans la vue.
  for (const q of input.queue) {
    const nlo = Math.min(lo, q.x - T / 2);
    const nhi = Math.max(hi, q.x + T / 2);
    if (nhi - nlo > 2 * halfW) break;
    lo = nlo;
    hi = nhi;
  }
  // Centre le plus proche du joueur qui contient [lo, hi].
  const minC = hi - halfW;
  const maxC = lo + halfW;
  const c = minC <= maxC ? Math.min(maxC, Math.max(minC, px)) : px;
  return { offsetX: (c - px) * w, extraTilesWide: extra };
}
