// Constantes d'équilibrage. Seul endroit où vivent les nombres de gameplay.
// Modifié par l'agent balance-designer.

export const TIME = {
  ticksPerSecond: 10,
  dayTicks: 2400, // 4 min de jour
  nightTicks: 1200, // 2 min de nuit
  daysPerSeason: 5,
  /** Présentation seulement (rendu, HUD) : non vérifiées au chargement, modifiables sans migration. */
  dawnTicks: 300, // 30 s d'aube rosée, partie du jour de jeu
  duskTicks: 300, // 30 s de crépuscule, partie du jour de jeu
} as const;

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export const STARTING_RESOURCES = { wood: 10, food: 5, stone: 0, water: 5, coins: 0 } as const;

export const OFFLINE = { maxTicks: 8 * 60 * 60 * 10 } as const; // 8 h

// ---------------------------------------------------------------------------
// Core loop (docs/design/core-loop.md §7). Toutes les valeurs gameplay sont des
// entiers ; les vitesses/distances sont en unités (1 tuile = 1000 unités).
// ---------------------------------------------------------------------------

export const WORLD = { unitsPerTile: 1000 } as const;

/**
 * Carte 16 x 12 (12 lignes de 16 caractères, vérifié).
 * Légende : `#` arbre de bordure (obstacle inerte), `R` rocher (obstacle), `.` herbe,
 * `T` tente initiale, `B` emplacement de construction (ordre de lecture = index
 * dans BUILD.slotCosts), `W` zone d'accueil, `Q` place de file (gauche = tête,
 * index 0, adjacente à W), `E` entrée/sortie, `P` départ joueur,
 * `A` arbre récoltable (nœud `tree`, obstacle permanent),
 * `M` buisson de mûres (nœud `bush`, obstacle permanent).
 *
 * `F` feu de camp (présent dès le départ, obstacle permanent, tuile "fire" ; exactement un).
 *
 * Coordonnées (tx, ty) : T (2,2) ; B0 (7,2) ; B1 (12,2) ; B2 (12,5) ;
 * P (7,8) ; W (7,9) ; Q (7..11,10) ; E (11,11) ; F (9,5).
 * Nœuds (ordre de lecture) : A (14,1) ; M (14,7) ; A (2,9) ; A (4,9) ; M (14,9).
 * Obstacles internes : R (5..6, 4..5) ; # (11..12, 4) ; # (3..4, 7).
 *
 * Vérification à l'œil :
 * - Portes (tuile x, y+1) toutes en herbe : T -> (2,3), B0 -> (7,3),
 *   B1 -> (12,3), B2 -> (12,6).
 * - Chemins depuis E (11,11) : E -> (11,10) Q -> (11,9) herbe, puis la ligne 6
 *   (entièrement herbe) et la ligne 3 (entièrement herbe) relient toute la carte.
 *   * Tente T : (11,9) -> remonter colonne 13 ou 7..10 jusqu'à la ligne 3
 *     -> ouest jusqu'à (2,3) -> (2,2). OK.
 *   * B0 : ... ligne 3 -> (7,3) -> (7,2). OK.
 *   * B1 : ... ligne 3 -> (12,3) -> (12,2). OK.
 *   * B2 : (11,9) -> (11,6) -> (12,6) -> (12,5). OK (bloc ## en (11..12,4) contourné par le sud).
 *   * W et toutes les Q : alignées sur les lignes 9/10, contiguës à E. OK.
 * - Les nœuds (A/M) ne coupent aucun chemin : ils sont en colonne 14
 *   (lignes 1, 7, 9), hors des routes (lignes 3 et 6, colonnes 7..13), et en
 *   ligne 9 colonnes 2 et 4 (cul-de-sac sud-ouest). Les lignes 3 et 6 restent
 *   entièrement en herbe ; les chemins ci-dessus sont inchangés.
 * - Chaque nœud a une voisine 4-connexe praticable atteignable depuis E :
 *   (13,1) ; (13,7) ; (1,9)/(3,9) ; (3,9)/(5,9) ; (13,9).
 * - Distance de Chebyshev >= 2 entre chaque nœud et T, B0..B2, portes, P, W,
 *   Q, E : aucune autre action n'est à portée de récolte d'un nœud.
 * - Feu F (9,5) (docs/design/day-night.md §1.7), seule différence avec la carte
 *   précédente (ligne 5, ex-herbe) :
 *   * ses 8 voisines (8..10, 4..6) sont toutes en herbe : (8,4) (9,4) (10,4)
 *     (le bloc ## commence en x = 11), (8,5) (10,5), (8,6) (9,6) (10,6) ;
 *     aucune n'est W, Q, E, P, T, B ni une porte (B2 (12,5) et sa porte (12,6)
 *     sont à Chebyshev 2 de la voisine la plus proche) ;
 *   * Chebyshev nœud ↔ voisine >= 4 (le plus proche : M (14,7) ↔ (10,6) = 4) :
 *     alimenter le feu ne coïncide jamais avec une récolte ;
 *   * aucun chemin coupé : les lignes 3 et 6 restent entièrement en herbe, et
 *     aucun trajet ci-dessus (E ↔ Q/W/T/B/portes) ne passait par (9,5) ; le feu
 *     se contourne par (9,4) ou (9,6).
 */
