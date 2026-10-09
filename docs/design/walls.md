# Design — Construire sa base : murs et portes (début du Jalon 3)

Statut : **plan, à valider** (§10). Point de départ : la branche `feature/ui-polish`, une fois commitée.
Références : `core-loop.md`, `harvest.md`, `save.md`, `day-night.md`, `render-3d.md`, `ui-polish.md`, `ui-style.md`.
Hors périmètre : loups, dégâts, réparation, niveaux de mur, tours, torches.

---

## 1. Règles de jeu

### 1.1 Carte agrandie 28 × 20 (`MAP_LAYOUT` v3)
- L'ancienne carte 16 × 12 est recopiée **telle quelle** avec un décalage entier fixe de **(+6, +4)** tuiles
  (`MAP_OFFSET_V2_V3`), **sauf** :
  - son ancienne bordure `#` devient de l'**herbe** : le camp est ouvert sur la forêt, c'est au joueur de l'enclore ;
  - l'ancienne entrée (11,11) → (17,15) devient de l'herbe. **La nouvelle entrée `E` est au bord sud, en (17,19)**,
    reliée au camp par un couloir d'herbe (17,16..18). Les survivants arrivent donc de l'extérieur et passent par la
    porte (ou une brèche) que le joueur leur laisse.
  - Les obstacles intérieurs (`RR`, `##`) et tout le reste sont inchangés.
- Nouveau caractère **`S` = rocher récoltable** (nœud `rock`, obstacle permanent). `R` reste un rocher obstacle.

```
          1111111111222222222
01234567890123456789012345678
############################   0
###......................###   1
##..A.......M...S.....A...##   2
#..........................#   3
##........................##   4   ← ancienne bordure nord (herbe)
#..S................A.....##   5
#.......T....B....B.....S..#   6
###........................#   7
##..M......RR....##....A.###   8
#..........RR..F..B......###   9
#.S........................#  10
#........##.........M....S.#  11
##..A........P............##  12
##......A.A..W......M..M...#  13
#............QQQQQ........##  14
#..........................#  15   ← ancienne bordure sud (herbe), ex-E en (17,15)
##.........................#  16
#..M..A...S...........A.####  17
###.................R....###  18
#################E##########  19
```
- Coordonnées v3 : T (8,6) ; B0 (13,6), B1 (18,6), B2 (18,9) ; F (15,9) ; P (13,12) ; W (13,13) ;
  Q (13..17,14) ; **E (17,19)**.
- Nœuds (ordre de lecture = ordre des ids) : 9 arbres `A`, 6 buissons `M`, 6 rochers `S` (21 au total) :
  A(4,2) M(12,2) S(16,2) A(22,2) S(3,5) A(20,5) S(24,6) M(4,8) A(23,8) S(2,10) M(20,11) S(25,11) A(4,12)
  A(8,13) A(10,13) M(20,13) M(23,13) M(3,17) A(6,17) S(10,17) A(22,17).
- Vérifications (test `tests/core/map-v3.test.ts`, en plus de la relecture) : 20 lignes de 28 ; zone (6..21, 4..15)
  = ancienne carte décalée hors bordure/E ; toute l'herbe est 4-connexe ; chaque nœud a une voisine 4-connexe
  praticable atteignable depuis E ; Chebyshev ≥ 2 entre chaque nœud et T, B, portes (y+1), P, W, Q, E ; Chebyshev ≥ 2
  entre chaque nœud et la zone d'alimentation du feu.

### 1.2 Pierre
- `NodeKind` += `"rock"` → ressource `"stone"` (`DropResource` += `"stone"`). Même cycle que l'arbre : barre de
  récolte, épuisement, butin au sol sur la tuile du joueur, repousse (`harvest.md`).
- `NODES.rock = { resource: "stone", yield: 2, harvestTicks: 25, regrowTicks: 450 }` (2,5 s, repousse 45 s).
- Les `R` (bordure et intérieur) restent de simples obstacles.
- HUD : pilule Pierre (§4.3).

### 1.3 Pièces
| Pièce (`StructureKind`) | Coût | PV (`maxHp`) | Bloque joueur / survivants |
|---|---|---|---|
| `palisade` (palissade) | 4 bois | 60 | oui |
| `stoneWall` (mur de pierre) | 4 pierre | 150 | oui |
| `door` (porte en bois) | 6 bois | 40 | **non** (plus tard : bloque les loups) |
- Pose = commande validée (§3) : coût débité immédiatement du stock, pièce créée instantanément avec `hp = maxHp`.
  L'animation d'apparition est purement visuelle.
