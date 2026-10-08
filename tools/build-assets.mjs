#!/usr/bin/env node
// npm run assets — convertit TOUS les packs sources (assets-src/) en assets web optimisés (public/assets/<pack>/)
// et génère le catalogue typé src/render/assets/asset-catalog.ts.
//
// - Textures → WebP (couleur ≤ 1024 px, normal maps ≤ 512 px), PARTAGÉES dans un pack (même nom de fichier) :
//   le navigateur ne les télécharge qu'une fois.
// - Modèles statiques : géométrie compressée meshopt (le GLTFLoader doit appeler setMeshoptDecoder).
// - Modèles animés (skinned) : pas de meshopt (quantification incompatible avec le skinning), animations rééchantillonnées.
// - Packs d'animations : on retire le mannequin, on garde squelette + clips.
// Déterministe : relancer le script donne le même résultat. Ne jamais éditer la sortie à la main.
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, textureCompress, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readdirSync, mkdirSync, rmSync, writeFileSync, copyFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "assets-src");
const OUT = path.join(root, "public", "assets");
const CATALOG = path.join(root, "src", "render", "assets", "asset-catalog.ts");

// [regex sur le nom, catégorie, usage suggéré en jeu]
const NATURE = [
  [/^CommonTree_/, "tree", "Arbre récoltable (bois) — printemps/été/automne"],
  [/^Pine_/, "pine", "Sapin récoltable (bois) — hiver, bordure de forêt"],
  [/^TwistedTree_/, "tree", "Grand arbre (feuillage rouge : automne) / bordure"],
  [/^DeadTree_/, "deadTree", "Arbre mort : souche après récolte, hiver, zone dangereuse"],
  [/^Bush_Common_Flowers/, "berryBush", "Buisson à baies récoltable (nourriture)"],
  [/^Bush_/, "bush", "Buisson décoratif / buisson à baies vide"],
  [/^Rock_Medium_/, "rock", "Rocher récoltable (pierre) ou obstacle"],
  [/^Pebble_/, "pebble", "Petits cailloux au sol (décor)"],
  [/^RockPath_/, "path", "Dalles de chemin du camp"],
  [/^Grass_/, "grass", "Herbe décorative (InstancedMesh)"],
  [/^(Flower_|Clover_|Fern_|Plant_)/, "plant", "Végétation décorative"],
  [/^Mushroom_/, "mushroom", "Champignon (décor, petite ressource nourriture)"],
  [/^Petal_/, "particle", "Pétale : particule de vent (printemps)"],
];
const FOREST = [
  [/^Tree_Bare_/, "deadTree", "Arbre nu (low-poly) : hiver, souche"],
  [/^Tree_/, "tree", "Arbre low-poly (bois)"],
  [/^Bush_/, "bush", "Buisson low-poly"],
  [/^Rock_/, "rock", "Rocher low-poly (pierre / obstacle)"],
  [/^Grass_/, "grass", "Touffe d'herbe low-poly (InstancedMesh)"],
];
const SURVIVAL = [
  [/^tent/, "shelter", "Tente : logement des survivants"],
  [/^bedroll/, "shelter", "Couchage (tente niveau 1, intérieur)"],
  [/^campfire/, "campfire", "Feu de camp / cuisine (cantine)"],
  [/^fence/, "defense", "Palissade et porte du camp (défense nocturne)"],
  [/^workbench/, "workshop", "Établi / atelier (construction, amélioration)"],
  [/^(structure|floor|metal-panel)/, "structure", "Éléments de bâtiment (murs, sol, toit)"],
  [/^resource-/, "resource", "Ressource au sol (drop à ramasser, tas dans l'entrepôt)"],
  [/^fish/, "resource", "Poisson (nourriture)"],
  [/^tool-/, "tool", "Outil tenu par un travailleur (handslot.r) / icône d'amélioration"],
  [/^(chest|barrel|box|bucket|bottle)/, "storage", "Stockage / entrepôt / décor de camp"],
  [/^signpost/, "prop", "Panneau (entrée du camp, zone à débloquer)"],
  [/^(tree|rock|grass|patch-grass)/, "natureAlt", "Nature style Kenney (alternative)"],
];
const CHARACTERS = [[/./, "character", "Personnage animé (Rig_Medium) : joueur, survivant, travailleur"]];
const ITEMS = [
  [/^(axe|sword|dagger|staff|wand|bow|crossbow|arrow|quiver)/, "weapon", "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)"],
  [/^shield/, "shield", "Bouclier à attacher à handslot.l (garde)"],
  [/^mug/, "item", "Chope (survivant servi à la cantine)"],
  [/./, "item", "Accessoire"],
];
const ANIMS = [[/./, "animation", "Clips d'animation pour les personnages Rig_Medium (même squelette)"]];
const CREATURES = [[/^Wolf/, "enemy", "Loup : menace nocturne (Walk, Gallop, Attack, Death…)"]];