export const MAP_LAYOUT = [
  "################",
  "#.............A#",
  "#.T....B....B..#",
  "#..............#",
  "#....RR....##..#",
  "#....RR..F..B..#",
  "#..............#",
  "#..##.........M#",
  "#......P.......#",
  "#.A.A..W......M#",
  "#......QQQQQ...#",
  "###########E####",
] as const;
export type MapChar = "#" | "R" | "." | "T" | "B" | "W" | "Q" | "E" | "P" | "A" | "M" | "F";

// ---------------------------------------------------------------------------
// Récolte (docs/design/harvest.md §7).
// ---------------------------------------------------------------------------

export type NodeKind = "tree" | "bush";
export type DropResource = "wood" | "food";

/** Portée de récolte : Chebyshev en tuiles entre la tuile du joueur et celle du nœud (1 = 8 voisines). */
export const HARVEST = { rangeTiles: 1 } as const;

/**
 * Durées en ticks (10 = 1 s). Ordre de grandeur : 3 arbres => <= 18 bois/min.
 * regrowTicks : Borne vérifiée au chargement des sauvegardes : la baisser rend des sauvegardes
 * honnêtes invalides ⇒ nouvelle version de sauvegarde + migration (voir docs/design/save.md).
 */
export const NODES = {
  tree: { resource: "wood", yield: 3, harvestTicks: 20, regrowTicks: 300 }, // 2 s, repousse 30 s
  bush: { resource: "food", yield: 2, harvestTicks: 15, regrowTicks: 200 }, // 1,5 s, repousse 20 s
} as const satisfies Record<
  NodeKind,
  { resource: DropResource; yield: number; harvestTicks: number; regrowTicks: number }
>;

/** Vitesses en unités/tick. diagonalSpeed = round(400 / sqrt(2)) par axe. */
export const PLAYER = { speed: 400, diagonalSpeed: 283, halfSize: 350 } as const;

/**
 * Durées en ticks (10 ticks = 1 s). Arrivée toutes les 6 à 10 s ; repos 15 s.
 * restTicks, spawnIntervalMin/Max, firstSpawnTicks : Borne vérifiée au chargement des
 * sauvegardes : la baisser rend des sauvegardes honnêtes invalides ⇒ nouvelle version de
 * sauvegarde + migration (voir docs/design/save.md).
 * woodReward : Borne vérifiée au chargement (égalité de night.woodEarned, avec
 * SLEEP.dawnBonus et COLD.rewardDivisor) : la changer rend des sauvegardes honnêtes
 * invalides ⇒ nouvelle version de sauvegarde + migration.
 */
export const SURVIVOR = {
  speed: 250,
  firstSpawnTicks: 20,
  spawnIntervalMin: 60,
  spawnIntervalMax: 100,
  restTicks: 150,
  woodReward: 8,
} as const;

export const QUEUE = { maxLength: 5 } as const;

export const WELCOME = { ticks: 5 } as const; // 0,5 s sur W

