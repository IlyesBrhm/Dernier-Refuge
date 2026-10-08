# Design — Core loop (version jouable minimale)

Statut : plan, aucun code de production. Couvre la fin du Jalon 0 (GameState/tick/applyCommand, boucle à pas fixe, grille)
et une partie du Jalon 1 (déplacement, survivants, file, accueil, HUD) avec les tentes construites du Jalon 3 en version minimale.

Hors périmètre : jour/nuit, saisons, menaces, feu, moral, récolte d'arbres, travailleurs, sauvegarde, menus, sons, tactile.

---

## 1. Règles de jeu

Unités : **1 tuile = 1000 unités** (positions entières, pas de flottants dans l'état). 1 tick = 100 ms (`TIME.ticksPerSecond = 10`).

1. **Déplacement** : le joueur se déplace à `PLAYER.speed` unités/tick (4 tuiles/s), `PLAYER.diagonalSpeed` par axe en diagonale (entier précalculé). Hitbox carrée de demi-côté `PLAYER.halfSize`. Collision résolue axe par axe (X puis Y) contre les tuiles obstacles et les bords de carte. Le joueur est « sur » une tuile = tuile contenant son centre (`floor(x/1000), floor(y/1000)`).
2. **Arrivées** : un minuteur `spawnTimer` décroît à chaque tick. À 0, si la file a moins de `QUEUE.maxLength` (5) survivants, un survivant apparaît sur la tuile `E` et le minuteur est retiré dans `[SURVIVOR.spawnIntervalMin, spawnIntervalMax]` via le RNG. **File pleine ⇒ minuteur gelé à 0** (personne n'arrive, pas de RNG consommé). Le survivant rejoint son emplacement de file (tuiles `Q`, index 0 = tête, la plus proche de `W`) ; la file avance quand la tête part.
3. **Accueil** : si le joueur est sur la tuile `W`, que la tête de file est **arrivée** à l'emplacement 0, et qu'au moins une tente est `free`, `welcomeProgress` augmente de 1/tick. À `WELCOME.ticks` : la tente libre d'**id le plus petit** passe `assigned` (occupantId = survivant), le survivant passe `walkingToTent` avec un chemin BFS calculé une fois. Si une condition devient fausse (joueur sort, plus de tente libre), `welcomeProgress` **retombe à 0**. Un seul accueil par cycle de progression.
4. **Repos** : arrivé sur la tuile de la tente ⇒ survivant `resting`, tente `occupied`, `restTicksLeft = SURVIVOR.restTicks`. À 0 : survivant `leaving` (chemin BFS vers `E`), tente `messy` (occupantId = null, cleanProgress = 0), un drop de `SURVIVOR.woodReward` bois est posé au centre de la tuile « porte » de la tente (tuile juste en dessous). Si un drop existe déjà sur cette tuile, les montants **fusionnent** sans plafond (option A, implémentée) : `RESOURCES.cap` (9999) s'applique au **stock du joueur**, pas aux tas au sol ; un tas peut dépasser 9999 (entier sûr ≥ 1). La collecte ne prend que ce qui rentre dans le stock, le reste reste au sol ; aucune ressource n'est jamais détruite. Survivant `leaving` arrivé sur `E` ⇒ supprimé.
   - `tick(state, n)` est borné à `OFFLINE.maxTicks` ticks par appel.
   - Outillage : ESLint (typescript-eslint, `npm run lint`) ajouté avec l'accord de l'utilisateur, exécuté en CI (`.github/workflows/ci.yml`).
5. **Remise en état** : joueur sur la tuile d'une tente `messy` ⇒ `cleanProgress` +1/tick ; à `TENT.cleanTicks` ⇒ tente `free`. Si le joueur part, la progression est **conservée** (pause, style My Perfect Hotel) ; elle n'est jamais perdue ni dépassée.
6. **Ramassage** : tout drop dont le centre est à distance de Chebyshev ≤ `PICKUP.magnetRadius` du joueur se déplace vers lui de `PICKUP.magnetSpeed` unités/tick ; à ≤ `PICKUP.collectRadius` il est ajouté au stock. Si le stock est au plafond, on n'ajoute que ce qui rentre, le reste reste au sol (le drop ne bouge plus tant que le stock est plein). Aucune ressource n'est détruite.
7. **Construction** : chaque emplacement a un coût en bois (`BUILD.slotCosts[i]`). Joueur sur l'emplacement non construit, bois > 0 ⇒ tous les `BUILD.payIntervalTicks` ticks, transfert de `min(BUILD.payPerStep, wood, cost - paid)`. Quitter la zone **conserve** `paid`. `paid === cost` ⇒ emplacement `built`, création d'une tente `free` sur cette tuile (`builtTentId`). Un emplacement construit ne consomme plus rien.
8. Survivants : pas de collision entre eux ni avec le joueur. Les tuiles tente/emplacement/zones sont traversables.

### Carte (16 × 12, dans `src/data/balance.ts`)
```
################   # arbre (obstacle)   R rocher (obstacle)   . herbe
#..............#   T tente initiale      B emplacement (ordre de lecture = index du coût)
#.T....B....B..#   W zone d'accueil      Q file (gauche = tête, index 0)
#..............#   E entrée/sortie       P départ joueur
#....RR....##..#
#....RR.....B..#   Porte (drop) d'une tente/emplacement = tuile (x, y+1), doit être de l'herbe.
#..............#
#..##..........#
#......P.......#
#......W.......#
#......QQQQQ...#
###########E####
```
Le parseur (core) lit la chaîne une fois dans `createInitialState` ; le layout est validé par test (cf. §6).

---

## 2. Changements d'état — `src/core/state.ts`

```ts
export type ResourceId = "wood" | "food" | "stone" | "water" | "coins";
export type Resources = Record<ResourceId, number>;      // entiers, 0..RESOURCES.cap
export interface Vec { x: number; y: number }            // unités entières (1 tuile = 1000)
export interface TilePos { tx: number; ty: number }
export type Tile = "grass" | "tree" | "rock";

export interface MapState {
  width: number; height: number;
  tiles: Tile[];               // index = ty * width + tx (statique)
  entrance: TilePos; welcome: TilePos; queueTiles: TilePos[]; // queueTiles[0] = tête
}
export interface PlayerState { pos: Vec; input: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } }

export type SurvivorStatus = "toQueue" | "queued" | "walkingToTent" | "resting" | "leaving";
export interface Survivor {
  id: number; pos: Vec; status: SurvivorStatus;
  path: TilePos[];             // tuiles restantes à parcourir (vide si arrivé)
  tentId: number | null;       // non-null ssi walkingToTent | resting
  restTicksLeft: number;       // > 0 seulement si resting
}
export type TentStatus = "free" | "assigned" | "occupied" | "messy";
export interface Tent {
  id: number; tile: TilePos; status: TentStatus;
  occupantId: number | null;   // non-null ssi assigned | occupied
  cleanProgress: number;       // 0..TENT.cleanTicks, significatif si messy
}
export interface Drop { id: number; pos: Vec; resource: "wood"; amount: number }
export interface BuildSlot {
  id: number; tile: TilePos; cost: number; paid: number; // 0 <= paid <= cost
  builtTentId: number | null;  // non-null ssi paid === cost
  payCooldown: number;         // ticks avant le prochain versement
}
export interface GameState {
  tick: number;
  rng: RngState;
  nextId: number;              // compteur d'ids unique (survivants, tentes, drops, slots)
  map: MapState;
  player: PlayerState;
  resources: Resources;
  queue: number[];             // ids des survivants en file, ordre = position
  survivors: Survivor[];       // triés par id
  tents: Tent[];               // triés par id
  drops: Drop[];
  buildSlots: BuildSlot[];
  spawnTimer: number;
  welcomeProgress: number;     // 0..WELCOME.ticks
  commandsThisTick: number;    // anti-spam, remis à 0 par tick()
}
```
Initial (`createInitialState(seed: number): GameState`) : `tick 0`, `rng = seedRng(seed)`, joueur au centre de `P`, `resources = STARTING_RESOURCES`, 1 tente `free` sur `T`, 3 slots (`paid 0`) sur les `B`, `spawnTimer = SURVIVOR.firstSpawnTicks`, file/drops/survivants vides.

**Migration de sauvegarde : non.** Aucun format de save n'existe (Jalon 2 non commencé). Cette forme deviendra la **v1** du format quand save-guardian démarrera le Jalon 2. Tout l'état est sérialisable JSON (pas de Map/Set/classe).

---

## 3. Commandes et systèmes — `src/core/commands.ts`, `src/core/tick.ts`

```ts
export type Command = { type: "setMoveInput"; dx: number; dy: number };
export type CommandError = "unknown_command" | "invalid_payload" | "rate_limited";
export type CommandResult = { ok: true; state: GameState } | { ok: false; error: CommandError; state: GameState };
export function applyCommand(state: GameState, cmd: Command): CommandResult; // ne mute jamais `state`
export function tick(state: GameState): GameState;                          // ne mute jamais `state`
```
`setMoveInput` : `dx`, `dy` doivent être des entiers ∈ {-1, 0, 1} (rejet de NaN, Infinity, 0.5, 2, non-number) → sinon `invalid_payload`. Idempotent. Au-delà de `LIMITS.maxCommandsPerTick` commandes depuis le dernier tick → `rate_limited`. Refus ⇒ état strictement identique (même référence).
Accueil, nettoyage, paiement, ramassage **ne sont pas des commandes** : ils découlent de la position du joueur, elle-même issue d'une commande validée (pas d'action « téléportée » possible).

Ordre de `tick()` (chaque système = fonction pure dans `src/core/systems/`) :
1. `tick += 1`, `commandsThisTick = 0`
2. `movePlayerSystem` — input → position, collisions, bornes.
3. `spawnSystem` — minuteur, file ≤ 5, RNG.
4. `survivorMoveSystem` — avance chaque survivant le long de `path` (déplacements axiaux entre centres de tuiles, `SURVIVOR.speed`, entiers exacts) ; met à jour la cible de file (`toQueue` → `queued`).
5. `survivorLifecycleSystem` — arrivée à la tente → `resting` ; fin de repos → `leaving` + drop + `messy` ; arrivée à `E` → suppression.
6. `welcomeSystem` — progression + attribution.
7. `cleaningSystem`.
8. `buildSystem`.
9. `pickupSystem`.

Pathfinding `src/core/path.ts` : BFS 4-voisins, ordre fixe N, E, S, W, sur tuiles non-obstacles ; renvoie `TilePos[] | null`. `null` ⇒ pas d'attribution (ne doit pas arriver, garanti par test de carte).
Sélecteurs `src/core/selectors.ts` (pour render/ui) : `playerTile`, `freeTentCount`, `queueLength`, `slotRemaining(slot)`, `isPlayerOn(state, tile)`.

---

## 4. Rendu / UI (lecture seule)

- `src/app/loop.ts` : `requestAnimationFrame`, accumulateur. `frameDelta = min(now - last, LOOP.maxFrameDeltaMs)` ; `while (acc >= tickMs && steps < LOOP.maxTicksPerFrame) tick()` ; si le plafond est atteint, l'excédent d'accumulateur est **jeté** (pas de rattrapage). `visibilitychange` → pause + `last = now` au retour. Garde `prevState` et `alpha = acc / tickMs` pour interpoler les positions (10 Hz sinon saccadé).
- `src/app/input.ts` : ZQSD + flèches (via `event.code` : KeyW/KeyA/KeyS/KeyD pour AZERTY/QWERTY), calcule dx/dy, envoie `setMoveInput` **uniquement quand la valeur change** ; relâche tout sur `blur`.
- `src/render/` : grille (herbe vert clair, arbre vert foncé, rocher gris), `E`/`W`/`Q` marqués au sol, joueur (cercle bleu), survivants (cercles orange ; gris si `leaving`), tentes (triangle : brun `free`, beige `occupied/assigned`, rouge `messy` + barre `cleanProgress/cleanTicks`), barre de repos au-dessus d'un `resting`, emplacements (carré pointillé + texte `paid/cost`), drops (petit carré marron + montant), barre `welcomeProgress` sur `W`. Caméra fixe, carte centrée et mise à l'échelle.
- `src/ui/hud.ts` : DOM, compteur bois, `file x/5`, tentes libres `n/total`. Ne fait que lire l'état.
- En dev (`import.meta.env.DEV`), l'app appelle `checkInvariants` après chaque tick et log en console.

---

## 5. Anti-triche — `src/core/invariants.ts`

`checkInvariants(state): string[]` (liste vide = OK), appelé dans tous les tests après chaque tick, et plus tard au chargement de save.
- Toutes les ressources : entiers, `0 ≤ r ≤ RESOURCES.cap`. Drops : entier sûr `amount ≥ 1` (pas de plafond au sol, cf. §1.4), au plus 1 drop par tuile.
- `queue.length ≤ QUEUE.maxLength` ; ids de la file uniques, existants, statut `toQueue|queued`.
- Tente : `occupantId !== null ⇔ status ∈ {assigned, occupied}` ; un survivant ne pointe que vers une tente qui le pointe en retour ; **aucun survivant n'est l'occupant de 2 tentes, aucune tente n'a 2 survivants** (`tentId` uniques parmi les survivants actifs).
- `0 ≤ cleanProgress ≤ TENT.cleanTicks` ; `0 ≤ welcomeProgress ≤ WELCOME.ticks`.
- Slot : `0 ≤ paid ≤ cost`, `builtTentId !== null ⇔ paid === cost`, chaque `builtTentId` unique et existant. Nombre de tentes = 1 + slots construits.
- Joueur : centre dans les bornes, hitbox sans chevauchement d'obstacle. Survivants dans la carte.
- Ids uniques globalement, tous `< nextId` ; `tick`, `spawnTimer` entiers ≥ 0.
- Conservation (test) : `wood_initial + Σ récompenses générées = wood + Σ drops + Σ paid`.

---

## 6. Tests (tests/core/)

- `state.test.ts` : état initial (1 tente, 3 slots, coûts, invariants OK) ; carte valide (dimensions, 1 seul P/W/E, 5 Q contigus, portes = herbe, tout atteignable depuis `E` par BFS).
- `commands.test.ts` : dx/dy valides ; rejets NaN/Infinity/0.5/2/string/type inconnu ; refus ⇒ même référence ; `rate_limited` au-delà du plafond puis OK après `tick()` ; spam de 1000 commandes ⇒ invariants OK.
- `movement.test.ts` : vitesse droite/diagonale, bord de carte, glissement contre obstacle, coin, input maintenu 1000 ticks contre un mur.
- `path.test.ts` : chemin le plus court, contournement du bloc `##`, cible inatteignable ⇒ null, résultat identique à chaque appel.
- `spawn.test.ts` : premier spawn à `firstSpawnTicks`, intervalle dans les bornes, file pleine ⇒ plus d'arrivée et RNG non consommé, reprise après départ de la tête.
- `welcome.test.ts` : attribution après `WELCOME.ticks`, aucune tente libre ⇒ rien, joueur qui sort ⇒ reset, tente de plus petit id choisie, tête pas encore arrivée ⇒ rien, un seul accueil par cycle.
- `lifecycle.test.ts` : marche → repos → départ, drop sur la porte, fusion de drops, tente `messy`, survivant supprimé en `E`.
- `cleaning.test.ts` : nettoyage complet, pause/reprise en sortant, tente occupée non nettoyable.
- `pickup.test.ts` : aimantation dans le rayon seulement, collecte, stock au plafond ⇒ reste au sol sans perte.
- `build.test.ts` : paiement progressif, ressources insuffisantes (paie partiellement, jamais négatif), sortie conserve `paid`, construction ⇒ nouvelle tente `free` utilisable, slot construit ne consomme plus, 0 bois ⇒ rien.
- `simulation.test.ts` : bot scripté (va sur W, puis tente messy, drops, slots) 3 000 ticks (5 min), seed fixe ⇒ `checkInvariants` vide à chaque tick, ≥ 1 tente construite, conservation du bois ; **déterminisme** : 2 runs même seed + mêmes commandes ⇒ `toEqual` ; seeds différentes ⇒ états différents ; état d'entrée jamais muté (`Object.freeze` profond en test).
- `loop-budget.test.ts` (delta énorme) : fonction pure `stepBudget(acc, frameDeltaMs): { steps, acc }` dans `src/core/loop-budget.ts` (utilisée par `src/app/loop.ts`). Cas : delta 10 min, négatif, NaN ⇒ `0 ≤ steps ≤ maxTicksPerFrame`, `0 ≤ acc < tickMs` ; delta normal 16 ms ⇒ cumul correct.

---

## 7. Constantes — `src/data/balance.ts` (fichier existant, à compléter)

```ts
export const WORLD = { unitsPerTile: 1000 } as const;
export const MAP_LAYOUT = [ /* les 12 lignes ci-dessus */ ] as const;
export const PLAYER = { speed: 400, diagonalSpeed: 283, halfSize: 350 } as const;      // unités/tick
export const SURVIVOR = { speed: 250, firstSpawnTicks: 20, spawnIntervalMin: 60, spawnIntervalMax: 100,
  restTicks: 150, woodReward: 8 } as const;
export const QUEUE = { maxLength: 5 } as const;
export const WELCOME = { ticks: 5 } as const;          // 0,5 s sur W
export const TENT = { cleanTicks: 30 } as const;       // 3 s
export const PICKUP = { magnetRadius: 1500, magnetSpeed: 500, collectRadius: 300 } as const;
export const BUILD = { slotCosts: [15, 25, 40], payIntervalTicks: 1, payPerStep: 1 } as const; // ×~1,6
export const RESOURCES = { cap: 9999 } as const;
export const LIMITS = { maxCommandsPerTick: 8 } as const;
export const LOOP = { tickMs: 100, maxFrameDeltaMs: 250, maxTicksPerFrame: 5 } as const;
```
`STARTING_RESOURCES.wood = 10` (existant) ⇒ premier slot atteint après 1 survivant. `TIME`, `SEASONS`, `OFFLINE` inchangés.

---

## 8. Découpage des tâches

| # | Agent | Tâche | Fichiers |
|---|---|---|---|
| 1 | balance-designer | Ajouter les constantes du §7 et `MAP_LAYOUT` | `src/data/balance.ts` |
| 2 | core-dev | Types + `createInitialState` + parseur de carte | `src/core/state.ts`, `src/core/map.ts` |
| 3 | core-dev | `path.ts` (BFS), `collision.ts`, `loop-budget.ts` | `src/core/` |
| 4 | core-dev | `applyCommand`, `tick` et 8 systèmes, `selectors.ts`, `invariants.ts` | `src/core/commands.ts`, `tick.ts`, `systems/*.ts` |
| 5 | core-dev | Tests unitaires au fil de l'eau (un fichier par système) | `tests/core/*.test.ts` |
| 6 | test-writer | `simulation.test.ts` (bot, 3000 ticks, invariants, déterminisme, conservation) + cas limites manquants | `tests/core/` |
| 7 | render-dev | Boucle à pas fixe (accumulateur, delta borné, pause onglet, interpolation), clavier, rendu formes, HUD, câblage `main.ts` | `src/app/`, `src/render/`, `src/ui/`, `src/main.ts`, `index.html` |
| — | save-guardian | **Rien pour l'instant** (pas de format de save). À noter : cette forme d'état = future v1. | — |

Dépendances : 1 → 2 → 3 → 4 → (6, 7 en parallèle). Mettre à jour `docs/ROADMAP.md` (cases Jalon 0 et Jalon 1 concernées) en fin de feature.

## 9. Points ouverts
- ~~Pas de script `lint`~~ Résolu : ESLint (typescript-eslint) ajouté avec l'accord de l'utilisateur, `npm run lint` tourne en CI (cf. §1.4).
- Vitest tourne avec `globals: true` (`vite.config.ts`) : les tests n'importent pas `describe/it/expect`, à conserver.
