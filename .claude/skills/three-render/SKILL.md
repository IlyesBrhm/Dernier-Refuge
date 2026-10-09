---
name: three-render
description: Rendu 3D three.js du jeu (3D par défaut, ?render=2d / repli 2D) - caméra perspective inclinée sans lacet, base visuelle KayKit (Forest + Adventurers) et Kenney Survival (tentes, feu de camp, sac de couchage), liste blanche d'assets livrés, catalogue, chargeur, animations, échelles, instancing, buildScene pur, cycle jour/nuit (lightingAt, setLighting, bascule des ombres soleil/feu), lumière du feu et du joueur, flammes en particules, calque 2D superposé, cadrage portrait, mémoire, repli 2D, tests e2e. À charger avant toute modification de src/render ou pour intégrer un modèle 3D.
---
<!-- Remplace tel quel .claude/skills/three-render/SKILL.md (aligné sur docs/design/render-3d.md et docs/design/day-night.md). -->

# Rendu 3D & assets

Plans de référence : `docs/design/render-3d.md` (base) et `docs/design/day-night.md` (jour/nuit, feu, sommeil).
En cas de doute, ces plans font foi.

## Statut : 3D par défaut
- Le rendu **3D three.js** est le rendu par défaut (`/`).
- `?render=2d` (insensible à la casse) force le **Canvas 2D** (`src/render/renderer.ts`). `parseRenderMode` dans
  `src/app/render-mode.ts` renvoie `"2d"` si et seulement si `render` vaut `2d` ; tout le reste ⇒ `"3d"`. Le mode
  n'est ni sauvegardé ni mis dans `localStorage`.
- La 2D est aussi le **repli automatique** (WebGL absent, modèles en échec, délai de 20 s, contexte perdu).
- `src/main.ts` charge la 3D par **import dynamique** : `await import("./render/three")` puis
  `createRenderer3D(canvas, { coarsePointer, onProgress, onContextLost })`. Vite en fait un chunk séparé : avec
  `?render=2d`, ni le chunk three ni aucun `.gltf` n'est téléchargé (vérifié en e2e).
- **`three` uniquement dans `src/render/three`, `src/render/assets` et `tools/`** (règle ESLint
  `no-restricted-imports`). Jamais dans `src/core`, `src/app`, `src/ui`, ni ailleurs dans `src/render`.

## Assets (tous CC0)
| Pack (`AssetPack`) | Contenu | Statut |
|---|---|---|
| `forest` — KayKit Forest | arbres, arbres nus, buissons, rochers, herbe (low-poly, 1 atlas) | **Base visuelle, livré** (sous-ensemble) |
| `characters` — KayKit Adventurers | 6 personnages skinnés (Barbarian, Knight, Mage, Ranger, Rogue, Rogue_Hooded) | **Livré** sauf Barbarian (Knight = joueur ; Mage, Ranger, Rogue, Rogue_Hooded = survivants) |
| `animations` — KayKit Adventurers | 2 fichiers de clips Rig_Medium (squelette + clips, sans mesh) | **Livré**, clips filtrés |
| `survival` — Kenney Survival Kit | tentes, feux, palissades, établis, coffres, outils… | **Livré : `tent-canvas`, `campfire-pit`, `bedroll`** (`tent-canvas-half` et `tent` non livrés) |
| `items` — KayKit Adventurers | haches, épées, boucliers, chopes… | Aperçu seulement, non livré |
| `nature` — Stylized Nature MegaKit (Quaternius) | arbres, pins, buissons, rochers, fleurs | Aperçu seulement, non livré |
| `creatures` — Wolf (Quaternius) | loup skinné, 12 clips | Aperçu seulement, non livré (menaces, plus tard) |

