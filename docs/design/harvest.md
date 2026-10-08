# Design — Récolte de ressources (fin du Jalon 1)

Statut : implémenté (branche feature/harvest). Prolonge `docs/design/core-loop.md` (implémenté).
Couvre : nœuds récoltables (arbres → bois, buissons → nourriture), récolte sans touche d'action, épuisement, repousse,
drops typés par ressource, HUD nourriture.

Hors périmètre : outils / améliorations de récolte, travailleurs, saisons (seulement le point d'extension), consommation
de la nourriture, sauvegarde.

---

## 1. Règles de jeu

Unités inchangées : 1 tuile = 1000 unités, 1 tick = 100 ms.

1. **Nœuds** : deux sortes, `tree` (donne du bois) et `bush` (donne de la nourriture). Ils sont placés par la carte
   (`A` = arbre récoltable, `M` = buisson de mûres). Ils sont distincts des arbres de bordure `#` (obstacles inertes).
2. **Les nœuds sont des obstacles, en permanence** (prêts OU épuisés). La tuile d'un nœud est de type `"node"`, statique,
   bloquante pour le joueur, les survivants et le BFS. Conséquence : la repousse ne change jamais la praticabilité,
   donc **un nœud qui repousse ne peut bloquer personne** (pas de cas spécial à gérer, pas de recalcul de chemin).
3. **Portée (en tuiles, comme toutes les autres actions)** : un nœud est à portée si la tuile du joueur
   (`tileOf(player.pos)`) est à distance de Chebyshev ≤ `HARVEST.rangeTiles` (= 1, donc les 8 voisines) de la tuile du nœud.
   Choix fait plutôt qu'une portée en unités : avec une portée en unités, un joueur « sur » la tuile voisine mais près
   de son bord opposé ne récolterait pas (incohérent avec accueil/nettoyage/construction, qui sont tous « sur la tuile »).
4. **Cible unique** : parmi les nœuds `ready` à portée, on prend celui dont le centre est le plus proche du centre du
   joueur (distance euclidienne au carré, entière) ; égalité ⇒ plus petit id. Les nœuds `depleted` ne sont jamais
   candidats (un buisson vide plus proche n'empêche pas de récolter un arbre prêt à portée).
5. **Progression** : la cible gagne `progress += 1` par tick. Les autres nœuds ne bougent pas (progression en pause).
   Joueur hors de portée ⇒ progression **conservée** (même règle que le nettoyage), jamais perdue ni dépassée.
6. **Barre pleine** (`progress` atteint `NODES[kind].harvestTicks`) : le nœud passe `depleted`, `progress = 0`,
   `regrowTicksLeft = regrowDelay(state, kind)` ; un drop de `NODES[kind].yield` unités de `NODES[kind].resource` est
   posé **au centre de la tuile du joueur** (toujours praticable par invariant, toujours voisine du nœud puisque la récolte
   n'avance que si le joueur est à portée). Le stock n'est jamais crédité directement : le ramassage existant s'en charge.
   Comme le système de récolte passe avant `pickupSystem`, le drop (à ≤ 500 u. du joueur par axe) est aimanté et
   ramassé **dans le même tick** si le stock n'est pas plein.
7. **Stock plein** : la récolte se termine quand même ; le drop reste au sol (règle de ramassage existante, par
   ressource). Rien n'est détruit.
8. **Repousse** : chaque tick, tout nœud `depleted` fait `regrowTicksLeft -= 1` ; à 0 ⇒ `ready`, `progress = 0`.
   La repousse a lieu **avant** la récolte dans le tick : si le joueur est à portée, la nouvelle récolte commence dans le
   même tick (progress = 1 à la fin de ce tick). Chronologie exacte : épuisé au tick `t0` ⇒ prêt au tick `t0 + R` ⇒
   (joueur resté à portée) de nouveau épuisé au tick `t0 + R + H - 1`, avec `R = regrowDelay`, `H = harvestTicks`.
9. **Point d'extension saisons** (non implémenté) : fonction pure `regrowDelay(state, kind): number` dans
   `src/core/harvest-rules.ts`. Aujourd'hui elle renvoie `NODES[kind].regrowTicks`. Plus tard, elle dérivera la saison
   de `state.tick` et appliquera un multiplicateur lu dans `src/data` (`SEASON_REGROW_MULT`), sans changer l'appelant.
   Le compagnon `maxRegrowDelay(kind)` (aujourd'hui = `regrowTicks`, plus tard max sur les saisons) sert de borne aux
   invariants. Pas de table par saison factice maintenant.
10. **Aucun RNG** dans la récolte ni la repousse (le RNG du jeu n'est pas consommé).
11. **Drops typés** : `Drop.resource ∈ {"wood", "food"}`. Au plus **un drop par (tuile, ressource)** : poser ou aimanter
    un drop sur une tuile qui contient déjà un drop de la **même** ressource fusionne les montants (sans plafond au
    sol, comme aujourd'hui) ; deux ressources différentes coexistent sur la même tuile.
12. **Ramassage par ressource** : la règle « stock plein ⇒ le drop ne bouge plus, collecte partielle sinon » s'applique
    à `resources[drop.resource]`. Un stock de bois plein n'empêche pas de ramasser de la nourriture.

### Combinaison avec les autres actions
Les actions sont **simultanées et indépendantes**, pas exclusives : chaque système lit la position du joueur et agit
sur son propre objet. La récolte ne consomme rien, elle ne peut donc pas entrer en conflit avec la construction (qui
consomme du bois) ; le bois récolté n'est crédité qu'au ramassage, en dernier. Ordre déterministe (§3).
Avec la carte proposée, **aucune tuile T/B/porte/W/Q/E/P n'est à portée d'un nœud** (vérifié par test) : en pratique
le joueur ne fait jamais deux actions à la fois, mais la règle reste bien définie si une future carte le permet.

### Carte proposée (16 × 12) — remplace `MAP_LAYOUT`
```
################   y0
#.............A#   y1   A (14,1)  arbre récoltable
#.T....B....B..#   y2
#..............#   y3
#....RR....##..#   y4
#....RR.....B..#   y5
#..............#   y6
#..##.........M#   y7   M (14,7)  buisson
#......P.......#   y8
#.A.A..W......M#   y9   A (2,9), A (4,9) ; M (14,9)
#......QQQQQ...#   y10
###########E####   y11
```
Ids par ordre de lecture, attribués **après** tentes et emplacements : tente 1, slots 2–4, nœuds 5 (14,1), 6 (14,7),
7 (2,9), 8 (4,9), 9 (14,9) ; `nextId` initial = 10.

Vérification :
- Longueurs : les 3 lignes modifiées font 16 caractères (`#` + 13 `.` + `A` + `#` ; `#..##` + 9 `.` + `M#` ;
  `#.A.A..W` + 6 `.` + `M#`).
- Aucun nœud sur un trajet existant : les routes décrites dans `balance.ts` passent par les lignes 3 et 6 et les
  colonnes 7 à 13 ; les nœuds sont en colonne 14 (lignes 1, 7, 9) et en ligne 9 colonnes 2 et 4 (cul-de-sac sud-ouest).
  E → Q → W, Q0 → T/B0/B1/B2, tentes/slots → E : inchangés. Ligne 3 et ligne 6 toujours entièrement en herbe.
- Chaque nœud a au moins une voisine 4-connexe praticable et atteignable depuis E : (13,1)/(14,2) ; (13,7)/(14,6)/(14,8) ;
  (1,9)/(3,9)/(2,8)/(2,10) ; (3,9)/(5,9)/(4,8)/(4,10) ; (13,9)/(14,8)/(14,10).
- Distance (Chebyshev, tuiles) ≥ 2 entre chaque nœud et T (2,2), B0 (7,2), B1 (12,2), B2 (12,5), portes (2,3) (7,3)
  (12,3) (12,6), P (7,8), W (7,9), Q (7..11,10), E (11,11). Ex. (14,1)↔B1 = 2, (14,7)↔porte B2 = 2, (4,9)↔W = 3.
- Tuiles utilisées par les tests existants (`(1,1)`, `(4,3)`, `(4,4)`, `(4,6)`, `(3,6)`, `(6,3)`, `(7,6)`, `(7,7)`,
  colonne 4 de y6 à y1) : aucune à portée d'un nœud ⇒ pas de récolte parasite dans les tests à bois exact.
- Égalité « deux nœuds à portée » naturelle : joueur au centre de (3,9) ⇒ (2,9) et (4,9) à égale distance ⇒ id 7.

---

## 2. Changements d'état — `src/core/state.ts`

```ts
// src/data/balance.ts (data ne dépend de rien ; core ré-exporte)
export type NodeKind = "tree" | "bush";
export type DropResource = "wood" | "food";

// src/core/state.ts
export type Tile = "grass" | "tree" | "rock" | "node";   // "node" : obstacle statique
export type NodeStatus = "ready" | "depleted";
export interface ResourceNode {
  id: number;
  kind: NodeKind;
  tile: TilePos;               // statique, = position dans MAP_LAYOUT
  status: NodeStatus;
  progress: number;            // ready : 0..harvestTicks-1 ; depleted : 0
  regrowTicksLeft: number;     // depleted : 1..maxRegrowDelay(kind) ; ready : 0
}
export interface Drop { id: number; pos: Vec; resource: DropResource; amount: number }  // était "wood"
export interface GameState {
  // ... champs existants inchangés ...
  nodes: ResourceNode[];       // triés par id, ordre de lecture de la carte
}
```
- `ParsedMap` gagne `nodes: { kind: NodeKind; tile: TilePos }[]` (ordre de lecture). `A` ⇒ `tree`, `M` ⇒ `bush`,
  tuile `"node"`. `isObstacleAt` : `tree | rock | node`.
- Initial : un `ResourceNode` par entrée, `status "ready"`, `progress 0`, `regrowTicksLeft 0`, ids après les slots.
- `cloneState` : `nodes: s.nodes.map((n) => ({ ...n, tile: { ...n.tile } }))` (sinon mutation de l'entrée).
- `MapChar` : ajouter `"A" | "M"`.
- **Conservation : calculée en test, pas stockée dans l'état** (comme aujourd'hui pour les récompenses des survivants).
  Le test observe les transitions `ready → depleted` entre deux états et ajoute `NODES[kind].yield` à la ressource.
  Un registre `produced` dans l'état n'apporterait de l'anti-triche qu'avec un format de save ; à reconsidérer au Jalon 2.

**Migration de sauvegarde : non.** Aucun format n'existe. Cette forme (avec `nodes` et drops typés) devient la future v1.

---

## 3. Commandes et systèmes

**Aucune nouvelle commande.** La récolte découle de la position du joueur, issue de `setMoveInput` validée.

Nouveau module pur `src/core/harvest-rules.ts` :
```ts
export function nodesInRange(state: Readonly<GameState>): ResourceNode[];          // ready + à portée
export function findHarvestTarget(state: Readonly<GameState>): ResourceNode | null; // règle §1.4
export function regrowDelay(state: Readonly<GameState>, kind: NodeKind): number;   // entier ≥ 1
export function maxRegrowDelay(kind: NodeKind): number;
```
Helpers (`src/core/systems/helpers.ts`) : `addDrop(draft, tile, resource: DropResource, amount)` — fusion avec le drop
de **même ressource** sur la tuile. `survivorLifecycle` appelle `addDrop(draft, door, "wood", SURVIVOR.woodReward)`.

`pickupSystem` : test de plafond et collecte sur `resources[drop.resource]` ; fusion lors de l'aimantation seulement
avec un drop de même ressource sur la tuile d'arrivée.

Nouveaux systèmes :
- `src/core/systems/nodeRegrow.ts` — `mutateNodeRegrow` (§1.8).
- `src/core/systems/harvest.ts` — `mutateHarvest` : `findHarvestTarget` ⇒ `progress+1` ⇒ si plein : épuisement + `addDrop`
  sur `tileOf(player.pos)`.

Ordre de `tick()` (ajouts en gras) :
1. tick++, commandsThisTick = 0 · 2. movePlayer · 3. spawn · 4. survivorMove · 5. survivorLifecycle · 6. welcome ·
7. cleaning · 8. build · **9. nodeRegrow** · **10. harvest** · 11. pickup.

Sélecteurs (`src/core/selectors.ts`, pour render/ui) : `harvestTarget(state)` (= `findHarvestTarget`),
`nodeHarvestRatio(node)` (`progress / harvestTicks`), `nodeRegrowRatio(node)` (`1 - regrowTicksLeft / maxRegrowDelay`),
`dropsAt(state, tile)`. Exporter `NodeKind`, `DropResource`, `ResourceNode` via `src/core/index.ts`.

---

## 4. Rendu / UI (lecture seule)

- `drawGround` : tuile `"node"` dessinée comme de l'herbe ; les nœuds sont dessinés par un nouveau `drawNodes(state)`
  avant les drops.
- Arbre `ready` : tronc brun + houppier plus clair que les arbres de bordure (distinguable). `depleted` : souche (disque
  brun à cernes). Buisson `ready` : boule verte + points rouges/violets. `depleted` : boule vert-gris sans baies.
- Barre de récolte sous le nœud si `progress > 0` ; couleur vive si le nœud est `harvestTarget(state)`, terne sinon
  (progression en pause). Contour léger sur la cible courante.
- Nœud épuisé : petite barre de repousse grise (`nodeRegrowRatio`).
- Drops : bois = carré marron (existant), nourriture = disque rouge ; si deux drops partagent une tuile, décaler le
  dessin de la nourriture (±0,15 tuile, rendu uniquement). Libellé `+n` inchangé.
- HUD (`src/ui/hud.ts`) : stat « Nourriture » `food / cap` juste après « Bois ». Rien d'autre.
- `interpolate.ts` : inchangé (drops appariés par id).

---

## 5. Anti-triche — `src/core/invariants.ts` (ajouts)

- **Nœuds vs carte** : `EXPECTED_NODES = parseMap(MAP_LAYOUT).nodes` calculé une fois. `state.nodes.length` égal,
  triés par id, et `nodes[i].kind/tile` = `EXPECTED_NODES[i]` (pas de nœud déplacé, ajouté, supprimé ou changé de sorte).
  Chaque tuile de nœud est de type `"node"` dans `state.map.tiles`.
- **États cohérents** : `status ∈ {ready, depleted}` ; entiers sûrs ;
  `ready ⇒ regrowTicksLeft === 0 ∧ 0 ≤ progress < NODES[kind].harvestTicks` ;
  `depleted ⇒ progress === 0 ∧ 1 ≤ regrowTicksLeft ≤ maxRegrowDelay(kind)`.
- **Ids** : ids des nœuds inclus dans le contrôle global (uniques, `< nextId`).
- **Drops** : `resource ∈ {wood, food}`, `amount` entier sûr ≥ 1, **au plus un drop par (tuile, ressource)**
  (clé `tx,ty,resource` ; remplace la règle « un drop par tuile »).
- Ressources : inchangé (toutes entières dans `[0, cap]`).
- Conservation (tests, à chaque tick) :
  `wood + Σdrops(wood) + Σpaid = START.wood + Σrécompenses survivants + Σyields(tree)` ;
  `food + Σdrops(food) = START.food + Σyields(bush)` ; autres ressources constantes.

---

## 6. Tests

### Nouveaux — `tests/core/harvest.test.ts` (core-dev)
- Nominal arbre : joueur au centre d'une voisine ⇒ `progress = k` après k ticks ; à `harvestTicks` : `depleted`,
  `regrowTicksLeft = regrowTicks`, bois `+yield` dans le même tick, aucun drop restant.
- Nominal buisson : nourriture `+yield`, bois inchangé.
- Portée : voisine diagonale ⇒ progresse ; tuile à 2 ⇒ rien ; poussée contre le nœud 1000 ticks ⇒ jamais dans la tuile.
- **Joueur qui s'éloigne en pleine récolte** (commandes uniquement, `walkTo`/`walkOff`) : progression conservée 100
  ticks, retour ⇒ termine en exactement `harvestTicks - kept` ticks, un seul yield.
- Aller-retour à chaque tick entre une tuile à portée et hors portée : `progress` = ticks passés à portée.
- **Stock plein** : bois = cap ⇒ récolte terminée, drop `yield` sur la tuile du joueur, rien de crédité, conservation ;
  cap - 1 ⇒ 1 crédité, `yield - 1` au sol ; deux récoltes stock plein sur la même tuile ⇒ un seul drop de `2 × yield`.
- **Nœud épuisé ne donne rien** : à portée pendant `regrowTicks - 1` ticks ⇒ progress 0, aucun drop, stock constant.
- **Deux nœuds à portée** : centre de (3,9) ⇒ cible id 7, le nœud 8 reste à 0 ; joueur décalé vers l'est dans (3,9)
  ⇒ cible id 8 ; cible épuisée ⇒ bascule sur l'autre nœud prêt à portée.
- **Repousse pendant que le joueur est à portée** : redevient `ready` au tick `t0 + R` avec `progress 1`, ré-épuisé à
  `t0 + R + H - 1` ; tuile toujours non praticable pendant tout le cycle.
- Repousse sans joueur : timing exact ; `regrowDelay(state, kind) === NODES[kind].regrowTicks` et `≤ maxRegrowDelay`.
- Déterminisme : RNG identique avec et sans récolte (la récolte ne consomme pas le RNG) ; état d'entrée non muté
  (`deepFreeze`).
- Drops mixtes : bois et nourriture sur la même tuile ⇒ 2 drops, invariants OK ; aimantation d'un drop bois sur une
  tuile contenant de la nourriture ⇒ pas de fusion.

### Modifiés
- `pickup.test.ts` : nourriture créditée dans `food` ; bois plein n'empêche pas la collecte de nourriture ; fusion
  seulement entre ressources identiques.
- `state.test.ts` : 5 nœuds `ready` aux bonnes positions/sortes, ids 5–9, `nextId` 10 ; parse `A`/`M` ⇒ tuile `"node"`
  obstacle ; **carte** : chaque nœud a une voisine 4-connexe praticable atteignable depuis E ; aucun nœud à portée de
  T/B/portes/W/P/Q/E ; tous les chemins existants (E ↔ tentes/slots/portes/file/W/P, Q0 → tentes/slots) non nuls.
- `invariants-detect.test.ts` : progress ≥ harvestTicks / négatif / non entier ; depleted avec progress > 0 ;
  depleted avec regrowTicksLeft 0 ou > max ; ready avec regrowTicksLeft > 0 ; statut inconnu ; nœud déplacé, de sorte
  changée, supprimé, dupliqué ; id de nœud ≥ nextId ; 2 drops bois sur une tuile ; drop `resource: "stone"`.
  Cas positif : bois + nourriture sur une tuile ⇒ valide.
- `simulation.test.ts` et `fuzz-simulation.test.ts` : conservation sur bois **et** nourriture (helper partagé
  `ledger(s)` + `harvestYields(prev, next)` dans `tests/core/helpers.ts`) ; `dropTotal` filtré par ressource ;
  objectif du bot : tente en désordre > drop > slot payable > (tête de file arrivée et tente libre ⇒ W) > nœud prêt
  (steer vers sa première voisine praticable N,E,S,W) > W. Assertions : ≥ 1 récolte de chaque sorte, ≥ 1 accueil,
  ≥ 1 tente construite. Propriété : toute transition `ready → depleted` a lieu avec le joueur à portée ; `food` ne
  diminue jamais (aucune consommation pour l'instant). JSON aller-retour avec nœuds en cours.
- `path.test.ts`, `movement.test.ts`, `edge-cases.test.ts` : relancer ; aucune modification attendue (nœuds hors des
  tuiles utilisées), corriger seulement si un chemin attendu en dur change.
- `tests/core/balance.test.ts` (nouveau, test-writer) : `NODES.*` entiers ≥ 1, `HARVEST.rangeTiles` entier ≥ 1.

---

## 7. Constantes — `src/data/balance.ts` (ajouts)

```ts
export type NodeKind = "tree" | "bush";
export type DropResource = "wood" | "food";
/** Portée de récolte : Chebyshev en tuiles entre la tuile du joueur et celle du nœud. */
export const HARVEST = { rangeTiles: 1 } as const;
/** Durées en ticks (10 = 1 s). */
export const NODES = {
  tree: { resource: "wood", yield: 3, harvestTicks: 20, regrowTicks: 300 },  // 2 s, repousse 30 s
  bush: { resource: "food", yield: 2, harvestTicks: 15, regrowTicks: 200 },  // 1,5 s, repousse 20 s
} as const satisfies Record<NodeKind, { resource: DropResource; yield: number; harvestTicks: number; regrowTicks: number }>;
```
Ordre de grandeur : 3 arbres ⇒ ≤ 18 bois/min, comparable à une tente occupée en boucle (8 bois / ~25 s) : la récolte
accélère le début de partie sans remplacer l'accueil. `MAP_LAYOUT` : version §1 (mettre à jour le commentaire de
coordonnées et la légende). `STARTING_RESOURCES`, `RESOURCES.cap`, `PICKUP` inchangés.

---

## 8. Découpage des tâches

| # | Agent | Tâche | Fichiers |
|---|---|---|---|
| 1 | balance-designer | `NodeKind`, `DropResource`, `HARVEST`, `NODES`, nouvelle `MAP_LAYOUT` + commentaire, `MapChar` | `src/data/balance.ts` |
| 2 | core-dev | Types (`Tile "node"`, `ResourceNode`, `Drop.resource`), `createInitialState`, `cloneState`, parseur `A`/`M`, `isObstacleAt` | `src/core/state.ts`, `src/core/map.ts` |
| 3 | core-dev | `harvest-rules.ts`, systèmes `nodeRegrow` et `harvest`, `addDrop(resource)`, pickup par ressource, ordre de `tick`, sélecteurs, exports `index.ts` | `src/core/` |
| 4 | core-dev | Invariants §5 ; tests unitaires `harvest.test.ts`, ajouts `pickup.test.ts`, `state.test.ts` | `src/core/invariants.ts`, `tests/core/` |
| 5 | test-writer | Helpers de conservation, `simulation`/`fuzz-simulation` (bot récolteur, conservation 2 ressources), `invariants-detect`, `balance.test.ts`, cas limites manquants | `tests/core/` |
| 6 | render-dev | `drawNodes`, barres récolte/repousse, cible surlignée, drops colorés + décalage, HUD Nourriture | `src/render/renderer.ts`, `src/ui/hud.ts` |
| — | save-guardian | **Rien** (pas de format de save). Noter : `nodes` et `Drop.resource` font partie de la future v1. | — |

Dépendances : 1 → 2 → 3 → 4 → (5, 6 en parallèle). En fin de feature : cocher « Nœuds de ressources + récolte +
repousse » dans `docs/ROADMAP.md`.

## 9. Choix à valider par l'utilisateur
1. Nœuds = obstacles permanents (souche/buisson vide compris) ; récolte depuis les 8 tuiles voisines.
2. Portée exprimée en tuiles (voisines), pas en unités.
3. Drop posé sur la tuile du joueur (ramassé dans le même tick si le stock le permet).
4. Repousse avant récolte dans le tick : un nœud qui repousse sous les yeux du joueur recommence aussitôt.
5. Conservation vérifiée en test, sans compteur « produit » dans l'état.
6. Valeurs : arbre 3 bois / 2 s / repousse 30 s ; buisson 2 nourriture / 1,5 s / repousse 20 s ; 3 arbres, 2 buissons.

## 10. Notes d'implémentation
- **Effet de butin** : animation + texte flottant (« +3 bois », « +2 nourriture », ou mention « stock plein » si le
  butin reste au sol), purement côté rendu (`src/render/fx.ts`), déclenché par comparaison état précédent / état
  courant à chaque tick. Aucun champ ajouté à `GameState`.
- **`nodeRegrowRatio`** divise par `maxRegrowDelay`. Point ouvert : quand les saisons rendront le délai variable, il
  faudra soit stocker le délai initial dans le nœud, soit accepter une barre partiellement remplie au départ.
- **Carte actuelle** : aucune tuile n'est à portée à la fois d'un nœud et d'une autre action, et bois + nourriture ne
  coexistent pas naturellement sur une même tuile (cas couvert par un scénario forcé en test).
- **Sauvegarde** : `nodes` et `Drop.resource` feront partie de la v1 du format de sauvegarde (Jalon 2).
- **Limite connue (acceptée)** : l'aimantation déplace un drop en ligne droite sans collision ; si le stock se remplit pendant le trajet, le drop peut rester posé sur une tuile obstacle (nœud, arbre, rocher). Aucune ressource n'est perdue et il repart dès qu'il y a de la place ; les invariants exigent seulement qu'un drop soit dans la carte.
