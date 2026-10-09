# Design — Prototype de rendu 3D (`?render=3d`)

Statut : **implémenté** (prototype), décisions validées par l'utilisateur reportées ci-dessous (§4.5, §4.6, §4.7,
§4.10, §6.3). Branche `feature/3d-test`. Couvre le Jalon 1.5 en mode **prototype** :
la 2D reste le rendu par défaut ; la 3D (three.js) est un second moteur d'affichage, chargé à la demande.

Hors périmètre : jour/nuit (la prochaine feature se branchera sur `setDaylight` et les lumières, §4.6), nouveau
gameplay, sons, loup, travailleurs.

---

## 1. Règles de jeu

**Aucune.** Ce prototype n'ajoute ni ne modifie aucune règle. Aucune constante de gameplay ; `src/data` ne change pas.
Les constantes de **présentation** (mètres, couleurs, durées d'animation, caméra, lumière) vivent dans
`src/render/three/config.ts`, comme `fx.ts` le fait déjà pour la 2D.

## 2. Changements d'état

- `GameState` : **inchangé**. Aucun champ ajouté, aucun type modifié.
- `src/core`, `src/save` : **0 ligne modifiée**. Migration de sauvegarde : **non** (version inchangée).
- Le mode de rendu n'est **pas** persisté (ni dans la save, ni dans `localStorage`) : il vient uniquement de l'URL.

## 3. Commandes et systèmes

Aucune nouvelle commande, aucun nouveau système. Le renderer 3D ne fait qu'implémenter l'interface existante
`Renderer { onTick, draw, reset }` (+ `dispose?()` optionnel, §4.9). `src/app/game.ts` n'est pas modifié.

---

## 4. Rendu / UI

### 4.1 Sélection du mode et chargement à la demande

- `src/app/render-mode.ts` (pur, testé) : `parseRenderMode(search: string): "2d" | "3d"` — `"3d"` ssi le paramètre
  `render` vaut exactement `3d` (insensible à la casse) ; tout le reste ⇒ `"2d"`.
- `src/main.ts` :
  1. Mode 2D : chemin actuel strictement inchangé (`createRenderer(canvas)` synchrone).
  2. Mode 3D : affiche l'écran de chargement, puis `const m = await import("./render/three")` et
     `await m.createRenderer3D(canvas, { coarsePointer, onProgress, onContextLost })`. `bootSave` tourne **en parallèle**
     (`Promise.all`). `startGame` n'est appelé qu'une fois le renderer prêt (aucun tick pendant le chargement).
  3. Échec (§4.8) ⇒ `createRenderer(canvas)` (2D) + bandeau, puis démarrage normal.
- Seuls `src/render/three/**` et `src/render/assets/**` importent `three`. Ils ne sont atteignables **que** par
  l'`import()` dynamique ⇒ Vite produit un chunk séparé ; le bundle 2D ne contient pas three.js (vérifié en e2e, §6.3).
- Garde-fou lint (agent principal) : `no-restricted-imports` sur `three` / `three/*` hors de
  `src/render/three`, `src/render/assets`, `tools/`.

### 4.2 Canvas : WebGL dessous, `#game` devient la couche 2D superposée

Choix structurant : le renderer 3D **crée son propre `<canvas class="webgl">`**, inséré dans `#app` *avant* `#game`
(même boîte CSS, `pointer-events: none`). Le canvas existant `#game` reste au-dessus et sert de **calque 2D
transparent** (`getContext("2d", { alpha: true })`) pour barres, textes et coûts.

Pourquoi : `#game` ne change jamais ⇒ joystick, menu (`inert`) et HUD gardent leurs références ; le repli en 2D
(même en cours de partie) consiste à supprimer le canvas WebGL et à créer `createRenderer(#game)`.
Contrainte : en mode 3D, **ne jamais appeler `createRenderer` (2D) avant** le 3D (le premier `getContext` fixe
`alpha`). En repli, le 2D récupère le même contexte (`alpha: true`) : sans effet, il peint tout le fond à chaque image.

`src/app/render-host.ts` : `createRenderHost(initial: Renderer): Renderer & { swap(next: Renderer): void }` —
délègue à l'implémentation courante ; `swap` appelle `old.dispose?.()`, puis `next.reset()`. C'est l'hôte qui est
passé à `startGame` ⇒ repli à chaud possible sans toucher `game.ts`.

### 4.3 Fonction pure `buildScene` (sans three, testable sous Vitest/node)

Fichiers sans aucun import de `three` : `src/render/three/scene-model.ts`, `config.ts`, `hash.ts`.

```ts
// Mètres, axe Y vers le haut. x3d = x / U * TILE_METERS ; z3d = y / U * TILE_METERS (TILE_METERS = 2).
export type SceneKey = string; // "player" | `survivor:${id}` | `node:${id}` | `tent:${id}` | `slot:${id}` | `drop:${id}`
export interface CharacterItem {
  key: SceneKey; type: "character"; role: "player" | "survivor";
  model: CharacterModel; tint: number;        // survivant : hash32(id) ; joueur : fixe
  x: number; z: number;                        // interpolés (interpolate.ts)
  heading: number | null;                      // atan2(dx, dz) du déplacement prev→curr ; null = garder l'actuel
  moving: boolean;                             // prev.pos !== curr.pos
  visible: boolean;                            // false si survivant "resting" (dans la tente)
}
export interface NodeItem {
  key: SceneKey; type: "tree" | "bush"; x: number; z: number; yaw: number; // yaw = f(hash32(id))
  ready: boolean; regrow: number; harvest: number; targeted: boolean;      // ratios interpolés, comme en 2D
}
export interface TentItem { key: SceneKey; type: "tent"; x: number; z: number; status: TentStatus;
  clean: number; rest: number | null; playerOn: boolean }               // rest = 1 - restTicksLeft/restTicks de l'occupant
export interface SlotItem { key: SceneKey; type: "slot"; x: number; z: number;
  paid: number; remaining: number; ratio: number; playerOn: boolean }   // absent si construit
export interface DropItem { key: SceneKey; type: "drop"; resource: DropResource; amount: number;
  x: number; z: number }                                                 // décalage « tuile partagée » déjà appliqué
export type SceneItem = CharacterItem | NodeItem | TentItem | SlotItem | DropItem;

export interface SceneFrame {
  focus: { x: number; z: number };     // cible caméra = joueur interpolé
  welcome: { active: boolean; ratio: number };
  items: SceneItem[];                  // ordre stable : player, survivants (id), nœuds, tentes, slots, drops
}
export function buildScene(prev: Readonly<GameState>, curr: Readonly<GameState>, alpha: number): SceneFrame;

/** Décor statique, calculé une fois par carte (ne dépend que de `map`). */
export interface Placement { model: number; x: number; z: number; yaw: number; scale: number }
export interface StaticLayout {
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };   // carte + marge de forêt
  groundTiles: { tx: number; ty: number; shade: 0 | 1 | 2 }[];          // herbe A / herbe B / sous-bois
  borderTrees: Placement[];   // une par tuile "#" + anneau de FOREST_MARGIN_TILES tuiles hors carte
  rocks: Placement[];         // une par tuile "R"
  tufts: Placement[];         // herbe décorative, jamais sur W/Q/E/T/B/portes ni sur les nœuds
  decals: { kind: "welcome" | "queue" | "entrance"; x: number; z: number; w: number; d: number }[];
}
export function buildStaticLayout(map: Readonly<MapState>): StaticLayout;
```

Règles : réutilise `interpolate`, `harvestTarget`, `nodeHarvestRatio/nodeRegrowRatio`, `slotRemaining`, `isPlayerOn`
et la même logique d'interpolation des ratios que `renderer.ts` (à extraire en fonctions partagées
`shownHarvestRatio` / `shownRegrowRatio` dans `src/render/ratios.ts`, utilisées par les deux renderers).
Variantes (modèle, teinte, jitter, yaw, échelle) via `hash32(id)` ou `hash32(tx, ty)` — jamais `Math.random`.
Ne mute jamais ses entrées ; ne lit pas l'horloge.