const PACKS = [
  { id: "nature", src: "nature-megakit/models", license: "nature-megakit/License_Standard.txt", credit: "Stylized Nature MegaKit (Standard) — Quaternius", cats: NATURE, kind: "static" },
  { id: "forest", src: "forest/models", license: "forest/License.txt", credit: "KayKit Forest Nature Pack 1.0 — Kay Lousberg", cats: FOREST, kind: "static", skip: /_Mesh$/ },
  { id: "survival", src: "survival/models", license: "survival/License.txt", credit: "Survival Kit 2.0 — Kenney", cats: SURVIVAL, kind: "static" },
  { id: "characters", src: "adventurers/characters", license: "adventurers/License.txt", credit: "KayKit Adventurers 2.0 — Kay Lousberg", cats: CHARACTERS, kind: "skinned" },
  { id: "items", src: "adventurers/items", license: "adventurers/License.txt", credit: "KayKit Adventurers 2.0 — Kay Lousberg", cats: ITEMS, kind: "static" },
  { id: "animations", src: "adventurers/animations", license: "adventurers/License.txt", credit: "KayKit Adventurers 2.0 — Kay Lousberg", cats: ANIMS, kind: "animation" },
  { id: "creatures", src: "creatures/models", license: "creatures/License.txt", credit: "Wolf — Quaternius", cats: CREATURES, kind: "skinned", dropAnim: /\|/ },
];

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const r2 = (n) => Math.round(n * 100) / 100;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.dirname(CATALOG), { recursive: true });

const entries = [];
const packMeta = {};

