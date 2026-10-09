---
name: three-render
description: Rendu 3D three.js du jeu (prototype via ?render=3d, 2D par défaut) - caméra perspective inclinée sans lacet, base visuelle KayKit (Forest + Adventurers) et tentes Kenney, liste blanche d'assets livrés, catalogue, chargeur, animations, échelles, instancing, buildScene pur, calque 2D superposé, mémoire, repli 2D, tests e2e. À charger avant toute modification de src/render ou pour intégrer un modèle 3D.
---
<!-- Remplace tel quel .claude/skills/three-render/SKILL.md (aligné sur docs/design/render-3d.md). -->

# Rendu 3D & assets

Plan de référence : `docs/design/render-3d.md`. En cas de doute, ce plan fait foi.

## Statut : prototype, 2D par défaut
- Le rendu **Canvas 2D** (`src/render/renderer.ts`) reste le rendu par défaut.
- La 3D est activée **uniquement** par l'URL `?render=3d` (`parseRenderMode` dans `src/app/render-mode.ts`, insensible à la casse ; tout le reste ⇒ 2D). Le mode n'est ni sauvegardé ni mis dans `localStorage`.
- `src/main.ts` charge la 3D par **import dynamique** : `await import("./render/three")` puis `createRenderer3D(canvas, { coarsePointer, onProgress, onContextLost })`. Vite en fait un chunk séparé : le bundle 2D ne contient pas three.js (vérifié en e2e).
- **`three` uniquement dans `src/render/three`, `src/render/assets` et `tools/`** (règle ESLint `no-restricted-imports`). Jamais dans `src/core`, `src/app`, `src/ui`, ni ailleurs dans `src/render`.

## Assets (tous CC0)
| Pack (`AssetPack`) | Contenu | Statut |
|---|---|---|
| `forest` — KayKit Forest | arbres, arbres nus, buissons, rochers, herbe (low-poly, 1 atlas) | **Base visuelle, livré** (sous-ensemble) |
| `characters` — KayKit Adventurers | 6 personnages skinnés (Barbarian, Knight, Mage, Ranger, Rogue, Rogue_Hooded) | **Livré** sauf Barbarian (Knight = joueur ; Mage, Ranger, Rogue, Rogue_Hooded = survivants) |
| `animations` — KayKit Adventurers | 2 fichiers de clips Rig_Medium (squelette + clips, sans mesh) | **Livré**, clips filtrés |
| `survival` — Kenney Survival Kit | tentes, feux, palissades, établis, coffres, outils… | **Livré uniquement pour `tent-canvas` et `tent-canvas-half`** (`tent`, armature nue, non livré ; feu de camp plus tard, avec jour/nuit/cantine) |
| `items` — KayKit Adventurers | haches, épées, boucliers, chopes… | Aperçu seulement, non livré |
| `nature` — Stylized Nature MegaKit (Quaternius) | arbres, pins, buissons, rochers, fleurs | Aperçu seulement, non livré |
| `creatures` — Wolf (Quaternius) | loup skinné, 12 clips | Aperçu seulement, non livré |

### Liste blanche et deux dossiers de sortie
- **`tools/shipped-assets.json`** : ids livrés + filtre de clips des 2 fichiers d'animation.
- `npm run assets` (`tools/build-assets.mjs`) :
  - conversion **complète** dans `assets-all/assets/<pack>/` (**gitignoré**, local, servi par `vite dev` pour `tools/asset-preview`) ;
  - écrit **d'abord** le **seul sous-ensemble livré** (+ `.bin`, textures référencées, `LICENSE.txt`, animations réduites aux clips gardés) dans le dossier de préparation `assets-all/.shipped-staging/<pack>/` ;
  - **ne remplace `public/assets/` et le catalogue qu'en cas de succès complet** : sources présentes, liste blanche entièrement résolue (ids et clips), total livré ≤ **4 Mo** (cible ≤ 2,5 Mo, total affiché). Sinon échec explicite, `public/assets/` et catalogue existants intacts. `public/assets/` est **versionné** et finit dans `dist/` ;
  - état actuel : **18 modèles, 2,46 Mo** livrés ;
  - `npm run assets:size` vérifie seulement la taille de `public/assets/` (≤ 4 Mo), sans reconvertir (utilisé en CI).