### Liste blanche et deux dossiers de sortie
- **`tools/shipped-assets.json`** : ids livrés + filtre de clips des 2 fichiers d'animation.
- `npm run assets` (`tools/build-assets.mjs`) :
  - conversion **complète** dans `assets-all/assets/<pack>/` (**gitignoré**, local, servi par `vite dev` pour
    `tools/asset-preview`) ;
  - écrit **d'abord** le **seul sous-ensemble livré** (+ `.bin`, textures référencées, `LICENSE.txt`, animations
    réduites aux clips gardés) dans `assets-all/.shipped-staging/<pack>/` ;
  - **ne remplace `public/assets/` et le catalogue qu'en cas de succès complet** : sources présentes, liste blanche
    entièrement résolue (ids et clips), total livré ≤ **4 Mo** (cible ≤ 2,5 Mo, total affiché). Sinon échec
    explicite, `public/assets/` et catalogue existants intacts. `public/assets/` est **versionné** et finit dans
    `dist/` ;
  - état visé : **19 modèles** (18 − `tent-canvas-half` + `campfire-pit` + `bedroll`), taille à relever après
    `npm run assets` et à reporter ici ;
  - `npm run assets:size` vérifie seulement la taille de `public/assets/` (≤ 4 Mo), sans reconvertir (CI).
- **Catalogue typé** `src/render/assets/asset-catalog.ts` (généré) : `ASSETS["survival/tent-canvas"]` →
  `{ pack, name, kind, category, usage, url, size, clips, shippedClips, shipped }` (`shippedClips` = clips
  réellement livrés ; le renderer ne joue que ceux-là), `ASSETS_BY_CATEGORY`, `PACKS`, `SHIPPED_IDS` et le type
  **`ShippedAssetId`**. Ids de la forme `"<pack>/<nom>"`.
- Dans `src/render/three/config.ts`, toute référence à un modèle est typée `ShippedAssetId` : référencer un modèle
  non livré est une **erreur de compilation**.
- **Ajouter un modèle au jeu** : `tools/shipped-assets.json` → `npm run assets` → vérifier la taille → `CREDITS.md`
  (colonne « Livré dans le jeu »). Fichiers protégés ⇒ agent principal avec accord de l'humain.
- **Ajouter un pack** : l'humain le place dans `assets-src/`, le déclare dans `PACKS` de `tools/build-assets.mjs`,
  puis `npm run assets`.

### Chargeur
`src/render/assets/asset-loader.ts` : `createAssetLibrary(baseUrl?)` (jeu : `/assets/` ; aperçu : `/assets-all/`) →
- `load(ids, onProgress?)` : précharge (écran de chargement) ;
- `create(id)` : copie mise à l'échelle, squelette cloné pour les modèles animés ;
- `clips(id)` : clips d'animation ;
- `meshes(id)` : pour l'instancing ;
- `attach(perso, objet, "handslot.r")` : accessoire en main ;
- `setDaylight(0..1)` (appelé par `stage.setLighting` avec `lighting.daylight`) et `dispose()`.

### Aperçu
`npm run dev` puis `/tools/asset-preview/?pack=forest` : montre **tous** les packs (depuis `assets-all/`), y compris
les non livrés. Survoler un modèle affiche id, catégorie, usage.

