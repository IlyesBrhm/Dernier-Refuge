// Décor statique construit une fois par carte depuis StaticLayout : sol (couleurs par sommet,
// 1 draw call), tapis au sol (CanvasTexture), arbres de bordure / rochers / touffes en InstancedMesh.
// Les géométries et matériaux des modèles appartiennent à la bibliothèque : jamais dispose() ici.

import * as THREE from "three";
import type { MapState } from "../../core";
import type { AssetLibrary } from "../assets/asset-loader";
import { COLORS3D, FAR_GROUND_TILES, FAR_GROUND_Y, MODEL_IDS, TILE_METERS } from "./config";
import { entranceTexture, queueTexture, welcomeTexture } from "./ground-labels";
import { DECAL_Y } from "./procedural";
import type { Placement, StaticLayout } from "./scene-model";

export interface StaticLayer {
  readonly group: THREE.Group;
  readonly map: Readonly<MapState>;
  readonly layout: StaticLayout;
  /** Tapis d'accueil plus lumineux quand le joueur est dessus. */
  setWelcomeActive(active: boolean): void;
  dispose(): void;
}

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Sol : 2 triangles par tuile (couleur franche par tuile) + grand anneau de sous-bois uni. */
function groundGeometry(layout: StaticLayout): THREE.BufferGeometry {
  const T = TILE_METERS;
  const palette = [new THREE.Color(COLORS3D.grassA), new THREE.Color(COLORS3D.grassB), new THREE.Color(COLORS3D.undergrowth)];
  const far = FAR_GROUND_TILES * T;
  const quads = layout.groundTiles.length + 4;
  const pos = new Float32Array(quads * 6 * 3);
  const col = new Float32Array(quads * 6 * 3);
  const nor = new Float32Array(quads * 6 * 3);
  let k = 0;
  const quad = (x0: number, z0: number, x1: number, z1: number, y: number, c: THREE.Color): void => {
    // Deux triangles orientés vers +Y (sens anti-horaire vus de dessus).
    const pts = [x0, z0, x0, z1, x1, z1, x0, z0, x1, z1, x1, z0];
    for (let i = 0; i < 6; i++) {
      pos[k * 3] = pts[i * 2] as number;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = pts[i * 2 + 1] as number;
      nor[k * 3 + 1] = 1;
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      k++;
    }
  };
  for (const t of layout.groundTiles) {
    quad(t.tx * T, t.ty * T, (t.tx + 1) * T, (t.ty + 1) * T, 0, palette[t.shade] as THREE.Color);
  }
  const b = layout.bounds;
  const under = palette[2] as THREE.Color;
  const y = FAR_GROUND_Y;
  quad(b.minX - far, b.minZ - far, b.maxX + far, b.minZ, y, under); // nord
  quad(b.minX - far, b.maxZ, b.maxX + far, b.maxZ + far, y, under); // sud
  quad(b.minX - far, b.minZ, b.minX, b.maxZ, y, under); // ouest
  quad(b.maxX, b.minZ, b.maxX + far, b.maxZ, y, under); // est
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Racine (sans parent) d'un maillage du modèle, matrices du gabarit à jour. */
function templateMatrices(lib: AssetLibrary, id: (typeof MODEL_IDS.borderTrees)[number] | (typeof MODEL_IDS.rocks)[number] | (typeof MODEL_IDS.tufts)[number]): { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] {
  const meshes = lib.meshes(id);
  const out: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] = [];
  for (const mesh of meshes) {
    let root: THREE.Object3D = mesh;
    while (root.parent) root = root.parent;
    root.updateMatrixWorld(true);
    out.push({ mesh, matrix: mesh.matrixWorld.clone() });
  }
  return out;
}