- **Catalogue typé** `src/render/assets/asset-catalog.ts` (généré) : `ASSETS["survival/tent-canvas"]` → `{ pack, name, kind, category, usage, url, size, clips, shippedClips, shipped }` (`clips` = tous les clips de la source, `shippedClips` = clips réellement livrés ; le renderer ne joue que ces derniers), `ASSETS_BY_CATEGORY`, `PACKS`, `SHIPPED_IDS` et le type **`ShippedAssetId`**. Ids de la forme `"<pack>/<nom>"`.
- Dans `src/render/three/config.ts`, toute référence à un modèle est typée `ShippedAssetId` : référencer un modèle non livré est une **erreur de compilation**.
- **Ajouter un modèle au jeu** : l'ajouter à `tools/shipped-assets.json` → `npm run assets` → vérifier la taille affichée → mettre à jour `CREDITS.md` (colonne « Livré dans le jeu »). Fichiers concernés protégés ⇒ agent principal avec accord de l'humain.
- **Ajouter un pack** : l'humain le place dans `assets-src/`, le déclare dans `PACKS` de `tools/build-assets.mjs`, puis `npm run assets`.

### Chargeur
`src/render/assets/asset-loader.ts` : `createAssetLibrary(baseUrl?)` (jeu : `/assets/` ; aperçu : `/assets-all/`) →
- `load(ids, onProgress?)` : précharge (écran de chargement) ;
- `create(id)` : copie mise à l'échelle, squelette cloné pour les modèles animés ;
- `clips(id)` : clips d'animation ;
- `meshes(id)` : pour l'instancing ;
- `attach(perso, objet, "handslot.r")` : accessoire en main ;
- `setDaylight(0..1)` et `dispose()`.

### Aperçu
`npm run dev` puis `/tools/asset-preview/?pack=forest` : montre **tous** les packs (depuis `assets-all/`), y compris les non livrés. Survoler un modèle affiche id, catégorie, usage.

## Correspondance gameplay → modèles (livrés)
| Élément | Modèle(s) |
|---|---|
| Sol | procédural : `PlaneGeometry` carte + marge, couleurs par sommet (1 draw call) |
| Tapis accueil / file / entrée | procédural : plans à y = 0,02 + `CanvasTexture` (`ground-labels.ts`) |
| Arbres de bordure `#` + anneau hors carte | `forest/Tree_1_A_Color1`, `Tree_2_A_Color1`, `Tree_4_A_Color1` en `InstancedMesh` |
| Rochers `R` | `forest/Rock_3_A_Color1`, `Rock_3_C_Color1` (instance ×3) |
| Touffes d'herbe | `forest/Grass_1_A_Color1`, `Grass_2_A_Color1` (≤ 2 par tuile libre) |
| Arbre récoltable prêt / épuisé | `forest/Tree_3_A_Color1` / souche procédurale + pousse `Tree_3_A` à l'échelle `0,15 + 0,45 × regrow` |
| Buisson prêt / vide | `forest/Bush_2_A_Color1` (×4) + baies procédurales instanciées / même modèle, clone de matériau désaturé |
| Tente libre | `survival/tent-canvas` teintée vert clair + liseré vert |
| Tente assignée | `survival/tent-canvas` teintée vert clair + liseré jaune pulsé |
| Tente occupée | `survival/tent-canvas` couleurs d'origine + barre de repos |
| Tente en désordre | `survival/tent-canvas-half` (inclinée, assombrie, « ! » + barre de nettoyage) |
| Emplacement de construction | procédural : contour pointillé + anneau `RingGeometry` + `setDrawRange` |
| Feu de camp | `survival/campfire-pit` — non affiché pour l'instant |
| Joueur | `characters/Knight` (teinte d'origine) + anneau cyan au sol (`COLORS3D.playerRing = 0x3fd4ff`, reçoit l'ombre, 1 draw call) |
| Survivants | `characters/Mage`, `Ranger`, `Rogue`, `Rogue_Hooded` × 5 teintes `[0xffffff, 0xffd6a5, 0xbde0fe, 0xcaffbf, 0xffadd6]` = 20 variantes ; `v = hash32(id) % 20`, modèle `v % 4`, teinte `floor(v / 4)` |
| Butin / drops bois, nourriture | procédural (bûches, grappe de baies) |

