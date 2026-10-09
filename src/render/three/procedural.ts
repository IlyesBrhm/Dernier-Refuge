// Géométries et matériaux procéduraux PARTAGÉS (créés une fois, libérés par dispose()) :
// souche, anneaux au sol (ciblage, joueur), tapis d'emplacement, bûches, baies. Aucune règle de jeu.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { COLORS3D, TILE_METERS } from "./config";
import { slotTexture } from "./ground-labels";

/** Hauteur des décalques au sol (au-dessus du sol, sous les objets). */
export const DECAL_Y = 0.02;

export interface Procedural {
  stump: { geometry: THREE.BufferGeometry; material: THREE.Material };
  targetRing: { geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial };
  /** Anneau sous le joueur : matériau éclairé (reçoit l'ombre) avec une part auto-éclairée. */
  playerRing: { geometry: THREE.BufferGeometry; material: THREE.MeshLambertMaterial };
  tentFrame: {
    geometry: THREE.BufferGeometry;
    free: THREE.MeshBasicMaterial;
    assigned: THREE.MeshBasicMaterial;
  };
  slot: {
    plane: THREE.BufferGeometry;
    normal: THREE.MeshLambertMaterial;
    active: THREE.MeshLambertMaterial;
    ringBack: THREE.BufferGeometry;
    ringBackMaterial: THREE.MeshBasicMaterial;
    ringMaterial: THREE.MeshBasicMaterial;
  };
  /** Butin bois : 3 bûches (au sol et en vol). */
  logs: { geometry: THREE.BufferGeometry; material: THREE.Material };
  /** Butin nourriture : grappe de baies. */
  berryCluster: { geometry: THREE.BufferGeometry; material: THREE.Material };
  /** Baie isolée (InstancedMesh des buissons). */
  berry: { geometry: THREE.BufferGeometry; material: THREE.Material };
  /** Nouvelle géométrie d'anneau de progression (une par emplacement : drawRange propre). */
  createSlotRing(): THREE.BufferGeometry;
  /** Matériaux / géométries à précompiler et téléverser (warm-up). */
  all(): { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  dispose(): void;
}

function paint(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = geometry.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geometry;
}

/** Cylindre coloré par groupe (0 = flanc, 1 = dessus, 2 = dessous). */
function paintCylinder(geometry: THREE.CylinderGeometry, side: THREE.Color, caps: THREE.Color): THREE.BufferGeometry {
  const n = geometry.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  const index = geometry.getIndex();
  const colorOf = (g: number): THREE.Color => (g === 0 ? side : caps);
  if (index) {
    for (const group of geometry.groups) {
      const c = colorOf(group.materialIndex ?? 0);
      for (let i = group.start; i < group.start + group.count; i++) {
        const v = index.getX(i);
        arr[v * 3] = c.r;
        arr[v * 3 + 1] = c.g;
        arr[v * 3 + 2] = c.b;
      }
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  geometry.clearGroups();
  return geometry;
}

function flatRing(inner: number, outer: number, segments: number, thetaStart = 0): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(inner, outer, segments, 1, thetaStart);
  g.rotateX(-Math.PI / 2);
  return g;
}

function decalMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

export function createProcedural(anisotropy: number): Procedural {
  const disposables = new Set<{ dispose(): void }>();
  const keep = <T extends { dispose(): void }>(r: T): T => {
    disposables.add(r);
    return r;
  };

  // Souche : cylindre 7 faces, Ø 0,7 m, h 0,35 m ; écorce sur le flanc, bois clair dessus.
  const stumpGeo = new THREE.CylinderGeometry(0.33, 0.36, 0.35, 7, 1);
  stumpGeo.translate(0, 0.175, 0);
  const stump = {
    geometry: keep(paintCylinder(stumpGeo, new THREE.Color(COLORS3D.stumpBark), new THREE.Color(COLORS3D.stumpTop))),
    material: keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
  };

  const targetRing = {
    geometry: keep(flatRing(0.95, 1.08, 48)),
    material: keep(decalMaterial(COLORS3D.target, 0.95)),
  };

  // Anneau du joueur : Ø ext. 1,36 m (≈ 2/3 de tuile), 0,2 m d'épaisseur, plus petit que l'anneau de
  // ciblage (0,95–1,08 m) pour rester lisible quand les deux coexistent.
  const playerRingMaterial = keep(
    new THREE.MeshLambertMaterial({
      color: COLORS3D.playerRing,
      emissive: COLORS3D.playerRingGlow,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const playerRing = { geometry: keep(flatRing(0.48, 0.68, 48)), material: playerRingMaterial };

  // Liseré carré autour de la tente (anneau à 4 segments tourné de 45°).
  const tentFrame = {
    geometry: keep(flatRing(1.12, 1.27, 4, Math.PI / 4)),
    free: keep(decalMaterial(COLORS3D.tentFree, 0.9)),
    assigned: keep(decalMaterial(COLORS3D.tentAssigned, 0.9)),
  };

  const slotTex = keep(slotTexture(anisotropy));
  const slotPlane = new THREE.PlaneGeometry(TILE_METERS, TILE_METERS);
  slotPlane.rotateX(-Math.PI / 2);
  const slotMaterial = (color: number): THREE.MeshLambertMaterial =>
    keep(
      new THREE.MeshLambertMaterial({
        map: slotTex,
        color,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
  const slot = {
    plane: keep(slotPlane),
    normal: slotMaterial(0xdddddd),
    active: slotMaterial(0xffffff),
    ringBack: keep(flatRing(0.8, 0.95, 64, Math.PI / 2)),
    ringBackMaterial: keep(decalMaterial(COLORS3D.slotRingBack, 0.3)),
    ringMaterial: keep(decalMaterial(COLORS3D.slotRing, 1)),
  };
  slot.active.emissive.setHex(0x3a3220);

  // Bûches : 3 cylindres couchés (2 en bas, 1 dessus), flanc écorce, bouts clairs.
  const bark = new THREE.Color(COLORS3D.logBark);
  const end = new THREE.Color(COLORS3D.logEnd);
  const logParts: THREE.BufferGeometry[] = [];
  const logAt = (x: number, y: number, yaw: number): void => {
    const g = new THREE.CylinderGeometry(0.09, 0.09, 0.56, 8, 1);
    paintCylinder(g, bark, end);
    g.rotateZ(Math.PI / 2);
    g.rotateY(yaw);
    g.translate(x, y, 0);
    logParts.push(g);
  };
  logAt(-0.09, 0.09, 0.08);
  logAt(0.09, 0.09, -0.06);
  logAt(0, 0.25, 0.15);
  const logsGeo = mergeGeometries(logParts, false);
  for (const g of logParts) g.dispose();
  if (!logsGeo) throw new Error("fusion des bûches impossible");
  const logs = {
    geometry: keep(logsGeo),
    material: keep(new THREE.MeshLambertMaterial({ vertexColors: true })),
  };

  // Grappe de baies : 5 sphères rouges / violettes.
  const red = new THREE.Color(COLORS3D.berryFood);
  const purple = new THREE.Color(COLORS3D.berryPurple);
  const clusterParts: THREE.BufferGeometry[] = [];
  const berryAt = (x: number, y: number, z: number, r: number, c: THREE.Color): void => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    paint(g, c);
    g.translate(x, y, z);
    clusterParts.push(g);
  };
  berryAt(-0.08, 0.08, 0.02, 0.09, red);
  berryAt(0.08, 0.08, -0.03, 0.09, purple);
  berryAt(0.0, 0.08, 0.1, 0.085, red);
  berryAt(0.02, 0.2, 0.0, 0.09, red);
  berryAt(-0.03, 0.08, -0.1, 0.08, purple);
  const clusterGeo = mergeGeometries(clusterParts, false);
  for (const g of clusterParts) g.dispose();
  if (!clusterGeo) throw new Error("fusion des baies impossible");
  const berryCluster = {
    geometry: keep(clusterGeo),
    material: keep(new THREE.MeshLambertMaterial({ vertexColors: true })),
  };

  const berry = {
    geometry: keep(new THREE.IcosahedronGeometry(0.1, 1)),
    material: keep(new THREE.MeshLambertMaterial({ color: 0xffffff })),
  };

  return {
    stump,
    targetRing,
    playerRing,
    tentFrame,
    slot,
    logs,
    berryCluster,
    berry,
    createSlotRing: () => flatRing(0.8, 0.95, 64, Math.PI / 2),
    all: () => [
      stump,
      targetRing,
      playerRing,
      { geometry: tentFrame.geometry, material: tentFrame.free },
      { geometry: tentFrame.geometry, material: tentFrame.assigned },
      { geometry: slot.plane, material: slot.normal },
      { geometry: slot.plane, material: slot.active },
      { geometry: slot.ringBack, material: slot.ringBackMaterial },
      { geometry: slot.ringBack, material: slot.ringMaterial },
      logs,
      berryCluster,
      berry,
    ],
    dispose(): void {
      for (const d of disposables) d.dispose();
      disposables.clear();
    },
  };
}