### 4.4 Couche three : réconciliation

`src/render/three/` (fichiers important three) :

| Fichier | Rôle |
|---|---|
| `index.ts` | `createRenderer3D(...)`, assemble le tout, `onTick` / `draw` / `reset` / `dispose` |
| `webgl-support.ts` | test WebGL2→WebGL1 sur un canvas **jetable** |
| `stage.ts` | `WebGLRenderer`, scène, caméra, lumières, redimensionnement, plafond de pixelRatio |
| `static-layer.ts` | sol, décalques, `InstancedMesh` (bordure, rochers, touffes) depuis `StaticLayout` |
| `reconcile.ts` | `Map<SceneKey, View>` : crée / met à jour / retire ; pools par type |
| `views/*.ts` | `node-view`, `tent-view`, `slot-view`, `character-view`, `drop-view` |
| `loot-fx.ts` | butin 3D en vol (à partir de `fx.sample`, §4.7) |
| `overlay.ts` | barres, coûts, textes sur `#game` (projection 3D → écran) |
| `ground-labels.ts` | `CanvasTexture` des tapis (« Accueil », « Entrée », numéros 1..5) |

- Chaque `draw` : `frame = buildScene(prev, curr, alpha)` → `reconcile(frame)` → mixers → caméra → `render` → overlay.
- Une vue retirée (survivant parti, drop ramassé) : `mixer.stopAllAction()`, `mixer.uncacheRoot(root)`, retour au
  pool (max 12 personnages, 8 drops) ; au-delà du plafond de pool, retrait de la scène.