## Échelle
1 tuile = `WORLD.unitsPerTile` unités du core = **2 m** (`TILE_METERS` dans `src/render/three/config.ts`).
`x3d = (x / unitsPerTile) * TILE_METERS`, `z3d = (y / unitsPerTile) * TILE_METERS` : l'axe Y du core devient Z ; Y 3D vers le haut.

`PACK_SCALE` dans le chargeur ramène les packs à cette grille (humain ≈ 1,8 m, tente ≈ 1 tuile, loup ≈ 1,7 m), vérifié dans l'aperçu. Pour un ajustement ponctuel (rochers ×3, buissons ×4), modifier l'échelle de l'instance, pas la constante.

## Architecture du renderer
- **Interface inchangée** `Renderer { onTick, draw(prev, curr, alpha), reset, dispose? }` (`dispose` optionnel). `src/app/game.ts` ne change pas. `src/app/render-host.ts` (`createRenderHost(initial)` + `swap(next)`) est passé à `startGame` et permet le repli à chaud.
- **Deux canvas** : le renderer 3D crée son propre `<canvas class="webgl">` inséré dans `#app` **avant** `#game` (même boîte, `pointer-events: none`). `#game` reste au-dessus comme **calque 2D transparent** (`getContext("2d", { alpha: true })`) pour barres, coûts, textes. En mode 3D, ne jamais appeler `createRenderer` (2D) avant le 3D.
- **Fonction pure `buildScene(prev, curr, alpha): SceneFrame`** dans `src/render/three/scene-model.ts`, **sans import de three** (comme `config.ts` et `hash.ts`), testée sous Vitest/node. Elle produit des items (`player`, `survivor:id`, `node:id`, `tent:id`, `slot:id`, `drop:id`) en mètres, interpolés via `interpolate.ts`, avec ratios partagés avec la 2D (`src/render/ratios.ts`). `buildStaticLayout(map)` calcule le décor une fois par carte. Ne mute jamais ses entrées, ne lit pas l'horloge, pas de `Math.random`.
- **Réconciliation** (`reconcile.ts`) : `Map<SceneKey, View>` créée / mise à jour / retirée à chaque `draw`, pools par type (12 personnages, 8 drops). Chaque `draw` : `buildScene` → `reconcile` → mixers → caméra → `render` → overlay.
- **Le rendu lit l'état sans jamais le modifier** ; aucune règle de jeu ici. Les transitions (nœud qui repousse, tente construite) sont détectées par la vue en mémorisant le statut précédent côté vue.
- Orientation des personnages : yaw lissé vers `heading = atan2(dx, dz)` (≤ 12 rad/s), conservé si immobile.
- Fichiers : `index.ts`, `webgl-support.ts`, `stage.ts`, `static-layer.ts`, `reconcile.ts`, `views/*.ts`, `loot-fx.ts`, `overlay.ts`, `ground-labels.ts`.

