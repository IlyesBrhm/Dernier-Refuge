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
  /**
   * Poids de nuit dans [0, 1] (1 − Lighting.sunWeight) : correction des rochers, qui renvoient
   * presque toute la lumière bleue de la nuit (gris clair) et ressortaient en bleu saturé.
   * Uniformes seulement (couleur, émission) : aucun changement de programme.
   */
  setNightWeight(weight: number): void;
  dispose(): void;
}

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Segments du disque de terre du feu (multiple de 8 : les coins de la tuile sont des sommets). */
const FIRE_DISC_SEGMENTS = 16;
/** Anneaux du disque (fraction de tuile) : cendres au centre → terre → fondu dans l'herbe. */
const FIRE_DISC_RINGS = { earth: 0.2, earthEdge: 0.36, blend: 0.46 } as const;

/**
 * Sol : 2 triangles par tuile (couleur franche par tuile) + grand anneau de sous-bois uni. La tuile
 * du feu est un disque de cendres / terre sombre fondu dans l'herbe (couleurs par sommet interpolées).
 */
function groundGeometry(layout: StaticLayout): THREE.BufferGeometry {
  const T = TILE_METERS;
  const palette = [new THREE.Color(COLORS3D.grassA), new THREE.Color(COLORS3D.grassB), new THREE.Color(COLORS3D.undergrowth)];
  const far = FAR_GROUND_TILES * T;
  const pos: number[] = [];
  const col: number[] = [];
  const vertex = (x: number, y: number, z: number, c: THREE.Color): void => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
  };
  const quad = (x0: number, z0: number, x1: number, z1: number, y: number, c: THREE.Color): void => {
    // Deux triangles orientés vers +Y (sens anti-horaire vus de dessus).
    const pts = [x0, z0, x0, z1, x1, z1, x0, z0, x1, z1, x1, z0];
    for (let i = 0; i < 6; i++) vertex(pts[i * 2] as number, y, pts[i * 2 + 1] as number, c);
  };
  const ash = new THREE.Color(COLORS3D.fireAsh);
  const earth = new THREE.Color(COLORS3D.fireEarth);
  /** Tuile du feu : éventail de centre (cx, cz), anneaux circulaires puis bord carré de la tuile. */
  const fireDisc = (tx: number, ty: number, grass: THREE.Color): void => {
    const cx = (tx + 0.5) * T;
    const cz = (ty + 0.5) * T;
    const blend = earth.clone().lerp(grass, 0.55);
    // Anneaux : rayon (null = bord de la tuile) et couleur. Le centre est un point (cendres).
    const rings: { r: number | null; c: THREE.Color }[] = [
      { r: FIRE_DISC_RINGS.earth * T, c: earth },
      { r: FIRE_DISC_RINGS.earthEdge * T, c: earth },
      { r: FIRE_DISC_RINGS.blend * T, c: blend },
      { r: null, c: grass },
    ];
    const n = FIRE_DISC_SEGMENTS;
    const at = (ring: number, i: number): [number, number] => {
      const a = (i / n) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const def = rings[ring] as { r: number | null };
      // Bord carré : le rayon touche le côté de la tuile (coins inclus car n est multiple de 8).
      const r = def.r ?? (0.5 * T) / Math.max(Math.abs(dx), Math.abs(dz));
      return [cx + dx * r, cz + dz * r];
    };
    for (let i = 0; i < n; i++) {
      // Sens anti-horaire vu de dessus (+Y) : i+1 avant i (l'angle croît vers +Z).
      const [ax, az] = at(0, i);
      const [bx, bz] = at(0, i + 1);
      vertex(cx, 0, cz, ash);
      vertex(bx, 0, bz, earth);
      vertex(ax, 0, az, earth);
      for (let ring = 1; ring < rings.length; ring++) {
        const ci = (rings[ring - 1] as { c: THREE.Color }).c;
        const co = (rings[ring] as { c: THREE.Color }).c;
        const [p0x, p0z] = at(ring - 1, i);
        const [p1x, p1z] = at(ring - 1, i + 1);
        const [q0x, q0z] = at(ring, i);
        const [q1x, q1z] = at(ring, i + 1);
        vertex(p0x, 0, p0z, ci);
        vertex(p1x, 0, p1z, ci);
        vertex(q1x, 0, q1z, co);
        vertex(p0x, 0, p0z, ci);
        vertex(q1x, 0, q1z, co);
        vertex(q0x, 0, q0z, co);
      }
    }
  };
  const f = layout.fireTile;
  for (const t of layout.groundTiles) {
    const grass = palette[t.shade] as THREE.Color;
    if (f && f.tx === t.tx && f.ty === t.ty) fireDisc(t.tx, t.ty, grass);
    else quad(t.tx * T, t.ty * T, (t.tx + 1) * T, (t.ty + 1) * T, 0, grass);
  }
  const b = layout.bounds;
  const under = palette[2] as THREE.Color;
  const y = FAR_GROUND_Y;
  quad(b.minX - far, b.minZ - far, b.maxX + far, b.minZ, y, under); // nord
  quad(b.minX - far, b.maxZ, b.maxX + far, b.maxZ + far, y, under); // sud
  quad(b.minX - far, b.minZ, b.minX, b.maxZ, y, under); // ouest
  quad(b.maxX, b.minZ, b.maxX + far, b.maxZ, y, under); // est
  const count = pos.length / 3;
  const nor = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) nor[i * 3 + 1] = 1;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
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
    material?: (m: THREE.Material | THREE.Material[]) => THREE.Material | THREE.Material[],
  ): void {
    ids.forEach((id, modelIndex) => {
      const list = placements.filter((p) => p.model === modelIndex);
      if (list.length === 0) return;
      for (const { mesh, matrix } of templateMatrices(lib, id)) {
        const mat = material ? material(mesh.material) : mesh.material;
        const im = keep(new THREE.InstancedMesh(mesh.geometry, mat, list.length));
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
  // Rochers : matériaux CLONÉS (ceux de la bibliothèque restent intacts), émission = texture × gris
  // neutre dès la création (emissive noir le jour) pour que la correction de nuit ne change que des
  // uniformes. Gris clair × hémisphère bleue = bleu saturé : la nuit, une teinte chaude atténue le
  // bleu reçu et une petite part auto-éclairée neutre ramène vers un gris-bleu discret.
  const rockMaterials: THREE.MeshStandardMaterial[] = [];
  const rockMaterial = (m: THREE.Material): THREE.Material => {
    if (!(m instanceof THREE.MeshStandardMaterial)) return m;
    const c = keep(m.clone());
    c.emissive.setHex(0x000000);
    if (c.map) c.emissiveMap = c.map;
    rockMaterials.push(c);
    return c;
  };
  instanced(MODEL_IDS.rocks, layout.rocks, "rocks", true, true, (m) =>
    Array.isArray(m) ? m.map(rockMaterial) : rockMaterial(m),
  );
  const rockDayColor = new THREE.Color(0xffffff);
  const rockNightColor = new THREE.Color(COLORS3D.rockNightTint);
  const rockNightGlow = new THREE.Color(COLORS3D.rockNightSelfLit);
  let nightWeight = -1;
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
        // Auto-éclairage léger (emissive × texture) : le tapis garde sa teinte crème / jaune sous la
        // lumière bleue de la nuit et le halo orangé du feu (plus de taches bleu vif / orange vif).
        emissive: COLORS3D.decalSelfLit,
        emissiveMap: tex,
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
      welcomeMaterial.emissive.setHex(active ? COLORS3D.welcomeGlowActive : COLORS3D.decalSelfLit);
    },
    setNightWeight(weight) {
      const w = Math.min(1, Math.max(0, weight));
      if (Math.abs(w - nightWeight) < 1e-3) return;
      nightWeight = w;
      for (const m of rockMaterials) {
        m.color.copy(rockDayColor).lerp(rockNightColor, w);
        m.emissive.setRGB(0, 0, 0).lerp(rockNightGlow, w);
      }
    },
    dispose() {
      group.removeFromParent();
      for (const o of owned) o.dispose();
      owned.clear();
    },
  };
}