- Transitions détectées par la vue (statut précédent mémorisé côté vue, pas dans l'état) : nœud `depleted→ready` ⇒
  rebond (échelle 0,6 → 1,12 → 1 en 350 ms, easeOutBack) ; tente construite ⇒ apparition « pop » 300 ms.
- Objets statiques : `matrixAutoUpdate = false` + `updateMatrix()` une fois.

### 4.5 Correspondance éléments → modèles (liste blanche « shipped »)

Base visuelle KayKit ; Kenney **uniquement** tente (et feu, si validé). Les ids ci-dessous sont typés
`ShippedAssetId` dans `config.ts` (erreur de compilation si un modèle non livré est référencé).

| Élément | Modèle(s) | Remarques |
|---|---|---|
| Sol | procédural : `PlaneGeometry` carte + marge, couleurs par sommet (herbe A `#7cb85a` / B `#75b153`, sous-bois `#4e8a3b`) | 1 draw call |
| Tapis accueil / file / entrée | procédural : plans + `CanvasTexture` (§4.6) | |
| Arbres de bordure `#` + anneau hors carte | `forest/Tree_1_A_Color1`, `forest/Tree_2_A_Color1`, `forest/Tree_4_A_Color1` | `InstancedMesh`, yaw/échelle 0,85–1,15/jitter ±0,25 tuile par hash |
| Rochers `R` | `forest/Rock_3_A_Color1`, `forest/Rock_3_C_Color1` | instanciés, échelle d'instance ×3 (≈ 1,7 m) |
| Touffes d'herbe (décor) | `forest/Grass_1_A_Color1`, `forest/Grass_2_A_Color1` | instanciées, ≤ 2 par tuile d'herbe libre |
| Arbre récoltable prêt | `forest/Tree_3_A_Color1` (silhouette ronde ≠ bordure) | anneau jaune au sol si `targeted`, léger tremblement quand `harvest` progresse |
| Arbre récoltable épuisé | souche **procédurale** (cylindre 7 faces, Ø 0,7 m, h 0,35 m, écorce `#7a4a22`, dessus `#a8763f`) + pousse `Tree_3_A` à l'échelle `0,15 + 0,45 × regrow` | KayKit n'a pas de souche ; alternative à valider : `survival/tree-trunk` (Kenney) |
| Buisson prêt | `forest/Bush_2_A_Color1` (×4 ≈ 1,3 m) + 6 baies procédurales (sphères rouge/violet, positions = `BERRIES` du 2D) | baies dans un `InstancedMesh` partagé |
| Buisson vide | même modèle, **clone** de matériau désaturé (`#8a9a7c`), échelle `0,6 + 0,35 × regrow`, pas de baies | clone mis en cache, unique |
| Tente libre | `survival/tent-canvas` teintée vert clair (clone de matériau en cache) + liseré vert au sol | `survival/tent` (armature nue) **n'est plus livré** |
| Tente assignée | `survival/tent-canvas` teintée vert clair + liseré jaune pulsé | |
| Tente occupée | `survival/tent-canvas`, couleurs d'origine + barre de repos | |
| Tente en désordre | `survival/tent-canvas-half`, inclinée 5°, matériau assombri (clone ×0,75), bulle « ! » + barre de nettoyage | |
| Emplacement de construction | procédural : contour pointillé au sol + remplissage translucide (plus clair si `playerOn`) + anneau de progression | anneau = `RingGeometry(0,8 ; 0,95 ; 64 seg.)` + `setDrawRange(0, 6 × ⌊64 × ratio⌋)` (pas de reconstruction de géométrie) |
| Feu de camp | `survival/campfire-pit` — **non affiché par défaut** | aucune tuile non praticable dédiée ; on le livrera avec jour/nuit/cantine (choix à valider) |
| Joueur | `characters/Knight`, teinte d'origine + **anneau cyan au sol** sous lui (`COLORS3D.playerRing = 0x3fd4ff`, reçoit l'ombre, 1 draw call) | `characters/Barbarian` **n'est plus livré** |
| Survivants | `characters/Mage`, `Ranger`, `Rogue`, `Rogue_Hooded` × 5 teintes `[0xffffff, 0xffd6a5, 0xbde0fe, 0xcaffbf, 0xffadd6]` = 20 variantes | `v = hash32(id) % 20` ; modèle `v % 4`, teinte `floor(v / 4)` ; matériaux teintés = clones mis en cache par (modèle, teinte) |
| Animations | `animations/Rig_Medium_General` (clips gardés : `Idle_A`, `Interact`, `Use_Item`), `animations/Rig_Medium_MovementBasic` (`Walking_A`) | les autres clips sont retirés par le script (§4.10) |
| Butin bois / nourriture | procédural : 3 bûches (cylindres) / grappe de baies | aussi utilisé au sol pour les drops |
| Loup | `creatures/Wolf` — **non livré** (aperçu seulement) | |
| Pack `nature` (Quaternius), `items` | **non livrés** (aperçu seulement) | KayKit = base visuelle |