## Caméra, lumière
- **Caméra** : `PerspectiveCamera`, **FOV vertical 35°**, inclinée **~57°** sous l'horizontale, **sans rotation en lacet** (grille alignée à l'écran : haut du clavier = haut de l'écran). Pas d'orthographique tournée de 45°. Distance **selon l'orientation** : **paysage** (`aspect > 1`) ⇒ carte entière en profondeur (~12 tuiles) et le plus possible en largeur, `D_MAX` (`config.ts`) relevé si nécessaire ; **portrait** (façon My Perfect Hotel) ⇒ caméra rapprochée qui **suit le joueur dans les deux axes**, largeur visible au niveau du joueur = `clamp(largeur CSS / 76, 5, 9)` tuiles (≈ 5,1 tuiles, d ≈ 35 m en 390×844), focus borné pour montrer **au plus 4 tuiles hors carte au sud** (forêt proche de 3 rangées côté caméra). `D_MIN = 14` m. Recalculée au redimensionnement. Suivi amorti `focus += (cible − focus) × (1 − e^(−6·dt))` ; `reset()` recale sans lissage.
- **Lumière** : `HemisphereLight` + `DirectionalLight` (soleil, ombres `PCFSoftShadowMap`, carte 1024 pointeur grossier / 2048 sur ordinateur, caméra d'ombre de demi-taille ≈ `0,7 × distance caméra` autour du focus, recalée au texel). `NeutralToneMapping`, sortie sRGB, fond + brouillard léger `#a9d4a0` (30 → 60 m).
- **Jour/nuit (non implémenté)** : point d'extension `stage.setDaylight(0..1)`, vide pour l'instant ; il appellera `library.setDaylight`. Plus tard : soleil, fond et brouillard fonctions pures des sélecteurs (heure) ; une `PointLight` par feu/torche, ≤ 8 actives.
- Saisons (plus tard) : variante de modèle ou **clone** de matériau teinté, mis en cache par saison.

## Barres, coûts, textes, butin
- Dessinés sur le **calque 2D `#game`** (pas de sprites 3D, pas de DOM par entité), mêmes fonctions `bar`/`label` que la 2D.
- Projection : `v.set(x, h, z).project(camera)` → px CSS. `tilePx` = largeur projetée d'une tuile au focus, bornée à [44, 96] px.
- Exclusion HUD/Menu par **boîte englobante réelle** (`getBoundingClientRect`) : un coût d'emplacement (ou une barre) qui tomberait sous le HUD est redessiné **sous** l'élément.
- Butin : `fx.sample(nowMs, player, out)` expose les effets en coordonnées monde ; phase `fly` = mesh procédural en arc (pool de 16), phase `text` = calque 2D.

## Animations
- **Personnages** : clips pris dans `animations/Rig_Medium_General` et `animations/Rig_Medium_MovementBasic` (même squelette). Clips **livrés** : `Idle_A`, `Interact`, `Use_Item`, `Walking_A` (les autres sont retirés par le script ; pour en ajouter, modifier le filtre de `tools/shipped-assets.json`).
  ```ts
  const mixer = new THREE.AnimationMixer(perso);
  const clips = [...lib.clips("animations/Rig_Medium_General"), ...lib.clips("animations/Rig_Medium_MovementBasic")];
  mixer.clipAction(THREE.AnimationClip.findByName(clips, "Walking_A")!).play();
  ```
  `Walking_A` si `moving`, sinon `Idle_A` (`crossFadeTo` 0,2 s). `Use_Item` quand le joueur récolte immobile, `Interact` pendant l'accueil. Survivant `resting` : masqué.
- Clips présents dans les sources (aperçu) : General `Idle_A/B`, `Interact`, `PickUp`, `Use_Item`, `Throw`, `Hit_A/B`, `Death_A/B`, `Spawn_Ground/Air` ; Movement `Walking_A/B/C`, `Running_A/B`, `Jump_*`. Loup (non livré) : `Idle`, `Walk`, `Gallop`, `Attack`, `Death`… Coffre Kenney : `open`, `close`, `open-close`.
- **Le clip joué est un état visuel** déduit de l'état du jeu ; choix et fondus appartiennent au renderer.
- Un `AnimationMixer` par entité, `mixer.update(min(dt, 0.1))` dans `draw` (`dt` via `performance.now()`) ; à la disparition : `mixer.stopAllAction()` puis `mixer.uncacheRoot(root)`.
- Accessoires : `lib.attach(perso, lib.create(id), "handslot.r")` (three retire les points des noms d'os ; `attach` gère). Aucun accessoire livré pour l'instant.

## Pack `nature` (aperçu seulement)
Particularités gérées par le chargeur, à ne pas défaire : feuillage auto-illuminé (`FOLIAGE_GLOW`, d'où `setDaylight`), feuillage qui projette sans recevoir d'ombres, herbe teintée via `GRASS_TINT`, feuilles rouges de `TwistedTree` voulues. À reprendre si le pack est un jour livré.

## Mémoire, repli, performance
- **`reset()`** (nouvelle partie, import, chargement) : vide vues dynamiques (mixers arrêtés + `uncacheRoot`, `skeleton.dispose()`), pools, `InstancedMesh` des baies, `fx.reset()`, recale la caméra. Décor statique reconstruit seulement si `map` change de référence. Bibliothèque conservée. Critère : `renderer.info.memory` identique après 1 et 5 nouvelles parties.
- **`dispose()`** : `reset()` + ressources procédurales (suivies dans un `Set`), `library.dispose()` (jamais `dispose()` sur une copie), `renderer.dispose()` + `forceContextLoss()`, retrait du canvas WebGL, `ResizeObserver` et écouteurs.
- **Repli 2D** : `createRenderer3D` rejette `Render3DError { reason: "webgl" | "assets" | "timeout" }` (timeout 20 s) après avoir tout libéré ; `main.ts` crée alors le 2D + bandeau fermable (`BannerKey` `"render"`). Contexte WebGL perdu non restauré après 3 s ⇒ rappel `onContextLost` (option de `createRenderer3D`, fournie par `main.ts`) ⇒ `host.swap(createRenderer(#game))`. Si le contexte est perdu **avant la création de l'hôte**, la demande est mémorisée et le swap est **différé** jusqu'à ce que l'hôte existe (exécuté une seule fois). `console.warn`, pas `error`.
- `#app` porte `data-render="2d" | "3d"` et `data-render-ready="1"` après la première image.
- Écran de chargement `src/ui/loading.ts` (import 0→10 %, `library.load` 10→90 %, `compileAsync` 90→100 %).
- **Budget** (via `renderer.info.render`) : **< 120 draw calls**, < 200 k triangles, ≤ 10 personnages. `setPixelRatio(min(devicePixelRatio, coarsePointer ? 1.5 : 2))` ; une seule dégradation adaptative (moyenne > 22 ms sur 3 s ⇒ pixelRatio 1, ombres 1024).
- Décor répété en **`THREE.InstancedMesh`** depuis `library.meshes(id)` ; objets statiques `matrixAutoUpdate = false` + `updateMatrix()` une fois ; matériaux teintés = clones mis en cache par (modèle, teinte).
- `ResizeObserver` sur `#app` ⇒ `setSize(w, h, false)`, aspect, distance caméra, taille du calque.
- Stats e2e en lecture seule : `window.__render3d = { info() }` (compteurs uniquement, aucun accès à l'état).

## Tests
- **Vitest** (sans WebGL ni three) : `tests/render/scene-model.test.ts`, `tests/render/static-layout.test.ts`, `tests/app/render-mode.test.ts` — conversion de coordonnées, interpolation bornée, variantes stables par `hash32(id)`, entrées gelées non mutées, déterminisme, 600 ticks sans NaN.
- **Playwright** dans `tests/e2e/*.spec.ts` (`npm run e2e`, build de prod, Chromium + SwiftShader : `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, aussi lancés en CI avec `npm run assets:size`) : 3D prête sans erreur ni 404 et < 120 draw calls ; 2D sans chunk three ni `.gltf` ; repli (WebGL absent, `.gltf` bloqués) ; mémoire stable sur 5 nouvelles parties.
- **Captures** : les captures choisies (`camp-3d-desktop.png` 1280×720, `camp-3d-mobile.png` 390×844) plus une **partie en cours** (file, tente occupée, tente en désordre, butin en vol) en paysage et en portrait, sont régénérées par `npm run captures` dans `captures/` (**versionné**, décision de l'utilisateur) ; les sorties automatiques de Playwright vont dans `test-results/` et `playwright-report/` (**ignorés**).

## Interdits (hooks et lint)
- `three` hors de `src/render/three`, `src/render/assets` et `tools/`.
- Modifier l'état du jeu depuis le rendu, ou appeler `applyCommand`.
- Éditer `assets-src/**`, `public/assets/**`, `asset-catalog.ts`, `tools/build-assets.mjs` (générés ou protégés) ; passer par la liste blanche + `npm run assets`.
- Référencer un modèle non livré (`ShippedAssetId`).
- `Math.random()` pour le décor ou les variantes : utiliser `hash32(id)` / `hash32(tx, ty)` ou `src/core/rng.ts`.
