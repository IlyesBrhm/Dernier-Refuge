// Constantes de PRÉSENTATION du rendu 3D (mètres, couleurs, durées, caméra, lumière).
// Aucune constante de gameplay ici (elles vivent dans src/data). Fichier sans import de three :
// utilisable par scene-model.ts et par les tests Vitest.

import { WORLD } from "../../data/balance";
import type { ShippedAssetId } from "../assets/asset-catalog";

/** Unités du core par tuile. */
export const U = WORLD.unitsPerTile;
/** 1 tuile = 2 m en 3D. */
export const TILE_METERS = 2;

/** Unités monde (core) ⇒ mètres. x3d = x / U * TILE_METERS ; z3d = y / U * TILE_METERS. */
export function toMeters(units: number): number {
  return (units / U) * TILE_METERS;
}

// ---------------------------------------------------------------------------------------------
// Modèles livrés (liste blanche, docs/design/render-3d.md §4.5). Chaque id doit être un
// `ShippedAssetId` du catalogue généré : référencer un modèle non livré est une erreur de compilation.
// ---------------------------------------------------------------------------------------------

export const MODEL_IDS = {
  borderTrees: ["forest/Tree_1_A_Color1", "forest/Tree_2_A_Color1", "forest/Tree_4_A_Color1"],
  rocks: ["forest/Rock_3_A_Color1", "forest/Rock_3_C_Color1"],
  tufts: ["forest/Grass_1_A_Color1", "forest/Grass_2_A_Color1"],
  nodeTree: "forest/Tree_3_A_Color1",
  bush: "forest/Bush_2_A_Color1",
  /** Tente montée (libre / assignée : teinte claire ; occupée : couleurs d'origine). */
  tent: "survival/tent-canvas",
  tentMessy: "survival/tent-canvas-half",
  /** Joueur : Knight, teinte d'origine (jamais utilisé pour un survivant) + anneau au sol. */
  player: "characters/Knight",
  survivors: ["characters/Mage", "characters/Ranger", "characters/Rogue", "characters/Rogue_Hooded"],
  animGeneral: "animations/Rig_Medium_General",
  animMovement: "animations/Rig_Medium_MovementBasic",
} as const satisfies Record<string, ShippedAssetId | readonly ShippedAssetId[]>;

/** Tous les modèles chargés par le renderer 3D (= ceux qu'il référence). */
export const RENDER3D_ASSET_IDS = [
  ...MODEL_IDS.borderTrees,
  ...MODEL_IDS.rocks,
  ...MODEL_IDS.tufts,
  MODEL_IDS.nodeTree,
  MODEL_IDS.bush,
  MODEL_IDS.tent,
  MODEL_IDS.tentMessy,
  MODEL_IDS.player,
  ...MODEL_IDS.survivors,
  MODEL_IDS.animGeneral,
  MODEL_IDS.animMovement,
] as const satisfies readonly ShippedAssetId[];

export type CharacterModel = typeof MODEL_IDS.player | (typeof MODEL_IDS.survivors)[number];
export const CHARACTER_MODELS: readonly CharacterModel[] = [MODEL_IDS.player, ...MODEL_IDS.survivors];

/** Teintes des survivants (multiplicateur de couleur ; blanc = matériau d'origine). */
export const SURVIVOR_TINTS = [0xffffff, 0xffd6a5, 0xbde0fe, 0xcaffbf, 0xffadd6] as const;
export const PLAYER_TINT = 0xffffff;
/**
 * 4 modèles × 5 teintes = 20 variantes : v = hash32(id) % 20 ⇒ modèle survivors[v % 4],
 * teinte SURVIVOR_TINTS[floor(v / 4)].
 */
export const SURVIVOR_VARIANTS = MODEL_IDS.survivors.length * SURVIVOR_TINTS.length;

/**
 * Lacet (rad) appliqué au modèle pour que son avant soit en +Z (porte du core en +y ⇒ +Z).
 * - characters : KayKit regarde +Z (vérifié sur captures/camp-3d-*.png : face visible depuis la caméra en +Z à yaw 0).
 * - tent : `survival/tent-canvas` est une tente canadienne ouverte aux deux pignons ; sur la capture
 *   desktop l'armature (même gabarit) présente son pignon en « A » face à la caméra ⇒ faîtage selon Z,
 *   ouverture en ±Z : 0 convient (π serait identique). Si l'aperçu (/tools/asset-preview/) montrait le
 *   faîtage selon X, mettre Math.PI / 2. La toile à moitié (désordre) n'est pas symétrique : sans enjeu.
 */