Personnages : clip `Walking_A` si `moving`, sinon `Idle_A` (`crossFadeTo` 0,2 s). Bonus si simple : `Use_Item` quand
le joueur récolte immobile, `Interact` pendant l'accueil. Orientation : yaw lissé vers `heading` (≤ 12 rad/s),
conservé quand `heading === null`. Survivant `resting` : masqué (il est « dans » la tente occupée).
`mixer.update(min(dt, 0.1))` avec `dt` mesuré par `performance.now()` dans `draw`.

### 4.6 Caméra, lumière, sol « My Perfect Hotel »

- **Caméra** : `PerspectiveCamera`, FOV vertical 35°, inclinaison 57° sous l'horizontale, **pas de rotation en lacet**
  (grille alignée à l'écran ⇒ haut du clavier = haut de l'écran, comme en 2D). Distance `d` **selon l'orientation** :
  - **paysage** (`aspect > 1`) : la carte entière en profondeur (~12 tuiles) et le plus possible en largeur, soit
    `d = clamp(dH(carte), D_MIN, D_MAX)` ; `D_MAX` (constante de `config.ts`) est relevé si nécessaire pour que la
    profondeur de la carte tienne à l'écran ;
  - **portrait** (`aspect ≤ 1`, façon My Perfect Hotel, **validé**) : caméra rapprochée qui **suit le joueur dans les
    deux axes** ; `d` est choisie pour que la largeur visible au niveau du joueur vaille
    `clamp(largeur CSS / 76, 5, 9)` tuiles (≈ 5,1 tuiles et d ≈ 35 m en 390×844). Le focus est borné pour montrer
    **au plus 4 tuiles hors carte au sud** (forêt proche de 3 rangées côté caméra).
  `D_MIN = 14` m ; le paysage reste inchangé (carte entière, vue centrée). Recalculée à chaque redimensionnement. Suivi amorti
  `focus += (cible − focus) × (1 − e^(−6·dt))` ; `reset()` recale sans lissage.
- **Lumière** : `HemisphereLight(#dff2ff, #7a9a4a, 1.1)` + `DirectionalLight(#fff1d6, 2.0)` direction (−0,5 ; 1 ; 0,35).
  Ombres `PCFSoftShadowMap`, carte 1024 (pointeur grossier) / 2048 (ordinateur), caméra d'ombre orthographique de
  demi-taille **proportionnelle à la distance caméra** (≈ `0,7 × d`, recalculée avec `d`), centrée sur le focus, recalée au texel (pas de scintillement), `bias −0.0005`, `normalBias 0.02`.
  `toneMapping = NeutralToneMapping` (couleurs vives, pas d'ACES qui désature), `outputColorSpace = SRGB`.
  Fond et brouillard léger `#a9d4a0` (de 30 m à 60 m) pour fondre la forêt de bordure.
- **Tapis au sol** (plans à y = 0,02, `polygonOffset`, reçoivent les ombres, ne projettent pas) :
  accueil = tapis arrondi jaune `#ffd857` liseré blanc, texte « Accueil », plus lumineux si le joueur est dessus ;
  file = bande beige `#efe1bd` sur les 5 tuiles `Q`, cases pointillées numérotées 1..5 ;
  entrée = chemin de terre `#c7a46c` prolongé de 3 tuiles hors carte, texte « Entrée ».
- **Point d'extension jour/nuit** : `stage.setDaylight(0..1)` (vide pour l'instant) appellera `library.setDaylight`.