export function createStaticLayer(
  map: Readonly<MapState>,
  layout: StaticLayout,
  lib: AssetLibrary,
  anisotropy: number,
): StaticLayer {
  const group = new THREE.Group();
  group.name = "static";
  const owned = new Set<{ dispose(): void }>();
  const keep = <T extends { dispose(): void }>(r: T): T => {
    owned.add(r);
    return r;
  };
  const mapW = map.width * TILE_METERS;
  const mapH = map.height * TILE_METERS;

  // --- Sol ---
  const ground = new THREE.Mesh(
    keep(groundGeometry(layout)),
    keep(new THREE.MeshLambertMaterial({ vertexColors: true })),
  );
  ground.name = "ground";
  ground.receiveShadow = true;
  group.add(ground);

  // --- Décor instancié ---
  function instanced(
    ids: readonly ((typeof MODEL_IDS.borderTrees)[number] | (typeof MODEL_IDS.rocks)[number] | (typeof MODEL_IDS.tufts)[number])[],
    placements: readonly Placement[],
    name: string,
    castShadow: boolean,
    receiveShadow: boolean,
  ): void {
    ids.forEach((id, modelIndex) => {
      const list = placements.filter((p) => p.model === modelIndex);
      if (list.length === 0) return;
      for (const { mesh, matrix } of templateMatrices(lib, id)) {
        const im = keep(new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length));
        im.name = `${name}:${id}`;
        list.forEach((p, i) => {
          tmpP.set(p.x, 0, p.z);
          tmpQ.setFromAxisAngle(UP, p.yaw);
          tmpS.setScalar(p.scale);
          tmpM.compose(tmpP, tmpQ, tmpS).multiply(matrix);
          im.setMatrixAt(i, tmpM);
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = castShadow;
        im.receiveShadow = receiveShadow;
        im.matrixAutoUpdate = false;
        im.updateMatrix();
        group.add(im);
      }
    });
  }

  // Arbres de bordure : ceux de la carte projettent une ombre ; l'anneau extérieur non (budget).
  const inside = (p: Placement): boolean => p.x >= 0 && p.z >= 0 && p.x <= mapW && p.z <= mapH;
  instanced(MODEL_IDS.borderTrees, layout.borderTrees.filter(inside), "border", true, true);
  instanced(MODEL_IDS.borderTrees, [...layout.borderTrees.filter((p) => !inside(p)), ...layout.nearForest], "forest", false, true);
  instanced(MODEL_IDS.rocks, layout.rocks, "rocks", true, true);
  instanced(MODEL_IDS.tufts, layout.tufts, "tufts", false, true);

  // --- Tapis au sol ---
  let welcomeMaterial: THREE.MeshLambertMaterial | null = null;
  for (const d of layout.decals) {
    let tex: THREE.CanvasTexture;
    if (d.kind === "welcome") tex = welcomeTexture(anisotropy);
    else if (d.kind === "queue") {
      const cols = Math.max(1, Math.round(d.w / TILE_METERS));
      const rows = Math.max(1, Math.round(d.d / TILE_METERS));
      const minTx = Math.round(d.x / TILE_METERS - cols / 2);
      const minTy = Math.round(d.z / TILE_METERS - rows / 2);
      const cells = map.queueTiles.map((q, i) => ({ col: q.tx - minTx, row: q.ty - minTy, label: String(i + 1) }));
      tex = queueTexture(cols, rows, cells, anisotropy);
    } else {
      const cols = Math.max(1, Math.round(d.w / TILE_METERS));
      const rows = Math.max(1, Math.round(d.d / TILE_METERS));
      const minTx = Math.round(d.x / TILE_METERS - cols / 2);
      const minTy = Math.round(d.z / TILE_METERS - rows / 2);
      tex = entranceTexture(cols, rows, map.entrance.tx - minTx, map.entrance.ty - minTy, anisotropy);
    }
    keep(tex);
    const geo = keep(new THREE.PlaneGeometry(d.w, d.d));
    geo.rotateX(-Math.PI / 2);
    const mat = keep(
      new THREE.MeshLambertMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    if (d.kind === "welcome") {
      mat.color.setHex(COLORS3D.welcomeTintIdle);
      welcomeMaterial = mat;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `decal:${d.kind}`;
    mesh.position.set(d.x, DECAL_Y, d.z);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }

  ground.matrixAutoUpdate = false;
  ground.updateMatrix();

  let welcomeActive: boolean | null = null;
  return {
    group,
    map,
    layout,
    setWelcomeActive(active) {
      if (active === welcomeActive || !welcomeMaterial) return;
      welcomeActive = active;
      welcomeMaterial.color.setHex(active ? COLORS3D.welcomeTintActive : COLORS3D.welcomeTintIdle);
      welcomeMaterial.emissive.setHex(active ? COLORS3D.welcomeGlowActive : 0x000000);
    },
    dispose() {
      group.removeFromParent();
      for (const o of owned) o.dispose();
      owned.clear();
    },
  };
}