export const MODEL_YAW = { characters: 0, tent: 0 } as const;

export const ANIM_CLIPS = { idle: "Idle_A", walk: "Walking_A", use: "Use_Item", interact: "Interact" } as const;

// ---------------------------------------------------------------------------------------------
// Décor statique (buildStaticLayout).
// ---------------------------------------------------------------------------------------------

/** Anneau de forêt hors carte (tuiles). 2 tient le budget de triangles (< 200 k), le brouillard fait le reste. */
export const FOREST_MARGIN_TILES = 2;
/**
 * Rangées de forêt supplémentaires au-delà de l'anneau, côté caméra (+Z) seulement : en portrait la
 * caméra peut montrer jusqu'à CAMERA.maxSouthOverflowTiles (4) tuiles au-delà du bord sud ;
 * anneau (2) + 3 rangées = 5 tuiles couvrent avec marge.
 * Coût : (16 + 2×2 + 2×1) × 3 − 3 (sentier) = 63 arbres ≈ 27 k triangles, 0 draw call (fusionnées
 * dans les InstancedMesh de l'anneau), sans ombre.
 */
export const FOREST_NEAR_ROWS = 3;
/** Débord latéral (tuiles) de ces rangées au-delà de l'anneau (coins visibles en paysage large). */
export const FOREST_NEAR_SIDE_TILES = 1;
/** Le chemin de terre de l'entrée se prolonge de N tuiles hors carte (pas d'arbre dessus). */
export const ENTRANCE_PATH_TILES = 3;
/** Sol lointain (sous-bois uni) autour de la marge, en tuiles. */
export const FAR_GROUND_TILES = 14;
/** Hauteur (m) du sol lointain, juste sous le sol de la carte (pas de z-fighting). */
export const FAR_GROUND_Y = -0.01;

export const DECOR = {
  borderJitterTiles: 0.25,
  borderScaleMin: 0.85,
  borderScaleMax: 1.15,
  rockScale: 3, // ≈ 1,7 m
  rockJitterTiles: 0.08,
  tuftsMaxPerTile: 2,
  tuftJitterTiles: 0.36,
  tuftScaleMin: 0.8,
  tuftScaleMax: 1.3,
} as const;

/** Décalage visuel (tuile) quand bois et nourriture partagent une tuile (même valeur que la 2D). */
export const SHARED_DROP_OFFSET_TILES = 0.15;

// ---------------------------------------------------------------------------------------------
// Couleurs (hex sRGB).
// ---------------------------------------------------------------------------------------------

export const COLORS3D = {
  grassA: 0x7cb85a,
  grassB: 0x75b153,
  undergrowth: 0x4e8a3b,
  fog: 0xa9d4a0,
  welcome: "#ffd857",
  welcomeBorder: "#ffffff",
  /** Teinte du tapis d'accueil (multiplicateur), et lueur quand le joueur est dessus. */
  welcomeTintIdle: 0xdddddd,
  welcomeTintActive: 0xffffff,
  welcomeGlowActive: 0x3a3000,
  queue: "#efe1bd",
  queueLine: "rgba(120, 96, 50, 0.65)",
  entrance: "#c7a46c",
  entranceDark: "#a8864f",
  stumpBark: 0x7a4a22,
  stumpTop: 0xa8763f,
  bushEmpty: 0x8a9a7c,
  berryRed: 0xd81b3c,
  berryPurple: 0x8e3bb5,
  target: 0xffe066,
  /** Anneau au sol sous le joueur (cyan : distinct du jaune de ciblage et du vert des tentes libres). */
  playerRing: 0x3fd4ff,
  /** Part auto-éclairée de l'anneau (reste lisible à l'ombre, l'ombre reste perceptible). */
  playerRingGlow: 0x0f5a73,
  tentFree: 0x57c45a,
  tentAssigned: 0xffd23f,
  /** Toile d'une tente libre / assignée : multiplicateur clair et vert + légère lueur (accueillante). */
  tentFreeTint: 0xd4f7c0,
  tentFreeGlow: 0x14300f,
  slotLine: "rgba(255, 255, 255, 0.9)",
  slotFill: "rgba(255, 255, 255, 0.16)",
  slotRing: 0xf0b43c,
  slotRingBack: 0x000000,
  logBark: 0x8b5a2b,
  logEnd: 0xd9a066,
  berryFood: 0xd0342c,
} as const;