### 4.7 Barres, coûts, textes, butin

- **Décision : calque 2D superposé** (`#game`, §4.2), pas de sprites 3D ni de DOM par entité. Raisons : texte net à
  tout DPR, taille en pixels indépendante de la perspective (lisibilité mobile garantie), mêmes fonctions `bar`/`label`
  que la 2D, zéro reflow DOM par image.
- Projection : `v.set(x, h, z).project(camera)` → px CSS. Taille de référence `tilePx` = largeur projetée d'une tuile
  au focus, **bornée à [44, 96] px** (mêmes bornes que la 2D). Barres : largeur `0,8 × tilePx`, hauteur ≥ 6 px.
- Contenu : barres de récolte/repousse (au-dessus du nœud, h = 2,6 m arbre / 1,4 m buisson), barre d'accueil,
  barre de repos (tente occupée), barre de nettoyage + « ! » (tente en désordre), coût restant « 15 » + « bois » au-dessus
  de l'emplacement, montant « +3 » des drops au sol, texte flottant de récolte.
- **Exclusion HUD/Menu** (validé) : les libellés du calque évitent la zone du HUD et du bouton Menu, mesurée par leur
  **boîte englobante réelle** (`getBoundingClientRect`). Si le coût d'un emplacement (ou une barre) tomberait sous le
  HUD, il est redessiné **sous** l'élément au lieu d'au-dessus.
- Butin : refactor minimal de `src/render/fx.ts` — ajout de `sample(nowMs, player, out): FxSample[]` qui expose les
  effets actifs en coordonnées monde (`{ phase: "fly", x, y, lift, size, resource }` / `{ phase: "text", x, y, rise,
  alpha, text, muted }`) ; `draw` (2D) est réécrit **sur** `sample` avec un rendu pixel-identique. En 3D : la phase
  `fly` déplace un mesh de butin procédural (pool de 16) en arc (lift en mètres = `ARC_HEIGHT_TILES × 2`), la phase
  `text` est dessinée dans le calque.

### 4.8 Chargement, repli 2D, messages

- **Écran de chargement** `src/ui/loading.ts` : `createLoadingScreen(root): { setProgress(r: number): void; remove(): void }`,
  `role="progressbar"`, `aria-valuenow`. Étapes : import du chunk (0 → 10 %, indéterminé), modèles via
  `library.load(ids, onProgress)` (10 → 90 %), `renderer.compileAsync(scene, camera)` (90 → 100 %).
- **Erreurs** : `createRenderer3D` rejette avec `Render3DError { reason: "webgl" | "assets" | "timeout" }`
  (timeout global 20 s). Avant de rejeter, il libère tout ce qu'il a créé (`dispose()`).
- **Repli** : `main.ts` crée le 2D, retire l'écran de chargement, pose un bandeau **fermable** via une nouvelle clé
  `BannerKey` `"render"` (dernière priorité) dans `src/ui/notices.ts` :
  - webgl : « La 3D n'est pas disponible sur cet appareil. Le jeu continue en 2D. »
  - assets / timeout : « Les modèles 3D n'ont pas pu être chargés. Le jeu continue en 2D. »
  - contexte WebGL perdu et non restauré après 3 s (en jeu) : `host.swap(createRenderer(#game))` + « Affichage 3D
    interrompu. Le jeu continue en 2D. »
  `console.warn` (pas `error`) avec la cause.
- **Contexte perdu** : `createRenderer3D(..., { onContextLost })` — option de rappel invoquée quand le contexte WebGL
  est perdu et non restauré dans le délai ; c'est `main.ts` qui la fournit et déclenche le repli 2D (le renderer ne
  connaît pas l'hôte). Cas **« contexte perdu avant la création de l'hôte »** (perte pendant le chargement ou entre la
  résolution de `createRenderer3D` et `createRenderHost`) : le rappel mémorise la demande et le swap vers la 2D est
  **différé** jusqu'à ce que l'hôte existe, puis exécuté immédiatement (une seule fois, même bandeau).
- `#app` porte `data-render="2d" | "3d"` et `data-render-ready="1"` une fois la première image dessinée (pour les e2e).

