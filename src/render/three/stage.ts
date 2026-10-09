// Scène three.js : WebGLRenderer sur un canvas DÉDIÉ inséré sous #game, caméra perspective inclinée
// sans lacet (haut du clavier = haut de l'écran), lumières, ombres recalées au texel, brouillard,
// redimensionnement (ResizeObserver) et plafond de pixelRatio.
//
// Jour/nuit (docs/design/day-night.md §4.2-4.3) : CINQ lumières créées une fois (soleil, hémisphère,
// projecteur du feu, lueur du feu, lumière du joueur). Seules les intensités / couleurs / positions
// changent : jamais d'ajout, de retrait, de `visible = false` ni de changement de `castShadow`
// (programmes de shaders stables). Une seule passe d'ombre à la fois : seul `shadow.autoUpdate`
// bascule, au creux des deux lumières (p = 2400 et p = 0).

import * as THREE from "three";
import type { Lighting, Rgb, ShadowOwner } from "../daylight";
import { CAMERA, COLORS3D, FIRE_LIGHT, FOG, LIGHT, QUALITY, TILE_METERS } from "./config";
import { portraitFraming, type FramingInput } from "./framing";

/** Lumières locales de l'image (feu, joueur), calculées par la vue du feu et la scène. */
export interface LocalLights {
  fire: {
    x: number;
    z: number;
    /** Bois / capacité dans [0, 1]. */
    ratio: number;
    /** Feu allumé dans l'état courant (pilote l'ombre du projecteur). */
    lit: boolean;
    /** litFade × flicker (mémoire de vue + vacillement). */
    strength: number;
  } | null;
  player: { x: number; z: number };
}

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  /** Bornes de la carte (m) pour le suivi caméra. */
  setMapSize(widthM: number, heightM: number): void;
  /**
   * Suivi amorti du point visé ; `snap` = recalage immédiat (reset, première image).
   * `framing` : en portrait, décalage vers la file d'attente près de l'accueil (§4.7).
   */
  follow(target: { x: number; z: number }, dt: number, snap: boolean, framing?: FramingInput): void;
  /** Éclairage jour/nuit + lumières du feu et du joueur + bascule des ombres. */
  setLighting(l: Lighting, local: LocalLights): void;
  /** Rend la carte d'ombre de la lumière active à jour à la prochaine image (reset, chargement). */
  refreshShadows(): void;
  /** Lumière qui porte l'ombre (lecture e2e). */
  shadowOwner(): ShadowOwner;
  /** Qualité réduite, une seule fois : pixelRatio 1 et carte d'ombre 1024. */
  degrade(): void;
  dispose(): void;
}