/** Couleurs des barres du calque (identiques à la 2D). */
export const BAR_COLORS = {
  harvest: "#ffd23f",
  harvestPaused: "#9a9a7a",
  regrow: "#c4c8cc",
  welcome: "#ffd23f",
  rest: "#5dade2",
  clean: "#57b45a",
  cleanActive: "#7ee081",
  slot: "#f0b43c",
} as const;

// ---------------------------------------------------------------------------------------------
// Caméra, lumière, qualité.
// ---------------------------------------------------------------------------------------------

/**
 * Distance caméra selon l'orientation (docs/design/render-3d.md §4.6) :
 * - paysage : toute la profondeur de la carte et la largeur de la carte (à la ligne du point visé),
 *   bornée par `maxDistanceLandscape` ;
 * - portrait (façon My Perfect Hotel) : caméra rapprochée qui suit le joueur. Largeur visible au
 *   point visé = clamp(largeur CSS / `portraitTilePx`, `portraitMinTilesWide`, `portraitMaxTilesWide`)
 *   tuiles (390 px ⇒ 5,1 tuiles ≈ 76 px/tuile, d ≈ 35 m), et ≥ `minTilesDeep` de profondeur,
 *   bornée par `maxDistancePortrait`.
 * Le point visé est borné pour que la vue ne dépasse la carte que de `edgeMarginTiles`. Si la vue
 * est plus grande que la carte sur un axe : paysage ⇒ centrée sur la carte ; portrait ⇒ elle suit
 * le joueur entre les deux positions où un bord de carte touche le bord d'écran (la carte reste
 * entièrement visible sur cet axe), et ne montre jamais plus de `maxSouthOverflowTiles` tuiles
 * au-delà du bord sud (couvert par la forêt : FOREST_MARGIN_TILES + FOREST_NEAR_ROWS = 5 tuiles).
 */
export const CAMERA = {
  fovDeg: 35,
  pitchDeg: 57,
  portraitTilePx: 76,
  portraitMinTilesWide: 5,
  portraitMaxTilesWide: 9,
  maxSouthOverflowTiles: 4,
  minTilesDeep: 6,
  minDistance: 14,
  maxDistanceLandscape: 38,
  maxDistancePortrait: 50,
  edgeMarginTiles: 0.5,
  followRate: 6, // 1 - e^(-6 dt)
  near: 0.5,
  far: 160,
} as const;

export const LIGHT = {
  hemiSky: 0xdff2ff,
  hemiGround: 0x7a9a4a,
  hemiIntensity: 1.1,
  sunColor: 0xfff1d6,
  sunIntensity: 2.0,
  sunDir: [-0.5, 1, 0.35] as const,
  sunDistance: 40,
  /** Demi-taille de la caméra d'ombre = max(shadowHalfMin, shadowHalfPerDistance × distance caméra). */
  // Vue : de nearK·d ≈ 0,31 d (bas) à farK·d ≈ 0,47 d (haut) autour du point visé, plus large en
  // haut en paysage : 0,7 d couvre aussi les coins du paysage. Portrait rapproché (d ≈ 35 m) ⇒ 24,5 m,
  // soit des ombres ~27 % plus fines qu'avec l'ancien cadrage (d ≈ 48 m ⇒ 33,6 m).
  shadowHalfPerDistance: 0.7,
  shadowHalfMin: 10,
  shadowMapCoarse: 1024,
  shadowMapFine: 2048,
  shadowBias: -0.0005,
  shadowNormalBias: 0.02,
} as const;

/** Brouillard : de `near` à `far` m, repoussé si la caméra est plus loin (le joueur reste net). */
export const FOG = { near: 30, far: 60, clearance: 12 } as const;

