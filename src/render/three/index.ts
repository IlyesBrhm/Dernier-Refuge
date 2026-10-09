// Renderer 3D (rendu par défaut ; `?render=2d` force la 2D) derrière l'interface Renderer existante.
// Chargé UNIQUEMENT par import() dynamique depuis src/main.ts : three.js reste hors du bundle 2D.
// LECTURE SEULE : ne reçoit que des Readonly<GameState>, n'appelle jamais applyCommand.
//
// Chaque draw : buildScene (pur) → feu → stage.setLighting (jour/nuit, feu, joueur, ombres) →
// réconciliation des vues → mixers → caméra → render → calque 2D.

import * as THREE from "three";
import { referenceMap, type GameState, type MapState } from "../../core";
import { createAssetLibrary, type AssetLibrary } from "../assets/asset-loader";
import { createFxLayer, type FxSample } from "../fx";
import type { Renderer, ScreenInsets } from "../renderer";
import { createCharacterKit, type CharacterKit } from "./characters";
import { ANIM, CHARACTER_MODELS, LOADING, MODEL_IDS, QUALITY, RENDER3D_ASSET_IDS, TILE_METERS, U } from "./config";
import { Render3DError } from "./errors";
import { createLootFx, type LootFx } from "./loot-fx";
import { createOverlay, type Overlay } from "./overlay";
import { createProcedural, DECAL_Y, type Procedural } from "./procedural";
import { createReconciler, type Reconciler } from "./reconcile";
import { buildScene, buildStaticLayout, type SceneFrame } from "./scene-model";
import { createStage, type Stage } from "./stage";
import { createStaticLayer, type StaticLayer } from "./static-layer";
import { FireView } from "./views/fire-view";
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
    contextLost = true;
    if (lostTimer !== null) window.clearTimeout(lostTimer);
    lostTimer = window.setTimeout(() => {
      lostTimer = null;
      if (contextLost) opts.onContextLost?.();
    }, LOADING.contextRestoreMs);
  };
  const onRestored = (): void => {
    contextLost = false;
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
      ctx.dt = Math.min(dtMs / 1000, ANIM.maxDtS);
      ctx.now = now;
      ctx.playerAction = playerActionOf(frame);
      ctx.live = !firstFrame;

      // Feu (vue unique) puis éclairage : jour/nuit, lumières du feu et du joueur, bascule des ombres.
      let fireLight: ReturnType<FireView["update"]> | null = null;
      for (const it of frame.items) {
        if (it.type === "fire") {
          fireLight = fireView.update(it, ctx);
          break;
        }
      }
      fireView.object.visible = fireLight !== null;
      stage.setLighting(frame.lighting, { fire: fireLight, player: frame.focus });
      library.setDaylight(frame.lighting.daylight);
      shownLight = frame.lighting.phase;

      berries.begin();
      reconciler.sync(frame, ctx);
      berries.end();
      layer.setWelcomeActive(frame.welcome.active);
      layer.setNightWeight(1 - frame.lighting.sunWeight);
      const pulse = 0.55 + 0.4 * Math.sin((now / 1000) * ANIM.pulseHz * Math.PI * 2);
      proc.tentFrame.assigned.opacity = pulse;

      playerUnits.x = (frame.focus.x / TILE_METERS) * U;
      playerUnits.y = (frame.focus.z / TILE_METERS) * U;
      playerRing.position.set(frame.focus.x, PLAYER_RING_Y, frame.focus.z);
      fx.sample(now, playerUnits, samples);
      loot.update(samples, now);

      stage.follow(frame.focus, ctx.dt, snapCamera, frame.framing);
      snapCamera = false;
      firstFrame = false;
      renderer.render(scene, camera);

      overlay.draw(frame, samples, camera, welcomeDecal, now);
    },

    reset,

    setScreenInsets(insets: ScreenInsets): void {
      overlay.setInsets(insets);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      fx.reset();
      cleanupAll();
    },
  };
}
