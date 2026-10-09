// Scène three.js : WebGLRenderer sur un canvas DÉDIÉ inséré sous #game, caméra perspective inclinée
// sans lacet (haut du clavier = haut de l'écran), lumières, ombres recalées au texel, brouillard,
// redimensionnement (ResizeObserver) et plafond de pixelRatio.

import * as THREE from "three";
import { CAMERA, COLORS3D, FOG, LIGHT, QUALITY, TILE_METERS } from "./config";

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  /** Bornes de la carte (m) pour le suivi caméra. */
  setMapSize(widthM: number, heightM: number): void;
  /** Suivi amorti du point visé ; `snap` = recalage immédiat (reset, première image). */
  follow(target: { x: number; z: number }, dt: number, snap: boolean): void;
  /** Point d'extension jour/nuit (0 nuit → 1 midi) : sans effet pour l'instant. */
  setDaylight(daylight: number): void;
  /** Qualité réduite, une seule fois : pixelRatio 1 et carte d'ombre 1024. */
  degrade(): void;
  dispose(): void;
}

export function createStage(host: HTMLElement, before: Element, coarsePointer: boolean): Stage {
  const canvas = document.createElement("canvas");
  canvas.className = "webgl";
  canvas.setAttribute("aria-hidden", "true");
  host.insertBefore(canvas, before);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (e) {
    canvas.remove();
    throw e;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, coarsePointer ? QUALITY.pixelRatioCoarse : QUALITY.pixelRatioFine);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS3D.fog);
  const fog = new THREE.Fog(COLORS3D.fog, FOG.near, FOG.far);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, 1, CAMERA.near, CAMERA.far);
  const pitch = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
  const halfFov = THREE.MathUtils.degToRad(CAMERA.fovDeg) / 2;
  const tanHalf = Math.tan(halfFov);
  // Emprise au sol en profondeur, par mètre de distance caméra : du point visé au bas de l'écran
  // (`nearK`) et au haut de l'écran (`farK`). Exact pour une caméra perspective inclinée.
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);
  const nearK = cosP - sinP / Math.tan(pitch + halfFov);
  const farK = sinP / Math.tan(pitch - halfFov) - cosP;
  const depthK = nearK + farK;
  let distance: number = CAMERA.minDistance;
  /** Demi-largeur visible (m) à la ligne du point visé. */
  let halfWidthAtFocus = 1;
  let portrait = false;

  const hemi = new THREE.HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, LIGHT.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sunIntensity);
  sun.castShadow = true;
  const mapSize = coarsePointer ? LIGHT.shadowMapCoarse : LIGHT.shadowMapFine;
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.bias = LIGHT.shadowBias;
  sun.shadow.normalBias = LIGHT.shadowNormalBias;
  const sc = sun.shadow.camera;
  sc.near = 1;
  sc.far = LIGHT.sunDistance * 2 + 20;
  let shadowHalf = 0;
  /** Demi-taille de la caméra d'ombre proportionnelle à la distance caméra (couvre la vue). */
  function setShadowHalf(half: number): void {
    if (half === shadowHalf) return;
    shadowHalf = half;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.updateProjectionMatrix();
  }
  scene.add(sun, sun.target);

  // Base de l'espace lumière (rotation pure) pour recaler le centre des ombres au texel.
  const lightDir = new THREE.Vector3(...LIGHT.sunDir).normalize();
  const lightBasis = new THREE.Matrix4().lookAt(lightDir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const lightBasisInv = lightBasis.clone().transpose();
  const tmp = new THREE.Vector3();

  let width = 1;
  let height = 1;
  let mapW = 32;
  let mapH = 24;
  const focus = { x: 0, z: 0 };
  let focusInit = false;

  /** Distance caméra selon l'orientation et la taille de la carte (cf. CAMERA dans config.ts). */
  function updateDistance(): void {
    const aspect = width / Math.max(1, height);
    const widthK = 2 * tanHalf * aspect; // largeur visible au point visé, par mètre de distance
    let d: number;
    portrait = aspect <= 1;
    if (!portrait) {
      // Paysage : toute la profondeur de la carte, et sa largeur si le plafond le permet.
      d = Math.max(mapH / depthK, mapW / widthK);
      d = THREE.MathUtils.clamp(d, CAMERA.minDistance, CAMERA.maxDistanceLandscape);
    } else {
      // Portrait : caméra rapprochée façon My Perfect Hotel (~76 px CSS par tuile, 5 à 9 tuiles de
      // large au point visé, ≥ 6 de profondeur).
      const tilesWide = THREE.MathUtils.clamp(
        width / CAMERA.portraitTilePx,
        CAMERA.portraitMinTilesWide,
        CAMERA.portraitMaxTilesWide,
      );
      const dW = (tilesWide * TILE_METERS) / widthK;
      const dH = (CAMERA.minTilesDeep * TILE_METERS) / depthK;
      d = THREE.MathUtils.clamp(Math.max(dW, dH), CAMERA.minDistance, CAMERA.maxDistancePortrait);
    }
    distance = d;
    halfWidthAtFocus = (widthK * d) / 2;
    fog.near = Math.max(FOG.near, distance + FOG.clearance);
    fog.far = fog.near + (FOG.far - FOG.near);
    setShadowHalf(Math.max(LIGHT.shadowHalfMin, LIGHT.shadowHalfPerDistance * distance));
  }

  /**
   * Borne une coordonnée du point visé : la vue [c − before, c + after] ne dépasse [0, size] que de
   * la marge. Vue plus grande que la carte sur l'axe : centrée (paysage) ou, en portrait, suivi borné
   * entre les deux positions où un bord de carte touche le bord de la vue (carte entière visible sur
   * l'axe), avec au plus `maxAfter` m montrés au-delà du bord `size`.
   */
  function clampAxis(c: number, before: number, after: number, size: number, maxAfter = Infinity): number {
    const margin = CAMERA.edgeMarginTiles * TILE_METERS;
    const lo = before - margin;
    const hi = size - after + margin;
    if (lo <= hi) return THREE.MathUtils.clamp(c, lo, hi);
    if (!portrait) return (lo + hi) / 2;
    const top = Math.max(hi, Math.min(lo, size - after + maxAfter));
    return THREE.MathUtils.clamp(c, hi, top);
  }

  // Taille lue uniquement quand le ResizeObserver signale un changement (pas de lecture du DOM par image).
  let sizeDirty = true;
  function resize(): void {
    if (!sizeDirty) return;
    sizeDirty = false;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updateDistance();
  }

  const ro = new ResizeObserver(() => {
    sizeDirty = true;
  });
  ro.observe(host);
  width = 0;
  resize();

  function placeCamera(): void {
    camera.position.set(focus.x, distance * Math.sin(pitch), focus.z + distance * Math.cos(pitch));
    camera.lookAt(focus.x, 0, focus.z);
    // Ombres centrées sur le point visé, recalées au texel (pas de scintillement en mouvement).
    const texel = (shadowHalf * 2) / sun.shadow.mapSize.x;
    tmp.set(focus.x, 0, focus.z).applyMatrix4(lightBasisInv);
    tmp.x = Math.round(tmp.x / texel) * texel;
    tmp.y = Math.round(tmp.y / texel) * texel;
    tmp.applyMatrix4(lightBasis);
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(lightDir, LIGHT.sunDistance);
    sun.target.updateMatrixWorld();
  }

  return {
    renderer,
    scene,
    camera,
    canvas,

    setMapSize(w, h): void {
      if (w === mapW && h === mapH) return;
      mapW = w;
      mapH = h;
      updateDistance();
    },

    follow(target, dt, snap): void {
      resize();
      if (snap || !focusInit) {
        focus.x = target.x;
        focus.z = target.z;
        focusInit = true;
      } else {
        const k = 1 - Math.exp(-CAMERA.followRate * dt);
        focus.x += (target.x - focus.x) * k;
        focus.z += (target.z - focus.z) * k;
      }
      // Point visé borné : la vue ne déborde de la carte que de la marge ; centrée si plus grande.
      focus.x = clampAxis(focus.x, halfWidthAtFocus, halfWidthAtFocus, mapW);
      // Sud (+Z, bas de l'écran) : jamais plus de maxSouthOverflowTiles hors carte (forêt de bordure).
      focus.z = clampAxis(focus.z, farK * distance, nearK * distance, mapH, CAMERA.maxSouthOverflowTiles * TILE_METERS);
      placeCamera();
    },

    setDaylight(_daylight): void {
      // Jour/nuit : branchera library.setDaylight, intensités et couleurs (feature suivante).
    },

    degrade(): void {
      pixelRatio = 1;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      if (sun.shadow.mapSize.x > LIGHT.shadowMapCoarse) {
        sun.shadow.mapSize.set(LIGHT.shadowMapCoarse, LIGHT.shadowMapCoarse);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },

    dispose(): void {
      ro.disconnect();
      sun.dispose();
      hemi.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
