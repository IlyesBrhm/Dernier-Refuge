# Design — 3D par défaut, cycle jour/nuit, feu de camp, sommeil (début du Jalon 4)

Statut : **implémenté** sur la branche `feature/day-night` (basée sur `feature/3d-test`). Ce document est aligné sur
le code (vérité : `src/data/balance.ts`, `src/core/`, `src/save/`, `src/render/daylight.ts`,
`src/render/three/config.ts`), sauf la **fermeture de l'accueil après un départ au froid** (§1.2, §10), décidée
par l'utilisateur et **à implémenter** (tâche 11).
Prolonge `core-loop.md`, `harvest.md`, `save.md` (§10) et `render-3d.md`.

Hors périmètre : saisons (seulement le compteur de jours), menaces, torches, gardes, palissade, chauffage
saisonnier, progression hors ligne, détection d'horloge trafiquée (§9, point 6).

---

## 0. Rendu : la 3D devient le mode par défaut

- `src/app/render-mode.ts` : `parseRenderMode(search)` renvoie `"2d"` **si et seulement si** `render` vaut `2d`
  (casse ignorée) ; tout le reste renvoie `"3d"`. Mode non persisté.
- Repli automatique en 2D inchangé : WebGL absent, modèles en échec, délai `LOADING.timeoutMs` (20 s) dépassé,
  contexte perdu non restauré en `LOADING.contextRestoreMs` (3 s).
- three reste dans un **chunk séparé** (import dynamique), jamais téléchargé avec `?render=2d`.
- Ombres : `sun.castShadow` et `fireSpot.castShadow` toujours vrais (§4.3) ⇒ shaders identiques jour et nuit.

### Textes hors de `docs/` (agent principal, avec l'accord de l'humain)
| Fichier | Changement |
|---|---|
| `CLAUDE.md` l.3 | « (gameplay sur grille 2D ; rendu 3D three.js par défaut, repli automatique en Canvas 2D, forçable avec `?render=2d`) » |
| `CLAUDE.md` Commandes | ajouter `npm run e2e` · `npm run captures` |
| `.claude/skills/three-render/SKILL.md` | remplacé par `docs/design/three-render-SKILL.new.md` |
| `docs/SPEC.md` | fait (architecte, fin de feature) |

---

## 1. Règles de jeu

### 1.1 Temps (tout se déduit de `state.tick`, aucun champ « heure »)
- `CYCLE_TICKS = TIME.dayTicks + TIME.nightTicks = 3600` (6 min). Dans `stepOnce`, `tick` est incrémenté
  **avant** les systèmes : tous lisent la **nouvelle** valeur.
- `cyclePos(t) = t mod CYCLE`. **Jour** ⇔ `cyclePos ∈ [0, 2400)`. **Nuit** ⇔ `cyclePos ∈ [2400, 3600)`.
- La partie commence au lever du jour (tick 0, aube rosée).
- Pas du **crépuscule** = tick `3600k + 2400` ; pas de l'**aube** = tick `3600n` (n ≥ 1). La nuit `n` couvre
  `[3600n − 1200, 3600n − 1]`.
- `dayIndex(t) = floor(t / CYCLE)` ; HUD « Jour `dayIndex + 1` ».
- Sous-phases **visuelles** (aucune règle) : `dawn [0, 300)` · `day [300, 2100)` · `dusk [2100, 2400)` ·
  `night [2400, 3600)` (`TIME.dawnTicks = TIME.duskTicks = 300`).

### 1.2 Nuit : plus d'arrivées ; accueil ouvert **seulement feu allumé**
- Tick de nuit : `spawnSystem` décrémente `spawnTimer` jusqu'à 0 puis s'arrête sans faire apparaître personne ni
  consommer le RNG. Au pas de l'aube, minuteur à 0 et file non pleine ⇒ arrivée immédiate.
- La file **n'est pas vidée** à la tombée de la nuit.
- **Accueil** : ouvert la nuit si le feu est allumé (une tente `free` est nécessaire). **Nuit ∧ `fire.wood === 0`
  ⇒ accueil suspendu** (`isWelcomeBlockedByCold`, `welcomeProgress` remis à 0, la file attend, W affiche
  « Feu éteint »). Décision utilisateur (ex-Q1). Le jour, un feu à 0 ne bloque rien.
- **Accueil fermé jusqu'à l'aube après un départ au froid** (décision utilisateur, option (a), §10) : la nuit, dès
  qu'un survivant est parti à cause du froid (`night.coldLeavers > 0`), l'accueil reste fermé **jusqu'à l'aube,
  même si le feu est rallumé**. Raison exposée par `welcomeBlockReason(state): null | "fireOut" | "coldLeavers"`
  (`"fireOut"` si nuit ∧ feu à 0, sinon `"coldLeavers"` si nuit ∧ `coldLeavers > 0`, sinon `null`). Aucun nouveau
  champ (`night` est remis à 0 au crépuscule), aucune migration.
