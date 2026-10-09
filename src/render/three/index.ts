// Renderer 3D (rendu par défaut ; `?render=2d` force la 2D) derrière l'interface Renderer existante.
// Chargé UNIQUEMENT par import() dynamique depuis src/main.ts : three.js reste hors du bundle 2D.
// LECTURE SEULE : ne reçoit que des Readonly<GameState>, n'appelle jamais applyCommand.
//
// Chaque draw : buildScene (pur) → feu → stage.setLighting (jour/nuit, feu, joueur, ombres) →
// réconciliation des vues → mixers → caméra → render → calque 2D.

import * as THREE from "three";
import { referenceMap, type GameState, type MapState } from "../../core";
import { createAssetLibrary, type AssetLibrary } from "../assets/asset-loader";
import { lightingAt } from "../daylight";
import { createFxLayer, type FxSample } from "../fx";
import type { GuideTarget, Presentation, Quality, Renderer, ScreenInsets } from "../renderer";
import { createCharacterKit, type CharacterKit } from "./characters";
import {
  ANIM,
  CHARACTER_MODELS,
  GUIDE,
  LOADING,
  MODEL_IDS,
  QUALITY,
  QUALITY_LEVELS,
  RENDER3D_ASSET_IDS,
  TILE_METERS,
  TITLE,
  U,
  toMeters,
} from "./config";
import { Render3DError } from "./errors";
import { createLootFx, type LootFx } from "./loot-fx";
import { createOverlay, type Overlay } from "./overlay";
import { createProcedural, DECAL_Y, type Procedural } from "./procedural";
import { createReconciler, type Reconciler } from "./reconcile";
import { buildScene, buildStaticLayout, type FireItem, type SceneFrame } from "./scene-model";
import { createStage, type Stage } from "./stage";
import { createStaticLayer, type StaticLayer } from "./static-layer";
import { FireView } from "./views/fire-view";
import { GuideView } from "./views/guide-view";
import { createBerryLayer, createViewKit, setMaterials, type BerryLayer, type FrameContext, type ViewKit } from "./views/kit";
import { createMessyTent } from "./views/tent-view";
import { detectWebGL } from "./webgl-support";
import type { LightPhase } from "../../core";
import type { ShadowOwner } from "../daylight";

export { Render3DError, isRender3DError, type Render3DFailure } from "./errors";

export interface Render3DOptions {
  coarsePointer: boolean;
  /** Avancement global du chargement dans [0,1] (0,1 → 0,9 : modèles ; 0,9 → 1 : compilation). */
  onProgress?: (ratio: number) => void;
  /** Contexte WebGL perdu et non restauré après LOADING.contextRestoreMs : l'app doit basculer en 2D. */
  onContextLost?: () => void;
  /**
   * Qualité choisie par le joueur (préférences), appliquée AVANT le warm-up : les programmes sont
   * compilés une seule fois dans la bonne configuration d'ombres (sinon, en Bas, tout est compilé avec
   * ombres puis recompilé sans à la première image : double compilation, très lente en WebGL logiciel).
   * Absente = défaut de l'appareil + dégradation adaptative.
   */
  quality?: Quality | null;
}

export interface Render3DInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Sous-phase de lumière affichée à la dernière image (null avant la première image). */
  light: LightPhase | null;
  /** Lumière qui porte l'ombre : "sun" | "fire". */
  shadow: ShadowOwner;
  /** Feu affiché allumé à la dernière image. */
  fireLit: boolean;
  /** Présentation courante ("play" | "title"). */
  presentation: Presentation;
  /** Flèche du tutoriel affichée à la dernière image. */
  guide: boolean;
  /** Niveau de qualité appliqué (défaut de l'appareil tant que setQuality n'a pas été appelé). */
  quality: Quality;
  /** Nombre de programmes de shaders vivants (borné, cf. changements de qualité). */
  programs: number;
}

