// Liste blanche des modèles livrés (tools/shipped-assets.json) ↔ modèles référencés par le renderer 3D
// (src/render/three/config.ts). docs/design/render-3d.md §4.5 et §4.10.

import { ANIM_CLIPS, CHARACTER_MODELS, MODEL_IDS, RENDER3D_ASSET_IDS } from "../../src/render/three/config";
// Texte brut, exactement tel que commité (import Vite `?raw`).
import SHIPPED_RAW from "../../tools/shipped-assets.json?raw";

interface ShippedEntry {
  clips?: string[];
}
interface ShippedFile {
  maxShippedBytes: number;
  assets: Record<string, ShippedEntry>;
}

const shipped = JSON.parse(SHIPPED_RAW) as ShippedFile;
const shippedIds = Object.keys(shipped.assets);

/** Fichier d'animation attendu pour chaque clip utilisé par le renderer. */
const CLIP_FILE: Record<keyof typeof ANIM_CLIPS, string> = {
  idle: MODEL_IDS.animGeneral,
  use: MODEL_IDS.animGeneral,
  interact: MODEL_IDS.animGeneral,
  walk: MODEL_IDS.animMovement,
};

describe("tools/shipped-assets.json ↔ RENDER3D_ASSET_IDS", () => {
  it("le fichier a la forme attendue", () => {
    expect(Number.isInteger(shipped.maxShippedBytes)).toBe(true);
    expect(shipped.maxShippedBytes).toBeGreaterThan(0);
    expect(shippedIds.length).toBeGreaterThan(0);
  });

  it("aucun doublon dans RENDER3D_ASSET_IDS", () => {
    expect(new Set(RENDER3D_ASSET_IDS).size).toBe(RENDER3D_ASSET_IDS.length);
  });

  it("égalité d'ensembles : tout modèle livré est utilisé, tout modèle utilisé est livré", () => {
    const used = new Set<string>(RENDER3D_ASSET_IDS);
    const listed = new Set<string>(shippedIds);
    expect([...used].filter((id) => !listed.has(id)).sort()).toEqual([]); // utilisé mais non livré
    expect([...listed].filter((id) => !used.has(id)).sort()).toEqual([]); // livré mais inutilisé
  });

  it("liste blanche à 18 ids ; anciens modèles retirés (Barbarian, tente survival/tent) non livrés", () => {
    expect(shippedIds).toHaveLength(18);
    expect(RENDER3D_ASSET_IDS).toHaveLength(18);
    expect(shippedIds).not.toContain("characters/Barbarian");
    expect(shippedIds).not.toContain("survival/tent");
    expect(shippedIds).toContain("characters/Knight");
  });

  it("personnages : tous livrés", () => {
    for (const m of CHARACTER_MODELS) expect(shippedIds).toContain(m);
  });

  it("chaque clip de ANIM_CLIPS est listé dans le bon fichier d'animation", () => {
    for (const [key, clip] of Object.entries(ANIM_CLIPS) as [keyof typeof ANIM_CLIPS, string][]) {
      const file = CLIP_FILE[key];
      expect(file, `clip ${key}`).toBeDefined();
      expect(shipped.assets[file]?.clips ?? [], `${clip} dans ${file}`).toContain(clip);
    }
  });

  it("tous les clips de ANIM_CLIPS ont un fichier attendu (table du test à jour)", () => {
    expect(Object.keys(CLIP_FILE).sort()).toEqual(Object.keys(ANIM_CLIPS).sort());
  });

  it("seuls les fichiers d'animation déclarent des clips, et aucun clip inutilisé n'est livré", () => {
    const usedClips = new Set<string>(Object.values(ANIM_CLIPS));
    const animFiles = new Set<string>([MODEL_IDS.animGeneral, MODEL_IDS.animMovement]);
    for (const [id, entry] of Object.entries(shipped.assets)) {
      if (entry.clips === undefined) continue;
      expect(animFiles.has(id), `${id} déclare des clips`).toBe(true);
      expect(entry.clips.length).toBeGreaterThan(0);
      for (const c of entry.clips) expect(usedClips.has(c), `${c} (${id}) inutilisé`).toBe(true);
    }
  });
});