function setRgb(c: THREE.Color, v: Rgb): void {
  // Composantes déjà en RVB linéaire (espace de travail de three).
  c.setRGB(v.r, v.g, v.b, THREE.LinearSRGBColorSpace);
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
  /** Portrait : largeur visible de base (tuiles) et élargissement amorti près de l'accueil. */
  let baseTilesWide: number = CAMERA.portraitMinTilesWide;
  let extraWide = 0;

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

  // --- Feu de camp : projecteur (porte l'ombre la nuit) + lueur sans ombre ; lumière du joueur ---
  const fireSpot = new THREE.SpotLight(
    FIRE_LIGHT.spotColor,
    0,
    FIRE_LIGHT.spotDistanceMax,
    FIRE_LIGHT.spotAngle,
    FIRE_LIGHT.spotPenumbra,
    FIRE_LIGHT.spotDecay,
  );
  fireSpot.name = "fire-spot";
  fireSpot.castShadow = true;
  const spotMap = coarsePointer ? FIRE_LIGHT.spotMapCoarse : FIRE_LIGHT.spotMapFine;
  fireSpot.shadow.mapSize.set(spotMap, spotMap);
  fireSpot.shadow.bias = LIGHT.shadowBias;
  fireSpot.shadow.normalBias = LIGHT.shadowNormalBias;
  fireSpot.shadow.camera.near = 0.3;
  // Position non dégénérée dès le warm-up (projecteur au-dessus de sa cible).
  fireSpot.position.set(0, FIRE_LIGHT.spotHeight, 0);
  fireSpot.target.position.set(0, 0, 0);
  scene.add(fireSpot, fireSpot.target);
  const fireGlow = new THREE.PointLight(FIRE_LIGHT.glowColor, 0, FIRE_LIGHT.glowDistanceMax, 2);
  fireGlow.name = "fire-glow";
  fireGlow.castShadow = false;
  scene.add(fireGlow);
  const playerLight = new THREE.PointLight(FIRE_LIGHT.playerColor, 0, FIRE_LIGHT.playerDistance, 2);
  playerLight.name = "player-light";
  playerLight.castShadow = false;
  scene.add(playerLight);

  // Ombres : soleil actif au départ ; les deux cartes sont rendues une première fois (warm-up) pour
  // qu'aucune ne soit nulle quand elle devient active.
  let owner: ShadowOwner = "sun";
  let fireLit = true;
  sun.shadow.autoUpdate = true;
  fireSpot.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  fireSpot.shadow.needsUpdate = true;

  function applyShadowOwner(next: ShadowOwner, lit: boolean, force: boolean): void {
    const changed = next !== owner;
    const litChanged = lit !== fireLit;
    owner = next;
    fireLit = lit;
    if (owner === "sun") {
      sun.shadow.autoUpdate = true;
      fireSpot.shadow.autoUpdate = false;
      if (changed || force) sun.shadow.needsUpdate = true;
    } else {
      sun.shadow.autoUpdate = false;
      fireSpot.shadow.autoUpdate = lit;
      // Carte de la veille (ou feu rallumé) : une mise à jour forcée.
      if (changed || force || (litChanged && lit)) fireSpot.shadow.needsUpdate = true;
    }
  }

  // Base de l'espace lumière (rotation pure) pour recaler le centre des ombres au texel ; recalculée
  // quand la direction du soleil change.
  const lightDir = new THREE.Vector3(...LIGHT.sunDir).normalize();
  const lightBasis = new THREE.Matrix4();
  const lightBasisInv = new THREE.Matrix4();
  const ORIGIN = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  function updateLightBasis(): void {
    lightBasis.lookAt(lightDir, ORIGIN, UP);
    lightBasisInv.copy(lightBasis).transpose();
  }
  updateLightBasis();
  const tmp = new THREE.Vector3();

  let width = 1;
  let height = 1;
  let mapW = 32;
  let mapH = 24;
  const focus = { x: 0, z: 0 };
  let focusInit = false;

  /** Teinte atmosphérique courante (Lighting.fogTint) : part du brouillard au point visé. */
  let fogTint = 0;
  /**
   * Brouillard : de jour, il ne touche que le lointain (au-delà du point visé + marge) ; quand
   * `fogTint` > 0 (nuit, aube, crépuscule), il part de la caméra et vaut ≈ `fogTint` au point visé
   * (plus au loin, moins au premier plan) : c'est lui qui donne la dominante bleutée de la nuit.
   * Seuls `near` / `far` changent (uniformes) : aucun changement de programme.
   */
  function applyFog(): void {
    const dayNear = Math.max(FOG.near, distance + FOG.clearance);
    const dayFar = dayNear + (FOG.far - FOG.near);
    const w = THREE.MathUtils.smoothstep(fogTint, 0, FOG.tintBlend);
    if (w <= 0) {
      fog.near = dayNear;
      fog.far = dayFar;
      return;
    }
    // Inverse de smoothstep : x tel que 3x² − 2x³ = y (facteur du brouillard de three).
    const y = THREE.MathUtils.clamp(fogTint, 0.01, 0.95);
    const x = 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);
    const tintFar = distance / Math.max(0.05, x);
    fog.near = THREE.MathUtils.lerp(dayNear, 0, w);
    fog.far = Math.max(fog.near + 1, THREE.MathUtils.lerp(dayFar, tintFar, w));
  }

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
      baseTilesWide = THREE.MathUtils.clamp(
        width / CAMERA.portraitTilePx,
        CAMERA.portraitMinTilesWide,
        CAMERA.portraitMaxTilesWide,
      );
      const tilesWide = baseTilesWide + extraWide;
      const dW = (tilesWide * TILE_METERS) / widthK;
      const dH = (CAMERA.minTilesDeep * TILE_METERS) / depthK;
      d = THREE.MathUtils.clamp(Math.max(dW, dH), CAMERA.minDistance, CAMERA.maxDistancePortrait);
    }
    distance = d;
    halfWidthAtFocus = (widthK * d) / 2;
    applyFog();
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

    follow(target, dt, snap, framing): void {
      resize();
      // Cadrage de la file (portrait seulement) : même amortissement pour la cible et la largeur.
      let tx = target.x;
      let wantExtra = 0;
      if (portrait && framing) {
        const f = portraitFraming(framing, baseTilesWide);
        tx += f.offsetX;
        wantExtra = f.extraTilesWide;
      }
      const k = snap || !focusInit ? 1 : 1 - Math.exp(-CAMERA.followRate * dt);
      const prevExtra = extraWide;
      extraWide += (wantExtra - extraWide) * k;
      if (Math.abs(extraWide - wantExtra) < 1e-3) extraWide = wantExtra;
      if (extraWide !== prevExtra && portrait) updateDistance();
      if (snap || !focusInit) {
        focus.x = tx;
        focus.z = target.z;
        focusInit = true;
      } else {
        focus.x += (tx - focus.x) * k;
        focus.z += (target.z - focus.z) * k;
      }
      // Point visé borné : la vue ne déborde de la carte que de la marge ; centrée si plus grande.
      focus.x = clampAxis(focus.x, halfWidthAtFocus, halfWidthAtFocus, mapW);
      // Sud (+Z, bas de l'écran) : jamais plus de maxSouthOverflowTiles hors carte (forêt de bordure).
      focus.z = clampAxis(focus.z, farK * distance, nearK * distance, mapH, CAMERA.maxSouthOverflowTiles * TILE_METERS);
      placeCamera();
    },

    setLighting(l, local): void {
      // Soleil : couleur, intensité, direction (base de recalage au texel mise à jour si elle bouge).
      setRgb(sun.color, l.sunColor);
      sun.intensity = l.sunIntensity;
      if (
        Math.abs(lightDir.x - l.sunDir.x) > 1e-5 ||
        Math.abs(lightDir.y - l.sunDir.y) > 1e-5 ||
        Math.abs(lightDir.z - l.sunDir.z) > 1e-5
      ) {
        lightDir.set(l.sunDir.x, l.sunDir.y, l.sunDir.z);
        updateLightBasis();
      }
      setRgb(hemi.color, l.hemiSky);
      setRgb(hemi.groundColor, l.hemiGround);
      hemi.intensity = l.hemiIntensity;
      if (scene.background instanceof THREE.Color) setRgb(scene.background, l.background);
      setRgb(fog.color, l.background);
      if (l.fogTint !== fogTint) {
        fogTint = l.fogTint;
        applyFog();
      }

      // Feu : intensités ∝ poids du cycle × fondu allumé × vacillement ; portée ∝ bois restant.
      const fire = local.fire;
      if (fire) {
        const ratio = Math.min(1, Math.max(0, fire.ratio));
        fireSpot.position.set(fire.x, FIRE_LIGHT.spotHeight, fire.z);
        fireSpot.target.position.set(fire.x, 0, fire.z);
        fireSpot.target.updateMatrixWorld();
        fireSpot.distance = THREE.MathUtils.lerp(FIRE_LIGHT.spotDistanceMin, FIRE_LIGHT.spotDistanceMax, ratio);
        fireSpot.intensity = FIRE_LIGHT.spotMax * l.fireSpotWeight * fire.strength;
        fireGlow.position.set(fire.x, FIRE_LIGHT.glowHeight, fire.z);
        fireGlow.distance = THREE.MathUtils.lerp(FIRE_LIGHT.glowDistanceMin, FIRE_LIGHT.glowDistanceMax, ratio);
        fireGlow.intensity = FIRE_LIGHT.glowMax * l.fireGlowWeight * fire.strength;
      } else {
        fireSpot.intensity = 0;
        fireGlow.intensity = 0;
      }
      playerLight.position.set(local.player.x, FIRE_LIGHT.playerHeight, local.player.z);
      playerLight.intensity = FIRE_LIGHT.playerMax * l.playerLightWeight;

      applyShadowOwner(l.shadowOwner, fire?.lit ?? false, false);
    },

    refreshShadows(): void {
      applyShadowOwner(owner, fireLit, true);
    },

    shadowOwner: () => owner,

    degrade(): void {
      pixelRatio = 1;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      if (sun.shadow.mapSize.x > LIGHT.shadowMapCoarse) {
        sun.shadow.mapSize.set(LIGHT.shadowMapCoarse, LIGHT.shadowMapCoarse);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.needsUpdate = true;
      }
      if (fireSpot.shadow.mapSize.x > FIRE_LIGHT.spotMapCoarse) {
        fireSpot.shadow.mapSize.set(FIRE_LIGHT.spotMapCoarse, FIRE_LIGHT.spotMapCoarse);
        fireSpot.shadow.map?.dispose();
        fireSpot.shadow.map = null;
        fireSpot.shadow.needsUpdate = true;
      }
    },

    dispose(): void {
      ro.disconnect();
      sun.dispose();
      hemi.dispose();
      fireSpot.dispose();
      fireGlow.dispose();
      playerLight.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