/** Nombre max de buissons pris en charge par le calque de baies (6 baies chacun). */
const MAX_BUSHES = 16;
/** Hauteur de l'anneau du joueur : juste au-dessus des décalques (tapis, anneaux) pour passer devant. */
const PLAYER_RING_Y = DECAL_Y + 0.005;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Render3DError("timeout", `chargement 3D > ${ms} ms`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Crée le renderer 3D. `canvas` = #game, qui devient le calque 2D transparent (barres, textes) ;
 * le canvas WebGL est créé et inséré juste avant lui dans son parent.
 * Rejette avec Render3DError { reason: "webgl" | "assets" | "timeout" } après avoir tout libéré.
 */
export async function createRenderer3D(canvas: HTMLCanvasElement, opts: Render3DOptions): Promise<Renderer> {
  const host = canvas.parentElement;
  if (!host) throw new Render3DError("webgl", "#game sans parent");
  const support = detectWebGL();
  if (support !== "webgl2") throw new Render3DError("webgl", `WebGL 2 indisponible (${String(support)})`);

  const cleanups: (() => void)[] = [];
  const cleanup = (): void => {
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try {
        cleanups[i]?.();
      } catch (e) {
        console.warn("[render3d] libération partielle", e);
      }
    }
    cleanups.length = 0;
  };

  let stage: Stage;
  try {
    stage = createStage(host, canvas, opts.coarsePointer);
  } catch (e) {
    throw new Render3DError("webgl", "création du contexte WebGL impossible", e);
  }
  cleanups.push(() => stage.dispose());

  const library: AssetLibrary = createAssetLibrary();
  cleanups.push(() => library.dispose());

  let aborted = false;
  try {
    return await withTimeout(
      assemble(canvas, opts, stage, library, cleanup, cleanups, () => aborted),
      LOADING.timeoutMs,
    );
  } catch (e) {
    aborted = true;
    cleanup();
    if (e instanceof Render3DError) throw e;
    throw new Render3DError("assets", "chargement des modèles 3D impossible", e);
  }
}

