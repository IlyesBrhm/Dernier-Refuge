// Constantes de PRÉSENTATION partagées 2D / 3D : écran titre (docs/design/ui-polish.md §4.4) et flèche
// du tutoriel (§4.6). Aucun import de three, aucune règle de jeu.

/** Fond de l'écran titre. */
export const TITLE = {
  /** Tick d'éclairage forcé (nuit bleutée, feu porteur de l'ombre) : lightingAt(lightTick). */
  lightTick: 2900,
  /** Feu forcé allumé à l'image : ratio affiché = max(ratio, fireMinRatio). */
  fireMinRatio: 0.7,
  /** Caméra orbitale (3D) : centre = feu, rayon et hauteur (m), visée au-dessus du feu (m). */
  orbitRadius: 11,
  orbitHeight: 7,
  orbitLookY: 0.5,
  /** Un tour en `orbitPeriodS` secondes ; angle de départ (et angle fixe en mouvement réduit). */
  orbitPeriodS: 120,
  /** 0 = caméra au sud du feu (comme en jeu) ; légèrement de biais pour un 3/4 plus vivant. */
  orbitYaw0: -0.55,
} as const;

/** Couleurs de la flèche (guide de style : ember-500 + contour night-900, jamais la couleur seule : forme). */
export const GUIDE_COLORS = {
  fill: "#ff8a2a",
  stroke: "#0e1626",
  /** Liseré clair intérieur (lisible sur fond sombre la nuit). */
  shine: "#ffc27a",
} as const;

/** Flèche du tutoriel. */
export const GUIDE = {
  /** Rebond vertical (m) et fréquence (Hz). */
  bounceM: 0.25,
  bounceHz: 1,
  /** Hauteur (m) de la pointe au-dessus du sol : cible ordinaire / tente / arbre prêt (au-dessus des barres). */
  heightM: 1.6,
  heightTentM: 3.1,
  heightTreeM: 3.5,
  /** Taille du chevron 3D (m). */
  chevronM: 0.9,
  /** Anneau au sol (m) et pulsation (amplitude d'échelle). */
  ringInnerM: 0.72,
  ringOuterM: 1.0,
  ringPulse: 0.1,
  /** 2D : taille du chevron (fraction de tuile), hauteur de la pointe au-dessus du centre (tuiles). */
  chevronTiles: 0.55,
  liftTiles: 0.55,
  /** Flèche de bord d'écran (px CSS) : taille, marge au bord / aux zones exclues, pas de recherche. */
  edgeSizePx: 40,
  edgeMarginPx: 10,
  edgeStepPx: 4,
  /** Va-et-vient de la flèche de bord vers la cible (px). */
  edgeNudgePx: 4,
} as const;

/**
 * Silhouette de la flèche (unités : 1 = longueur totale), pointe en +x, sens trigonométrique (y vers
 * le haut). Partagée par le calque 2D (flèche de bord, chevron 2D) et le chevron 3D.
 */
export const GUIDE_ARROW_SHAPE: readonly (readonly [number, number])[] = [
  [0.5, 0],
  [0.0, 0.42],
  [0.0, 0.17],
  [-0.5, 0.17],
  [-0.5, -0.17],
  [0.0, -0.17],
  [0.0, -0.42],
];