## Correspondance gameplay → modèles (livrés)
| Élément | Modèle(s) |
|---|---|
| Sol | procédural : `PlaneGeometry` carte + marge, couleurs par sommet (1 draw call) ; tuile `F` teinte « terre battue » |
| Tapis accueil / file / entrée | procédural : plans à y = 0,02 + `CanvasTexture` (`ground-labels.ts`) |
| Arbres de bordure `#` + anneau hors carte | `forest/Tree_1_A_Color1`, `Tree_2_A_Color1`, `Tree_4_A_Color1` en `InstancedMesh` |
| Rochers `R` | `forest/Rock_3_A_Color1`, `Rock_3_C_Color1` (instance ×3) |
| Touffes d'herbe | `forest/Grass_1_A_Color1`, `Grass_2_A_Color1` (≤ 2 par tuile libre, aucune sur `F`) |
| Arbre récoltable prêt / épuisé | `forest/Tree_3_A_Color1` / souche procédurale + pousse `Tree_3_A` à l'échelle `0,15 + 0,45 × regrow` |
| Buisson prêt / vide | `forest/Bush_2_A_Color1` (×4) + baies procédurales instanciées / même modèle, clone de matériau désaturé |
| Tente libre | `survival/tent-canvas` teintée vert clair + liseré vert |
| Tente assignée | `survival/tent-canvas` teintée vert clair + liseré jaune pulsé |
| Tente occupée (repos, jour) | `survival/tent-canvas` couleurs d'origine + barre de repos |
| Tente occupée (dormeur, nuit) | `survival/tent-canvas` couleurs d'origine + bulle « Zz » animée (calque 2D), pas de barre (`TentItem.sleeping`, `restRatio = null`) |
| Tente en désordre | `survival/tent-canvas` **affaissée** (échelle y 0,55, x 1,1, inclinaison 10°, clone de matériau sali ×0,7 teinté `#b89a7a`) + `survival/bedroll` de travers devant la porte + « ! » et barre de nettoyage |
| Emplacement de construction | procédural : contour pointillé + anneau `RingGeometry` + `setDrawRange` |
| Feu de camp | `survival/campfire-pit` (~0,8 tuile, `castShadow = false`) + flammes en particules + braises émissives (voir « Feu de camp ») |
| Joueur | `characters/Knight` + anneau cyan au sol (`COLORS3D.playerRing = 0x3fd4ff`, reçoit l'ombre, 1 draw call) + `playerLight` |
| Survivants | `characters/Mage`, `Ranger`, `Rogue`, `Rogue_Hooded` × 5 teintes `[0xffffff, 0xffd6a5, 0xbde0fe, 0xcaffbf, 0xffadd6]` = 20 variantes ; `v = hash32(id) % 20`, modèle `v % 4`, teinte `floor(v / 4)` ; `resting` et `sleeping` : masqués |
| Butin / drops bois, nourriture | procédural (bûches, grappe de baies) ; bûche volante joueur → feu à chaque bois versé |

## Échelle
1 tuile = `WORLD.unitsPerTile` unités du core = **2 m** (`TILE_METERS` dans `src/render/three/config.ts`).
`x3d = (x / unitsPerTile) * TILE_METERS`, `z3d = (y / unitsPerTile) * TILE_METERS` : l'axe Y du core devient Z ;
Y 3D vers le haut.

`PACK_SCALE` dans le chargeur ramène les packs à cette grille (humain ≈ 1,8 m, tente ≈ 1 tuile, loup ≈ 1,7 m),
vérifié dans l'aperçu. Pour un ajustement ponctuel (rochers ×3, buissons ×4, foyer ×0,8), modifier l'échelle de
l'instance, pas la constante.

## Architecture du renderer
- **Interface inchangée** `Renderer { onTick, draw(prev, curr, alpha), reset, dispose? }`. `src/app/game.ts` ne
  change pas. `src/app/render-host.ts` (`createRenderHost(initial)` + `swap(next)`) permet le repli à chaud.
- **Deux canvas** : le renderer 3D crée son `<canvas class="webgl">` dans `#app` **avant** `#game` (même boîte,
  `pointer-events: none`). `#game` reste au-dessus comme **calque 2D transparent** (`alpha: true`) pour barres,
  coûts, textes, bulles. En mode 3D, ne jamais appeler `createRenderer` (2D) avant le 3D.
- **Fonction pure `buildScene(prev, curr, alpha): SceneFrame`** dans `src/render/three/scene-model.ts`, **sans
  import de three** (comme `config.ts`, `hash.ts`, `src/render/daylight.ts`), testée sous Vitest/node. Items
  (`player`, `survivor:id`, `node:id`, `tent:id`, `slot:id`, `drop:id`, `fire`) en mètres, interpolés via
  `interpolate.ts`, ratios partagés avec la 2D (`src/render/ratios.ts`). `SceneFrame` porte aussi
  `lighting: Lighting` et `framing` (cadrage portrait). `buildStaticLayout(map)` calcule le décor une fois par
  carte. Ne mute jamais ses entrées, ne lit pas l'horloge, pas de `Math.random`.
- `FireItem { key: "fire"; type: "fire"; x; z; ratio; lit; low; feeding }` (`ratio` interpolé) ;
  `TentItem.sleeping: boolean`.
- **Réconciliation** (`reconcile.ts`) : `Map<SceneKey, View>` créée / mise à jour / retirée à chaque `draw`, pools
  par type (12 personnages, 8 drops). Chaque `draw` : `buildScene` → `stage.setLighting(frame.lighting)` →
  `reconcile` → mixers → caméra → `render` → overlay.
- **Le rendu lit l'état sans jamais le modifier** ; aucune règle de jeu ici. Les transitions sont détectées par la
  vue en mémorisant l'état précédent : nœud qui repousse, tente construite, feu rallumé/éteint (`litFade`),
  dormeur qui part (`sleeping → leaving` : de nuit = froid, texte « Froid ! » bleuté ; de jour = aube, « +8 » doré).
- Orientation des personnages : yaw lissé vers `heading = atan2(dx, dz)` (≤ 12 rad/s), conservé si immobile.
- Fichiers : `index.ts`, `webgl-support.ts`, `stage.ts`, `static-layer.ts`, `reconcile.ts`, `views/*.ts`
  (dont `fire-view.ts`), `loot-fx.ts`, `overlay.ts`, `ground-labels.ts`, `framing.ts` (pur) ; `src/render/daylight.ts`
  (pur, partagé 2D/3D).

## Caméra
- `PerspectiveCamera`, **FOV vertical 35°**, inclinée **~57°** sous l'horizontale, **sans lacet** (haut du clavier =
  haut de l'écran). Pas d'orthographique tournée de 45°.
- **Paysage** (`aspect > 1`) : carte entière en profondeur (~12 tuiles) et le plus possible en largeur.
- **Portrait** (façon My Perfect Hotel) : caméra rapprochée qui **suit le joueur dans les deux axes**, largeur
  visible au niveau du joueur = `clamp(largeur CSS / 76, 5, 9)` tuiles, focus borné pour montrer **au plus 4 tuiles
  hors carte au sud**. `D_MIN = 14` m.
- **Cadrage de la file en portrait** : `portraitFraming(...)` (pur, testé). Joueur à Chebyshev ≤ 2 de `W` et file
  non vide ⇒ cible x décalée vers l'est pour inclure la tête de file et le plus de places occupées, joueur à
  ≥ 0,75 tuile du bord, décalage effacé linéairement entre 2 et 3 tuiles de `W`, `extraTilesWide = +1`. Critère
  390×844 : joueur sur `W`, file pleine ⇒ places 0 à 3 entièrement visibles.
- Suivi amorti `focus += (cible − focus) × (1 − e^(−6·dt))` (cible et distance) ; `reset()` recale sans lissage.
  Recalculée au redimensionnement.

## Lumière et cycle jour/nuit
- Base : `HemisphereLight` + `DirectionalLight` (soleil, `PCFSoftShadowMap`, carte 1024 pointeur grossier / 2048
  ordinateur, caméra d'ombre de demi-taille ≈ `0,7 × distance caméra` autour du focus, recalée au texel).
  `NeutralToneMapping`, sortie sRGB, brouillard 30 → 60 m.
- **`lightingAt(tickF)`** (`src/render/daylight.ts`, pur, sans three) avec `tickF = prev.tick + alpha`,
  `p = tickF mod 3600`. Images clés (smoothstep entre clés, RVB linéaire) :

  | p | Ambiance | soleil | hémisphère | fond / brouillard | voile 2D |
  |---|---|---|---|---|---|
  | 0 | fin de nuit | `#ff9e7a`, **0** | `#4a5a8a`, 0.35 | `#2a3550` | 0.55 |
  | 150 | aube rosée | `#ffb38a`, 0.9 | `#f4c6d6`, 0.7 | `#e8b8c0` | 0.25 |
  | 300 → 2100 | jour | `#fff1d6`, 2.0 | `#dff2ff`, 1.1 | `#a9d4a0` | 0 |
  | 2250 | crépuscule | `#ff9a4a`, 1.1 | `#ffc89a`, 0.75 | `#e0a070` | 0.2 |
  | 2400 | tombée de la nuit | `#ff7a4a`, **0** | `#3a4a7a`, 0.35 | `#1e2a44` | 0.55 |
  | 2400 → 3600 | nuit | 0 | `#3a4a7a` → `#4a5a8a`, 0.3–0.35 | `#1a2440` | 0.55–0.6 |

  Poids exposés (dans [0, 1]) : `sunWeight` (intensité / 2.0) ; `fireSpotWeight` = 0 sur `[0, 2400)`, montée
  smoothstep sur `[2400, 2460]`, 1 jusqu'à 3540, descente sur `[3540, 3600)` ; `fireGlowWeight =
  0.35 + 0.65 × (1 − sunWeight)` ; `playerLightWeight = 1 − sunWeight` ; `daylight = max(sunWeight, 0.25)` ;
  `shadowOwner` = `"fire"` sur `[2400, 3600)`, sinon `"sun"`. Course du soleil :
  `sunDir(p) = normalize(lerp(+0.9, −0.9, p/2400), 0.15 + sin(π·p/2400), 0.35)`.
  Couleurs ajustables (présentation) ; **les poids nuls aux bascules ne le sont pas**.
- **`stage.setLighting(l)`** (remplace `setDaylight`) : soleil (couleur, intensité, direction), hémisphère,
  `scene.background`, brouillard, `library.setDaylight(l.daylight)`, intensités du feu et du joueur, bascule des
  ombres.
- **Nombre de lumières constant**, créées une fois : soleil, hémisphère, `fireSpot`, `fireGlow`, `playerLight`.
  On ne change que les **intensités**. Jamais `visible = false`, jamais d'ajout ni de retrait (recompilation des
  shaders ⇒ saccade).
- **Une seule passe d'ombre à la fois** : `sun.castShadow` et `fireSpot.castShadow` toujours vrais (shaders
  stables, un seul `compileAsync` au chargement) ; seul `shadow.autoUpdate` change :
  `"sun"` ⇒ soleil `true`, spot `false` ; `"fire"` ⇒ soleil `false`, spot `= lit`. La lumière qui devient active
  reçoit `shadow.needsUpdate = true` une fois (carte de la veille), et dans `reset()`.
- **Bascule au creux** : elle a lieu au premier `draw` où `shadowOwner(prev.tick + alpha)` change, soit la première
  image avec `prev.tick ≡ 2400` (crépuscule) ou `≡ 0` (aube) mod 3600. À ces instants `sunWeight = fireSpotWeight
  = 0`, et sur ±10 ticks `sunWeight ≤ 0.02`, `fireSpotWeight ≤ 0.1` : la scène n'est éclairée que par
  l'hémisphère et `fireGlow` (sans ombre), le changement de carte d'ombre est invisible. Testé dans
  `tests/render/daylight.test.ts`.
- **`fireSpot`** : `SpotLight` 2,4 m au-dessus du feu, visée au sol, angle 1,2 rad, penumbra 0,6, decay 2, carte
  512 (pointeur grossier) / 1024 ; `distance = lerp(6, 16, ratio)` m ; intensité `FIRE_SPOT_MAX × fireSpotWeight ×
  litFade × flicker`.
- **`fireGlow`** : `PointLight` `#ff8a3c` **sans ombre** à 0,8 m, `distance = lerp(3, 8, ratio)`, intensité
  `FIRE_GLOW_MAX × fireGlowWeight × litFade × flicker`.
- `litFade` : 0 → 1 en 0,5 s au rallumage, 1 → 0 en 0,5 s à l'extinction (mémoire de vue). `flicker` : somme de 3
  sinus de fréquences incommensurables, ±12 %, **sans `Math.random`**.
- **`playerLight`** : `PointLight` `#ffd9a0` sans ombre, 2 m au-dessus du joueur, portée 4 m, intensité
  `0.8 × playerLightWeight`.
- Saisons (plus tard) : variante de modèle ou **clone** de matériau teinté, mis en cache par saison ; palette via
  `lightingAt`.

## Feu de camp (`views/fire-view.ts`)
- Modèle `survival/campfire-pit`, meshes `castShadow = false` (sinon les pierres masquent le spot).
- **Flammes** : un seul `THREE.Points` de 24 particules (texture radiale `CanvasTexture` 32 px,
  `AdditiveBlending`, `depthWrite: false`, couleur par sommet) = **1 draw call** ;
  `setDrawRange(0, ceil(24 × ratio))` ; positions par particule depuis `hash32(i)` et le temps. Feu éteint :
  6 particules grises lentes (fumée).
- **Braises** : icosaèdre émissif (1 draw call), émission `0.3 + 0.7 × ratio`, sombre si éteint.
- Bûche volante joueur → feu via le pool `loot-fx` (détection : `fire.wood` augmente et `resources.wood` baisse).
- Calque 2D : barre du feu au-dessus du foyer si le joueur est dans la zone ou si `low`.

## Barres, coûts, textes, butin
- Dessinés sur le **calque 2D `#game`** (pas de sprites 3D, pas de DOM par entité), mêmes fonctions `bar`/`label`
  que la 2D. Bulles « Zz » (dormeurs) et « ! » (désordre) au même endroit.
- Projection : `v.set(x, h, z).project(camera)` → px CSS. `tilePx` = largeur projetée d'une tuile au focus, bornée
  à [44, 96] px.
- Exclusion HUD/Menu/bilan de l'aube par **boîte englobante réelle** (`getBoundingClientRect`) : un élément qui
  tomberait dessous est redessiné **sous** l'élément.
- Butin : `fx.sample(nowMs, player, out)` ; phase `fly` = mesh procédural en arc (pool de 16), phase `text` = calque
  2D. À l'aube, jusqu'à 4 drops de 8 apparaissent au même pas devant les tentes.

## Animations
- **Personnages** : clips de `animations/Rig_Medium_General` et `animations/Rig_Medium_MovementBasic`. Clips
  **livrés** : `Idle_A`, `Interact`, `Use_Item`, `Walking_A`.
  ```ts
  const mixer = new THREE.AnimationMixer(perso);
  const clips = [...lib.clips("animations/Rig_Medium_General"), ...lib.clips("animations/Rig_Medium_MovementBasic")];
  mixer.clipAction(THREE.AnimationClip.findByName(clips, "Walking_A")!).play();
  ```
  `Walking_A` si `moving`, sinon `Idle_A` (`crossFadeTo` 0,2 s). `Use_Item` quand le joueur récolte ou alimente le
  feu immobile, `Interact` pendant l'accueil. Survivant `resting` ou `sleeping` : masqué.
- Clips présents dans les sources (aperçu) : General `Idle_A/B`, `Interact`, `PickUp`, `Use_Item`, `Throw`,
  `Hit_A/B`, `Death_A/B`, `Spawn_Ground/Air` ; Movement `Walking_A/B/C`, `Running_A/B`, `Jump_*`. Loup (non livré) :
  `Idle`, `Walk`, `Gallop`, `Attack`, `Death`…
- **Le clip joué est un état visuel** déduit de l'état du jeu ; choix et fondus appartiennent au renderer.
- Un `AnimationMixer` par entité, `mixer.update(min(dt, 0.1))` dans `draw` (`dt` via `performance.now()`) ; à la
  disparition : `mixer.stopAllAction()` puis `mixer.uncacheRoot(root)`.
- Accessoires : `lib.attach(perso, lib.create(id), "handslot.r")`. Aucun accessoire livré pour l'instant.

## Rendu 2D (`?render=2d` et repli)
- Même `lightingAt` : voile de nuit sur calque hors écran `rgba(10, 18, 48, a)` (`a = lighting.overlay2D`), halo
  percé au feu (`destination-out`, rayon `lerp(1.5, 4, ratio)` tuiles × `litFade`) et au joueur (0,8 tuile), collé
  avant barres et textes.
- Tuile `"fire"` = herbe + disque de terre ; `drawFire` : anneau de pierres, flamme (rayon ∝ `ratio`) ou braises
  grises. Dormeurs dessinés comme `resting` avec « z » ; tente d'un dormeur : « Zz ».

## Pack `nature` (aperçu seulement)
Particularités gérées par le chargeur, à ne pas défaire : feuillage auto-illuminé (`FOLIAGE_GLOW`, d'où
`setDaylight`), feuillage qui projette sans recevoir d'ombres, herbe teintée via `GRASS_TINT`, feuilles rouges de
`TwistedTree` voulues. À reprendre si le pack est un jour livré.

## Mémoire, repli, performance
- **`reset()`** (nouvelle partie, import, chargement) : vide vues dynamiques (mixers arrêtés + `uncacheRoot`,
  `skeleton.dispose()`), pools, `InstancedMesh` des baies, `fx.reset()`, mémoires de vue (`litFade`, statuts
  précédents), recale la caméra, force `needsUpdate` sur l'ombre active. Décor statique reconstruit seulement si
  `map` change de référence. Bibliothèque et lumières conservées. Critère : `renderer.info.memory` identique après 1
  et 5 nouvelles parties.
- **`dispose()`** : `reset()` + ressources procédurales (suivies dans un `Set`, dont texture des particules),
  `library.dispose()` (jamais `dispose()` sur une copie), `renderer.dispose()` + `forceContextLoss()`, retrait du
  canvas WebGL, `ResizeObserver` et écouteurs.
- **Repli 2D** : `createRenderer3D` rejette `Render3DError { reason: "webgl" | "assets" | "timeout" }` (20 s) après
  avoir tout libéré ; `main.ts` crée alors le 2D + bandeau fermable (`BannerKey` `"render"`). Contexte WebGL perdu
  non restauré après 3 s ⇒ `onContextLost` ⇒ `host.swap(createRenderer(#game))` ; si la perte précède la création
  de l'hôte, le swap est **différé** (exécuté une seule fois). `console.warn`, pas `error`.
- `#app` porte `data-render="2d" | "3d"` et `data-render-ready="1"` après la première image.
- Écran de chargement `src/ui/loading.ts` (import 0→10 %, `library.load` 10→90 %, `compileAsync` 90→100 %).
- **Budget** (via `renderer.info.render`) : **< 120 draw calls**, < 200 k triangles, ≤ 10 personnages, **dans les 5
  états** jour, crépuscule, nuit feu allumé, nuit feu éteint, aube (4 tentes en désordre + `bedroll`). Feu = foyer +
  1 (flammes) + 1 (braises). Une seule passe d'ombre à la fois. `setPixelRatio(min(devicePixelRatio, coarsePointer
  ? 1.5 : 2))` ; une seule dégradation adaptative (moyenne > 22 ms sur 3 s ⇒ pixelRatio 1, ombres 1024).
- Décor répété en **`THREE.InstancedMesh`** ; objets statiques `matrixAutoUpdate = false` + `updateMatrix()` ;
  matériaux teintés = clones mis en cache par (modèle, teinte) (dont « tente salie »).
- `ResizeObserver` sur `#app` ⇒ `setSize(w, h, false)`, aspect, distance caméra, taille du calque.
- Stats e2e en lecture seule : `window.__render3d = { info() }` (compteurs uniquement, aucun accès à l'état).

## Tests
- **Vitest** (sans WebGL ni three) : `tests/render/scene-model.test.ts` (dont `FireItem`, `TentItem.sleeping`,
  dormeurs invisibles), `tests/render/static-layout.test.ts` (aucune touffe sur `F`),
  `tests/render/daylight.test.ts` (périodicité, continuité, images clés, soleil à 0 la nuit, **creux et
  `shadowOwner` aux bascules**), `tests/render/framing.test.ts` (`portraitFraming`), `tests/app/render-mode.test.ts`
  (`""` ⇒ 3d, `?render=2D` ⇒ 2d, `?render=webgl` ⇒ 3d). Entrées gelées non mutées, déterminisme, 600 ticks sans NaN.
- **Playwright** `tests/e2e/*.spec.ts` (`npm run e2e`, build de prod, Chromium + SwiftShader :
  `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, en CI avec `npm run assets:size`) :
  `/` ⇒ 3D prête sans erreur ni 404 ; `?render=2d` ⇒ ni chunk three ni `.gltf` ni `__render3d` ; repli (WebGL
  absent, `.gltf` bloqués) via `/` ; < 120 draw calls dans les 5 états ; mémoire stable sur 5 nouvelles parties.
- **Captures** (`npm run captures`, `captures/` **versionné**) : `camp-3d-desktop.png` (1280×720),
  `camp-3d-mobile.png` (390×844), `camp-2d-desktop.png` (`?render=2d&seed=7`), partie en cours (paysage et
  portrait), `daynight-day`, `-dusk`, `-night-lit`, `-night-out`, `-dawn` (1280×720), `-night-lit-mobile` et
  `queue-portrait` (390×844). États produits par `tests/e2e/daynight-scenario.ts` (core seedé, saves importées par
  le menu, horloge gelée par `installCaptureClock`). Sorties automatiques Playwright dans `test-results/` et
  `playwright-report/` (**ignorés**).

## Interdits (hooks et lint)
- `three` hors de `src/render/three`, `src/render/assets` et `tools/`.
- Modifier l'état du jeu depuis le rendu, ou appeler `applyCommand`.
- Éditer `assets-src/**`, `public/assets/**`, `asset-catalog.ts`, `tools/build-assets.mjs` (générés ou protégés) ;
  passer par la liste blanche + `npm run assets`.
- Référencer un modèle non livré (`ShippedAssetId`) — `survival/tent-canvas-half` ne l'est plus.
- Ajouter/retirer une lumière ou basculer `visible`/`castShadow` en cours de partie (seules les intensités et
  `shadow.autoUpdate` changent).
- `Math.random()` pour le décor, les variantes, les particules ou le vacillement : utiliser `hash32(id)` /
  `hash32(tx, ty)`, des sinus du temps, ou `src/core/rng.ts`.