### 4.9 Mémoire, redimensionnement, performance

- `reset()` (appelé par `replaceState` : nouvelle partie, import, chargement) : vide toutes les vues dynamiques
  (mixers arrêtés + `uncacheRoot`, `skeleton.dispose()`), vide les pools, `InstancedMesh` des baies `dispose()`,
  `fx.reset()`, caméra recalée. Le décor statique est reconstruit seulement si `map` change de référence. La
  bibliothèque de modèles est **conservée** (bornée par la liste blanche). Critère : `renderer.info.memory`
  (géométries, textures) identique après 1 et après 5 nouvelles parties.
- `dispose()` (ajouté en **optionnel** à l'interface `Renderer` : `dispose?(): void`) : `reset()` + toutes les
  ressources procédurales (suivies dans un `Set<{ dispose(): void }>`), `library.dispose()`,
  `renderer.dispose()` + `forceContextLoss()`, retrait du canvas WebGL, `ResizeObserver` et écouteurs retirés.
- Redimensionnement : `ResizeObserver` sur `#app` ⇒ `setSize(w, h, false)`, `aspect`, distance caméra, taille du calque.
- `setPixelRatio(min(devicePixelRatio, coarsePointer ? 1.5 : 2))`. Adaptatif une seule fois : moyenne > 22 ms sur 3 s
  ⇒ pixelRatio 1 et ombres 1024 (pas d'oscillation).
- Budget (vérifié via `renderer.info.render`) : **< 120 draw calls**, < 200 k triangles, ≤ 10 personnages
  (file 5 + 4 tentes + joueur). Antialias activé.
- Lecture seule de stats pour les e2e : `window.__render3d = { info(): { calls, triangles, geometries, textures } }`
  (aucun accès à l'état).

### 4.10 Assets : liste blanche versionnée (décision)

- `tools/shipped-assets.json` (nouveau) : ids de §4.5 marqués « livrés » + filtre de clips pour les 2 fichiers
  d'animation.
- `tools/build-assets.mjs` évolue (fichier protégé ⇒ **agent principal, avec accord de l'humain**) :
  1. conversion complète inchangée, mais écrite dans `assets-all/assets/<pack>/` (racine, **gitignoré**, servi par
     `vite dev` pour la page d'aperçu) ;
  2. écrit **d'abord** les modèles livrés (+ `.bin`, textures référencées, `LICENSE.txt`, animations ré-exportées avec
     les seuls clips gardés) dans un dossier de préparation `assets-all/.shipped-staging/<pack>/` ;
  3. **ne remplace `public/assets/` et le catalogue qu'en cas de succès complet** : sources présentes, liste blanche
     entièrement résolue (chaque id et chaque clip trouvé), total livré ≤ 4 Mo (cible ≤ 2,5 Mo). Sinon : échec, message
     explicite, `public/assets/` et le catalogue existants intacts ;
  4. catalogue : toutes les entrées + champ `shipped: boolean` + `clips` (**tous** les clips du fichier source) +
     `shippedClips` (clips réellement livrés, sous-ensemble de `clips`) + `export const SHIPPED_IDS = [...] as const`
     et `export type ShippedAssetId`. Le renderer ne joue que des `shippedClips`.
- `npm run assets:size` : vérifie la taille de `public/assets/` (≤ 4 Mo) sans reconvertir (`tools/check-assets-size.mjs`).
- `tools/asset-preview/preview.ts` : `createAssetLibrary("/assets-all/")` (le chargeur accepte déjà `baseUrl`).
- `public/assets/` (sous-ensemble) est **versionné** ; Vite ne copie dans `dist/` que ce sous-ensemble.
- Résultat : liste blanche de **18 modèles**, **2,46 Mo** livrés (`characters/Barbarian` et `survival/tent` retirés).
- `.gitignore` (agent principal) : `assets-all/`, `test-results/`, `playwright-report/`.
- **`captures/` est versionné** (décision de l'utilisateur) : il ne contient que les captures choisies, régénérées par
  `npm run captures`. Les sorties automatiques de Playwright (captures d'échec, traces, rapport) vont dans
  `test-results/` et `playwright-report/` (ignorés).
- **CI** (`.github/workflows/ci.yml`) : en plus de typecheck/lint/test/build, exécute `npm run assets:size` et les e2e
  Playwright (Chromium, WebGL logiciel SwiftShader, cf. §6.3).

### 4.11 CREDITS.md (agent principal — hors périmètre des sous-agents)

Compléter avec la colonne **Licence** (CC0 1.0 pour tous), le **lien exact** de chaque pack et la colonne
« Livré dans le jeu » : KayKit Adventurers 2.0 (Kay Lousberg, <https://kaylousberg.itch.io/kaykit-adventurers>, oui) ;
KayKit Forest Nature Pack 1.0 (Kay Lousberg, <https://kaylousberg.itch.io/kaykit-forest>, oui) ;
Survival Kit 2.0 (Kenney, <https://kenney.nl/assets/survival-kit>, oui — tentes) ;
Stylized Nature MegaKit (Quaternius, <https://quaternius.com>, aperçu seulement) ;
Wolf (Quaternius, aperçu seulement — licence CC0 **à vérifier** sur la page de téléchargement, conserver la mention).
Vérifier chaque lien et le texte de `LICENSE.txt` copié par le script avant de committer.

---

## 5. Anti-triche

- Le renderer 3D ne reçoit que `Readonly<GameState>` et n'appelle jamais `applyCommand` ; `buildScene` est testé
  sur des états gelés en profondeur (`Object.freeze`).
- Le paramètre `?render=` n'influence ni l'état, ni la save, ni la boucle (même `stepBudget`, mêmes ticks).
- `window.__render3d` n'expose que des compteurs de rendu ; `window.__game` reste réservé au DEV (inchangé).
- Invariants (`checkInvariants`) et validation au chargement : inchangés.

---

## 6. Tests

### 6.1 Vitest — `tests/render/scene-model.test.ts` (sans WebGL, sans three)
- État initial ⇒ 1 `player`, 1 tente `free`, 3 slots, 5 nœuds, 0 survivant/drop ; clés uniques et stables.
- Conversion : joueur au centre de `P` (7,8) ⇒ `x = 15`, `z = 17` m ; `alpha = 0 / 0,5 / 1` ⇒ positions = prev / milieu
  / curr ; `alpha` NaN, −1, 2 ⇒ borné ; saut > 1 tuile ⇒ pas d'interpolation.
- `moving` / `heading` : déplacement vers +x ⇒ `heading = π/2` ; immobile ⇒ `moving false`, `heading null`.
- Survivant `resting` ⇒ `visible false` ; tente occupée ⇒ `rest` ∈ [0, 1] croissant.
- Tentes : un `TentItem.status` par statut ; slot construit ⇒ plus de `SlotItem`, tente présente.
- Nœuds : `targeted` ssi `harvestTarget(curr)` ; `harvest`/`regrow` égaux aux ratios 2D ; buisson épuisé ⇒ `ready false`.
- Drops : bois + nourriture sur la même tuile ⇒ décalages opposés.
- Variantes : même id ⇒ même `(model, tint)` quel que soit l'ordre des survivants ; ids 1..200 ⇒ ≥ 10 variantes
  distinctes (répartition).
- Pureté / déterminisme : entrées gelées non mutées ; deux appels identiques ⇒ `toEqual` ; simulation 600 ticks
  (bot existant de `tests/core/helpers.ts`) avec `buildScene` à chaque tick ⇒ aucune exception, aucune valeur NaN.

### 6.2 Vitest — `tests/render/static-layout.test.ts`, `tests/app/render-mode.test.ts`
- `buildStaticLayout(referenceMap())` : 1 arbre par tuile `#` dans la carte + anneau de marge ; 1 rocher par `R` ;
  aucune touffe sur W/Q/E/T/B/portes/nœuds ; déterministe (deux appels `toEqual`) ; bornes = carte + marge.
- `parseRenderMode` : `?render=3d`, `?render=3D`, `?x=1&render=3d` ⇒ 3d ; `""`, `?render=2d`, `?render=3`,
  `?render=3d3` ⇒ 2d.
- **Tous les tests existants passent sans modification.**

### 6.3 Playwright — `tests/e2e/*.spec.ts` (hors Vitest : suffixe `.spec.ts`, Vitest ne prend que `*.test.ts`)
- Cible : build de prod (`webServer: npm run build && npx vite preview --port 4173`), Chromium seul,
  `launchOptions.args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]`
  (WebGL en headless, local et CI). `outputDir: "test-results"`, rapport dans `playwright-report/`.
- `render-3d.spec.ts` : `/?render=3d` ⇒ `data-render="3d"` + `data-render-ready` ; **aucun** `console.error` ni
  `pageerror` ; aucune réponse 404 ; `__render3d.info().calls < 120`.
- Captures choisies (versionnées) `captures/camp-3d-desktop.png` (1280×720) et `captures/camp-3d-mobile.png`
  (390×844, portrait) : produites uniquement par `npm run captures`, pas par la suite e2e ordinaire. `npm run captures`
  produit aussi une **partie en cours** (file d'attente, tente occupée, tente en désordre, butin en vol) en paysage et
  en portrait.
- `render-2d.spec.ts` : `/` ⇒ `data-render="2d"` ; **aucune** requête vers un chunk three ni un `.gltf`.
- `render-fallback.spec.ts` : (a) `addInitScript` qui fait renvoyer `null` à `getContext("webgl" | "webgl2" |
  "experimental-webgl")` ⇒ 2D + bandeau « La 3D n'est pas disponible », 0 `pageerror` ;
  (b) `page.route("**/*.gltf", r => r.abort())` ⇒ 2D + bandeau « modèles 3D », 0 `pageerror`.
- `render-memory.spec.ts` : en 3D, 5 × (menu → Nouvelle partie → confirmer) ⇒ `geometries`/`textures` stables, 0 erreur.

---

## 7. Découpage des tâches

| # | Agent | Tâche | Fichiers |
|---|---|---|---|
| 0 | **humain** | Valider : Playwright (`@playwright/test` en devDependency + Chromium), taille des assets versionnés, souche procédurale, feu non affiché, `captures/` versionné (validé) | — |
| 1 | agent principal | Liste blanche + évolution du script (§4.10), `npm run assets`, aperçu sur `assets-all/`, `.gitignore`, CREDITS.md (§4.11), règle ESLint `three`, `playwright.config.ts` + script `"e2e": "playwright test"` | `tools/`, `.gitignore`, `CREDITS.md`, `eslint.config.js`, `package.json`, `playwright.config.ts` |
| 2 | render-dev | `config.ts`, `hash.ts`, `scene-model.ts` (pur), extraction `src/render/ratios.ts` | `src/render/three/`, `src/render/` |
| 3 | test-writer | Tests §6.1 et §6.2 (dès que #2 est livré) | `tests/render/`, `tests/app/` |
| 4 | render-dev | Couche three (§4.4–4.7, 4.9) + `fx.sample` + calque overlay | `src/render/three/`, `src/render/fx.ts`, `src/render/renderer.ts` (`dispose?` optionnel) |
| 5 | render-dev | `render-mode.ts`, `render-host.ts`, `main.ts`, écran de chargement, clé de bandeau `"render"`, CSS | `src/app/`, `src/main.ts`, `src/ui/`, `src/styles/`, `index.html` |
| 6 | test-writer | E2E §6.3 (après #1, #4, #5) | `tests/e2e/` |
| 7 | reviewer | Revue : 0 diff dans `src/core`, `src/save`, `src/data`, `tests/core`, `tests/save` ; pas de `three` dans le chunk d'entrée ; budget draw calls ; dispose | — |
| — | core-dev, save-guardian, balance-designer | **Rien.** Aucune règle, aucun état, aucune constante de gameplay | — |

Dépendances : 0 → 1 → (2 → 3) ∥ 4 → 5 → 6 → 7. En fin de feature : cocher le Jalon 1.5 dans `docs/ROADMAP.md`.

## 8. Docs à nuancer (3D = prototype)

- `docs/SPEC.md` et `docs/ROADMAP.md` : mis à jour avec ce plan (2D par défaut, 3D en prototype, caméra perspective,
  base KayKit).
- `CLAUDE.md` (hors périmètre de l'architecte) — phrase à remplacer, ligne 3 :
  « Jeu de gestion-survie vue de dessus (rendu 3D three.js, gameplay sur grille 2D) dans le navigateur » →
  « Jeu de gestion-survie vue de dessus (gameplay sur grille 2D ; rendu Canvas 2D par défaut, rendu 3D three.js en
  prototype via `?render=3d`) dans le navigateur ». Et la règle « `three` uniquement dans `src/render` » →
  « `three` uniquement dans `src/render/three` et `src/render/assets` (chargés par import dynamique) et `tools/` ».
  Ajouter `npm run e2e` à la liste des commandes.
- `.claude/skills/three-render/SKILL.md` (protégé, humain) diverge de ce plan : caméra orthographique tournée de 45°,
  pack `nature` comme style principal, WebGL sur le même `<canvas>`. À aligner sur §4.2, §4.5, §4.6 et §4.10.
