---
name: three-render
description: Rendu 3D three.js du jeu (caméra vue de dessus inclinée façon My Perfect Hotel) et utilisation des 289 modèles 3D du projet - nature, bâtiments de survie, personnages animés, accessoires, loup. Catalogue, chargeur, animations, échelles, instancing, saisons, jour/nuit. À charger avant toute modification de src/render ou pour intégrer un modèle 3D.
---

# Rendu 3D & assets

## Assets disponibles (tous CC0)
| Pack (`AssetPack`) | Contenu | Usage dans le jeu |
|---|---|---|
| `nature` — Stylized Nature MegaKit (Quaternius) | 68 : arbres, sapins, arbres morts, buissons, rochers, herbe, fleurs, champignons | **Style visuel principal** de la forêt |
| `forest` — KayKit Forest | 101 : arbres, arbres nus, buissons, rochers, herbe (low-poly, 1 texture atlas) | Variante plus légère / mobile bas de gamme |
| `survival` — Kenney Survival Kit | 80 : tentes, couchages, feux de camp, palissades, établis, structures, coffres/tonneaux, ressources au sol, outils, panneaux | **Bâtiments du camp, drops, entrepôt, défenses** |
| `characters` — KayKit Adventurers | 6 personnages skinnés (Barbarian, Knight, Mage, Ranger, Rogue, Rogue_Hooded) | Joueur, survivants, travailleurs |
| `animations` — KayKit Adventurers | 2 fichiers de clips Rig_Medium (squelette + clips, sans mesh) | Animations partagées par tous les `characters` |
| `items` — KayKit Adventurers | 31 : haches, épées, arcs, boucliers, chopes… | Accessoires en main (gardes, bûcherons, cantine) |
| `creatures` — Wolf (Quaternius) | Loup skinné, 12 clips | **Menace nocturne** |

- Sources : `assets-src/` · web : `public/assets/<pack>/` (≈ 10 Mo au total) · licences : `public/assets/<pack>/LICENSE.txt`.
- **Catalogue typé** `src/render/assets/asset-catalog.ts` : `ASSETS["survival/tent"]` → `{ pack, name, kind, category, usage, url, size, clips }`, `ASSETS_BY_CATEGORY`, `PACKS`. Les ids sont de la forme `"<pack>/<nom>"`.
- **Chargeur** `src/render/assets/asset-loader.ts` : `createAssetLibrary()` →
  - `load(ids)` : précharge ;
  - `create(id)` : copie mise à l'échelle, avec squelette cloné pour les modèles animés ;
  - `clips(id)` : clips d'animation ;
  - `meshes(id)` : pour l'instancing ;
  - `attach(perso, objet, "handslot.r")` : place un accessoire dans une main ;
  - `setDaylight(0..1)` et `dispose()`.
- **Aperçu** : `npm run dev` puis `/tools/asset-preview/?pack=survival`. Le sélecteur en haut à droite change de pack ; survoler un modèle affiche son id, sa catégorie et son usage.
- Fichiers **générés et protégés**. Pour ajouter un pack, l'humain le place dans `assets-src/`, déclare le pack dans `PACKS` de `tools/build-assets.mjs`, puis lance `npm run assets`.

## Correspondance gameplay → modèles (point de départ)
| Élément du jeu | Modèle(s) |
|---|---|
| Nœud `tree` prêt / épuisé | `nature/CommonTree_1..5` (hiver : `nature/Pine_*`) / `nature/DeadTree_*` réduit ou `survival/tree-trunk` |
| Nœud `bush` prêt / épuisé | `nature/Bush_Common_Flowers` / `nature/Bush_Common` |
| Rocher / obstacle | `nature/Rock_Medium_*` |
| Bordure de forêt | `nature/Pine_*`, `nature/TwistedTree_*` en `InstancedMesh` |
| Tente (logement) | `survival/tent`, `tent-canvas` (niveaux), `bedroll` à l'intérieur |
| Feu de camp / cantine | `survival/campfire-pit`, `campfire-stand`, `campfire-fishing-stand` |
| Zone de construction | `survival/structure-floor` / `floor` + `signpost` |
| Entrepôt | `survival/chest` (clips `open`/`close`), `barrel`, `box-large` |
| Établi / atelier | `survival/workbench`, `workbench-anvil`, `workbench-grind` |
| Palissade, porte | `survival/fence`, `fence-fortified`, `fence-doorway` |
| Drops au sol (bois, pierre, nourriture) | `survival/resource-wood`, `resource-planks`, `resource-stone`, `fish` |
| Joueur | `characters/Barbarian` ou `Ranger` |
| Survivants | `characters/*` variés, choisis par `hash(survivor.id)`, jamais `Math.random` |
| Travailleurs | personnage + outil : `survival/tool-axe` (bûcheron), `items/mug_full` (cuisinier), `items/sword_1handed` + `items/shield_round` (garde) |
| Loup (nuit) | `creatures/Wolf` |
| Décor au sol | `nature/Grass_*`, `Clover_*`, `Flower_*`, `Pebble_*`, `RockPath_*` |

## Échelle
1 tuile = `WORLD.unitsPerTile` unités du core = **2 m** en 3D. Utilise une constante unique `TILE_METERS` dans `src/render`.

Les packs ont des échelles d'origine très différentes : une tente Kenney mesure 0,56 et le loup 5,5 de long. `PACK_SCALE` dans le chargeur les ramène à cette grille : humain ≈ 1,8 m, tente ≈ 1 tuile, arbre nature ≈ 3,6 m, loup ≈ 1,7 m. Ces valeurs ont été vérifiées dans l'aperçu. Pour un ajustement ponctuel, modifie l'échelle de l'instance, pas la constante.