- **Portée : aucune.** Toute case de la carte peut être visée (le joueur pose d'un clic là où il regarde).
- **Maximum : 200 pièces** (toutes sortes confondues).
- **Démolition** : retire la pièce et rend `floor(coût / 2)` de sa ressource au stock (palissade 2 bois, mur 2 pierre,
  porte 3 bois), plafonné à `RESOURCES.cap` (l'excédent est perdu). Toujours permise s'il y a une pièce sur la case
  (personne ne peut être sur un mur ; une porte retirée laisse de l'herbe).
- Les PV ne changent jamais dans cette feature (préparation des loups).

### 1.4 Règles de placement (toutes dans le core, dans cet ordre — la première qui échoue donne la raison)
1. Dans la carte.
2. Tuile statique libre : pas `#`/`R` (`blocked_obstacle`), pas un nœud (`blocked_node`), pas le feu (`blocked_fire`).
3. Pas déjà une pièce (`occupied`).
4. Cases réservées : entrée E (`blocked_entrance`), accueil W (`blocked_welcome`), file Q (`blocked_queue`), tente **ou
   case devant sa porte** (`blocked_tent`), emplacement **ou case devant** (`blocked_slot`). Les cases « porte » sont
   ajoutées à la liste de l'utilisateur : c'est là que tombent les récompenses (`departSurvivor`) et que le joueur
   arrive.
5. Entités : hitbox du joueur chevauchant la case (chevauchement strict, comme `collision.ts`) (`blocked_player`) ;
   survivant dont `tileOf(pos)` ou `path[0]` est la case (`blocked_survivor`) ; butin dont `tileOf(pos)` est la case
   (`blocked_drop`).
6. `structures.length < 200` (`max_structures`).
7. Stock suffisant (`insufficient_resources`).
8. **Connexité** (murs seulement ; une porte ne bloque personne) : avec la case bloquée, BFS 4-voisins depuis E sur
   la grille de navigation ; **toutes** les cibles doivent rester atteintes, sinon `would_block_path`
   (« Bloquerait le passage des survivants ») :
   - W, chaque case de file, chaque tente et la case devant sa porte, chaque emplacement et la case devant ;
   - au moins une case praticable de la zone d'alimentation du feu (`feedZone`) ;
   - pour chaque nœud, au moins une case praticable à Chebyshev ≤ `HARVEST.rangeTiles` ;
   - la tuile du joueur ; pour chaque survivant, `tileOf(pos)` et `path[0]` s'il existe.
   Coût : une BFS sur 560 cases par pose (négligeable). Les poches fermées **vides** sont permises (pièces closes).
   Les butins ne sont **pas** des cibles (un butin aimanté peut s'arrêter n'importe où : l'invariant ne doit jamais
   casser une partie honnête).

### 1.5 Effet d'une pose sur les survivants en marche
Après une pose acceptée, chaque survivant dont le chemin restant contient la case reçoit un nouveau chemin vers la
même destination (dernière case), via `pathFromSurvivor` sur la nouvelle grille, dans l'ordre des ids. Le chemin
existe toujours (connexité garantie, et la case n'est ni sa tuile ni `path[0]`). Une démolition ne recalcule rien.

---

## 2. Changements d'état

### 2.1 Types (`src/core/state.ts`, `src/data/balance.ts`)
```ts
// src/data/balance.ts
export type MapChar = "#" | "R" | "." | "T" | "B" | "W" | "Q" | "E" | "P" | "A" | "M" | "S" | "F";
export type NodeKind = "tree" | "bush" | "rock";
export type DropResource = "wood" | "food" | "stone";
export const STRUCTURE_KINDS = ["palisade", "stoneWall", "door"] as const;
export type StructureKind = (typeof STRUCTURE_KINDS)[number];

// src/core/state.ts
export interface Structure {
  readonly id: number;          // depuis nextId, comme tout le reste
  readonly kind: StructureKind;
  readonly tile: TilePos;       // unique
  readonly hp: number;          // entier, 1..STRUCTURES[kind].maxHp (= maxHp à la pose)
}
export interface GameState {
  // … inchangé …
  structures: readonly Structure[]; // triées par id ; IMMUABLE (voir 2.3)
}
```
`maxHp` n'est pas stocké (dérivé de `STRUCTURES[kind]`). Valeur initiale : `structures: []`.

### 2.2 Grille de navigation (`src/core/nav.ts`, nouveau)
```ts
export interface NavGrid { readonly map: MapState; readonly width: number; readonly height: number;
  readonly blocked: Uint8Array } // 1 = obstacle statique, nœud, feu ou mur (palisade | stoneWall) ; porte = 0
export function navOf(map: MapState): NavGrid;           // statique seule (migrations, tests)
export function navGrid(state: Readonly<GameState>): NavGrid; // mémoïsée (WeakMap sur le tableau structures)
export function isBlocked(nav: NavGrid, tx: number, ty: number): boolean; // hors carte = true
```
- `findPath`, `isWalkable`, `hitboxBlocked`, `moveWithCollision` prennent un `NavGrid` au lieu d'un `MapState`.
- Tous les appels du core passent `navGrid(draft)` : `movePlayer`, `spawn`, `welcome`, `retargetQueue`,
  `pathFromSurvivor`, `departSurvivor`, `feedZone`, invariants. `isObstacleAt(map, …)` reste la vérité **statique**.
- Plus tard (loups) : un second masque où les portes bloquent.

### 2.3 Immutabilité de `structures`
Aucun système ne modifie `structures` : `cloneState` **garde la référence** ; seules les commandes `place`/`demolish`
créent un nouveau tableau. Ainsi `navGrid` est recalculée une fois par pose, pas à chaque tick. Test : `tick()` ne
change jamais la référence `structures`.

### 2.4 Constantes (`src/data/balance.ts`)
```ts
export const STRUCTURES = {
  palisade:  { resource: "wood",  cost: 4, maxHp: 60 },
  stoneWall: { resource: "stone", cost: 4, maxHp: 150 },
  door:      { resource: "wood",  cost: 6, maxHp: 40 },
} as const satisfies Record<StructureKind, { resource: ResourceId; cost: number; maxHp: number }>;
export const STRUCTURE_LIMITS = { maxCount: 200, refundDivisor: 2 } as const;
export const NODES = { tree: …, bush: …, rock: { resource: "stone", yield: 2, harvestTicks: 25, regrowTicks: 450 } };
export const PLAUSIBILITY = { woodPerTick: 1, foodPerTick: 1, stonePerTick: 1, waterPerTick: 0, coinsPerTick: 0 };
```
(`ResourceId` est déplacé ou réexporté dans `src/data` si nécessaire pour le typage ; aucune logique.)
`maxRegrowDelay("rock")` et `stonePerTick` sont des bornes vérifiées au chargement (commentaire habituel).

### 2.5 Migration de sauvegarde : **oui, v2 → v3** (`CURRENT_VERSION = 3`)
Voir §5.3.

---

## 3. Commandes et systèmes

### 3.1 Commandes (`src/core/commands.ts`)
```ts
export type Command =
  | { type: "setMoveInput"; dx: number; dy: number }
  | { type: "placeStructure"; kind: StructureKind; tx: number; ty: number }
  | { type: "demolishStructure"; tx: number; ty: number };

export type PlacementError =
  | "out_of_bounds" | "blocked_obstacle" | "blocked_node" | "blocked_fire" | "occupied"
  | "blocked_entrance" | "blocked_welcome" | "blocked_queue" | "blocked_tent" | "blocked_slot"
  | "blocked_player" | "blocked_survivor" | "blocked_drop"
  | "max_structures" | "insufficient_resources" | "would_block_path";
export type CommandError = "unknown_command" | "invalid_payload" | "rate_limited" | PlacementError | "no_structure";
```
- Validation commune : `type` connu ; `kind ∈ STRUCTURE_KINDS` ; `tx`, `ty` entiers sûrs (sinon `invalid_payload`) ;
  puis `rate_limited` (`LIMITS.maxCommandsPerTick = 8`, inchangé) ; puis §1.4 dans l'ordre.
- `placeStructure` OK : `resources[res] -= cost` ; `structures = [...structures, { id: nextId++, kind, tile, hp: maxHp }]` ;
  recalcul des chemins (§1.5) ; `commandsThisTick + 1`.
- `demolishStructure` : `no_structure` si rien sur la case ; sinon retrait, remboursement (§1.3), `commandsThisTick + 1`.
- Refus ⇒ même référence d'état (règle existante).

### 3.2 Module `src/core/structures.ts` (pur)
```ts
export function structureAt(state, tile): Structure | undefined;
export function placementError(state, kind, tile): PlacementError | null; // §1.4, sans le rate limit
export function connectivityTargets(state): { all: TilePos[]; anyOf: TilePos[][] }; // §1.4.8
export function isConnected(nav: NavGrid, state): boolean;               // BFS depuis E
export function refundOf(kind): number;                                   // floor(cost / divisor)
/** Aperçu d'une ligne : verdicts SÉQUENTIELS (chaque pose OK est simulée avant la suivante : stock, max, connexité). */
export function planPlacements(state, kind, tiles: readonly TilePos[]):
  { tile: TilePos; error: PlacementError | null }[];
```
Sélecteurs ajoutés (`selectors.ts`) : `structureAt`, `placementError`, `planPlacements`, `refundOf`, `structureCost`,
`structureMask(state, tile)` (bits N=1, E=2, S=4, O=8 des voisines portant une pièce, toutes sortes), `navGrid`.

### 3.3 Systèmes
Aucun nouveau système, ordre du tick inchangé. Changements : grille de navigation partout (§2.2) ; le rocher passe par
`harvest`/`nodeRegrow`/`pickup` existants (génériques sur `NODES` et `DropResource`).

---

## 4. Rendu / UI (lecture seule de l'état)

### 4.1 Modèles 3D — **rien à télécharger**
Les kits **Kenney Castle Kit 2.0** (`assets-src/castle/`) et **Fantasy Town Kit 2.0** (`assets-src/town/`) sont
présents, **déclarés** dans `PACKS` de `tools/build-assets.mjs`, présents dans le catalogue
(`castle/*`, `town/*`) et `PACK_SCALE` vaut 2 pour les deux (1 module Kenney = 1 tuile de 2 m). **Mais `public/assets/`
n'est pas régénéré** (2,47 Mo) : étape `npm run assets` par l'agent principal, taille ≤ 4 Mo à vérifier.

Tailles du catalogue (unités Kenney, ×2 en mètres) : `castle/wall` et `castle/wall-corner` 1 × 1,31 × 1 (**module
plein d'une tuile**, 2,6 m de haut) ; `castle/wall-doorway` 0,5 × 1,31 × 1 ; `castle/gate` 0,15 × 0,91 × 0,66 (vantail) ;
`town/fence` et `town/fence-gate` 0,08 × 0,38 × 1 (2 m de long mais **0,76 m de haut** : trop bas pour une défense) ;
`survival/fence-fortified` / `fence-doorway` 0,5 × 0,52 (×3,5 ⇒ 1,75 m de long, 1,8 m de haut, pieux pointus).

| Pièce / raccord | Modèle retenu | Repli |
|---|---|---|
| Palissade (bras centre → bord) | `survival/fence-fortified` **à ajouter à la liste blanche** (bras = ×0,57 en longueur) | `town/fence` ×2 en hauteur |
| Palissade (poteau central) | procédural instancié (pieu : cylindre + cône, 1 draw call) | — |
| Mur de pierre droit / extrémité / isolé | `castle/wall` orienté selon la ligne | — |
| Mur de pierre angle | `castle/wall-corner` tourné selon le quadrant | — |
| Mur de pierre T / croix | 2 × `castle/wall` superposés (0° et 90°) | `castle/wall-pillar` (non livré) |
| Porte dans une ligne de pierre (≥ 1 voisin `stoneWall`) | `castle/wall-doorway` + vantail `castle/gate` | — |
| Porte ailleurs (palissade, isolée) | `survival/fence-doorway` **à ajouter** | `town/fence-gate` (déjà listé) |
| Rocher récoltable prêt / épuisé | `forest/Rock_2_A_Color1` **à ajouter** / même modèle à l'échelle `0,3 + 0,7 × regrow` | autre `forest/Rock_1_*` |
| Butin pierre | procédural (3 galets gris instanciés, comme bûches/baies) | `survival/resource-stone` |

**Liste blanche — proposition (taille)** : la liste actuelle ajoute 26 modèles castle/town dont la plupart ne servent
pas à cette feature (tours, drapeau, baliste, murs/toits de maison, lanterne, étal, charrette, moulin, fontaine, route,
planches). Proposition : **ne livrer maintenant que** `castle/wall`, `castle/wall-corner`, `castle/wall-doorway`,
`castle/gate`, `town/fence-gate` (repli) + `survival/fence-fortified`, `survival/fence-doorway`,
`forest/Rock_2_A_Color1` ; retirer les autres de `tools/shipped-assets.json` et les rajouter avec leur feature (tours /
torches / bâtiments). Si l'humain préfère tout garder : `npm run assets` doit rester ≤ 4 Mo, sinon échec explicite.
Les textures `colormap` des kits Kenney sont partagées par kit (une seule par pack).

### 4.2 Raccords (pur, `scene-model.ts`, sans three, testé)
- `mask` = bits N=1, E=2, S=4, O=8 des voisines portant une pièce (toutes sortes se raccordent).
- **Palissade** (modèle en segment) : **poteau au centre + bras vers le bord** (1 m). `armsFor(mask)` : 0 voisin ⇒ E + O
  (ligne droite) ; 1 voisin ⇒ ce côté + l'opposé (extrémité) ; ≥ 2 ⇒ un bras par voisin (droit, angle, T, croix).
- **Mur de pierre** (module plein d'une tuile) : `stonePieces(mask)` ⇒ `{ model: "wall" | "corner"; yaw }[]` :
  0/1 voisin ou ligne droite ⇒ 1 `wall` orienté ; angle ⇒ 1 `corner` (lacet selon le quadrant, à calibrer dans
  l'aperçu) ; T / croix ⇒ 2 `wall` à 0° et 90°.
- **Porte** : pas de poteau ; orientée E-O si `mask & (E|O)` sans `N|S`, N-S dans le cas inverse, E-O sinon ; variante
  `stone` si une voisine dans l'axe est un `stoneWall`, sinon `wood`.
- Un mur de pierre à côté d'une palissade : chacun garde son modèle ; le bras de palissade s'arrête au bord du module.
- `StructureItem { key: "structure:<id>"; type: "structure"; kind; tx; ty; x; z; mask; parts: { model; yaw; scaleX }[] }`.

### 4.3 Vue 3D (`views/structure-view.ts`)
- **Instanciation** : un `InstancedMesh` par maillage de chaque modèle (bras de palissade : capacité 4 × 200 ;
  `castle/wall` : 2 × 200 ; autres : 200). Matrices reconstruites seulement quand la référence `state.structures`
  change. `matrixAutoUpdate = false`.
- **Apparition** : pièce nouvelle (id inconnu de la vue, hors `reset()`) ⇒ échelle Y 0 → 1 en `ANIM.popMs` (ease-pop),
  seules ses instances sont réécrites pendant 300 ms. « Réduire les animations » ⇒ immédiat. Démolition : retrait
  immédiat + 4 particules de poussière via le pool `loot-fx` (option).
- **Aperçu** : `renderer.setBuildPreview(p: BuildPreview | null)` (comme `setGuide`).
  `BuildPreview = { mode: "place" | "demolish"; kind?: StructureKind; tiles: { tx; ty; error: PlacementError | null }[];
  label: string | null }`. Rendu : bloc translucide procédural instancié (1 draw call) à la hauteur de la sorte,
  `instanceColor` vert `#6fcf7a` / rouge `#ff6b5a` + motif hachuré au sol si rouge (jamais la couleur seule) ;
  démolition : instances visées teintées orange + « +2 bois ». Calque 2D : coût total au-dessus de la dernière case
  (« −8 bois ») et raison du refus dans une pastille (`label`).
- **Sélection de case** : `renderer.pickTile(clientX, clientY): TilePos | null` (rayon caméra ∩ plan y = 0 ; 2D :
  transformation inverse). Lecture seule.
- **Budget** (< 120 draw calls, < 200 k triangles, dans les 5 états + mode construction ouvert, 200 pièces) :
  structures ≈ 7 modèles × 1–2 maillages (+ passe d'ombre) + aperçu 1 + rocher 1–2. Carte 2,3× plus grande : forêt de bordure et
  touffes à re-doser (anneau extérieur `FOREST_MARGIN_TILES` 2 → 1, touffes ≤ 1 par tuile hors camp) ; si le budget
  de triangles casse encore, découper le décor en 4 quadrants pour profiter du frustum culling. Test Vitest
  `static-layout` : plafonds d'instances par catégorie ; mesure réelle en e2e (CI).
- **Sol** : chemin de terre E → file (BFS statique, couleurs par sommet, 0 draw call) prolongé hors carte
  (`ENTRANCE_PATH_TILES`).

### 4.4 Caméra
- **Paysage** : ne montre plus toute la carte ; suit le joueur comme en portrait, profondeur visible
  `CAMERA.landscapeTilesDeep = 13` (≈ l'ancienne carte), point visé borné à la carte (`edgeMarginTiles`).
- **Portrait** : inchangé (suivi, 5–9 tuiles de large).
- **Mode construction** : +2 tuiles de large (`CAMERA.buildExtraTiles`), sans descendre sous 44 px par tuile.
- La flèche de bord (`guide-edge.ts`) sert davantage (cibles hors écran) : aucun changement de logique.

### 4.5 2D de secours (`renderer.ts`)
Carte entière si ≥ 32 px/tuile, sinon suivi du joueur borné à la carte. Dessin : rocher récoltable (polygone gris +
barre), galets, palissade (traits bruns épais selon `armsFor`), mur (gris plus épais), porte (cadre brun ouvert),
aperçu vert/rouge hachuré, `pickTile` inverse.

### 4.6 UI (`src/ui`, `src/app`) — respecte `ui-style.md`
- **HUD** : pilule `data-hud="stone"` (icône maison **`stone`**, 3ᵉ icône maison : tas de 3 pierres, 24 × 24, trait 2,
  à ajouter au §4 du guide) placée après Nourriture : groupes (Horloge·Feu·Bois) / (Nourriture·Pierre·File·Tentes).
  `aria-label` « Pierre : 12 ». Vérifier 360 px sans débordement.
- **Bouton « Construire »** : `.btn--secondary` icône `hammer`, en bas à droite (safe area), `data-action="build"`,
  touche **B**. Masqué hors `screen = game`, inerte sous un panneau.
- **Barre de construction** (`src/ui/build-bar.ts`, `#build-bar`, en bas, remplace le bouton) :
  - choix segmenté (`createSegmented`, `role=radiogroup`) des 3 pièces : icône Lucide (`fence`, `brick-wall`,
    `door-open`) + nom + coût avec icône de ressource (« 4 » + `wood`) ; `data-build-piece` = `palisade|stoneWall|door` ;
    pièce trop chère : `aria-disabled` + note « Bois insuffisant » ; < 560 px : nom masqué (dans l'`aria-label`) ;
  - bascule **Démolir** (`makeIconButton`, `pickaxe`, `aria-pressed`, `data-action="build-demolish"`, touche **X**) ;
  - **Annuler** (`.btn--secondary`, `x`, `data-action="build-cancel"`) ;
  - ligne d'état `.build-status` (`text-300`, **pas** de région live) : « Palissade · 4 bois · 60 PV » ou la raison du
    refus de la case visée.
  - Les toasts remontent au-dessus de la barre (`--build-bar-h`).
- **Raccourcis** (à ajouter à `ui-style.md` §7.1) : **B** ouvrir/fermer ; **1/2/3** pièce (lus par `e.code`
  `Digit1..3`/`Numpad1..3` : en AZERTY `e.key` donne « & é " ») ; **X** démolir ; **Entrée** poser sur la case visée
  (seulement si le focus n'est pas sur un contrôle) ; **Échap** quitte le mode **avant** d'ouvrir la pause.
  À l'ouverture, le focus reste sur le jeu (barre atteignable au Tab).
- **Visée** : souris ⇒ case sous le pointeur ; clavier (dès qu'une touche de déplacement est pressée) ⇒ case voisine
  du joueur dans sa dernière direction (sud par défaut).
- **Gestes** : clic / appui court (< 8 px de déplacement) = une pose ; glisser = **ligne** verrouillée sur l'axe dominant
  depuis la case de départ (≤ 28 cases), aperçu `planPlacements` recalculé seulement quand la case change ; relâcher =
  envoi des poses valides dans l'ordre. Clic droit ou Échap pendant le glisser = annule la ligne. Même mécanique en
  démolition.
- **Tactile** : en mode construction le joystick est désactivé (les doigts servent à poser) ; pour se déplacer, on quitte
  le mode (la dernière pièce choisie est mémorisée). Choix à valider (§10).
- **Envoi des commandes** (`src/app/build-controller.ts`) : file locale ; à chaque image, envoie tant que
  `commandsThisTick < LIMITS.maxCommandsPerTick − 2` (2 places gardées pour `setMoveInput`), le reste à l'image
  suivante. Aucune commande quand le jeu ne tique pas (pause, panneau). `Game` expose `sendCommand(cmd): CommandResult`.
- **Retours** : succès ⇒ son `build` (une fois par ligne) ; refus ⇒ toast warning `data-key="build-refused"` avec la
  raison (ligne : « 3 pièces non posées : Bloquerait le passage des survivants »).
- **Textes des raisons** (`src/ui/build-text.ts`) : obstacle « Un obstacle occupe la case » · nœud « Une ressource
  occupe la case » · feu « Le feu de camp occupe la case » · occupée « Une pièce est déjà là » · entrée « Réservé à
  l'entrée du camp » · accueil « Réservé à l'accueil » · file « Réservé à la file d'attente » · tente « Réservé à une
  tente » · emplacement « Réservé à un emplacement de construction » · joueur « Vous êtes sur la case » · survivant
  « Un survivant passe ici » · butin « Ramassez d'abord le butin » · max « Maximum de 200 pièces atteint » · stock
  « Pas assez de bois » / « Pas assez de pierre » · chemin « Bloquerait le passage des survivants » · démolir
  « Rien à démolir ici » · hors carte « Hors de la carte ».
- **État d'interface pur** (`src/app/build-mode.ts`, testé) : `{ mode: "off" | "place" | "demolish"; kind; drag }`,
  réducteur d'événements (touches, boutons, pointeur, Échap, pause), `lineTiles(start, end)`.
- **Contrat de test** (ajouts à `ui-style.md` §10) : `#app[data-build]` = `place|demolish` (absent sinon) ;
  `[data-action]` `build`, `build-cancel`, `build-demolish` ; `[data-build-piece]` ; `[data-hud=stone]` ;
  `window.__gameInfo.structures(): number` (lecture seule, compte).
- **Tutoriel** : étapes inchangées (cibles lues dans l'état, donc adaptées à la carte) ; mettre à jour les coordonnées
  des tests et des scénarios e2e.

---

## 5. Anti-triche

### 5.1 Invariants (`src/core/invariants.ts`, au chargement et à chaque tick en dev/tests)
- `structures` : ≤ 200 ; triées par id ; ids uniques, ≥ 1, < `nextId` (ajoutés à la liste globale des ids) ;
  `kind` connu ; `hp` entier dans [1, maxHp] ; tuile dans la carte ; une pièce par tuile.
- Tuile autorisée **statiquement** : pas `#`/`R`/nœud/feu, ni E, W, Q, tente (tuile ou porte), emplacement (tuile
  ou porte).
- Joueur et survivants : vérifications existantes faites sur `navGrid(state)` (joueur pas dans un mur, chemins sans
  mur).
- **Connexité** : `isConnected(navGrid(state), state)` (cibles statiques + joueur + survivants, §1.4.8). Aucun tick ne
  peut la casser (structures immuables pendant le tick, déplacements dans la composante de E).
- **Plausibilité** : `heldTotal(res)` += `Σ refundOf(kind)` des pièces de cette ressource (empêche d'injecter des murs
  gratuits pour les démolir). Partie honnête : poser fait baisser `heldTotal` (`−cost + floor(cost/2)`).
- Nœuds : mêmes règles, avec `rock` ; `DROP_RESOURCES` dérivé de `NODES` inclut `stone`.

### 5.2 À chaque commande
Validation complète §1.4 avant application ; refus = état inchangé (même référence).

### 5.3 Sauvegarde v3 (save-guardian)
- `config.ts` : `CURRENT_VERSION = 3` ; `limits.path` 192 → **560** (un labyrinthe de murs allonge les chemins ;
  560 = nombre de cases) ; `limits.structures = 256` (test : ≥ `STRUCTURE_LIMITS.maxCount`).
- **Carte v2 figée** `src/save/legacy/map-v2.ts` : `MAP_LAYOUT_V2` (copie exacte, « ne jamais modifier ») +
  `LEGACY_MAP_V2 = parseMap(MAP_LAYOUT_V2).map` gelée. **`migrate-v1.ts` doit l'utiliser** (`F`, voisines,
  `navOf(LEGACY_MAP_V2)`) au lieu de `referenceMap()`, sinon v1 → v2 se ferait sur la carte v3.
- **Schéma** : formes paramétrées par les dimensions. v1 et v2 figées en 16 × 12, `NODE_KINDS` `tree|bush`,
  `DROP_RESOURCES` `wood|food` ; v3 en 28 × 20, + `rock`, + `stone`, + `structures: arr(obj({ id, kind, tile, hp }),
  limits.structures)`. Exporter `validateSavedStateV2`.
- **`migrate-v2.ts` (`migrations[2]`)**, pure, ne répare rien :
  - pas un objet ⇒ rendu tel quel ; contient `structures` ⇒ `MigrationError` ; v2 mal formée
    (`validateSavedStateV2`) ⇒ rendue telle quelle (refus `bad_shape` ensuite) ;
  - décalage `(+6, +4)` tuiles / `(+6000, +4000)` unités : `player.pos`, `survivors[].pos` et `path`, `tents[].tile`,
    `buildSlots[].tile`, `drops[].pos` ; le feu suit la carte (non sérialisé) ; `fire`, `night`, ressources, `tick`,
    `rng`, file : intacts ;
  - survivant `leaving` à chemin non vide : chemin + `findPath(navOf(v3), (17,15), (17,19))` = (17,16)…(17,19) ;
    `leaving` à chemin vide : inchangé (retiré au tick suivant) ; autres statuts : seulement décalés ;
  - **nœuds** : nouvelle liste dans l'ordre de lecture v3 avec des **ids neufs** `nextId, nextId+1…` (`nextId += 21`) ;
    un nœud v3 situé sur un ancien nœud décalé reprend `status`, `progress`, `regrowTicksLeft` (sorte différente ⇒
    `MigrationError`) ; les nouveaux sont `ready` ;
  - `structures = []`. Résultat validé comme une v3 native (forme + invariants, connexité comprise).
- **Fixtures** : v1 (×2) et v2 (×3) **gelées** et toujours chargées (v1 → v2 → v3 ; états attendus mis à jour : positions
  décalées, ids de nœuds). Générateur v2 retiré (commentaire comme pour v1). Nouvelles fixtures générées une fois :
  `v3-initial.json` (`createInitialState(4242)`), `v3-walls.json` (bot : enceinte palissade + mur de pierre + porte sur
  le couloir, nuit 1, dormeurs), `v3-stone.json` (rocher épuisé, butin pierre au sol). `CHECK_SAVE_FIXTURES` porte sur
  v3 (CI).

---

## 6. Tests

### 6.1 `tests/core/` (core-dev, test-writer)
- `map-v3.test.ts` : §1.1 (dimensions, décalage exact de l'ancienne carte, une seule E au bord, connexité, espacement
  des nœuds, voisine atteignable, 21 nœuds dans l'ordre).
- `rock.test.ts` : récolte → 2 pierres au sol, épuisement, repousse 450, ramassage, `isStockFull("stone")`.
- `structures-place.test.ts` : **un test par case interdite** (`#`, `R`, nœud prêt et épuisé, feu, E, W, chaque Q,
  tente, porte de tente, emplacement, porte d'emplacement, joueur sur la case, joueur à cheval sur deux cases, survivant
  sur la case, survivant dont `path[0]` est la case, butin, case occupée, hors carte, `kind`/coordonnées invalides) ;
  **coût exact** par sorte ; **refus si stock insuffisant** (même référence, stock inchangé) ; `max_structures` à 200 ;
  `rate_limited` ; refus `would_block_path` (fermer le couloir d'E, enclore une tente, un emplacement, le feu, un nœud,
  le joueur, un survivant en marche) ; **porte** sur le couloir acceptée là où un mur est refusé ; chemin d'un survivant
  recalculé quand la case est sur son trajet ; `structures` immuable pendant `tick`.
- `doors.test.ts` : le joueur traverse une porte (collision), un survivant traverse une porte (spawn → file à travers
  une enceinte fermée par une porte), les murs bloquent.
- `structures-demolish.test.ts` : **remboursement exact** `floor(cost/2)` par sorte, plafond `RESOURCES.cap`,
  `no_structure`, porte démolie avec le joueur dessus.
- `nav.test.ts` : `navGrid` déterministe, mémoïsation par référence, `findPath` contourne les murs.
- `connectivity-property.test.ts` : **propriété**, 5 graines × 2 000 poses aléatoires (RNG du core, sortes et cases
  tirées) avec démolitions aléatoires : après chaque pose acceptée, toutes les cibles sont atteintes et chaque
  survivant trouve un chemin vers sa destination ; chaque refus `would_block_path` est confirmé par un oracle (BFS
  naïve indépendante).
- `build-bot-simulation.test.ts` : **simulation longue** (3 jours = 10 800 ticks), bot « attentif » (accueil, feu,
  récolte) qui pose et démolit au hasard ; `checkInvariants` vide **à chaque tick** ; déterminisme (même graine + mêmes
  commandes ⇒ même `canonical` final).
- `invariants-structures.test.ts` : chaque invariant §5.1 détecte une save trafiquée (doublon de tuile, mur sur Q, hp
  0, id ≥ nextId, enceinte fermée autour d'une tente, murs gratuits gonflant la plausibilité).
- `balance.test.ts` : `stonePerTick` recalculé depuis `NODES` ; `refund < cost` ; règle du feu (entretenir > laisser
  mourir dès 2 tentes) inchangée ; un bot qui pose 10 palissades par jour avec 2 tentes reste en bois positif.
- Tests existants : coordonnées migrées par un utilitaire `old(tx, ty)` = `(tx + 6, ty + 4)` dans
  `tests/core/helpers.ts`.

### 6.2 `tests/save/` (save-guardian)
`migration-v2-v3.test.ts` (décalage de chaque champ, `leaving` prolongé, nœuds réindexés avec états conservés,
`structures` présent ⇒ refus, v2 mal formée ⇒ `bad_shape`, résultat valide) ; `fixture-v1/v2` (chargement via la
chaîne) ; `fixture-v3.test.ts` ; `fuzz-load` étendu aux structures ; schéma : bornes 28 × 20, `limits.path` 560.

### 6.3 `tests/render/`, `tests/app/` (render-dev)
`scene-model` (`StructureItem`, `armsFor` : 16 masques, orientation des portes, apparition) ; `static-layout`
(aucune touffe sur `S`, plafonds d'instances, chemin E → file) ; `build-mode.test.ts` (réducteur, B/1/2/3/X/Entrée,
Échap prioritaire sur la pause, `lineTiles` verrouillée sur un axe) ; `build-controller.test.ts` (étalement des
commandes sous la limite, rien en pause) ; `tutorial.test.ts` (coordonnées v3).

### 6.4 e2e et captures — **CI uniquement** (jamais en local)
`tests/e2e/build.spec.ts` : ouvrir/fermer (B, bouton, Échap), poser une ligne, refus affiché, démolir, < 120 draw calls
avec 200 pièces, 360 px sans débordement. Captures : `build-mode-desktop.png` (1280×720, ligne avec une case rouge),
`build-mode-mobile.png` (390×844), `walls-night.png` (camp enclos de nuit) ; captures existantes régénérées (nouvelle
carte). Scénarios `daynight-scenario.ts`/`ui-scenario.ts` : coordonnées v3.

---

## 7. Découpage en tâches

| # | Agent | Tâche | Dépend de |
|---|---|---|---|
| 1 | **agent principal** | liste blanche §4.1 (ajouter `survival/fence-fortified`, `survival/fence-doorway`, `forest/Rock_2_A_Color1` ; réduire castle/town si l'humain l'accepte) ; `npm run assets` (pas encore fait) ; vérifier ≤ 4 Mo ; `CREDITS.md` ; plus tard : `ui-style.md` §4/§7.1/§10 et skill `three-render`, ROADMAP Jalon 3 | — |
| 2 | **balance-designer** | §2.4 dans `src/data` (`MAP_LAYOUT` v3 + commentaire de vérification, `NODES.rock`, `STRUCTURES`, `STRUCTURE_LIMITS`, `PLAUSIBILITY.stonePerTick`) ; `balance.test.ts` | — |
| 3 | **core-dev** | `nav.ts`, `structures.ts`, commandes, `state.ts`, parseur `S`, systèmes sur `navGrid`, invariants §5.1, sélecteurs, exports ; tests §6.1 hors propriété/simulation | 2 |
| 4 | **test-writer** | `connectivity-property`, `build-bot-simulation`, `invariants-structures`, migration des coordonnées des tests existants | 3 |
| 5 | **save-guardian** | §5.3 : carte v2 figée, `migrate-v1` sur la carte v2, schéma paramétré, `migrate-v2`, registre, limites, fixtures v3, tests §6.2 | 3 |
| 6 | **render-dev** | §4 : `PACK_SCALE`, `config.ts` (`MODEL_IDS`), structure-view, rocher, butin pierre, aperçu, `pickTile`, caméra, décor 28 × 20, 2D ; UI (HUD pierre, bouton, barre, icônes Lucide `fence`/`brick-wall`/`door-open`/`pickaxe` + maison `stone`, raccourcis, build-mode/controller, textes) ; tutoriel ; tests §6.3 ; e2e et captures écrits (exécutés en CI) | 1, 3 |

Barrière finale (session principale) : `npm run typecheck` + `npm test`. Aucune commande lourde en local.

---

## 8. Équilibrage — ordres de grandeur
- Enceinte autour de l'ancien camp (≈ 60 cases de périmètre, 1 porte) : ≈ 236 bois en palissade, ou ≈ 236 pierres en
  mur ; la récolte seule donne ≈ 0,15 bois/tick et ≈ 0,08 pierre/tick ⇒ un objectif sur 2–3 jours, en concurrence avec
  les tentes (15/25/40) et le feu (13–16 bois/cycle).
- Construire reste un choix : la comparaison nuit par nuit « entretenir le feu > laisser mourir » (dès 2 tentes) ne
  dépend pas des murs. Coûts à revoir à l'arrivée des loups.

## 9. Risques
- Budget de triangles avec la carte agrandie (§4.3) : à mesurer en CI dès la première PR de rendu.
- Proportions des kits Castle/Town inconnues avant l'aperçu : replis listés §4.1.
- Beaucoup de tests existants codent des coordonnées en dur : migration mécanique via `old()`.

## 10. Choix à valider par l'utilisateur
1. Ancienne bordure rendue praticable ; **entrée déplacée au bord sud (17,19)** avec un couloir de 4 cases.
2. Cases **devant les tentes et les emplacements** aussi interdites (récompenses et accès).
3. Pose **sans limite de distance** (toute case visible).
4. Tactile : joystick coupé en mode construction (on quitte le mode pour bouger) — ou geste à deux doigts pour
   déplacer la caméra (plus coûteux).
5. Coûts / PV : palissade 4 bois / 60, mur 4 pierre / 150, porte 6 bois / 40 ; max 200 ; remboursement `floor(c/2)`.
6. Rocher : 2 pierres, 2,5 s, repousse 45 s ; 6 rochers ; 9 arbres, 6 buissons.
7. Caméra paysage qui suit le joueur (≈ 13 tuiles de profondeur) au lieu de montrer toute la carte.
8. Icône maison `stone` (3ᵉ icône maison) ; icônes Lucide `fence`, `brick-wall`, `door-open`, `pickaxe`.
9. Modèles (rien à télécharger) : palissade `survival/fence-fortified` (pas `town/fence`, trop basse) ; mur
   `castle/wall` + `castle/wall-corner` ; porte `castle/wall-doorway` + `castle/gate` dans la pierre,
   `survival/fence-doorway` ailleurs. Ne livrer pour l'instant que les modèles castle/town utiles (§4.1).