- Nettoyage, construction, récolte et repousse : inchangés la nuit.

### 1.3 Sommeil
Statut **`sleeping`** : dans sa tente (centre, chemin vide), `tentId` non nul, tente `occupied`,
`restTicksLeft = 0`. N'existe **que la nuit, feu allumé**.
- `survivorLifecycle`, tick de nuit : un `resting` devient `sleeping` sans décompter ni payer (au crépuscule, tous
  d'un coup) ; un `walkingToTent` qui arrive devient directement `sleeping`.
- Le test de nuit passe **avant** le décompte : `restTicksLeft = 1` au tick 2399 ⇒ dort au 2400 sans payer ;
  repos fini au tick 2399 ⇒ paie 8 normalement.
- **Paiement à l'aube** (pas `3600n`) : tous les `sleeping` partent dans le même pas, ordre des ids, récompense
  `DAWN_REWARD = SURVIVOR.woodReward + SLEEP.dawnBonus` = **12** (« nuit au chaud ») déposée sur la porte (fusion
  avec un drop existant), tente `messy`, `cleanProgress = 0`, `leaving`, BFS vers `E`.
  `night.sleepersPaid += 1`, `night.woodEarned += 12`.
- Le jour, `resting` inchangé (décompte, 8 à la fin du repos).

### 1.4 Feu de camp
- Présent dès le départ en `F` (9,5), **ne se construit pas**, **obstacle permanent** (tuile `"fire"`).
- Réserve `fire.wood ∈ [0, FIRE.capacity]` (16). **Allumé** ⇔ `wood > 0`. Départ : `FIRE.initialWood` (10).
- **Combustion** (calendrier fixe, sans état) : le pas `t` brûle `burnPerStep` (1) si `wood > 0` et
  (jour ∧ `t mod 600 === 0`) ou (nuit ∧ `t mod 100 === 0`). Soit **3 combustions le jour 1** (600, 1200, 1800),
  4 par jour complet (dont le pas de l'aube), **12 par nuit** (2400 … 3500). `fire.burnedTotal` augmente du même
  montant ; la nuit, `night.woodBurned` aussi.
- **Alimentation** (aucune commande, tout découle de la position et de l'input) :
  - `fire.feedProgress` compte les ticks consécutifs où le joueur est sur une des **8 voisines** de `F`
    (Chebyshev = `feedRangeTiles` = 1) **et immobile** (`player.input = (0,0)`). Toute direction ou sortie de la
    zone ⇒ `feedProgress = 0`. Borné à `FIRE.feedDelayTicks` (5 = 0,5 s, comme l'accueil).
  - **Premier versement au tick où le délai est atteint**, puis 1 bois aux ticks multiples de
    `feedIntervalTicks` (2) tant qu'il reste arrêté. Transfert `min(feedPerStep, resources.wood, capacity − wood)`.
  - **Passer à côté du feu, même en diagonale, ou pousser contre lui ne verse rien.**
  - Feu plein ou stock vide : le délai reste acquis, rien n'est versé ; reprise sans nouveau délai.
- **Rallumage** : un feu à 0 alimenté repart dès le premier bois.
- Ordre dans le pas : **combustion, puis délai/alimentation** ⇒ un joueur posté au feu ne le laisse jamais à 0.

### 1.5 Froid (feu éteint la nuit)
- Chaque **tick de nuit** où, après combustion et alimentation, `fire.wood === 0` : **tous les `sleeping`** partent
  (`coldSystem`, ordre des ids) avec `COLD_REWARD = floor(SURVIVOR.woodReward / COLD.rewardDivisor)` = **2**
  (aucun drop si 0), tente `messy`, `leaving` + BFS vers `E`. `coldLeavers += 1`, `woodEarned += 2`.
- Crépuscule avec feu déjà à 0 : les `resting` s'endorment puis partent au même pas avec 2.
- Un `walkingToTent` (accueilli avant l'extinction) qui arrive feu éteint s'endort et repart **au même pas** avec 2 ;
  si le joueur rallume dans ce pas, il reste endormi. Jamais de `sleeping` en fin de pas de nuit feu à 0.
- Le jour, un feu éteint n'a aucun effet. `toQueue`, `queued`, `walkingToTent`, `leaving` non concernés.

### 1.6 Bilan de la nuit
- `night = { coldLeavers, sleepersPaid, woodEarned, woodBurned }`, remis à 0 au pas du crépuscule (`clock`, avant
  tout autre système). Bilan de la nuit `n` lisible de `3600n` à `3600n + 2399`.
- `woodEarned` = récompenses du froid (2) pendant la nuit + récompenses de l'aube (12).
  `woodBurned` = combustions des ticks de nuit seulement.
- Avant la première nuit : tout à 0, `nightReport = null`.

### 1.7 Carte : `MAP_LAYOUT` ligne 5 = `"#....RR..F..B..#"`
Seule différence avec l'ancienne carte. Vérifié par `tests/core/day-night-map.test.ts` : un seul `F` ; lignes 3
et 6 en herbe ; les 8 voisines (8..10, 4..6) en herbe, hors W/Q/E/P/T/B/portes, à Chebyshev ≥ 4 de tout nœud ;
tuiles fixes des tests non voisines ; longueurs BFS de référence identiques ; `nextId` initial inchangé.

---

## 2. Changements d'état

### 2.1 Forme (implémentée)
```ts
// src/core/state.ts
export type Tile = "grass" | "tree" | "rock" | "node" | "fire";
export type SurvivorStatus =
  "toQueue" | "queued" | "walkingToTent" | "resting" | "sleeping" | "leaving";
export interface MapState { /* … */ fire: TilePos }   // statique, NON sérialisé
export interface FireState {
  wood: number;          // 0..FIRE.capacity ; allumé ⇔ > 0
  burnedTotal: number;   // depuis le début de la partie
  feedProgress: number;  // 0..FIRE.feedDelayTicks ; > 0 ⇒ joueur dans la zone d'alimentation. SAUVEGARDÉ.
}
export interface NightStats {
  coldLeavers: number; sleepersPaid: number; woodEarned: number; woodBurned: number;
}
export interface GameState { /* … */ fire: FireState; night: NightStats }
```
- Initial : `fire = { wood: FIRE.initialWood, burnedTotal: 0, feedProgress: 0 }`, `night = emptyNightStats()`.
- `cloneState` copie `fire` et `night`. Parseur : exactement un `F`, `isObstacleAt` inclut `"fire"`.

### 2.2 Migration de sauvegarde : **oui, v1 → v2** (`CURRENT_VERSION = 2`, `src/save/migrate-v1.ts`)
Pure, sur `unknown`, sans muter l'entrée, sans rien réparer :
1. Non-objet ⇒ renvoyé tel quel ; `fire`/`night` déjà présents ⇒ `migration_failed` ; v1 mal formée
   (`validateSavedStateV1`) ⇒ renvoyée telle quelle ⇒ `bad_shape`.
2. Ajout `fire = { wood: FIRE.initialWood, burnedTotal: 0, feedProgress: 0 }` et `night` à 0.
3. **Sommeil** : tick de nuit ⇒ chaque `resting` valide devient `sleeping`, `restTicksLeft = 0` (feu migré à 10,
   donc « dormeur ⇒ feu allumé » tient) ; il paiera 12 à l'aube.
4. **Carte** (F devient obstacle) :
   - Joueur dont la hitbox (`±PLAYER.halfSize`) chevauche `F` : placé au centre de la voisine 4-connexe la plus
     proche (égalité : N, E, S, O), `input` conservé. **Un joueur au centre de `F` est donc décalé d'une tuile
     entière** (géométriquement inévitable : aucune position à moins d'une tuile n'est hors de `F` pour une
     hitbox centrée). **Écart accepté par l'utilisateur (décision validée).**
   - Survivant `toQueue`/`walkingToTent`/`leaving` sur `F` ou dont le chemin passe par `F` : trajet v1 vérifié
     (sinon refus), ancre = sa tuile (≤ ½ tuile) ou la voisine la plus proche s'il est sur `F` (≤ 1 tuile), BFS v2
     vers sa destination ; impossible ⇒ `migration_failed`.
   - Ressources, compteurs, ids, RNG, drops (même sur `F`) intacts.
5. Puis validation normale (forme v2 stricte + `checkInvariants`).

**Effet connu** : une v1 dont le tick tombe dans `[3600k, 3600k + 300)` (k ≥ 1, aube) affiche à la reprise un
**bilan de nuit à zéro** (« Nuit k terminée », tout à 0) : la v1 n'a pas de bilan à reconstituer. Accepté, sans
conséquence de jeu.

Fixtures : `v1-initial`, `v1-midgame` (gelées), `v2-initial`, `v2-night`, `v2-dawn`.

---

## 3. Commandes et systèmes

**Aucune nouvelle commande.** `Command` et `CommandError` inchangés.

### 3.1 `src/core/time.ts` (pur, O(1))
`CYCLE_TICKS`, `cyclePos`, `dayIndex`, `phase`, `isNight`, `isDawnTick`, `isDuskTick`, `nightStartTick`,
`lightPhase`, `isBurnTick`, `countBurnTicks(from, to)` (O(1), un tick `2^53 − 1` ne gèle rien).

### 3.2 Systèmes
- `helpers.departSurvivor(draft, s, reward)` : seul chemin de départ (fin de repos, aube, froid).
- `clock` : crépuscule ⇒ `night` à 0.
- `spawn` : blocage de nuit après décrémentation.
- `survivorLifecycle` : sommeil, paiement de l'aube (`DAWN_REWARD`).
- `welcome` : suspendu si `welcomeBlockReason(state) !== null` (nuit ∧ (feu à 0 ∨ `coldLeavers > 0`)) ;
  progression remise à 0.
- `fire` : combustion, puis délai d'immobilité, puis alimentation.
- `cold` : nuit ∧ feu à 0 ⇒ départ des dormeurs avec `COLD_REWARD`.

Ordre de `tick()` : 1. tick++, commandsThisTick = 0 ; 2. clock ; 3. movePlayer ; 4. spawn ; 5. survivorMove ;
6. survivorLifecycle ; 7. welcome ; 8. cleaning ; 9. build ; 10. nodeRegrow ; 11. harvest ; 12. fire ; 13. cold ;
14. pickup.

### 3.3 Sélecteurs (`selectors.ts`)
`clockInfo`, `fireRatio`, `isFireLit`, `isFireLow` (nuit ∧ `0 < wood ≤ 3`), `isFireOutAtNight`, `feedZone`,
`isFeedingFire`, `feedProgressRatio` (jauge d'arrêt), `welcomeBlockReason` (à ajouter ; `welcomeBlockedByCold`
devient `welcomeBlockReason(s) !== null`), `sleepersCount`, `nightReport`,
`DAWN_REWARD`, `COLD_REWARD`, ré-exports de `time.ts`.

---

## 4. Rendu / UI (lecture seule)

### 4.1 Courbes jour/nuit — `src/render/daylight.ts` (pur, testé)
`lightingAt(tickF)`, `p = cyclePos(prev.tick + alpha)`, images clés en smoothstep, couleurs converties en RVB
linéaire. Valeurs réelles (hex sRGB) :

| p | Ambiance | soleil (couleur, int.) | hémisphère ciel / sol, int. | fond | voile 2D | `fogTint` |
|---|---|---|---|---|---|---|
| 0 ≡ 3600 | fin de nuit | `#ff9e7a`, **0** | `#7a8cc4` / `#2e3a58`, 1.2 | `#34466e` | 0.55 | 0.3 |
| 150 | aube rosée | `#ffb38a`, 0.9 | `#f4c6d6` / `#6a5a5a`, 0.9 | `#e8b8c0` | 0.25 | 0.12 |
| 300 → 2100 | jour | `#fff1d6`, 2.0 | `#dff2ff` / `#7a9a4a`, 1.1 | `#a9d4a0` | 0 | 0 |
| 2250 | crépuscule orangé-rosé | `#ff8c6a`, 1.2 | `#ffb8a8` / `#6a4a50`, 0.8 | `#e89a88` | 0.2 | 0.18 |
| 2400 | tombée de la nuit | `#ff7a5a`, **0** | `#6a7cb8` / `#2a3450`, 1.1 | `#2c3e6a` | 0.55 | 0.3 |
| 2520 → 3480 | nuit bleutée | —, 0 | `#7d8fc8` / `#2e3a5a`, 1.25 | `#2f4272` | 0.6 | 0.32 |

- **Nuit bleutée lisible** : hémisphère bleu clair désaturé assez forte (silhouettes lisibles, l'herbe verte ne
  renvoie presque pas de bleu) + **brouillard teinté** : `fogTint` ≈ 0,3 = part de la couleur de fond mêlée au point
  visé (`stage.applyFog` : brouillard partant de la caméra quand `fogTint ≥ FOG.tintBlend` = 0,08, fondu depuis le
  brouillard de jour `FOG.near/far` = 30/60 m + `clearance` 12 m en dessous ; seuls `near`/`far` changent).
  Luminance visée feu éteint ≈ 35–50 % du jour.
- Poids : `sunWeight = sunIntensity / 2.0` ; `fireSpotWeight` = 0 sur `[0, 2400)`, montée smoothstep sur
  `[2400, 2460]`, 1, descente sur `[3540, 3600)` ; `fireGlowWeight = 0.35 + 0.65 (1 − sunWeight)` ;
  `playerLightWeight = 1 − sunWeight` ; `daylight = max(sunWeight, 0.25)` ;
  `shadowOwner = "fire"` sur `[2400, 3600)`, sinon `"sun"`.
- **Creux garanti à la bascule** (testé, non ajustable) : en p = 2400 et p = 0, `sunWeight = fireSpotWeight = 0` ;
  sur ±10 ticks, `sunWeight ≤ 0.02` et `fireSpotWeight ≤ 0.1`. Couleurs ajustables (présentation).
- `fireFlicker(nowMs)` : 3 sinus (±12 %), sans `Math.random` ; `stepLitFade` : 0 ↔ 1 en 0,5 s.

### 4.2 Stage 3D
`stage.setLighting(l)` : soleil (couleur, intensité, direction), hémisphère, fond, brouillard teinté,
`library.setDaylight(l.daylight)`, bascule d'ombres.

### 4.3 Lumières (`FIRE_LIGHT`, nombre constant, seules les intensités changent)
- Une seule passe d'ombre active : `shadow.autoUpdate` suit `shadowOwner` (`fireSpot` seulement si feu allumé) ;
  `needsUpdate = true` une fois à la bascule et au `reset()`.
- `fireSpot` : `SpotLight` **orange franc `#ff7034`**, 2,4 m au-dessus du feu, angle 1,2, penumbra 0,6, decay 2,
  carte 512 (pointeur grossier) / 1024, portée `lerp(6, 16, ratio)` m, intensité max 32 × `fireSpotWeight` ×
  `litFade` × `flicker`. (Plus rouge que la lueur : un orange-jaune devenait jaune-vert sur l'herbe.)
- `fireGlow` : `PointLight` `#ff8a3a` sans ombre, à **1,3 m**, portée `lerp(3, 8, ratio)`, max 4.
- `playerLight` : `PointLight` blanc chaud `#ffe8d0`, 2 m au-dessus du joueur, portée 4 m, max **2**
  × `playerLightWeight` (0,8 était trop faible avec decay 2).

### 4.4 Feu de camp 3D (`views/fire-view.ts`)
- `FireItem { ratio (interpolé), lit, low, feeding }` ; foyer `survival/campfire-pit` (~0,8 tuile) teinté
  `firePitTint #b09a8c`, sans ombre projetée.
- Flammes : `THREE.Points` 24 particules (additif, 1 draw call), hauteur `lerp(0.5, 1.4, ratio)` m ; feu éteint :
  6 particules de fumée. Braises émissives (`#ff5a1a`, éteint `#3a3634`).
- **Tuile du feu : disque de cendres** (`fireAsh #3a342f` au centre → `fireEarth #54442f` → fondu dans l'herbe,
  16 segments, couleurs par sommet du sol, 0 draw call en plus) ; aucune touffe d'herbe sur `F`.
- Calque 2D : barre du feu (`#ff9a3c` / faible `#e53935` / éteint `#8a8a8a`) si joueur dans la zone ou `low` ;
  **jauge d'arrêt** (`feedProgressRatio`, `#ffd23f`) au sol devant le feu.
- Bûche volante joueur → feu à chaque bois versé.

### 4.5 Tentes, sommeil, textes
- Désordre : toile affaissée (y 0,55, x 1,1, 10°, `#b89a7a`) + `survival/bedroll` devant la porte.
- Tente d'un dormeur : bulle « Zz » au lieu de la barre de repos ; survivant `sleeping` masqué.
- Départ `sleeping → leaving` : de nuit « **Froid ! +2** » bleuté ; de jour (aube) « **+12** » doré.
- Accueil suspendu : « Feu éteint » sur le tapis W (3D et 2D) si `"fireOut"` ; « Fermé jusqu'à l'aube » si
  `"coldLeavers"`.

### 4.6 Cadrage portrait de la file — `render/three/framing.ts`
`portraitFraming(input, baseTilesWide)` (pur, testé) : file non vide et joueur à Chebyshev ≤ 2 de W ⇒ décalage x
vers la file (tête incluse, puis le plus de places occupées), joueur à ≥ 0,75 tuile du bord, +1 tuile de largeur ;
effet effacé linéairement entre 2 et 3 tuiles. Paysage inchangé. Critère 390×844 : joueur sur W, file pleine ⇒
places 0 à 3 visibles.

### 4.7 HUD (`src/ui/hud.ts`) et bilan (`src/ui/dawn-report.ts`)
- « Jour N » + icône soleil/lune ; jauge « Feu » `role="meter"` (`aria-valuenow`, `aria-valuemax = 16`,
  `aria-valuetext` « … faible / éteint »), texte `w/16`, classes `is-low` / `is-out`.
- La nuit : « Dormeurs : n ».
- Alerte `role="status"`, `aria-live="polite"` (mise à jour si le texte change) : « Le feu faiblit — n dormeurs
  risquent de partir » (ou « Le feu faiblit ») ; `"fireOut"` : « Le feu est éteint — accueil suspendu » ;
  `"coldLeavers"` (feu rallumé) : « Le froid a fait fuir des survivants : plus personne ne viendra cette nuit ».
- Panneau `#dawn-report` tant que `light === "dawn"` et `nightReport ≠ null`, une fois par nuit, bouton « Fermer » :
  « Nuit N terminée — Payés à l'aube : P — Partis à cause du froid : C — Bois gagné : +E — Bois brûlé : B ».

### 4.8 Rendu 2D de secours (`renderer.ts`)
Tuile feu + `drawFire` (flamme ∝ ratio ou braises), dormeurs « z », « Feu éteint » sur W ; voile de nuit
`rgba(10, 18, 48, overlay2D)` percé (`destination-out`) au feu et au joueur.

---

## 5. Anti-triche — invariants (`src/core/invariants.ts`)
- **Feu** : `fire.wood` entier dans `[0, 16]` ; `burnedTotal` entier dans `[0, countBurnTicks(1, tick)]` ;
  `feedProgress` entier dans `[0, FIRE.feedDelayTicks]` et **`feedProgress > 0` ⇒ joueur dans la zone
  d'alimentation** (l'input n'est pas contraint : une commande a pu le changer avant le tick).
- **Statuts** : `sleeping` ⇒ nuit ∧ `fire.wood > 0` ∧ dans sa tente ; `resting` ⇒ jour ; `restTicksLeft = 0` hors
  `resting` ; `tentId` / tente `occupied` cohérents avec `resting | sleeping`.
- **Bilan `night`** (entiers ≥ 0) : tout à 0 si `tick < 2400` ;
  **`woodEarned ≤ coldLeavers × 2 + sleepersPaid × 12`** — **borne supérieure** (décision utilisateur, ex-Q3) :
  égalité en jeu honnête, mais changer plus tard `woodReward`/`dawnBonus`/`rewardDivisor` à la baisse invaliderait
  des saves, à la hausse non ; nuit ⇒ `sleepersPaid = 0` et `woodBurned ≤` combustions de la nuit en cours ; jour
  ⇒ `sleepersPaid ≤ tents.length`, `woodBurned ≤ 12` ; `woodBurned ≤ burnedTotal` ;
  `coldLeavers + sleepersPaid < nextId`.
- **Carte** : tuile `"fire"` dans la carte de référence, feu non déplacé ; personne sur `F`.
- **Plausibilité bois** : `heldTotal` ajoute `fire.wood + fire.burnedTotal` ; `plausibleMax` ajoute
  `FIRE.initialWood`. `PLAUSIBILITY` inchangé.
- **Conservation stricte** (tests, chaque tick) : le bois versé au feu reste compté (réserve + brûlé) :
  `wood + Σdrops(wood) + Σpaid + fire.wood + fire.burnedTotal = START.wood + FIRE.initialWood
  + 8 × fins de repos + 12 × payés à l'aube + 2 × départs au froid + Σyields(tree)`.
- **Forme v2** (`schema.ts`) : `sleeping` ; `fire: { wood, burnedTotal, feedProgress }` ; `night` à 4 clés ;
  clés strictes.
- **Bornes vérifiées au chargement** (commentées dans `src/data`) : `FIRE.capacity`, `*BurnIntervalTicks`,
  `feedDelayTicks`, `SURVIVOR.woodReward`, `SLEEP.dawnBonus`, `COLD.rewardDivisor`.

---

## 6. Tests

### 6.1 `tests/core/` (implémentés)
- `time.test.ts` : phases aux bornes, `dayIndex`, `isDawnTick(0) = false`, `countBurnTicks` = boucle naïve.
- `spawn-night.test.ts` : aucune arrivée sur `[2400, 3599]`, minuteur gelé, RNG identique ; arrivée au 3600 ; file
  conservée ; file pleine à l'aube ⇒ rien.
- `sleep.test.ts` : `DAWN_REWARD = 12` ; au pas 2400 les `resting` s'endorment sans payer ; 2399/2398 ;
  arrivée de nuit ⇒ `sleeping` ; aucun départ la nuit feu allumé ; **test utilisateur** : 2 dormeurs (T et B0),
  joueur posté au feu ⇒ ils paient **12 chacun au 3600, au même pas** (`sleepersPaid: 2`, `woodEarned: 24`) ;
  ordre des ids, fusion de drops ; toutes les tentes en désordre à l'aube ; repos de jour inchangé (8).
- `fire.test.ts` : présent en (9,5), réserve 10 ; sans joueur : **3 combustions le jour 1, `wood = 7` au tick
  2399, `wood = 0` au tick 3000 exactement** ; `burnedTotal`/`woodBurned` ; jamais négatif ; RNG intact ;
  rien à distance 2 ; arrêts (plein, stock vide) ; feu à 1 + combustion + alimentation ⇒ jamais éteint ;
  rallumage ; **tests utilisateur : passer à côté (ligne 6, diagonale par (8,4), deux sens) ne verse rien ; pousser
  contre le feu ne verse rien** ; arrêt : 4 ticks rien, le 5e verse, puis 1 bois / 2 ticks (deux parités) ; bouger
  remet le délai à 0 ; joueur poussé 1000 ticks : jamais sur `F`.
- `cold.test.ts` : `COLD_REWARD = 2` ; 3 dormeurs ⇒ partent au même pas, 2 sur chaque porte ; feu > 0 ⇒ rien ;
  jour ⇒ rien ; crépuscule feu à 0 ⇒ départ au 2400 avec 2 ; arrivé après l'extinction ⇒ repart au même pas, sauf
  rallumage au même pas ; statuts non concernés ; **accueil** : suspendu nuit ∧ feu à 0, ouvert feu allumé, ouvert
  le jour feu à 0, repris après rallumage (commandes seulement).
- `dawn-report.test.ts` : remis à 0 au 2400 ; figé 3600–5999 ; remplacé au 6000 ; `nightReport`.
- `selectors-day-night.test.ts`, `invariants-day-night.test.ts` (un cas par invariant, `feedProgress`, borne
  supérieure de `woodEarned`, tick `2^53 − 1`), `day-night-map.test.ts`.

### 6.2 Simulation et équilibrage (`day-night-simulation.test.ts`, `balance.test.ts`)
- Bots attentif / ignorant, plusieurs seeds, invariants + conservation à chaque tick :
  (1) attentif : feu jamais éteint la nuit, 0 départ au froid, ≥ 1 payé par aube, 12 brûlés par nuit ;
  (2) ignorant (traverse la zone sans s'arrêter, 0 versé) : extinction au **3000** la nuit 1, puis dès le
  crépuscule, 0 payé à l'aube ; (3) **T = 2, 3, 4 : net attentif > net ignorant chaque nuit** ;
  (4) 3 emplacements construits avant la 1re nuit ; bois net global attentif > ignorant ;
  (5) part versée au feu > 0 et ≤ 50 %. **À ajouter (tâche 11)** : bot **mixte** (laisse s'éteindre vers le
  milieu de la nuit, nettoie, rallume, tente d'accueillir) ⇒ accueil refusé jusqu'à l'aube et, pour T = 2, 3, 4,
  net attentif > net mixte chaque nuit (entretenir le feu reste la meilleure stratégie). Déterminisme (même seed ⇒ même état ; seeds différentes ⇒ différents).
- `balance.test.ts` : divisibilités, `initialWood ≤ capacity`, `lowWood < capacity`,
  `feedDelayTicks` < traversée de la zone, `rewardDivisor ≥ 1`, `dawnBonus ≥ 0`,
  `initialWood − burns(jour 1) = burns([2400, 3000])`, `capacity > burns(nuit)`.

### 6.3 `tests/save/`
Migrations (fixtures v1, v1 synthétiques : joueur sur `F`, survivants traversant `F`, `resting` de nuit ⇒
`sleeping` qui paie 12 au 3600, clés en trop, v1 malformée), fixtures v2 (`initial`, `night`, `dawn`), codec et
`tampered-resigned` (`fire.wood = 999`, `feedProgress` hors bornes ou hors zone, `woodEarned` gonflé, `sleeping`
de jour…), rechargements autour de 2400 / 3600, fuzz.

### 6.4 Rendu
Vitest : `lightingAt` (périodique, continu, creux, `shadowOwner`), `buildScene`, `portraitFraming`,
`static-layout`, `render-mode`. Playwright : 3D par défaut, `?render=2d` sans three, budgets draw calls / triangles,
captures jour / crépuscule / nuit allumé / nuit éteint / aube + portrait.

---

## 7. Constantes — `src/data/balance.ts` (valeurs réelles)
```ts
FIRE = { capacity: 16, initialWood: 10, dayBurnIntervalTicks: 600, nightBurnIntervalTicks: 100,
         burnPerStep: 1, feedIntervalTicks: 2, feedPerStep: 1, feedRangeTiles: 1,
         feedDelayTicks: 5, lowWood: 3 }
COLD  = { rewardDivisor: 4 }   // froid : floor(8 / 4) = 2
SLEEP = { dawnBonus: 4 }       // aube : 8 + 4 = 12
TIME  = { …, dawnTicks: 300, duskTicks: 300 } // présentation seulement
```
- **Feu ignoré** : 10 − 3 = 7 au crépuscule, 7 combustions sur `[2400, 3000]` ⇒ 0 au tick **3000** (milieu exact
  de la nuit) ; alerte « faiblit » (≤ 3) au tick 2700, 30 s avant. Feu plein au crépuscule (16 > 12) ⇒ toute la
  nuit avec 4 de marge ; plein en ≈ 3 s d'arrêt.
- **Coût** : 13 à 16 bois par cycle (12 de nuit + 1 à 4 brûlés le jour suivant).
- **Contrainte obligatoire (utilisateur)** : **entretenir le feu doit rapporter plus que le laisser mourir, dès
  2 tentes, chaque nuit.** Théorie (nuit stabilisée, accueil suspendu feu éteint) : entretenu = 12T − coût ;
  laissé mourir = 2T. T = 1 : −4 < 2 (voulu).
- **Bilans par nuit mesurés** (simulation, net attentif vs ignorant) : **T = 2 : 8 vs 4 ; T = 3 : 20 vs 6 ;
  T = 4 : 32 vs 0–8**.
- **Décision utilisateur** : le coût du feu (~5 % du bois produit) est accepté tel quel ; il sera rééquilibré à
  l'arrivée des loups, en conservant la contrainte ci-dessus.

---

## 8. Découpage des tâches (état)

| # | Agent | Tâche | État |
|---|---|---|---|
| 1 | balance-designer | `TIME`, `FIRE`, `COLD`, `SLEEP`, `MAP_LAYOUT` (`F`) | fait |
| 2 | core-dev | temps, carte, `sleeping`, `fire`/`night`, systèmes, sélecteurs, invariants, tests §6.1 | fait |
| 3 | save-guardian | v2, `migrate-v1.ts`, schéma, fixtures v2, tests §6.3 | fait |
| 4 | test-writer | §6.2, §6.3 (reload, fuzz, tampered), §6.4 Vitest | fait |
| 5 | balance-designer | réglage `FIRE`/`COLD`/`SLEEP` jusqu'au vert | fait |
| 6 | render-dev | 3D par défaut, `daylight.ts`, lumières, feu, tentes, textes, cadrage, HUD, bilan, 2D | fait |
| 7 | test-writer | E2E + captures | fait |
| 8 | agent principal | liste blanche, assets, `CREDITS.md`, `CLAUDE.md`, SKILL (avec accord) | voir §0 |
| 9 | reviewer | revue | fait (exploit mixte relevé, §10) |
| 10 | architecte | `SPEC.md`, `ROADMAP.md`, ce document | fait |
| 11a | core-dev | `welcomeBlockReason`, règle dans `welcome.ts`, tests `cold.test.ts` (scénario de l'exploit, réouverture à l'aube, nuit sans départ au froid inchangée) | à faire |
| 11b | render-dev | message HUD « Le froid a fait fuir… », libellé W « Fermé jusqu'à l'aube » (3D + 2D) | à faire |
| 11c | test-writer | bot mixte (§6.2) ; simulation toujours verte | à faire |

---

## 9. Décisions de l'utilisateur
1. Forme de l'état (§2.1), y compris `fire.feedProgress` sauvegardé.
2. Plus d'arrivées la nuit ; sommeil jusqu'à l'aube, paiement au matin (12) ; froid = départ avec 2.
3. **Accueil suspendu la nuit feu éteint** (ex-Q1).
4. Alimentation après 0,5 s d'immobilité (passer à côté ne verse rien).
5. `woodEarned` = **borne supérieure** (ex-Q3), conservation stricte (feu + brûlé).
6. Coût du feu ~5 % accepté, à rééquilibrer avec les loups ; contrainte « entretenir > laisser mourir dès 2 tentes ».
7. Migration v1 → v2 ; `campfire-pit` + `bedroll` livrés, `tent-canvas-half` retiré ; une ombre à la fois.
8. Horloge trafiquée : rien à détecter ici (l'heure vient du tick).
9. Rush de nettoyage à l'aube (ex-Q2) : voulu.
10. Migration : un joueur au centre de `F` est décalé d'une tuile entière (§2.2) — **accepté**.
11. Exploit mixte : **option (a)**, accueil fermé jusqu'à l'aube après un départ au froid (§10).

---

## 10. Règle — accueil fermé jusqu'à l'aube après un départ au froid (décision utilisateur, option (a))

**Origine** (revue, 4 tentes) : laisser le feu s'éteindre vers le milieu de la nuit (4 départs au froid, 4 × 2 = 8),
nettoyer, rallumer, accueillir 4 survivants qui paient 12 à l'aube (48) ⇒ **56 contre 48** pour une nuit
entretenue. La suspension « feu éteint » seule ne suffisait pas : le joueur rallume avant d'accueillir.

**Règle** : la nuit, **dès qu'un survivant est parti à cause du froid, l'accueil reste fermé jusqu'à l'aube, même
si le feu est rallumé**.
- Core : `welcomeBlockReason(state): null | "fireOut" | "coldLeavers"` ;
  `"fireOut"` ⇔ nuit ∧ `fire.wood === 0` (prioritaire) ; `"coldLeavers"` ⇔ nuit ∧ `night.coldLeavers > 0` ;
  sinon `null`. `welcome` ne progresse que si `null`. Aucun nouveau champ (`night` remis à 0 au crépuscule),
  aucune migration, aucun nouvel invariant (le blocage est dérivé de l'état).
- Effet de bord assumé : les `walkingToTent` déjà accueillis avant le départ au froid continuent normalement.
- UI : alerte HUD « **Le froid a fait fuir des survivants : plus personne ne viendra cette nuit** » ; tapis W
  « Fermé jusqu'à l'aube » ; « Feu éteint » reste affiché pour `"fireOut"`.
- Tests : `welcomeBlockReason` aux trois cas et à l'aube (`null`) ; scénario de l'exploit ⇒ accueil refusé après
  rallumage, total de la nuit < nuit entretenue ; nuit sans départ au froid inchangée ; **bot « mixte »** (§6.2) :
  entretenir le feu reste la meilleure stratégie pour T = 2, 3, 4.