async function assemble(
  overlayCanvas: HTMLCanvasElement,
  opts: Render3DOptions,
  stage: Stage,
  library: AssetLibrary,
  cleanupAll: () => void,
  cleanups: (() => void)[],
  isAborted: () => boolean,
): Promise<Renderer> {
  const progress = (r: number): void => {
    if (!isAborted()) opts.onProgress?.(Math.min(1, Math.max(0, r)));
  };
  /** Après chaque attente : abandon si le délai global a expiré entre-temps (tout est déjà libéré). */
  const checkpoint = (): void => {
    if (isAborted()) throw new Render3DError("timeout", "chargement 3D abandonné");
  };
  progress(0.1);
  await library.load(RENDER3D_ASSET_IDS, (done, total) => progress(0.1 + 0.8 * (done / Math.max(1, total))));
  checkpoint();

  const { renderer, scene, camera } = stage;
  // Qualité choisie connue dès le démarrage : ombres / pixelRatio fixés avant toute compilation.
  const initialQuality: Quality | null = opts.quality && opts.quality in QUALITY_LEVELS ? opts.quality : null;
  if (initialQuality) stage.setQuality(initialQuality);
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const proc: Procedural = createProcedural(anisotropy);
  cleanups.push(() => proc.dispose());
  const characters: CharacterKit = createCharacterKit(library);
  cleanups.push(() => characters.dispose());
  const kit: ViewKit = createViewKit(library, proc, characters);
  cleanups.push(() => kit.dispose());
  kit.emptyBush.prepare(library.meshes(MODEL_IDS.bush));
  kit.messyTent.prepare(library.meshes(MODEL_IDS.tent));
  kit.freeTent.prepare(library.meshes(MODEL_IDS.tent));
  kit.closedTent.prepare(library.meshes(MODEL_IDS.tent));
  kit.firePit.prepare(library.meshes(MODEL_IDS.campfire));

  const dynamic = new THREE.Group();
  dynamic.name = "dynamic";
  scene.add(dynamic);
  const loot: LootFx = createLootFx(kit);
  scene.add(loot.group);
  cleanups.push(() => loot.dispose());
  let berries: BerryLayer = createBerryLayer(proc, MAX_BUSHES * 6);
  scene.add(berries.mesh);
  cleanups.push(() => berries.dispose());
  const reconciler: Reconciler = createReconciler(dynamic, kit);
  cleanups.push(() => reconciler.clear());
  // Anneau au sol sous le joueur : suit sa position interpolée, reçoit l'ombre sans en projeter.
  // Ajouté avant le warm-up pour que son programme (avec ombres reçues) soit précompilé.
  const playerRing = new THREE.Mesh(proc.playerRing.geometry, proc.playerRing.material);
  playerRing.name = "player-ring";
  playerRing.receiveShadow = true;
  playerRing.castShadow = false;
  playerRing.renderOrder = 1;
  scene.add(playerRing);
  cleanups.push(() => playerRing.removeFromParent());
  // Feu de camp : vue unique et persistante (foyer + flammes + braises), réutilisée après reset().
  const fireView = new FireView(kit);
  scene.add(fireView.object);
  cleanups.push(() => fireView.destroy());
  // Flèche du tutoriel : vue unique (chevron + anneau), masquée hors tutoriel.
  const guideView = new GuideView();
  scene.add(guideView.object);
  cleanups.push(() => guideView.dispose());

  let staticLayer: StaticLayer | null = null;
  /** Centre du tapis d'accueil (m), recalculé seulement quand la carte change. */
  let welcomeDecal: { x: number; z: number } | null = null;
  cleanups.push(() => staticLayer?.dispose());
  function ensureStatic(map: Readonly<MapState>): StaticLayer {
    if (staticLayer && staticLayer.map === map) return staticLayer;
    staticLayer?.dispose();
    staticLayer = createStaticLayer(map, buildStaticLayout(map), library, anisotropy);
    welcomeDecal = staticLayer.layout.decals.find((d) => d.kind === "welcome") ?? null;
    scene.add(staticLayer.group);
    stage.setMapSize(map.width * TILE_METERS, map.height * TILE_METERS);
    return staticLayer;
  }

  // --- Warm-up : programmes compilés et géométries / textures partagées téléversées une fois, pour
  // que la mémoire GPU ne grandisse pas en cours de partie (critère : stable après 5 nouvelles parties).
  const map0 = referenceMap();
  ensureStatic(map0);
  const center = { x: (map0.width * TILE_METERS) / 2, z: (map0.height * TILE_METERS) / 2 };
  stage.follow(center, 0, true);
  const warm = new THREE.Group();
  const warmChars = CHARACTER_MODELS.map((m) => characters.create(m, 0xffffff));
  for (const c of warmChars) warm.add(c.model);
  for (const id of [MODEL_IDS.nodeTree, MODEL_IDS.bush, MODEL_IDS.tent]) {
    warm.add(library.create(id));
  }
  {
    // Variantes de matériaux (tente libre, tente en désordre + sac de couchage) : programmes compilés au warm-up.
    const freeTent = library.create(MODEL_IDS.tent);
    setMaterials(freeTent, (b) => kit.freeTent.get(b), new Map());
    warm.add(freeTent);
    const closedTent = library.create(MODEL_IDS.tent);
    setMaterials(closedTent, (b) => kit.closedTent.get(b), new Map());
    warm.add(closedTent);
    warm.add(createMessyTent(kit));
  }
  // Feu : flammes, fumée et braises visibles pendant la compilation (points additifs / normaux).
  fireView.showAllForWarmup(center.x, center.z);
  guideView.showForWarmup(center.x, center.z);
  for (const { geometry, material } of proc.all()) {
    const m = new THREE.Mesh(geometry, material);
    m.frustumCulled = false;
    warm.add(m);
  }
  warm.position.set(center.x, 0, center.z);
  scene.add(warm);
  playerRing.position.set(center.x, PLAYER_RING_Y, center.z);
  try {
    await renderer.compileAsync(scene, camera);
    checkpoint();
    renderer.render(scene, camera);
  } finally {
    scene.remove(warm);
    for (const c of warmChars) c.destroy();
    guideView.object.visible = false;
  }
  progress(1);

  // --- Calque 2D (créé en dernier : le premier getContext("2d") de #game fixe alpha: true) ---
  const overlay: Overlay = createOverlay(overlayCanvas, opts.coarsePointer);
  cleanups.push(() => overlay.dispose());

  // --- Contexte WebGL perdu ---
  let contextLost = false;
  let lostTimer: number | null = null;
  const onLost = (e: Event): void => {
    e.preventDefault(); // autorise la restauration
    // Journalisé (avertissement) : sans cela, une perte due au navigateur (processus GPU tué sous
    // charge) est indiscernable d'un bug de rendu dans les traces e2e.
    if (!contextLost) console.warn("[render] contexte WebGL perdu : attente de restauration");
    contextLost = true;
    stage.canvas.dataset.contextLost = "1"; // masqué (main.css) : pas de canvas « cassé » à l'écran
    if (lostTimer !== null) window.clearTimeout(lostTimer);
    lostTimer = window.setTimeout(() => {
      lostTimer = null;
      if (contextLost) opts.onContextLost?.();
    }, LOADING.contextRestoreMs);
  };
  const onRestored = (): void => {
    if (contextLost) console.warn("[render] contexte WebGL restauré");
    contextLost = false;
    delete stage.canvas.dataset.contextLost;
    // Cartes d'ombre recréées vides par three : la carte active est redessinée à la prochaine image.
    stage.refreshShadows();
    if (lostTimer !== null) window.clearTimeout(lostTimer);
    lostTimer = null;
  };
  stage.canvas.addEventListener("webglcontextlost", onLost);
  stage.canvas.addEventListener("webglcontextrestored", onRestored);
  cleanups.push(() => {
    stage.canvas.removeEventListener("webglcontextlost", onLost);
    stage.canvas.removeEventListener("webglcontextrestored", onRestored);
    if (lostTimer !== null) window.clearTimeout(lostTimer);
  });

  // --- Présentation (écran titre, flèche du tutoriel, qualité, mouvement réduit) : jamais l'état ---
  let presentation: Presentation = "play";
  let guide: GuideTarget | null = null;
  let reducedMotion = false;
  let quality: Quality = opts.coarsePointer ? "medium" : "high";
  /** Début de l'orbite de l'écran titre (ms, horloge d'affichage). */
  let titleStart = 0;
  /** Éclairage forcé de l'écran titre (nuit bleutée), calculé une fois. */
  const titleLighting = lightingAt(TITLE.lightTick);
  let titleOverlayCleared = false;

  // --- Statistiques en lecture seule pour les e2e (aucun accès à l'état) ---
  let shownLight: LightPhase | null = null;
  const info = (): Render3DInfo => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    light: shownLight,
    shadow: stage.shadowOwner(),
    fireLit: fireView.isLit(),
    presentation,
    guide: guideView.isShown(),
    quality,
    programs: renderer.info.programs?.length ?? 0,
  });
  const w = window as unknown as { __render3d?: { info(): Render3DInfo } };
  w.__render3d = Object.freeze({ info });
  cleanups.push(() => {
    if (w.__render3d?.info === info) delete w.__render3d;
  });

  // --- Boucle de rendu ---
  const fx = createFxLayer();
  const samples: FxSample[] = [];
  const playerUnits = { x: 0, y: 0 };
  const ctx: FrameContext = { dt: 0, now: 0, playerAction: null, berries, live: false };
  let lastNow: number | null = null;
  let snapCamera = true;
  let firstFrame = true;
  // Qualité adaptative (une seule fois) : moyenne des images après la période de chauffe.
  let qualityStart: number | null = null;
  let qualityFrames = 0;
  let qualityTime = 0;
  let degraded = false;
  let disposed = false;
  let overlayCleared = false;

  function playerActionOf(frame: SceneFrame): FrameContext["playerAction"] {
    for (const it of frame.items) {
      if ((it.type === "tree" || it.type === "bush") && it.targeted) return "harvest";
      // Verser du bois au feu : même geste (Use_Item) que la récolte.
      if (it.type === "fire" && it.feeding) return "harvest";
    }
    return frame.welcome.active && frame.welcome.ratio > 0 ? "welcome" : null;
  }

  function adapt(now: number, dtMs: number): void {
    if (degraded || dtMs <= 0 || dtMs > 250) return;
    if (qualityStart === null) qualityStart = now;
    if (now - qualityStart < QUALITY.warmupMs) return;
    qualityFrames++;
    qualityTime += dtMs;
    if (qualityTime < QUALITY.windowMs) return;
    const avg = qualityTime / qualityFrames;
    degraded = true;
    if (avg > QUALITY.slowFrameMs) {
      console.warn(`[render3d] images lentes (${avg.toFixed(1)} ms) : qualité réduite`);
      stage.degrade();
      overlay.degrade();
    }
  }

  /**
   * Cible de la flèche en mètres + hauteur de la pointe : au-dessus des barres d'une tente ou d'un arbre
   * prêt présents sur la tuile visée (lecture seule de l'état).
   */
  const guideAnchor = { x: 0, z: 0, height: 0 };
  function guideAnchorOf(g: GuideTarget, curr: Readonly<GameState>): typeof guideAnchor {
    const tx = Math.floor(g.x / U);
    const ty = Math.floor(g.y / U);
    let height: number = GUIDE.heightM;
    for (const n of curr.nodes) {
      if (n.kind === "tree" && n.status === "ready" && n.tile.tx === tx && n.tile.ty === ty) {
        height = GUIDE.heightTreeM;
        break;
      }
    }
    if (height === GUIDE.heightM) {
      for (const t of curr.tents) {
        if (t.tile.tx === tx && t.tile.ty === ty) {
          height = GUIDE.heightTentM;
          break;
        }
      }
    }
    guideAnchor.x = toMeters(g.x);
    guideAnchor.z = toMeters(g.y);
    guideAnchor.height = height;
    return guideAnchor;
  }

  /** Écran titre : feu forcé allumé À L'IMAGE (ratio ≥ TITLE.fireMinRatio) ; l'état n'est pas touché. */
  function titleFire(it: FireItem): FireItem {
    return { ...it, lit: true, low: false, feeding: false, ratio: Math.max(it.ratio, TITLE.fireMinRatio) };
  }

  function applyQuality(q: Quality): void {
    quality = q;
    stage.setQuality(q);
    overlay.setQuality(q);
    fireView.setFlameBudget(QUALITY_LEVELS[q].flames);
    degraded = true; // plus de dégradation adaptative : le joueur a choisi
  }

  function reset(): void {
    reconciler.clear();
    berries.dispose();
    berries = createBerryLayer(proc, MAX_BUSHES * 6);
    scene.add(berries.mesh);
    ctx.berries = berries;
    fx.reset();
    loot.hideAll();
    overlay.clear();
    fireView.reset();
    // Chargement possible en pleine nuit : la carte d'ombre active date d'une autre partie.
    stage.refreshShadows();
    snapCamera = true;
    firstFrame = true;
  }

  // Calque, flammes et état exposé alignés sur la qualité déjà appliquée à la scène (sans recompilation :
  // shadowMap.enabled ne change plus).
  if (initialQuality) applyQuality(initialQuality);

  return {
    onTick(prev: Readonly<GameState>, curr: Readonly<GameState>): void {
      fx.onTick(prev, curr, performance.now());
    },

    draw(prev: Readonly<GameState>, curr: Readonly<GameState>, alpha: number): void {
      if (disposed) return;
      const now = performance.now();
      const dtMs = lastNow === null ? 0 : now - lastNow;
      lastNow = now;
      adapt(now, dtMs);
      if (contextLost) {
        // Pas de barres figées au-dessus d'un canvas WebGL vide.
        if (!overlayCleared) {
          overlay.clear();
          overlayCleared = true;
        }
        return;
      }
      overlayCleared = false;

      const layer = ensureStatic(curr.map);
      const frame = buildScene(prev, curr, alpha);
      const title = presentation === "title";
      // Écran titre : nuit bleutée forcée (présentation seulement, le tick n'est pas lu).
      const lighting = title ? titleLighting : frame.lighting;
      ctx.dt = Math.min(dtMs / 1000, ANIM.maxDtS);
      ctx.now = now;
      ctx.playerAction = playerActionOf(frame);
      ctx.live = !firstFrame;

      // Feu (vue unique) puis éclairage : jour/nuit, lumières du feu et du joueur, bascule des ombres.
      let fireLight: ReturnType<FireView["update"]> | null = null;
      let fireCenter: { x: number; z: number } | null = null;
      for (const it of frame.items) {
        if (it.type === "fire") {
          fireLight = fireView.update(title ? titleFire(it) : it, ctx);
          fireCenter = { x: it.x, z: it.z };
          break;
        }
      }
      fireView.object.visible = fireLight !== null;
      stage.setLighting(lighting, { fire: fireLight, player: frame.focus });
      library.setDaylight(lighting.daylight);
      shownLight = lighting.phase;

      berries.begin();
      reconciler.sync(frame, ctx);
      berries.end();
      layer.setWelcomeActive(frame.welcome.active);
      layer.setNightWeight(1 - lighting.sunWeight);
      const pulse = 0.55 + 0.4 * Math.sin((now / 1000) * ANIM.pulseHz * Math.PI * 2);
      proc.tentFrame.assigned.opacity = pulse;

      playerUnits.x = (frame.focus.x / TILE_METERS) * U;
      playerUnits.y = (frame.focus.z / TILE_METERS) * U;
      playerRing.position.set(frame.focus.x, PLAYER_RING_Y, frame.focus.z);
      playerRing.visible = !title;
      fx.sample(now, playerUnits, samples);
      loot.update(samples, now);

      if (title) {
        // Orbite lente autour du feu (angle fixe en mouvement réduit) ; retour au jeu : recalage net.
        const t = (now - titleStart) / 1000;
        const yaw = TITLE.orbitYaw0 + (reducedMotion ? 0 : (2 * Math.PI * t) / TITLE.orbitPeriodS);
        stage.orbit(fireCenter ?? frame.focus, yaw);
        snapCamera = true;
      } else {
        stage.follow(frame.focus, ctx.dt, snapCamera, frame.framing);
        snapCamera = false;
      }
      firstFrame = false;

      const anchor = !title && guide ? guideAnchorOf(guide, curr) : null;
      guideView.update(anchor, camera, now, reducedMotion);

      stage.prepareRender();
      renderer.render(scene, camera);

      if (title) {
        // Ni barres, ni libellés, ni flèche sur le fond de l'écran titre.
        if (!titleOverlayCleared) {
          overlay.clear();
          titleOverlayCleared = true;
        }
        return;
      }
      titleOverlayCleared = false;
      overlay.draw(frame, samples, camera, welcomeDecal, now);
      if (anchor) overlay.drawGuideEdge(camera, anchor, now, reducedMotion);
    },

    reset,

    setScreenInsets(insets: ScreenInsets): void {
      overlay.setInsets(insets);
    },

    setPresentation(p: Presentation): void {
      if (p === presentation) return;
      presentation = p;
      if (p === "title") titleStart = performance.now();
      // Retour au jeu : caméra recalée sans lissage, vues conservées (pas de reset()).
      snapCamera = true;
    },

    setGuide(g: GuideTarget | null): void {
      if (g && Number.isFinite(g.x) && Number.isFinite(g.y)) {
        if (guide) {
          guide.x = g.x;
          guide.y = g.y;
        } else guide = { x: g.x, y: g.y };
      } else guide = null;
    },

    setQuality(q: Quality): void {
      if (!(q in QUALITY_LEVELS)) return;
      applyQuality(q);
    },

    setReducedMotion(on: boolean): void {
      reducedMotion = on;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      fx.reset();
      cleanupAll();
    },
  };
}