for (const pack of PACKS) {
  const srcDir = path.join(SRC, pack.src);
  if (!existsSync(srcDir)) {
    console.warn(`⚠ pack ${pack.id} absent (${pack.src}) — ignoré`);
    continue;
  }
  const outDir = path.join(OUT, pack.id);
  mkdirSync(outDir, { recursive: true });
  const texNames = new Map(); // nom de fichier → hash du contenu (détection de collisions)

  const files = readdirSync(srcDir).filter((f) => /\.(gltf|glb)$/.test(f)).sort();
  for (const file of files) {
    const name = path.basename(file, path.extname(file));
    if (pack.skip?.test(name)) continue;
    const doc = await io.read(path.join(srcDir, file));
    const docRoot = doc.getRoot();

    if (pack.dropAnim) for (const a of docRoot.listAnimations()) if (pack.dropAnim.test(a.getName())) a.dispose();
    if (pack.kind === "animation") {
      for (const node of docRoot.listNodes()) node.setMesh(null).setSkin(null);
    }

    const skinned = pack.kind !== "static";
    await doc.transform(
      dedup(),
      prune({ keepLeaves: skinned }),
      ...(docRoot.listAnimations().length ? [resample()] : []),
      textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85, resize: [512, 512], slots: /^normalTexture$/ }),
      textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85, resize: [1024, 1024], slots: /^(?!normalTexture$)/ }),
    );

    // Textures partagées dans le pack : nom stable, suffixé si deux images différentes portent le même nom.
    docRoot.listTextures().forEach((tex, i) => {
      const base = (tex.getName() || path.basename(tex.getURI() || "", path.extname(tex.getURI() || "")) || `${name}_${i}`).replace(/[^\w.-]/g, "_");
      const hash = createHash("sha1").update(tex.getImage() ?? "").digest("hex").slice(0, 8);
      let fileName = `${base}.webp`;
      if (texNames.has(fileName) && texNames.get(fileName) !== hash) fileName = `${base}_${hash}.webp`;
      texNames.set(fileName, hash);
      tex.setURI(fileName);
    });

    const scene = docRoot.getDefaultScene() ?? docRoot.listScenes()[0];
    const { min, max } = pack.kind === "animation" ? { min: [0, 0, 0], max: [0, 0, 0] } : getBounds(scene);
    const clips = docRoot.listAnimations().map((a) => a.getName());

    if (pack.kind === "static") await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    docRoot.listBuffers().forEach((b, i) => b.setURI(i === 0 ? `${name}.bin` : `${name}_${i}.bin`));
    await io.write(path.join(outDir, `${name}.gltf`), doc);

    const [, category, usage] = pack.cats.find(([re]) => re.test(name)) ?? [null, "misc", "Divers"];
    entries.push({
      id: `${pack.id}/${name}`,
      pack: pack.id,
      name,
      kind: pack.kind,
      category,
      usage,
      url: `assets/${pack.id}/${name}.gltf`,
      size: { x: r2(max[0] - min[0]), y: r2(max[1] - min[1]), z: r2(max[2] - min[2]) },
      clips,
    });
  }

  copyFileSync(path.join(SRC, pack.license), path.join(outDir, "LICENSE.txt"));
  const bytes = readdirSync(outDir).reduce((s, f) => s + statSync(path.join(outDir, f)).size, 0);
  packMeta[pack.id] = { credit: pack.credit, license: `assets/${pack.id}/LICENSE.txt` };
  console.log(`✓ ${pack.id.padEnd(11)} ${String(entries.filter((e) => e.pack === pack.id).length).padStart(3)} modèles  ${(bytes / 1024 / 1024).toFixed(1)} Mo`);
}

const byCategory = {};
for (const e of entries) (byCategory[e.category] ??= []).push(e.id);
const union = (xs) => [...new Set(xs)].map((x) => JSON.stringify(x)).join(" | ");

writeFileSync(
  CATALOG,
  `// ⚠ FICHIER GÉNÉRÉ par tools/build-assets.mjs (npm run assets) — ne pas éditer à la main.
// Tous les packs sont sous licence CC0 (voir PACKS et public/assets/<pack>/LICENSE.txt).
// size : boîte englobante en unités du modèle (≈ mètres ; les échelles diffèrent selon les packs). y = hauteur.
// kind : "static" (décor, bâtiments), "skinned" (personnage/créature animé), "animation" (clips seuls, pas de mesh).

export type AssetPack = ${union(entries.map((e) => e.pack))};
export type AssetKind = "static" | "skinned" | "animation";
export type AssetCategory = ${union(entries.map((e) => e.category))};

export interface AssetEntry {
  readonly id: string;
  readonly pack: AssetPack;
  readonly name: string;
  readonly kind: AssetKind;
  readonly category: AssetCategory;
  readonly usage: string;
  readonly url: string;
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
  readonly clips: readonly string[];
}

export const ASSETS = ${JSON.stringify(Object.fromEntries(entries.map((e) => [e.id, e])), null, 2)} as const satisfies Record<string, AssetEntry>;

export type AssetId = keyof typeof ASSETS;

export const ASSETS_BY_CATEGORY = ${JSON.stringify(byCategory, null, 2)} as const satisfies Partial<Record<AssetCategory, readonly AssetId[]>>;

export const PACKS = ${JSON.stringify(packMeta, null, 2)} as const satisfies Record<AssetPack, { credit: string; license: string }>;
`,
);

const total = entries.length;
console.log(`\n${total} modèles → public/assets/ + ${path.relative(root, CATALOG)}`);
