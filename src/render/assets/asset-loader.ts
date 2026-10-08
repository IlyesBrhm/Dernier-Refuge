// Chargement des modèles 3D de tous les packs (générés par `npm run assets`, catalogue : asset-catalog.ts).
// Chaque modèle est chargé UNE fois ; `create()` renvoie une copie (squelette cloné pour les modèles animés)
// qui partage géométries et matériaux : ne pas les dispose() individuellement, appeler `library.dispose()`.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { ASSETS, type AssetId, type AssetPack } from "./asset-catalog";

/**
 * Facteur d'échelle par pack pour une grille où 1 tuile = 2 m et un humain ≈ 1,8 m.
 * Point de départ mesuré sur les boîtes englobantes du catalogue ; à ajuster visuellement.
 */
export const PACK_SCALE: Record<AssetPack, number> = {
  nature: 0.5, // arbre 7 m → 3,6 m
  forest: 0.6, // arbre 4,2 m → 2,5 m
  survival: 3.5, // tente 0,56 m → 2 m (une tuile)
  characters: 0.7, // 2,5 m → 1,8 m
  items: 0.7, // même échelle que les personnages (attachés à leur main)
  animations: 0.7,
  creatures: 0.3, // loup 5,5 m de long → 1,7 m
};

export interface AssetLibrary {
  /** Précharge les modèles demandés (idempotent). */
  load(ids: readonly AssetId[], onProgress?: (done: number, total: number) => void): Promise<void>;
  isLoaded(id: AssetId): boolean;
  /** Nouvelle instance à l'échelle PACK_SCALE (ombres activées). Lève une erreur si non chargé. */
  create(id: AssetId): THREE.Group;
  /** Clips d'animation du modèle (personnages, loup, packs "animations", coffre…). */
  clips(id: AssetId): readonly THREE.AnimationClip[];
  /** Meshes du modèle, pour construire des THREE.InstancedMesh (herbe, cailloux, forêt de bordure). */
  meshes(id: AssetId): readonly THREE.Mesh[];
  /** Attache un accessoire (arme, outil) à un os du personnage, par défaut la main droite. */
  attach(character: THREE.Object3D, item: THREE.Object3D, bone?: "handslot.r" | "handslot.l" | "head"): void;
  /** Lumière du jour 0 (nuit) → 1 (midi) : règle l'auto-illumination du feuillage. À appeler depuis le cycle jour/nuit. */
  setDaylight(daylight: number): void;
  dispose(): void;
}

// --- Particularités du pack « nature » (shader stylisé d'origine), vérifiées dans le navigateur ---
const FOLIAGE = /^(Leaves|Leaf|Flowers|Grass)/;
/** La texture `Grass` est quasi blanche : la teinte vient du matériau (à varier par saison sur un CLONE). */
export const GRASS_TINT = 0x86b843;
/** Les feuilles (plans orientés dans tous les sens) sont très sombres vues de dessus : auto-illumination. */
export const FOLIAGE_GLOW = 0.45;

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

interface Loaded {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  skinned: boolean;
}

export function createAssetLibrary(baseUrl: string = import.meta.env.BASE_URL): AssetLibrary {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const loaded = new Map<AssetId, Loaded>();
  const pending = new Map<AssetId, Promise<void>>();
  const glowing = new Set<THREE.MeshStandardMaterial>();
  let daylight = 1;

  function stylizeNature(mesh: THREE.Mesh): void {
    const mats = materialsOf(mesh);
    // Le feuillage dense s'auto-ombre en taches sombres : il projette mais ne reçoit pas.
    if (mats.some((m) => FOLIAGE.test(m.name))) mesh.receiveShadow = false;
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      if (m.name === "Grass") m.color.setHex(GRASS_TINT);
      if (/^(Leaves|Leaf)/.test(m.name) && m.map && !glowing.has(m)) {
        m.emissive.setHex(0xffffff);
        m.emissiveMap = m.map;
        m.emissiveIntensity = FOLIAGE_GLOW * daylight;
        glowing.add(m);
      }
    }
  }

  function loadOne(id: AssetId): Promise<void> {
    const existing = pending.get(id);
    if (existing) return existing;
    const entry = ASSETS[id];
    const p = loader.loadAsync(baseUrl + entry.url).then((gltf) => {
      const scene = gltf.scene;
      scene.name = id;
      scene.scale.setScalar(PACK_SCALE[entry.pack]);
      let skinned = false;
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (o instanceof THREE.SkinnedMesh) {
          skinned = true;
          o.frustumCulled = false; // la boîte du mesh au repos ne suit pas l'animation
        }
        o.castShadow = true;
        o.receiveShadow = true;
        if (entry.pack === "nature") stylizeNature(o);
      });
      loaded.set(id, { scene, clips: gltf.animations, skinned });
    });
    pending.set(id, p);
    return p;
  }

  function get(id: AssetId): Loaded {
    const l = loaded.get(id);
    if (!l) throw new Error(`modèle non chargé : ${id} (appeler library.load([...]) avant)`);
    return l;
  }

  return {
    async load(ids, onProgress) {
      let done = 0;
      await Promise.all(
        ids.map((id) =>
          loadOne(id).then(() => {
            onProgress?.(++done, ids.length);
          }),
        ),
      );
    },
    isLoaded: (id) => loaded.has(id),
    create(id) {
      const l = get(id);
      return (l.skinned ? cloneSkinned(l.scene) : l.scene.clone(true)) as THREE.Group;
    },
    clips: (id) => get(id).clips,
    meshes(id) {
      const out: THREE.Mesh[] = [];
      get(id).scene.traverse((o) => {
        if (o instanceof THREE.Mesh) out.push(o);
      });
      return out;
    },
    attach(character, item, bone = "handslot.r") {
      // GLTFLoader nettoie les noms de nœuds (PropertyBinding) : "handslot.r" devient "handslotr".
      const target = character.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(bone));
      if (!target) throw new Error(`os introuvable : ${bone}`);
      // L'accessoire est déjà à l'échelle du personnage : on annule l'échelle héritée de la scène parente.
      item.scale.setScalar(1);
      target.add(item);
    },
    setDaylight(value) {
      daylight = Math.min(1, Math.max(0, value));
      for (const m of glowing) m.emissiveIntensity = FOLIAGE_GLOW * daylight;
    },
    dispose() {
      const textures = new Set<THREE.Texture>();
      for (const { scene } of loaded.values()) {
        scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.geometry.dispose();
          for (const m of materialsOf(o)) {
            for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
            m.dispose();
          }
        });
      }
      textures.forEach((t) => t.dispose());
      loaded.clear();
      pending.clear();
      glowing.clear();
    },
  };
}
