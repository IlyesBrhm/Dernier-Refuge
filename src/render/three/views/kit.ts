// Ressources partagées par les vues dynamiques : bibliothèque de modèles, procédural, personnages,
// clones de matériaux mis en cache (buisson vide, tente en désordre), calque instancié des baies.

import * as THREE from "three";
import type { AssetLibrary } from "../../assets/asset-loader";
import type { CharacterKit } from "../characters";
import { ANIM, COLORS3D } from "../config";
import type { Procedural } from "../procedural";

/** Clones de matériaux transformés, un par matériau d'origine (créés une fois, partagés). */
export interface MaterialVariants {
  get(base: THREE.Material): THREE.Material;
  /** Précrée les variantes des matériaux d'un modèle (warm-up). */
  prepare(meshes: readonly THREE.Mesh[]): void;
  dispose(): void;
}

function materialVariants(transform: (m: THREE.Material) => void): MaterialVariants {
  const cache = new Map<THREE.Material, THREE.Material>();
  const get = (base: THREE.Material): THREE.Material => {
    let m = cache.get(base);
    if (!m) {
      m = base.clone();
      transform(m);
      cache.set(base, m);
    }
    return m;
  };
  return {
    get,
    prepare(meshes) {
      for (const mesh of meshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) get(m);
      }
    },
    dispose() {
      for (const m of cache.values()) m.dispose();
      cache.clear();
    },
  };
}

function colorOf(m: THREE.Material): THREE.Color | null {
  return "color" in m && m.color instanceof THREE.Color ? m.color : null;
}

export interface ViewKit {
  readonly lib: AssetLibrary;
  readonly proc: Procedural;
  readonly characters: CharacterKit;
  /** Buisson vide : matériau désaturé (#8a9a7c). */
  readonly emptyBush: MaterialVariants;
  /** Tente en désordre : matériau sali (× 0,7, teinté #b89a7a). */
  readonly messyTent: MaterialVariants;
  /** Tente libre / assignée : toile éclaircie et verdie, légère lueur (lisible comme « disponible »). */
  readonly freeTent: MaterialVariants;
  /** Tente occupée : couleurs d'origine + léger auto-éclairage de la toile (lisible de nuit). */
  readonly closedTent: MaterialVariants;
  /** Foyer du feu : palette Kenney ramenée vers des tons terre (bûches brunes, pierres beige-gris). */
  readonly firePit: MaterialVariants;
  dispose(): void;
}

/**
 * Auto-éclairage « × texture » : emissive = couleur × carte de base. La toile garde sa propre couleur
 * quelle que soit la lumière (nuit bleue, crépuscule orangé) au lieu de ne montrer que l'armature.
 */
function selfLit(m: THREE.Material, color: number): void {
  if (!("emissive" in m) || !(m.emissive instanceof THREE.Color)) return;
  m.emissive.setHex(color);
  if ("map" in m && "emissiveMap" in m && m.map instanceof THREE.Texture) {
    (m as THREE.MeshStandardMaterial).emissiveMap = m.map;
  }
}

export function createViewKit(lib: AssetLibrary, proc: Procedural, characters: CharacterKit): ViewKit {
  const emptyBush = materialVariants((m) => colorOf(m)?.setHex(COLORS3D.bushEmpty));
  const messyTint = new THREE.Color(COLORS3D.tentMessyTint);
  const messyTent = materialVariants((m) => {
    colorOf(m)?.multiplyScalar(ANIM.messyDarken).multiply(messyTint);
    selfLit(m, COLORS3D.tentMessySelfLit);
  });
  const freeTent = materialVariants((m) => {
    colorOf(m)?.multiply(new THREE.Color(COLORS3D.tentFreeTint));
    selfLit(m, COLORS3D.tentFreeGlow);
  });
  const closedTent = materialVariants((m) => selfLit(m, COLORS3D.tentSelfLit));
  const firePit = materialVariants((m) => colorOf(m)?.multiply(new THREE.Color(COLORS3D.firePitTint)));
  return {
    lib,
    proc,
    characters,
    emptyBush,
    messyTent,
    freeTent,
    closedTent,
    firePit,
    dispose() {
      emptyBush.dispose();
      messyTent.dispose();
      freeTent.dispose();
      closedTent.dispose();
      firePit.dispose();
    },
  };
}

/**
 * Met un modèle (sans parent) à l'échelle pour que sa plus grande dimension au sol vaille `meters`.
 * Mesure faite sur la copie : aucun effet sur le modèle source de la bibliothèque.
 */
export function fitFootprint(model: THREE.Object3D, meters: number): void {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const m = Math.max(size.x, size.z);
  if (m > 1e-6) model.scale.multiplyScalar(meters / m);
}

/** Remplace les matériaux de tous les maillages d'un objet (clone de modèle : maillages propres). */
export function setMaterials(root: THREE.Object3D, pick: (base: THREE.Material) => THREE.Material, originals: Map<THREE.Mesh, THREE.Material | THREE.Material[]>): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const known = originals.get(o);
    const base: THREE.Material | THREE.Material[] = known ?? o.material;
    if (known === undefined) originals.set(o, base);
    o.material = Array.isArray(base) ? base.map((m) => pick(m)) : pick(base);
  });
}

/** Baies des buissons : un seul InstancedMesh pour tous les buissons (couleur par instance). */
export interface BerryLayer {
  readonly mesh: THREE.InstancedMesh;
  begin(): void;
  push(matrix: THREE.Matrix4, color: THREE.Color): void;
  end(): void;
  dispose(): void;
}

export function createBerryLayer(proc: Procedural, capacity: number): BerryLayer {
  const mesh = new THREE.InstancedMesh(proc.berry.geometry, proc.berry.material, capacity);
  mesh.name = "berries";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false; // instances déplacées à chaque image : pas de sphère englobante à jour
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, white);
  mesh.count = 0;
  mesh.visible = false;
  let n = 0;
  return {
    mesh,
    begin() {
      n = 0;
    },
    push(matrix, color) {
      if (n >= capacity) return;
      mesh.setMatrixAt(n, matrix);
      mesh.setColorAt(n, color);
      n++;
    },
    end() {
      mesh.count = n;
      mesh.visible = n > 0; // pas de draw call vide
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
    },
  };
}

/** Contexte d'une image, fourni à toutes les vues. */
export interface FrameContext {
  /** Secondes depuis l'image précédente, déjà bornées (≤ ANIM.maxDtS). */
  dt: number;
  /** performance.now() de l'image (ms). */
  now: number;
  /** Action visuelle du joueur (choix du clip), déduite de la scène. */
  playerAction: "harvest" | "welcome" | null;
  berries: BerryLayer;
  /** false à la première image après création / reset (pas d'animation d'apparition). */
  live: boolean;
}

/** easeOutBack standard. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Rebond de repousse : 0,6 → 1,12 → 1 (t ∈ [0, 1]). */
export function bounceScale(t: number): number {
  if (t >= 1) return 1;
  if (t < 0.6) {
    const k = t / 0.6;
    return 0.6 + (1.12 - 0.6) * (1 - (1 - k) * (1 - k));
  }
  const k = (t - 0.6) / 0.4;
  return 1.12 + (1 - 1.12) * (k * k * (3 - 2 * k));
}