## Animations
- **Personnages** : leurs propres fichiers n'ont pas de clips utiles. On prend les clips de `animations/Rig_Medium_General` et `animations/Rig_Medium_MovementBasic`, qui utilisent le même squelette :
  ```ts
  const mixer = new THREE.AnimationMixer(perso);
  const clips = [...lib.clips("animations/Rig_Medium_General"), ...lib.clips("animations/Rig_Medium_MovementBasic")];
  mixer.clipAction(THREE.AnimationClip.findByName(clips, "Walking_A")!).play();
  ```
  Clips disponibles :
  - General : `Idle_A/B`, `Interact`, `PickUp`, `Use_Item`, `Throw`, `Hit_A/B`, `Death_A/B`, `Spawn_Ground/Air` ;
  - Movement : `Walking_A/B/C`, `Running_A/B`, `Jump_*`.
  Exemples : `Interact` pour accueillir un survivant, `PickUp` pour ramasser, `Use_Item` pour récolter.
- **Loup** : `Idle`, `Idle_2`, `Walk`, `Gallop`, `Attack`, `Death`, `Eating`, `Idle_HitReact_Left/Right`, `Gallop_Jump`, `Jump_ToIdle`.
- **Coffre** (`survival/chest`) : `open`, `close`, `open-close`.
- **Ce que joue le mixer est un état visuel**, déduit de l'état du jeu (statut du survivant, vitesse, événement de récolte détecté dans `onTick`). Le choix du clip et les fondus (`crossFadeTo`) appartiennent au renderer ; aucune règle de jeu ne vit ici.
- Un `AnimationMixer` par entité animée, `mixer.update(dt)` dans `draw`, et `mixer.stopAllAction()` puis `uncacheRoot` quand l'entité disparaît.
- Accessoires : `lib.attach(perso, lib.create("survival/tool-axe"), "handslot.r")`. three.js retire les points des noms d'os (`handslot.r` devient `handslotr`) ; `attach` gère cette conversion.

## Particularités du pack `nature` (déjà gérées par le chargeur, ne pas les défaire)
Le pack est conçu pour un shader stylisé Unity/Godot. En PBR three.js, vérifié dans le navigateur :
- **Feuillage sombre vu de dessus** → auto-illumination par sa propre texture (`FOLIAGE_GLOW`). **Appeler `library.setDaylight(0..1)` à chaque frame depuis le cycle jour/nuit**, sinon les arbres brilleront la nuit.
- **Auto-ombrage en taches** → le feuillage projette des ombres mais n'en reçoit pas.
- **Texture `Grass` quasi blanche** → teinte via `material.color` (`GRASS_TINT`). Pour les saisons, cloner le matériau.
- Les feuilles de `TwistedTree` sont rouges (automne) par texture : c'est voulu.

## Architecture du renderer
- **Garder l'interface existante** `Renderer { onTick, draw(prev, curr, alpha), reset }` de `src/render/renderer.ts` : `src/app` ne doit pas changer. Seule l'implémentation change (Canvas 2D → `THREE.WebGLRenderer` sur le même `<canvas>`).
- **Le rendu lit l'état sans jamais le modifier.** On synchronise une *scène* à partir de l'état : un `Map<entityId, Object3D>` qu'on crée, met à jour ou supprime à chaque `draw`. Pas de logique de jeu dans ce code.
- Positions interpolées avec `interpolate.ts` (alpha). Orientation des personnages : `atan2` du déplacement interpolé.
- Conversion des coordonnées : `x3d = (x / unitsPerTile) * TILE_METERS`, `z3d = (y / unitsPerTile) * TILE_METERS`. L'axe Y du core devient l'axe Z en 3D.
- **Caméra** : `OrthographicCamera`, inclinée d'environ 50° et tournée de 45° (vue « hôtel »), qui suit le joueur avec un lissage. Zoom adapté à la largeur de l'écran.
- **HUD et effets 2D** (`fx.ts`, `icons.ts`) : les garder en DOM ou sur un canvas 2D *superposé*. Pour placer un élément, projeter la position 3D vers l'écran avec `vector.project(camera)`.

## Lumière, jour/nuit, saisons
- `HemisphereLight` + `DirectionalLight` (soleil, avec ombres) + un brouillard léger.
- Jour/nuit : soleil, fond et brouillard sont des fonctions *pures* des `selectors` (heure du jour). La nuit, une `PointLight` par feu de camp ou torche, avec un plafond (≤ 8 actives, les plus proches de la caméra).
- Saisons : changer de variante de modèle (pins en hiver, `TwistedTree` en automne) ou teinter un **clone** de matériau, mis en cache par saison.

## Performance (mobile milieu de gamme, 60 FPS)
- Décor répété en **`THREE.InstancedMesh`**, construit à partir de `library.meshes(id)`.
- Objets statiques : `matrixAutoUpdate = false` puis `updateMatrix()` une seule fois.
- Ombres `PCFSoftShadowMap`, carte de 1024 à 2048, caméra d'ombre bornée à la zone visible. `setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Budget : < 150 draw calls, < 300 k triangles, ≤ 20 personnages animés à l'écran. Vérifie avec `renderer.info.render`.
- Ne charger que les modèles utilisés (`library.load([...])`) pendant un écran de chargement. Appeler `library.dispose()` en quittant, jamais `dispose()` sur une copie.

## Interdits (vérifiés par les hooks et le lint)
- `three` dans `src/core`.
- Éditer `public/assets/**`, `assets-src/**`, `asset-catalog.ts` ou `tools/build-assets.mjs` (fichiers protégés).
- `Math.random()` pour placer le décor ou choisir une variante : utiliser `src/core/rng.ts` ou `hash(id)`, sinon le décor « saute » à chaque rechargement.