/**
 * cleanTicks : Borne vérifiée au chargement des sauvegardes : la baisser rend des sauvegardes
 * honnêtes invalides ⇒ nouvelle version de sauvegarde + migration (voir docs/design/save.md).
 */
export const TENT = { cleanTicks: 30 } as const; // 3 s

// ---------------------------------------------------------------------------
// Jour/nuit, feu de camp, sommeil (docs/design/day-night.md §1.3 à §1.5, §7).
//
// Calendrier de combustion (1 bois par combustion) :
// - jour : ticks multiples de 600 ⇒ 3 combustions le jour 1 (600, 1200, 1800),
//   4 par jour complet (dont le pas de l'aube) ;
// - nuit : ticks multiples de 100 ⇒ 12 combustions par nuit (2400, 2500, ..., 3500).
// Feu ignoré : 10 − 3 = 7 au crépuscule, 7 combustions sur [2400, 3000] ⇒ 0 au tick
// 3000 exactement (milieu de la nuit) ; alerte « faiblit » (≤ 3) au tick 2700, 30 s avant.
// Feu plein au crépuscule (16 > 12) ⇒ toute la nuit, 4 de marge.
//
// Contrainte utilisateur : entretenir le feu doit TOUJOURS rapporter plus que le laisser
// mourir, dès 2 tentes, chaque nuit. Bilan d'une nuit stabilisée (n ≥ 2), T tentes occupées,
// accueil suspendu feu éteint :
// - entretenu : T × (8 + 4) à l'aube − bois versé (13 à 16 par cycle : 12 de nuit + 1 à 4
//   brûlés le jour suivant, quelle que soit la stratégie d'alimentation) ;
// - laissé mourir : T × floor(8 / 4) = 2T, coût 0.
// T = 2 : 24 − 16 = 8 > 4 ; T = 3 : 20 > 6 ; T = 4 : 32 > 8. (T = 1 : −4 < 2, voulu.)
//
// Décision utilisateur : le coût du feu reste à ~5 % du bois produit (13 à 16 bois par
// cycle) ; il sera rééquilibré à l'arrivée des loups. Contrainte obligatoire maintenue :
// entretenir le feu rapporte toujours plus que le laisser mourir, dès 2 tentes.
// ---------------------------------------------------------------------------

/**
 * Feu de camp (docs/design/day-night.md §1.4). Durées en ticks.
 * capacity, dayBurnIntervalTicks, nightBurnIntervalTicks : Borne vérifiée au chargement
 * des sauvegardes (fire.wood, fire.burnedTotal, night.woodBurned) : les changer rend des
 * sauvegardes honnêtes invalides ⇒ nouvelle version de sauvegarde + migration.
 * Contraintes (tests/core/balance.test.ts) : dayBurnIntervalTicks divise dayTicks et le
 * cycle ; nightBurnIntervalTicks divise dayTicks, nightTicks et le cycle ;
 * initialWood ≤ capacity ; lowWood < capacity ; capacity > nightTicks / nightBurnIntervalTicks ;
 * initialWood − combustions(jour 1) = combustions([2400, 3000]).
 * feedDelayTicks : Borne vérifiée au chargement des sauvegardes (fire.feedProgress) : la
 * baisser rend des sauvegardes honnêtes invalides ⇒ nouvelle version de sauvegarde + migration.
 */
export const FIRE = {
  capacity: 16,
  initialWood: 10, // = 3 (jour 1) + 7 ([2400, 3000]) ; aussi pour les saves v1 migrées
  dayBurnIntervalTicks: 600, // 1 bois / min de jour : le feu de jour ne fait que s'éteindre
  nightBurnIntervalTicks: 100, // 1 bois / 10 s ⇒ 12 bois par nuit
  burnPerStep: 1,
  feedIntervalTicks: 2, // 5 bois/s ⇒ plein (16) en ≈ 3 s
  feedPerStep: 1,
  feedRangeTiles: 1, // Chebyshev : les 8 voisines de F
  feedDelayTicks: 5, // 0,5 s immobile sur une voisine de F avant d'alimenter (comme WELCOME.ticks)
  lowWood: 3, // « Le feu faiblit » : 3 combustions = 30 s de nuit avant l'extinction
} as const;

