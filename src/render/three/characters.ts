// Personnages KayKit : instances animées, teintées, avec les maillages du personnage FUSIONNÉS en un
// seul SkinnedMesh (9 maillages → 1 draw call, même squelette, même matériau). Les géométries
// fusionnées et les matériaux teintés sont créés une seule fois (au chargement) puis partagés.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { AssetLibrary } from "../assets/asset-loader";
import { ANIM_CLIPS, CHARACTER_MODELS, MODEL_IDS, SURVIVOR_TINTS, type CharacterModel } from "./config";

export type ClipName = keyof typeof ANIM_CLIPS;

export interface CharacterInstance {
  /** Racine du modèle (échelle du pack) : à placer dans un groupe porteur. */
  readonly model: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
  /** Crée (ou recrée après uncacheRoot) l'action d'un clip ; null si le clip n'est pas livré. */
  action(name: ClipName): THREE.AnimationAction | null;
  /** Arrête le mixer et libère caches d'animation et texture d'os. */
  destroy(): void;
}

export interface CharacterKit {
  create(model: CharacterModel, tint: number): CharacterInstance;
  dispose(): void;
}

interface Merged {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

function skinnedMeshesOf(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) out.push(o);
  });
  return out;
}

/** Fusionne les maillages d'un personnage s'ils partagent squelette, bind matrix et matériau. */
function tryMerge(meshes: readonly THREE.Mesh[]): Merged | null {
  const skinned = meshes.filter((m): m is THREE.SkinnedMesh => m instanceof THREE.SkinnedMesh);
  const first = skinned[0];
  if (!first || skinned.length < 2 || skinned.length !== meshes.length) return null;
  const material = first.material;
  if (Array.isArray(material)) return null;
  const bones = first.skeleton.bones;
  for (const s of skinned) {
    if (s.material !== material) return null;
    if (!s.bindMatrix.equals(first.bindMatrix)) return null;
    if (s.skeleton.bones.length !== bones.length) return null;
    for (let i = 0; i < bones.length; i++) {
      if (s.skeleton.bones[i] !== bones[i]) return null;
      const a = s.skeleton.boneInverses[i];
      const b = first.skeleton.boneInverses[i];
      if (!a || !b || !a.equals(b)) return null;
    }
  }
  const geometry = mergeGeometries(
    skinned.map((s) => s.geometry),
    false,
  );
  if (!geometry) return null;
  geometry.computeBoundingSphere();
  return { geometry, material };
}

export function createCharacterKit(lib: AssetLibrary): CharacterKit {
  const merged = new Map<CharacterModel, Merged | null>();
  /** Matériau d'origine → (teinte → clone teinté). */
  const tinted = new Map<THREE.Material, Map<number, THREE.Material>>();
  const owned = new Set<{ dispose(): void }>();

  const clips: THREE.AnimationClip[] = [
    ...lib.clips(MODEL_IDS.animGeneral),
    ...lib.clips(MODEL_IDS.animMovement),
  ];
  const clipByName = new Map<ClipName, THREE.AnimationClip>();
  for (const key of Object.keys(ANIM_CLIPS) as ClipName[]) {
    const c = THREE.AnimationClip.findByName(clips, ANIM_CLIPS[key]);
    if (c) clipByName.set(key, c);
  }

  function tintOf(base: THREE.Material, tint: number): THREE.Material {
    if (tint === 0xffffff) return base;
    let byTint = tinted.get(base);
    if (!byTint) {
      byTint = new Map();
      tinted.set(base, byTint);
    }
    let m = byTint.get(tint);
    if (!m) {
      m = base.clone();
      if ("color" in m && m.color instanceof THREE.Color) m.color.multiply(new THREE.Color(tint));
      owned.add(m);
      byTint.set(tint, m);
    }
    return m;
  }

  // Préparation unique (au chargement) : géométries fusionnées et matériaux teintés de toutes les
  // variantes, pour que la mémoire GPU ne grandisse pas en cours de partie.
  for (const model of CHARACTER_MODELS) {
    const m = tryMerge(lib.meshes(model));
    if (m) owned.add(m.geometry);
    merged.set(model, m);
    const tints: readonly number[] = model === MODEL_IDS.player ? [0xffffff] : SURVIVOR_TINTS;
    for (const mesh of lib.meshes(model)) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const base of mats) for (const t of tints) tintOf(base, t);
    }
  }

  return {
    create(model, tint): CharacterInstance {
      const root = lib.create(model);
      const skinned = skinnedMeshesOf(root);
      const m = merged.get(model) ?? null;
      if (m && skinned[0]) {
        const keep = skinned[0];
        keep.geometry = m.geometry;
        keep.material = tintOf(m.material, tint);
        for (let i = 1; i < skinned.length; i++) skinned[i]?.removeFromParent();
      } else {
        for (const s of skinned) {
          s.material = Array.isArray(s.material) ? s.material.map((x) => tintOf(x, tint)) : tintOf(s.material, tint);
        }
      }
      const mixer = new THREE.AnimationMixer(root);
      return {
        model: root,
        mixer,
        action(name) {
          const clip = clipByName.get(name);
          return clip ? mixer.clipAction(clip) : null;
        },
        destroy() {
          mixer.stopAllAction();
          mixer.uncacheRoot(root);
          for (const s of skinned) s.skeleton.dispose();
          root.removeFromParent();
        },
      };
    },

    dispose(): void {
      for (const o of owned) o.dispose();
      owned.clear();
      tinted.clear();
      merged.clear();
    },
  };
}