export const QUALITY = {
  pixelRatioCoarse: 1.5,
  pixelRatioFine: 2,
  /** Adaptation unique : moyenne > slowFrameMs sur windowMs ⇒ pixelRatio 1 et ombres 1024. */
  slowFrameMs: 22,
  windowMs: 3000,
  warmupMs: 1000,
} as const;

export const ANIM = {
  crossFadeS: 0.2,
  maxTurnRate: 12, // rad/s
  maxDtS: 0.1,
  bounceMs: 350,
  popMs: 300,
  messyTiltRad: (5 * Math.PI) / 180,
  messyDarken: 0.75,
  shakeAmplitudeRad: 0.04,
  shakeHz: 9,
  pulseHz: 1.6,
  /** Butin au sol : flottement (m, Hz en rad/s) et rotation (rad/s). */
  dropBobBase: 0.04,
  dropBobAmplitude: 0.04,
  dropBobRate: 3,
  dropSpinRate: 0.8,
} as const;

export const POOLS = { characters: 12, drops: 8, loot: 16 } as const;

/** Échelles d'instance (par-dessus PACK_SCALE). */
export const MODEL_SCALE = { bush: 4, sapling: [0.15, 0.45] as const, emptyBush: [0.6, 0.35] as const } as const;

export const OVERLAY = {
  minTilePx: 44,
  maxTilePx: 96,
  barMinHeightPx: 6,
  /** Hauteur de barre = max(barMinHeightPx, barHeightRatio × tilePx). */
  barHeightRatio: 0.1,
  barWidthRatio: 0.8,
  regrowBarWidthRatio: 0.6,
  /** Hauteurs (m) des barres / libellés au-dessus de l'objet. */
  treeBarHeight: 2.6,
  treeRegrowBarHeight: 1.5,
  bushBarHeight: 1.4,
  bushRegrowBarHeight: 1.1,
  tentBarHeight: 2.3,
  tentAlertRise: 0.5,
  slotLabelHeight: 0.5,
  dropLabelHeight: 0.9,
  fxTextHeight: 1.9,
  /** Barre d'accueil : décalée vers le bas du tapis (fraction de tuile). */
  welcomeBarOffsetTiles: 0.35,
  /** Tailles de texte (fraction de tilePx) et décalages verticaux (fraction de tilePx). */
  alertSize: 0.4,
  slotCostSize: 0.32,
  slotCostDy: -0.1,
  slotUnitSize: 0.17,
  slotUnitDy: 0.14,
  dropAmountSize: 0.22,
  fxTextSize: 0.28,
  fxTextMinPx: 12,
  fxStrokeRatio: 0.06,
  fxStrokeMinPx: 2,
  /** Marge de projection hors écran (en tuiles) avant de renoncer à dessiner. */
  offscreenMarginTiles: 2,
  /** Marge (px) autour des zones couvertes par le DOM (HUD, bouton Menu). */
  exclusionPadPx: 4,
  /**
   * Repli quand un libellé / une barre ancré(e) au-dessus d'un élément touche le HUD ou le Menu :
   * redessiné en miroir sous l'élément, symétrique par rapport à un pivot au sol. Pivot d'un
   * emplacement de construction = son bord bas (décalage en tuiles vers la caméra depuis le centre) ;
   * pivot des autres éléments = leur pied (centre au sol).
   */
  slotMirrorPivotTiles: 0.5,
  /** Plafond du devicePixelRatio du calque : ordinateur / pointeur grossier / qualité réduite. */
  maxDprFine: 3,
  maxDprCoarse: 2,
  maxDprDegraded: 1.5,
} as const;

/** Chargement : timeout global, délai de restauration du contexte WebGL avant repli 2D. */
export const LOADING = { timeoutMs: 20000, contextRestoreMs: 3000 } as const;

/** Hauteur de vol du butin (m) = ARC_HEIGHT_TILES (fx.ts, en tuiles) × TILE_METERS ; départ à ~mi-hauteur. */
/** `spinRate` : rotation du butin en vol (rad/s), indépendante de la cadence d'affichage. */
export const LOOT = { baseHeight: 0.6, sizeRef: 0.3, minScale: 0.2, spinRate: 9 } as const;