/**
 * Froid : récompense d'un dormeur parti feu éteint = floor(SURVIVOR.woodReward / rewardDivisor)
 * (= 2, un quart). Borne vérifiée au chargement (égalité de night.woodEarned) : la changer
 * rend des sauvegardes honnêtes invalides ⇒ nouvelle version de sauvegarde + migration.
 */
export const COLD = { rewardDivisor: 4 } as const;

/**
 * Sommeil : récompense d'un dormeur payé à l'aube = SURVIVOR.woodReward + dawnBonus (= 12,
 * « nuit au chaud »). Levier qui rend l'entretien du feu rentable dès 2 tentes (voir bilan
 * ci-dessus). Borne vérifiée au chargement (égalité de night.woodEarned :
 * woodEarned = coldLeavers × floor(R / D) + sleepersPaid × (R + dawnBonus)) : la changer
 * rend des sauvegardes honnêtes invalides ⇒ nouvelle version de sauvegarde + migration.
 */
export const SLEEP = { dawnBonus: 4 } as const;

/** Distances en unités (Chebyshev), vitesse en unités/tick. */
export const PICKUP = { magnetRadius: 1500, magnetSpeed: 500, collectRadius: 300 } as const;

/**
 * Coûts en bois par emplacement (×~1,6 entre paliers), 1 bois versé par tick.
 * payIntervalTicks : Borne vérifiée au chargement des sauvegardes : la baisser rend des
 * sauvegardes honnêtes invalides ⇒ nouvelle version de sauvegarde + migration
 * (voir docs/design/save.md).
 */
export const BUILD = { slotCosts: [15, 25, 40], payIntervalTicks: 1, payPerStep: 1 } as const;

export const RESOURCES = { cap: 9999 } as const;

export const LIMITS = { maxCommandsPerTick: 8 } as const;

/**
 * Borne anti-triche (docs/design/save.md §5 et §7) : production totale maximale
 * plausible, par ressource, en unités par tick écoulé, en plus de STARTING_RESOURCES.
 * Invariant : stock + drops au sol + versé dans les chantiers <= départ + tick x valeur.
 *
 * Elle doit rester LARGEMENT au-dessus du rythme maximal honnête, pour ne jamais
 * rejeter une vraie partie. Estimation actuelle (borne haute) :
 * - bois  : survivants <= 12 (8 + SLEEP.dawnBonus, payé une fois par arrivée) / 60 ticks
 *           (intervalle de spawn min) = 0,2 ; récolte (un seul joueur) <= 3 / 20 ticks
 *           ≈ 0,15 ; total ≈ 0,35 bois/tick. Le feu ne produit rien (initialWood est
 *           ajouté à part au plafond). Les paiements de l'aube sont groupés (pic de
 *           4 × 12 = 48 en un tick) mais la borne est cumulée depuis le tick 0 : au
 *           tick 3600, plafond 3610 + initialWood, largement au-dessus.
 * - nourriture : récolte <= 2 / 15 ticks ≈ 0,13 nourriture/tick.
 * Un test (tests/core/balance.test.ts) recalcule cette borne depuis NODES, SURVIVOR
 * et le nombre de tentes : s'il casse parce qu'une feature rend le jeu plus rapide
 * (travailleurs, nouveaux nœuds, bonus...), il faut RELEVER cette valeur ici.
 * - pierre, eau, pièces : aucun système ne les produit encore => 0 (une sauvegarde
 *   honnête ne peut pas en avoir plus que STARTING_RESOURCES). À RELEVER dès qu'une
 *   feature produira l'une de ces ressources.
 *
 * Borne vérifiée au chargement des sauvegardes : la baisser rend des sauvegardes honnêtes
 * invalides ⇒ nouvelle version de sauvegarde + migration (voir docs/design/save.md).
 */
export const PLAUSIBILITY = {
  woodPerTick: 1,
  foodPerTick: 1,
  stonePerTick: 0,
  waterPerTick: 0,
  coinsPerTick: 0,
} as const;

/** Boucle à pas fixe (src/app) : tickMs = 1000 / TIME.ticksPerSecond. */
export const LOOP = { tickMs: 100, maxFrameDeltaMs: 250, maxTicksPerFrame: 5 } as const;
