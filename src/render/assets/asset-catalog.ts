// ⚠ FICHIER GÉNÉRÉ par tools/build-assets.mjs (npm run assets) — ne pas éditer à la main.
// Tous les packs sont sous licence CC0 (voir PACKS et assets-all/assets/<pack>/LICENSE.txt).
// size : boîte englobante en unités du modèle (≈ mètres ; les échelles diffèrent selon les packs). y = hauteur.
// kind : "static" (décor, bâtiments), "skinned" (personnage/créature animé), "animation" (clips seuls, pas de mesh).
// shipped : livré dans le jeu (public/assets/, liste blanche tools/shipped-assets.json) ; sinon aperçu seulement
// (assets-all/, servi par vite dev). clips = tous les clips (aperçu) ; shippedClips = clips livrés dans le jeu.

export type AssetPack = "nature" | "forest" | "survival" | "characters" | "items" | "animations" | "creatures";
export type AssetKind = "static" | "skinned" | "animation";
export type AssetCategory = "bush" | "berryBush" | "plant" | "tree" | "deadTree" | "grass" | "mushroom" | "pebble" | "particle" | "pine" | "path" | "rock" | "storage" | "shelter" | "campfire" | "defense" | "resource" | "structure" | "natureAlt" | "prop" | "tool" | "workshop" | "character" | "weapon" | "item" | "shield" | "animation" | "enemy";

export interface AssetEntry {
  readonly id: string;
  readonly shipped: boolean;
  readonly pack: AssetPack;
  readonly name: string;
  readonly kind: AssetKind;
  readonly category: AssetCategory;
  readonly usage: string;
  readonly url: string;
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
  readonly clips: readonly string[];
  readonly shippedClips: readonly string[];
}

export const ASSETS = {
  "nature/Bush_Common": {
    "id": "nature/Bush_Common",
    "shipped": false,
    "pack": "nature",
    "name": "Bush_Common",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson décoratif / buisson à baies vide",
    "url": "assets/nature/Bush_Common.gltf",
    "size": {
      "x": 1.91,
      "y": 1.58,
      "z": 1.97
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Bush_Common_Flowers": {
    "id": "nature/Bush_Common_Flowers",
    "shipped": false,
    "pack": "nature",
    "name": "Bush_Common_Flowers",
    "kind": "static",
    "category": "berryBush",
    "usage": "Buisson à baies récoltable (nourriture)",
    "url": "assets/nature/Bush_Common_Flowers.gltf",
    "size": {
      "x": 1.91,
      "y": 1.58,
      "z": 1.97
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Clover_1": {
    "id": "nature/Clover_1",
    "shipped": false,
    "pack": "nature",
    "name": "Clover_1",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Clover_1.gltf",
    "size": {
      "x": 0.8,
      "y": 1.14,
      "z": 0.76
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Clover_2": {
    "id": "nature/Clover_2",
    "shipped": false,
    "pack": "nature",
    "name": "Clover_2",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Clover_2.gltf",
    "size": {
      "x": 0.85,
      "y": 1.26,
      "z": 0.84
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/CommonTree_1": {
    "id": "nature/CommonTree_1",
    "shipped": false,
    "pack": "nature",
    "name": "CommonTree_1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre récoltable (bois) — printemps/été/automne",
    "url": "assets/nature/CommonTree_1.gltf",
    "size": {
      "x": 4.31,
      "y": 7.26,
      "z": 4.58
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/CommonTree_2": {
    "id": "nature/CommonTree_2",
    "shipped": false,
    "pack": "nature",
    "name": "CommonTree_2",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre récoltable (bois) — printemps/été/automne",
    "url": "assets/nature/CommonTree_2.gltf",
    "size": {
      "x": 4.46,
      "y": 7.64,
      "z": 4.28
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/CommonTree_3": {
    "id": "nature/CommonTree_3",
    "shipped": false,
    "pack": "nature",
    "name": "CommonTree_3",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre récoltable (bois) — printemps/été/automne",
    "url": "assets/nature/CommonTree_3.gltf",
    "size": {
      "x": 4.06,
      "y": 9.43,
      "z": 4.24
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/CommonTree_4": {
    "id": "nature/CommonTree_4",
    "shipped": false,
    "pack": "nature",
    "name": "CommonTree_4",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre récoltable (bois) — printemps/été/automne",
    "url": "assets/nature/CommonTree_4.gltf",
    "size": {
      "x": 3.83,
      "y": 9.44,
      "z": 3.76
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/CommonTree_5": {
    "id": "nature/CommonTree_5",
    "shipped": false,
    "pack": "nature",
    "name": "CommonTree_5",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre récoltable (bois) — printemps/été/automne",
    "url": "assets/nature/CommonTree_5.gltf",
    "size": {
      "x": 3.67,
      "y": 7.01,
      "z": 4.22
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/DeadTree_1": {
    "id": "nature/DeadTree_1",
    "shipped": false,
    "pack": "nature",
    "name": "DeadTree_1",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre mort : souche après récolte, hiver, zone dangereuse",
    "url": "assets/nature/DeadTree_1.gltf",
    "size": {
      "x": 6.15,
      "y": 9.5,
      "z": 5.75
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/DeadTree_2": {
    "id": "nature/DeadTree_2",
    "shipped": false,
    "pack": "nature",
    "name": "DeadTree_2",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre mort : souche après récolte, hiver, zone dangereuse",
    "url": "assets/nature/DeadTree_2.gltf",
    "size": {
      "x": 6.73,
      "y": 11.49,
      "z": 6.38
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/DeadTree_3": {
    "id": "nature/DeadTree_3",
    "shipped": false,
    "pack": "nature",
    "name": "DeadTree_3",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre mort : souche après récolte, hiver, zone dangereuse",
    "url": "assets/nature/DeadTree_3.gltf",
    "size": {
      "x": 6.39,
      "y": 13.28,
      "z": 6.43
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/DeadTree_4": {
    "id": "nature/DeadTree_4",
    "shipped": false,
    "pack": "nature",
    "name": "DeadTree_4",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre mort : souche après récolte, hiver, zone dangereuse",
    "url": "assets/nature/DeadTree_4.gltf",
    "size": {
      "x": 7.96,
      "y": 12.77,
      "z": 7.73
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/DeadTree_5": {
    "id": "nature/DeadTree_5",
    "shipped": false,
    "pack": "nature",
    "name": "DeadTree_5",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre mort : souche après récolte, hiver, zone dangereuse",
    "url": "assets/nature/DeadTree_5.gltf",
    "size": {
      "x": 8.36,
      "y": 16.44,
      "z": 8.41
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Fern_1": {
    "id": "nature/Fern_1",
    "shipped": false,
    "pack": "nature",
    "name": "Fern_1",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Fern_1.gltf",
    "size": {
      "x": 2.83,
      "y": 0.84,
      "z": 2.65
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Flower_3_Group": {
    "id": "nature/Flower_3_Group",
    "shipped": false,
    "pack": "nature",
    "name": "Flower_3_Group",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Flower_3_Group.gltf",
    "size": {
      "x": 1.49,
      "y": 2.05,
      "z": 1.59
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Flower_3_Single": {
    "id": "nature/Flower_3_Single",
    "shipped": false,
    "pack": "nature",
    "name": "Flower_3_Single",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Flower_3_Single.gltf",
    "size": {
      "x": 0.91,
      "y": 2.07,
      "z": 0.88
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Flower_4_Group": {
    "id": "nature/Flower_4_Group",
    "shipped": false,
    "pack": "nature",
    "name": "Flower_4_Group",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Flower_4_Group.gltf",
    "size": {
      "x": 1.78,
      "y": 2.49,
      "z": 1.37
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Flower_4_Single": {
    "id": "nature/Flower_4_Single",
    "shipped": false,
    "pack": "nature",
    "name": "Flower_4_Single",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Flower_4_Single.gltf",
    "size": {
      "x": 1.07,
      "y": 2.42,
      "z": 0.77
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Grass_Common_Short": {
    "id": "nature/Grass_Common_Short",
    "shipped": false,
    "pack": "nature",
    "name": "Grass_Common_Short",
    "kind": "static",
    "category": "grass",
    "usage": "Herbe décorative (InstancedMesh)",
    "url": "assets/nature/Grass_Common_Short.gltf",
    "size": {
      "x": 0.64,
      "y": 1.33,
      "z": 0.74
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Grass_Common_Tall": {
    "id": "nature/Grass_Common_Tall",
    "shipped": false,
    "pack": "nature",
    "name": "Grass_Common_Tall",
    "kind": "static",
    "category": "grass",
    "usage": "Herbe décorative (InstancedMesh)",
    "url": "assets/nature/Grass_Common_Tall.gltf",
    "size": {
      "x": 0.9,
      "y": 1.87,
      "z": 0.99
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Grass_Wispy_Short": {
    "id": "nature/Grass_Wispy_Short",
    "shipped": false,
    "pack": "nature",
    "name": "Grass_Wispy_Short",
    "kind": "static",
    "category": "grass",
    "usage": "Herbe décorative (InstancedMesh)",
    "url": "assets/nature/Grass_Wispy_Short.gltf",
    "size": {
      "x": 1.32,
      "y": 1.07,
      "z": 1.21
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Grass_Wispy_Tall": {
    "id": "nature/Grass_Wispy_Tall",
    "shipped": false,
    "pack": "nature",
    "name": "Grass_Wispy_Tall",
    "kind": "static",
    "category": "grass",
    "usage": "Herbe décorative (InstancedMesh)",
    "url": "assets/nature/Grass_Wispy_Tall.gltf",
    "size": {
      "x": 1.54,
      "y": 1.67,
      "z": 1.59
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Mushroom_Common": {
    "id": "nature/Mushroom_Common",
    "shipped": false,
    "pack": "nature",
    "name": "Mushroom_Common",
    "kind": "static",
    "category": "mushroom",
    "usage": "Champignon (décor, petite ressource nourriture)",
    "url": "assets/nature/Mushroom_Common.gltf",
    "size": {
      "x": 0.56,
      "y": 0.46,
      "z": 0.78
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Mushroom_Laetiporus": {
    "id": "nature/Mushroom_Laetiporus",
    "shipped": false,
    "pack": "nature",
    "name": "Mushroom_Laetiporus",
    "kind": "static",
    "category": "mushroom",
    "usage": "Champignon (décor, petite ressource nourriture)",
    "url": "assets/nature/Mushroom_Laetiporus.gltf",
    "size": {
      "x": 1.37,
      "y": 0.77,
      "z": 1.1
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Round_1": {
    "id": "nature/Pebble_Round_1",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Round_1",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Round_1.gltf",
    "size": {
      "x": 0.5,
      "y": 0.1,
      "z": 0.37
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Round_2": {
    "id": "nature/Pebble_Round_2",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Round_2",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Round_2.gltf",
    "size": {
      "x": 0.45,
      "y": 0.09,
      "z": 0.41
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Round_3": {
    "id": "nature/Pebble_Round_3",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Round_3",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Round_3.gltf",
    "size": {
      "x": 0.45,
      "y": 0.1,
      "z": 0.48
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Round_4": {
    "id": "nature/Pebble_Round_4",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Round_4",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Round_4.gltf",
    "size": {
      "x": 0.41,
      "y": 0.1,
      "z": 0.45
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Round_5": {
    "id": "nature/Pebble_Round_5",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Round_5",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Round_5.gltf",
    "size": {
      "x": 0.42,
      "y": 0.1,
      "z": 0.35
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Square_1": {
    "id": "nature/Pebble_Square_1",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Square_1",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Square_1.gltf",
    "size": {
      "x": 0.43,
      "y": 0.13,
      "z": 0.44
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Square_2": {
    "id": "nature/Pebble_Square_2",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Square_2",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Square_2.gltf",
    "size": {
      "x": 0.39,
      "y": 0.14,
      "z": 0.28
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Square_3": {
    "id": "nature/Pebble_Square_3",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Square_3",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Square_3.gltf",
    "size": {
      "x": 0.37,
      "y": 0.16,
      "z": 0.32
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Square_4": {
    "id": "nature/Pebble_Square_4",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Square_4",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Square_4.gltf",
    "size": {
      "x": 0.34,
      "y": 0.17,
      "z": 0.29
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Square_5": {
    "id": "nature/Pebble_Square_5",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Square_5",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Square_5.gltf",
    "size": {
      "x": 0.35,
      "y": 0.15,
      "z": 0.45
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pebble_Square_6": {
    "id": "nature/Pebble_Square_6",
    "shipped": false,
    "pack": "nature",
    "name": "Pebble_Square_6",
    "kind": "static",
    "category": "pebble",
    "usage": "Petits cailloux au sol (décor)",
    "url": "assets/nature/Pebble_Square_6.gltf",
    "size": {
      "x": 0.46,
      "y": 0.14,
      "z": 0.26
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Petal_1": {
    "id": "nature/Petal_1",
    "shipped": false,
    "pack": "nature",
    "name": "Petal_1",
    "kind": "static",
    "category": "particle",
    "usage": "Pétale : particule de vent (printemps)",
    "url": "assets/nature/Petal_1.gltf",
    "size": {
      "x": 0.46,
      "y": 0.24,
      "z": 0.45
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Petal_2": {
    "id": "nature/Petal_2",
    "shipped": false,
    "pack": "nature",
    "name": "Petal_2",
    "kind": "static",
    "category": "particle",
    "usage": "Pétale : particule de vent (printemps)",
    "url": "assets/nature/Petal_2.gltf",
    "size": {
      "x": 0.67,
      "y": 0.24,
      "z": 0.63
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Petal_3": {
    "id": "nature/Petal_3",
    "shipped": false,
    "pack": "nature",
    "name": "Petal_3",
    "kind": "static",
    "category": "particle",
    "usage": "Pétale : particule de vent (printemps)",
    "url": "assets/nature/Petal_3.gltf",
    "size": {
      "x": 0.62,
      "y": 0.19,
      "z": 0.61
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Petal_4": {
    "id": "nature/Petal_4",
    "shipped": false,
    "pack": "nature",
    "name": "Petal_4",
    "kind": "static",
    "category": "particle",
    "usage": "Pétale : particule de vent (printemps)",
    "url": "assets/nature/Petal_4.gltf",
    "size": {
      "x": 0.33,
      "y": 0.25,
      "z": 0.24
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Petal_5": {
    "id": "nature/Petal_5",
    "shipped": false,
    "pack": "nature",
    "name": "Petal_5",
    "kind": "static",
    "category": "particle",
    "usage": "Pétale : particule de vent (printemps)",
    "url": "assets/nature/Petal_5.gltf",
    "size": {
      "x": 0.83,
      "y": 0.29,
      "z": 0.8
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pine_1": {
    "id": "nature/Pine_1",
    "shipped": false,
    "pack": "nature",
    "name": "Pine_1",
    "kind": "static",
    "category": "pine",
    "usage": "Sapin récoltable (bois) — hiver, bordure de forêt",
    "url": "assets/nature/Pine_1.gltf",
    "size": {
      "x": 4.94,
      "y": 7.32,
      "z": 4.54
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pine_2": {
    "id": "nature/Pine_2",
    "shipped": false,
    "pack": "nature",
    "name": "Pine_2",
    "kind": "static",
    "category": "pine",
    "usage": "Sapin récoltable (bois) — hiver, bordure de forêt",
    "url": "assets/nature/Pine_2.gltf",
    "size": {
      "x": 5.73,
      "y": 7.38,
      "z": 5.22
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pine_3": {
    "id": "nature/Pine_3",
    "shipped": false,
    "pack": "nature",
    "name": "Pine_3",
    "kind": "static",
    "category": "pine",
    "usage": "Sapin récoltable (bois) — hiver, bordure de forêt",
    "url": "assets/nature/Pine_3.gltf",
    "size": {
      "x": 3.61,
      "y": 7.39,
      "z": 4
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pine_4": {
    "id": "nature/Pine_4",
    "shipped": false,
    "pack": "nature",
    "name": "Pine_4",
    "kind": "static",
    "category": "pine",
    "usage": "Sapin récoltable (bois) — hiver, bordure de forêt",
    "url": "assets/nature/Pine_4.gltf",
    "size": {
      "x": 5.8,
      "y": 10.24,
      "z": 5.37
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Pine_5": {
    "id": "nature/Pine_5",
    "shipped": false,
    "pack": "nature",
    "name": "Pine_5",
    "kind": "static",
    "category": "pine",
    "usage": "Sapin récoltable (bois) — hiver, bordure de forêt",
    "url": "assets/nature/Pine_5.gltf",
    "size": {
      "x": 6.42,
      "y": 8.72,
      "z": 6.22
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Plant_1": {
    "id": "nature/Plant_1",
    "shipped": false,
    "pack": "nature",
    "name": "Plant_1",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Plant_1.gltf",
    "size": {
      "x": 1.27,
      "y": 1.01,
      "z": 1.39
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Plant_1_Big": {
    "id": "nature/Plant_1_Big",
    "shipped": false,
    "pack": "nature",
    "name": "Plant_1_Big",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Plant_1_Big.gltf",
    "size": {
      "x": 1.81,
      "y": 2.35,
      "z": 1.95
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Plant_7": {
    "id": "nature/Plant_7",
    "shipped": false,
    "pack": "nature",
    "name": "Plant_7",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Plant_7.gltf",
    "size": {
      "x": 1.05,
      "y": 0.25,
      "z": 0.96
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Plant_7_Big": {
    "id": "nature/Plant_7_Big",
    "shipped": false,
    "pack": "nature",
    "name": "Plant_7_Big",
    "kind": "static",
    "category": "plant",
    "usage": "Végétation décorative",
    "url": "assets/nature/Plant_7_Big.gltf",
    "size": {
      "x": 1.31,
      "y": 0.25,
      "z": 1.36
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Round_Small_1": {
    "id": "nature/RockPath_Round_Small_1",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Round_Small_1",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Round_Small_1.gltf",
    "size": {
      "x": 1.06,
      "y": 0.11,
      "z": 1.48
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Round_Small_2": {
    "id": "nature/RockPath_Round_Small_2",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Round_Small_2",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Round_Small_2.gltf",
    "size": {
      "x": 1.14,
      "y": 0.1,
      "z": 1.35
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Round_Small_3": {
    "id": "nature/RockPath_Round_Small_3",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Round_Small_3",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Round_Small_3.gltf",
    "size": {
      "x": 1.18,
      "y": 0.11,
      "z": 1.29
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Round_Thin": {
    "id": "nature/RockPath_Round_Thin",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Round_Thin",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Round_Thin.gltf",
    "size": {
      "x": 1.46,
      "y": 0.11,
      "z": 2.09
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Round_Wide": {
    "id": "nature/RockPath_Round_Wide",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Round_Wide",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Round_Wide.gltf",
    "size": {
      "x": 2.11,
      "y": 0.11,
      "z": 2.13
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Square_Small_1": {
    "id": "nature/RockPath_Square_Small_1",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Square_Small_1",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Square_Small_1.gltf",
    "size": {
      "x": 1.02,
      "y": 0.15,
      "z": 0.97
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Square_Small_2": {
    "id": "nature/RockPath_Square_Small_2",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Square_Small_2",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Square_Small_2.gltf",
    "size": {
      "x": 0.99,
      "y": 0.15,
      "z": 0.97
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Square_Small_3": {
    "id": "nature/RockPath_Square_Small_3",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Square_Small_3",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Square_Small_3.gltf",
    "size": {
      "x": 0.84,
      "y": 0.17,
      "z": 1.08
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Square_Thin": {
    "id": "nature/RockPath_Square_Thin",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Square_Thin",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Square_Thin.gltf",
    "size": {
      "x": 1.56,
      "y": 0.18,
      "z": 1.99
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/RockPath_Square_Wide": {
    "id": "nature/RockPath_Square_Wide",
    "shipped": false,
    "pack": "nature",
    "name": "RockPath_Square_Wide",
    "kind": "static",
    "category": "path",
    "usage": "Dalles de chemin du camp",
    "url": "assets/nature/RockPath_Square_Wide.gltf",
    "size": {
      "x": 2.05,
      "y": 0.18,
      "z": 1.99
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Rock_Medium_1": {
    "id": "nature/Rock_Medium_1",
    "shipped": false,
    "pack": "nature",
    "name": "Rock_Medium_1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher récoltable (pierre) ou obstacle",
    "url": "assets/nature/Rock_Medium_1.gltf",
    "size": {
      "x": 3.23,
      "y": 2.26,
      "z": 2.99
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Rock_Medium_2": {
    "id": "nature/Rock_Medium_2",
    "shipped": false,
    "pack": "nature",
    "name": "Rock_Medium_2",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher récoltable (pierre) ou obstacle",
    "url": "assets/nature/Rock_Medium_2.gltf",
    "size": {
      "x": 3.05,
      "y": 1.9,
      "z": 2.48
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/Rock_Medium_3": {
    "id": "nature/Rock_Medium_3",
    "shipped": false,
    "pack": "nature",
    "name": "Rock_Medium_3",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher récoltable (pierre) ou obstacle",
    "url": "assets/nature/Rock_Medium_3.gltf",
    "size": {
      "x": 3.42,
      "y": 2.32,
      "z": 3.48
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/TwistedTree_1": {
    "id": "nature/TwistedTree_1",
    "shipped": false,
    "pack": "nature",
    "name": "TwistedTree_1",
    "kind": "static",
    "category": "tree",
    "usage": "Grand arbre (feuillage rouge : automne) / bordure",
    "url": "assets/nature/TwistedTree_1.gltf",
    "size": {
      "x": 13.52,
      "y": 16.73,
      "z": 11.55
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/TwistedTree_2": {
    "id": "nature/TwistedTree_2",
    "shipped": false,
    "pack": "nature",
    "name": "TwistedTree_2",
    "kind": "static",
    "category": "tree",
    "usage": "Grand arbre (feuillage rouge : automne) / bordure",
    "url": "assets/nature/TwistedTree_2.gltf",
    "size": {
      "x": 10.56,
      "y": 18.95,
      "z": 9.2
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/TwistedTree_3": {
    "id": "nature/TwistedTree_3",
    "shipped": false,
    "pack": "nature",
    "name": "TwistedTree_3",
    "kind": "static",
    "category": "tree",
    "usage": "Grand arbre (feuillage rouge : automne) / bordure",
    "url": "assets/nature/TwistedTree_3.gltf",
    "size": {
      "x": 11.36,
      "y": 16.07,
      "z": 11.51
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/TwistedTree_4": {
    "id": "nature/TwistedTree_4",
    "shipped": false,
    "pack": "nature",
    "name": "TwistedTree_4",
    "kind": "static",
    "category": "tree",
    "usage": "Grand arbre (feuillage rouge : automne) / bordure",
    "url": "assets/nature/TwistedTree_4.gltf",
    "size": {
      "x": 10.38,
      "y": 18.74,
      "z": 11.29
    },
    "clips": [],
    "shippedClips": []
  },
  "nature/TwistedTree_5": {
    "id": "nature/TwistedTree_5",
    "shipped": false,
    "pack": "nature",
    "name": "TwistedTree_5",
    "kind": "static",
    "category": "tree",
    "usage": "Grand arbre (feuillage rouge : automne) / bordure",
    "url": "assets/nature/TwistedTree_5.gltf",
    "size": {
      "x": 9.49,
      "y": 15.66,
      "z": 9.39
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_1_A_Color1": {
    "id": "forest/Bush_1_A_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_1_A_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_1_A_Color1.gltf",
    "size": {
      "x": 0.27,
      "y": 0.23,
      "z": 0.23
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_1_B_Color1": {
    "id": "forest/Bush_1_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_1_B_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_1_B_Color1.gltf",
    "size": {
      "x": 0.72,
      "y": 0.48,
      "z": 0.72
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_1_C_Color1": {
    "id": "forest/Bush_1_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_1_C_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_1_C_Color1.gltf",
    "size": {
      "x": 1.2,
      "y": 0.81,
      "z": 1.2
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_1_D_Color1": {
    "id": "forest/Bush_1_D_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_1_D_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_1_D_Color1.gltf",
    "size": {
      "x": 1.57,
      "y": 0.99,
      "z": 1.57
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_1_E_Color1": {
    "id": "forest/Bush_1_E_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_1_E_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_1_E_Color1.gltf",
    "size": {
      "x": 1.58,
      "y": 0.81,
      "z": 1.32
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_1_F_Color1": {
    "id": "forest/Bush_1_F_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_1_F_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_1_F_Color1.gltf",
    "size": {
      "x": 2.28,
      "y": 0.99,
      "z": 1.88
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_1_G_Color1": {
    "id": "forest/Bush_1_G_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_1_G_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_1_G_Color1.gltf",
    "size": {
      "x": 3.1,
      "y": 0.99,
      "z": 1.75
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_2_A_Color1": {
    "id": "forest/Bush_2_A_Color1",
    "shipped": true,
    "pack": "forest",
    "name": "Bush_2_A_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_2_A_Color1.gltf",
    "size": {
      "x": 0.53,
      "y": 0.53,
      "z": 0.53
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_2_B_Color1": {
    "id": "forest/Bush_2_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_2_B_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_2_B_Color1.gltf",
    "size": {
      "x": 0.86,
      "y": 0.86,
      "z": 0.86
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_2_C_Color1": {
    "id": "forest/Bush_2_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_2_C_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_2_C_Color1.gltf",
    "size": {
      "x": 1.32,
      "y": 1.32,
      "z": 1.32
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_2_D_Color1": {
    "id": "forest/Bush_2_D_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_2_D_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_2_D_Color1.gltf",
    "size": {
      "x": 1.57,
      "y": 0.86,
      "z": 1.02
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_2_E_Color1": {
    "id": "forest/Bush_2_E_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_2_E_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_2_E_Color1.gltf",
    "size": {
      "x": 2.35,
      "y": 1.33,
      "z": 2.01
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_2_F_Color1": {
    "id": "forest/Bush_2_F_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_2_F_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_2_F_Color1.gltf",
    "size": {
      "x": 2.01,
      "y": 1.79,
      "z": 1.59
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_3_A_Color1": {
    "id": "forest/Bush_3_A_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_3_A_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_3_A_Color1.gltf",
    "size": {
      "x": 1.03,
      "y": 0.49,
      "z": 1.03
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_3_B_Color1": {
    "id": "forest/Bush_3_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_3_B_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_3_B_Color1.gltf",
    "size": {
      "x": 1.68,
      "y": 0.8,
      "z": 1.68
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_3_C_Color1": {
    "id": "forest/Bush_3_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_3_C_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_3_C_Color1.gltf",
    "size": {
      "x": 2.49,
      "y": 1.15,
      "z": 2.49
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_4_A_Color1": {
    "id": "forest/Bush_4_A_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_4_A_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_4_A_Color1.gltf",
    "size": {
      "x": 0.58,
      "y": 0.43,
      "z": 0.58
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_4_B_Color1": {
    "id": "forest/Bush_4_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_4_B_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_4_B_Color1.gltf",
    "size": {
      "x": 0.99,
      "y": 0.74,
      "z": 0.99
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_4_C_Color1": {
    "id": "forest/Bush_4_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_4_C_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_4_C_Color1.gltf",
    "size": {
      "x": 1.58,
      "y": 1.3,
      "z": 1.58
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_4_D_Color1": {
    "id": "forest/Bush_4_D_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_4_D_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_4_D_Color1.gltf",
    "size": {
      "x": 1.74,
      "y": 0.74,
      "z": 1.29
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_4_E_Color1": {
    "id": "forest/Bush_4_E_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_4_E_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_4_E_Color1.gltf",
    "size": {
      "x": 2.7,
      "y": 1.3,
      "z": 2.28
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Bush_4_F_Color1": {
    "id": "forest/Bush_4_F_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Bush_4_F_Color1",
    "kind": "static",
    "category": "bush",
    "usage": "Buisson low-poly",
    "url": "assets/forest/Bush_4_F_Color1.gltf",
    "size": {
      "x": 3.39,
      "y": 1.3,
      "z": 2.14
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_1_A_Color1": {
    "id": "forest/Grass_1_A_Color1",
    "shipped": true,
    "pack": "forest",
    "name": "Grass_1_A_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_1_A_Color1.gltf",
    "size": {
      "x": 0.34,
      "y": 0.56,
      "z": 0.15
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_1_A_Singlesided_Color1": {
    "id": "forest/Grass_1_A_Singlesided_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_1_A_Singlesided_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_1_A_Singlesided_Color1.gltf",
    "size": {
      "x": 0.29,
      "y": 0.56,
      "z": 0.13
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_1_B_Color1": {
    "id": "forest/Grass_1_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_1_B_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_1_B_Color1.gltf",
    "size": {
      "x": 0.51,
      "y": 0.54,
      "z": 0.56
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_1_B_Singlesided_Color1": {
    "id": "forest/Grass_1_B_Singlesided_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_1_B_Singlesided_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_1_B_Singlesided_Color1.gltf",
    "size": {
      "x": 0.51,
      "y": 0.52,
      "z": 0.53
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_1_C_Color1": {
    "id": "forest/Grass_1_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_1_C_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_1_C_Color1.gltf",
    "size": {
      "x": 0.75,
      "y": 0.58,
      "z": 0.72
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_1_C_Singlesided_Color1": {
    "id": "forest/Grass_1_C_Singlesided_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_1_C_Singlesided_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_1_C_Singlesided_Color1.gltf",
    "size": {
      "x": 0.73,
      "y": 0.58,
      "z": 0.73
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_1_D_Color1": {
    "id": "forest/Grass_1_D_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_1_D_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_1_D_Color1.gltf",
    "size": {
      "x": 1.08,
      "y": 0.59,
      "z": 1.18
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_1_D_Singlesided_Color1": {
    "id": "forest/Grass_1_D_Singlesided_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_1_D_Singlesided_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_1_D_Singlesided_Color1.gltf",
    "size": {
      "x": 1.04,
      "y": 0.58,
      "z": 1.19
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_2_A_Color1": {
    "id": "forest/Grass_2_A_Color1",
    "shipped": true,
    "pack": "forest",
    "name": "Grass_2_A_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_2_A_Color1.gltf",
    "size": {
      "x": 0.16,
      "y": 0.92,
      "z": 0.25
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_2_A_Singlesided_Color1": {
    "id": "forest/Grass_2_A_Singlesided_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_2_A_Singlesided_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_2_A_Singlesided_Color1.gltf",
    "size": {
      "x": 0.16,
      "y": 0.92,
      "z": 0.23
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_2_B_Color1": {
    "id": "forest/Grass_2_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_2_B_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_2_B_Color1.gltf",
    "size": {
      "x": 0.4,
      "y": 0.92,
      "z": 0.4
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_2_B_Singlesided_Color1": {
    "id": "forest/Grass_2_B_Singlesided_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_2_B_Singlesided_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_2_B_Singlesided_Color1.gltf",
    "size": {
      "x": 0.38,
      "y": 0.92,
      "z": 0.38
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_2_C_Color1": {
    "id": "forest/Grass_2_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_2_C_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_2_C_Color1.gltf",
    "size": {
      "x": 0.9,
      "y": 0.94,
      "z": 0.76
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_2_C_Singlesided_Color1": {
    "id": "forest/Grass_2_C_Singlesided_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_2_C_Singlesided_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_2_C_Singlesided_Color1.gltf",
    "size": {
      "x": 0.87,
      "y": 0.93,
      "z": 0.74
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_2_D_Color1": {
    "id": "forest/Grass_2_D_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_2_D_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_2_D_Color1.gltf",
    "size": {
      "x": 1.1,
      "y": 0.94,
      "z": 1.37
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Grass_2_D_Singlesided_Color1": {
    "id": "forest/Grass_2_D_Singlesided_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Grass_2_D_Singlesided_Color1",
    "kind": "static",
    "category": "grass",
    "usage": "Touffe d'herbe low-poly (InstancedMesh)",
    "url": "assets/forest/Grass_2_D_Singlesided_Color1.gltf",
    "size": {
      "x": 1.08,
      "y": 0.93,
      "z": 1.34
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_A_Color1": {
    "id": "forest/Rock_1_A_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_A_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_A_Color1.gltf",
    "size": {
      "x": 0.58,
      "y": 0.54,
      "z": 0.61
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_B_Color1": {
    "id": "forest/Rock_1_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_B_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_B_Color1.gltf",
    "size": {
      "x": 0.55,
      "y": 0.54,
      "z": 0.58
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_C_Color1": {
    "id": "forest/Rock_1_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_C_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_C_Color1.gltf",
    "size": {
      "x": 0.52,
      "y": 0.54,
      "z": 0.61
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_D_Color1": {
    "id": "forest/Rock_1_D_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_D_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_D_Color1.gltf",
    "size": {
      "x": 0.93,
      "y": 1.13,
      "z": 1.16
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_E_Color1": {
    "id": "forest/Rock_1_E_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_E_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_E_Color1.gltf",
    "size": {
      "x": 1,
      "y": 1.13,
      "z": 1.09
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_F_Color1": {
    "id": "forest/Rock_1_F_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_F_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_F_Color1.gltf",
    "size": {
      "x": 1,
      "y": 1.13,
      "z": 0.87
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_G_Color1": {
    "id": "forest/Rock_1_G_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_G_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_G_Color1.gltf",
    "size": {
      "x": 1.75,
      "y": 1.87,
      "z": 1.65
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_H_Color1": {
    "id": "forest/Rock_1_H_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_H_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_H_Color1.gltf",
    "size": {
      "x": 1.53,
      "y": 1.87,
      "z": 1.53
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_I_Color1": {
    "id": "forest/Rock_1_I_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_I_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_I_Color1.gltf",
    "size": {
      "x": 1.61,
      "y": 1.87,
      "z": 2
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_J_Color1": {
    "id": "forest/Rock_1_J_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_J_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_J_Color1.gltf",
    "size": {
      "x": 3.39,
      "y": 3.36,
      "z": 3.76
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_K_Color1": {
    "id": "forest/Rock_1_K_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_K_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_K_Color1.gltf",
    "size": {
      "x": 3.69,
      "y": 3.65,
      "z": 3.13
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_L_Color1": {
    "id": "forest/Rock_1_L_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_L_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_L_Color1.gltf",
    "size": {
      "x": 3.29,
      "y": 3.4,
      "z": 2.62
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_M_Color1": {
    "id": "forest/Rock_1_M_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_M_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_M_Color1.gltf",
    "size": {
      "x": 3.91,
      "y": 3.52,
      "z": 2.71
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_N_Color1": {
    "id": "forest/Rock_1_N_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_N_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_N_Color1.gltf",
    "size": {
      "x": 2.3,
      "y": 4.5,
      "z": 2.24
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_O_Color1": {
    "id": "forest/Rock_1_O_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_O_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_O_Color1.gltf",
    "size": {
      "x": 2.11,
      "y": 4.58,
      "z": 2.11
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_P_Color1": {
    "id": "forest/Rock_1_P_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_P_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_P_Color1.gltf",
    "size": {
      "x": 2.21,
      "y": 4.01,
      "z": 1.84
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_1_Q_Color1": {
    "id": "forest/Rock_1_Q_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_1_Q_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_1_Q_Color1.gltf",
    "size": {
      "x": 2.22,
      "y": 4.28,
      "z": 2.8
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_2_A_Color1": {
    "id": "forest/Rock_2_A_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_2_A_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_2_A_Color1.gltf",
    "size": {
      "x": 0.22,
      "y": 0.22,
      "z": 0.22
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_2_B_Color1": {
    "id": "forest/Rock_2_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_2_B_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_2_B_Color1.gltf",
    "size": {
      "x": 0.63,
      "y": 0.65,
      "z": 0.63
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_2_C_Color1": {
    "id": "forest/Rock_2_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_2_C_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_2_C_Color1.gltf",
    "size": {
      "x": 1.3,
      "y": 1.33,
      "z": 1.3
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_2_D_Color1": {
    "id": "forest/Rock_2_D_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_2_D_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_2_D_Color1.gltf",
    "size": {
      "x": 1.71,
      "y": 1.74,
      "z": 1.71
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_2_E_Color1": {
    "id": "forest/Rock_2_E_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_2_E_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_2_E_Color1.gltf",
    "size": {
      "x": 3.17,
      "y": 2.86,
      "z": 3.31
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_2_F_Color1": {
    "id": "forest/Rock_2_F_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_2_F_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_2_F_Color1.gltf",
    "size": {
      "x": 4.14,
      "y": 2.86,
      "z": 2.87
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_2_G_Color1": {
    "id": "forest/Rock_2_G_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_2_G_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_2_G_Color1.gltf",
    "size": {
      "x": 3.09,
      "y": 3.2,
      "z": 3.73
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_2_H_Color1": {
    "id": "forest/Rock_2_H_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_2_H_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_2_H_Color1.gltf",
    "size": {
      "x": 3.7,
      "y": 2.76,
      "z": 3.31
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_A_Color1": {
    "id": "forest/Rock_3_A_Color1",
    "shipped": true,
    "pack": "forest",
    "name": "Rock_3_A_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_A_Color1.gltf",
    "size": {
      "x": 0.96,
      "y": 0.86,
      "z": 0.81
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_B_Color1": {
    "id": "forest/Rock_3_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_B_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_B_Color1.gltf",
    "size": {
      "x": 0.82,
      "y": 1.03,
      "z": 0.85
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_C_Color1": {
    "id": "forest/Rock_3_C_Color1",
    "shipped": true,
    "pack": "forest",
    "name": "Rock_3_C_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_C_Color1.gltf",
    "size": {
      "x": 0.81,
      "y": 0.97,
      "z": 0.86
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_D_Color1": {
    "id": "forest/Rock_3_D_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_D_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_D_Color1.gltf",
    "size": {
      "x": 0.93,
      "y": 0.97,
      "z": 0.79
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_E_Color1": {
    "id": "forest/Rock_3_E_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_E_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_E_Color1.gltf",
    "size": {
      "x": 1.15,
      "y": 1.29,
      "z": 1.18
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_F_Color1": {
    "id": "forest/Rock_3_F_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_F_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_F_Color1.gltf",
    "size": {
      "x": 1.09,
      "y": 1.18,
      "z": 1.19
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_G_Color1": {
    "id": "forest/Rock_3_G_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_G_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_G_Color1.gltf",
    "size": {
      "x": 1.86,
      "y": 2,
      "z": 1.73
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_H_Color1": {
    "id": "forest/Rock_3_H_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_H_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_H_Color1.gltf",
    "size": {
      "x": 1.95,
      "y": 2.06,
      "z": 1.76
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_I_Color1": {
    "id": "forest/Rock_3_I_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_I_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_I_Color1.gltf",
    "size": {
      "x": 1.92,
      "y": 2.11,
      "z": 1.64
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_J_Color1": {
    "id": "forest/Rock_3_J_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_J_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_J_Color1.gltf",
    "size": {
      "x": 1.97,
      "y": 1.9,
      "z": 1.74
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_K_Color1": {
    "id": "forest/Rock_3_K_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_K_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_K_Color1.gltf",
    "size": {
      "x": 2.61,
      "y": 2.22,
      "z": 2.59
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_L_Color1": {
    "id": "forest/Rock_3_L_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_L_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_L_Color1.gltf",
    "size": {
      "x": 2.62,
      "y": 2.27,
      "z": 2.56
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_M_Color1": {
    "id": "forest/Rock_3_M_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_M_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_M_Color1.gltf",
    "size": {
      "x": 3.43,
      "y": 3.6,
      "z": 2.81
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_N_Color1": {
    "id": "forest/Rock_3_N_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_N_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_N_Color1.gltf",
    "size": {
      "x": 3.42,
      "y": 3.53,
      "z": 2.98
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_O_Color1": {
    "id": "forest/Rock_3_O_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_O_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_O_Color1.gltf",
    "size": {
      "x": 3.48,
      "y": 3.47,
      "z": 2.93
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_P_Color1": {
    "id": "forest/Rock_3_P_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_P_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_P_Color1.gltf",
    "size": {
      "x": 3.29,
      "y": 3.68,
      "z": 2.87
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_Q_Color1": {
    "id": "forest/Rock_3_Q_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_Q_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_Q_Color1.gltf",
    "size": {
      "x": 4.65,
      "y": 3.72,
      "z": 4.48
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Rock_3_R_Color1": {
    "id": "forest/Rock_3_R_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Rock_3_R_Color1",
    "kind": "static",
    "category": "rock",
    "usage": "Rocher low-poly (pierre / obstacle)",
    "url": "assets/forest/Rock_3_R_Color1.gltf",
    "size": {
      "x": 5.16,
      "y": 3.85,
      "z": 4.21
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_1_A_Color1": {
    "id": "forest/Tree_1_A_Color1",
    "shipped": true,
    "pack": "forest",
    "name": "Tree_1_A_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_1_A_Color1.gltf",
    "size": {
      "x": 3.18,
      "y": 4.16,
      "z": 3.25
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_1_B_Color1": {
    "id": "forest/Tree_1_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_1_B_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_1_B_Color1.gltf",
    "size": {
      "x": 4.01,
      "y": 4.93,
      "z": 3.45
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_1_C_Color1": {
    "id": "forest/Tree_1_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_1_C_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_1_C_Color1.gltf",
    "size": {
      "x": 6.69,
      "y": 7.81,
      "z": 5.75
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_2_A_Color1": {
    "id": "forest/Tree_2_A_Color1",
    "shipped": true,
    "pack": "forest",
    "name": "Tree_2_A_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_2_A_Color1.gltf",
    "size": {
      "x": 2.6,
      "y": 4.67,
      "z": 2
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_2_B_Color1": {
    "id": "forest/Tree_2_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_2_B_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_2_B_Color1.gltf",
    "size": {
      "x": 3.7,
      "y": 6.04,
      "z": 2.1
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_2_C_Color1": {
    "id": "forest/Tree_2_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_2_C_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_2_C_Color1.gltf",
    "size": {
      "x": 4.6,
      "y": 6.92,
      "z": 3.4
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_2_D_Color1": {
    "id": "forest/Tree_2_D_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_2_D_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_2_D_Color1.gltf",
    "size": {
      "x": 4.74,
      "y": 8.09,
      "z": 4.03
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_2_E_Color1": {
    "id": "forest/Tree_2_E_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_2_E_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_2_E_Color1.gltf",
    "size": {
      "x": 6.05,
      "y": 8.79,
      "z": 5.68
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_3_A_Color1": {
    "id": "forest/Tree_3_A_Color1",
    "shipped": true,
    "pack": "forest",
    "name": "Tree_3_A_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_3_A_Color1.gltf",
    "size": {
      "x": 3.09,
      "y": 3.51,
      "z": 3.09
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_3_B_Color1": {
    "id": "forest/Tree_3_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_3_B_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_3_B_Color1.gltf",
    "size": {
      "x": 4.13,
      "y": 4.35,
      "z": 4.13
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_3_C_Color1": {
    "id": "forest/Tree_3_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_3_C_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_3_C_Color1.gltf",
    "size": {
      "x": 5.63,
      "y": 5.79,
      "z": 4.62
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_4_A_Color1": {
    "id": "forest/Tree_4_A_Color1",
    "shipped": true,
    "pack": "forest",
    "name": "Tree_4_A_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_4_A_Color1.gltf",
    "size": {
      "x": 2.01,
      "y": 5.27,
      "z": 2
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_4_B_Color1": {
    "id": "forest/Tree_4_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_4_B_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_4_B_Color1.gltf",
    "size": {
      "x": 2.57,
      "y": 6.94,
      "z": 2.27
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_4_C_Color1": {
    "id": "forest/Tree_4_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_4_C_Color1",
    "kind": "static",
    "category": "tree",
    "usage": "Arbre low-poly (bois)",
    "url": "assets/forest/Tree_4_C_Color1.gltf",
    "size": {
      "x": 3.74,
      "y": 10.77,
      "z": 2.87
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_Bare_1_A_Color1": {
    "id": "forest/Tree_Bare_1_A_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_Bare_1_A_Color1",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre nu (low-poly) : hiver, souche",
    "url": "assets/forest/Tree_Bare_1_A_Color1.gltf",
    "size": {
      "x": 1.13,
      "y": 2.86,
      "z": 1.03
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_Bare_1_B_Color1": {
    "id": "forest/Tree_Bare_1_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_Bare_1_B_Color1",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre nu (low-poly) : hiver, souche",
    "url": "assets/forest/Tree_Bare_1_B_Color1.gltf",
    "size": {
      "x": 1.96,
      "y": 3.25,
      "z": 1.45
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_Bare_1_C_Color1": {
    "id": "forest/Tree_Bare_1_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_Bare_1_C_Color1",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre nu (low-poly) : hiver, souche",
    "url": "assets/forest/Tree_Bare_1_C_Color1.gltf",
    "size": {
      "x": 3.74,
      "y": 5.26,
      "z": 2.07
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_Bare_2_A_Color1": {
    "id": "forest/Tree_Bare_2_A_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_Bare_2_A_Color1",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre nu (low-poly) : hiver, souche",
    "url": "assets/forest/Tree_Bare_2_A_Color1.gltf",
    "size": {
      "x": 1.2,
      "y": 3.84,
      "z": 0.6
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_Bare_2_B_Color1": {
    "id": "forest/Tree_Bare_2_B_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_Bare_2_B_Color1",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre nu (low-poly) : hiver, souche",
    "url": "assets/forest/Tree_Bare_2_B_Color1.gltf",
    "size": {
      "x": 1.79,
      "y": 5.54,
      "z": 0.66
    },
    "clips": [],
    "shippedClips": []
  },
  "forest/Tree_Bare_2_C_Color1": {
    "id": "forest/Tree_Bare_2_C_Color1",
    "shipped": false,
    "pack": "forest",
    "name": "Tree_Bare_2_C_Color1",
    "kind": "static",
    "category": "deadTree",
    "usage": "Arbre nu (low-poly) : hiver, souche",
    "url": "assets/forest/Tree_Bare_2_C_Color1.gltf",
    "size": {
      "x": 1.58,
      "y": 7.61,
      "z": 1.1
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/barrel-open": {
    "id": "survival/barrel-open",
    "shipped": false,
    "pack": "survival",
    "name": "barrel-open",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/barrel-open.gltf",
    "size": {
      "x": 0.24,
      "y": 0.34,
      "z": 0.24
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/barrel": {
    "id": "survival/barrel",
    "shipped": false,
    "pack": "survival",
    "name": "barrel",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/barrel.gltf",
    "size": {
      "x": 0.24,
      "y": 0.34,
      "z": 0.24
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/bedroll-frame": {
    "id": "survival/bedroll-frame",
    "shipped": false,
    "pack": "survival",
    "name": "bedroll-frame",
    "kind": "static",
    "category": "shelter",
    "usage": "Couchage (tente niveau 1, intérieur)",
    "url": "assets/survival/bedroll-frame.gltf",
    "size": {
      "x": 0.27,
      "y": 0.15,
      "z": 0.61
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/bedroll-packed": {
    "id": "survival/bedroll-packed",
    "shipped": false,
    "pack": "survival",
    "name": "bedroll-packed",
    "kind": "static",
    "category": "shelter",
    "usage": "Couchage (tente niveau 1, intérieur)",
    "url": "assets/survival/bedroll-packed.gltf",
    "size": {
      "x": 0.26,
      "y": 0.09,
      "z": 0.09
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/bedroll": {
    "id": "survival/bedroll",
    "shipped": true,
    "pack": "survival",
    "name": "bedroll",
    "kind": "static",
    "category": "shelter",
    "usage": "Couchage (tente niveau 1, intérieur)",
    "url": "assets/survival/bedroll.gltf",
    "size": {
      "x": 0.31,
      "y": 0.12,
      "z": 0.61
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/bottle-large": {
    "id": "survival/bottle-large",
    "shipped": false,
    "pack": "survival",
    "name": "bottle-large",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/bottle-large.gltf",
    "size": {
      "x": 0.07,
      "y": 0.14,
      "z": 0.08
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/bottle": {
    "id": "survival/bottle",
    "shipped": false,
    "pack": "survival",
    "name": "bottle",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/bottle.gltf",
    "size": {
      "x": 0.05,
      "y": 0.15,
      "z": 0.06
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/box-large-open": {
    "id": "survival/box-large-open",
    "shipped": false,
    "pack": "survival",
    "name": "box-large-open",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/box-large-open.gltf",
    "size": {
      "x": 0.25,
      "y": 0.31,
      "z": 0.5
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/box-large": {
    "id": "survival/box-large",
    "shipped": false,
    "pack": "survival",
    "name": "box-large",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/box-large.gltf",
    "size": {
      "x": 0.25,
      "y": 0.25,
      "z": 0.5
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/box-open": {
    "id": "survival/box-open",
    "shipped": false,
    "pack": "survival",
    "name": "box-open",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/box-open.gltf",
    "size": {
      "x": 0.25,
      "y": 0.31,
      "z": 0.25
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/box": {
    "id": "survival/box",
    "shipped": false,
    "pack": "survival",
    "name": "box",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/box.gltf",
    "size": {
      "x": 0.25,
      "y": 0.25,
      "z": 0.25
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/bucket": {
    "id": "survival/bucket",
    "shipped": false,
    "pack": "survival",
    "name": "bucket",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/bucket.gltf",
    "size": {
      "x": 0.14,
      "y": 0.19,
      "z": 0.14
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/campfire-fishing-stand": {
    "id": "survival/campfire-fishing-stand",
    "shipped": false,
    "pack": "survival",
    "name": "campfire-fishing-stand",
    "kind": "static",
    "category": "campfire",
    "usage": "Feu de camp / cuisine (cantine)",
    "url": "assets/survival/campfire-fishing-stand.gltf",
    "size": {
      "x": 0.39,
      "y": 0.28,
      "z": 0.25
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/campfire-pit": {
    "id": "survival/campfire-pit",
    "shipped": true,
    "pack": "survival",
    "name": "campfire-pit",
    "kind": "static",
    "category": "campfire",
    "usage": "Feu de camp / cuisine (cantine)",
    "url": "assets/survival/campfire-pit.gltf",
    "size": {
      "x": 0.28,
      "y": 0.11,
      "z": 0.27
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/campfire-stand": {
    "id": "survival/campfire-stand",
    "shipped": false,
    "pack": "survival",
    "name": "campfire-stand",
    "kind": "static",
    "category": "campfire",
    "usage": "Feu de camp / cuisine (cantine)",
    "url": "assets/survival/campfire-stand.gltf",
    "size": {
      "x": 0.41,
      "y": 0.28,
      "z": 0.12
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/chest": {
    "id": "survival/chest",
    "shipped": false,
    "pack": "survival",
    "name": "chest",
    "kind": "static",
    "category": "storage",
    "usage": "Stockage / entrepôt / décor de camp",
    "url": "assets/survival/chest.gltf",
    "size": {
      "x": 0.26,
      "y": 0.26,
      "z": 0.27
    },
    "clips": [
      "open",
      "close",
      "open-close"
    ],
    "shippedClips": []
  },
  "survival/fence-doorway": {
    "id": "survival/fence-doorway",
    "shipped": false,
    "pack": "survival",
    "name": "fence-doorway",
    "kind": "static",
    "category": "defense",
    "usage": "Palissade et porte du camp (défense nocturne)",
    "url": "assets/survival/fence-doorway.gltf",
    "size": {
      "x": 0.5,
      "y": 0.52,
      "z": 0.05
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/fence-fortified": {
    "id": "survival/fence-fortified",
    "shipped": false,
    "pack": "survival",
    "name": "fence-fortified",
    "kind": "static",
    "category": "defense",
    "usage": "Palissade et porte du camp (défense nocturne)",
    "url": "assets/survival/fence-fortified.gltf",
    "size": {
      "x": 0.5,
      "y": 0.52,
      "z": 0.05
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/fence": {
    "id": "survival/fence",
    "shipped": false,
    "pack": "survival",
    "name": "fence",
    "kind": "static",
    "category": "defense",
    "usage": "Palissade et porte du camp (défense nocturne)",
    "url": "assets/survival/fence.gltf",
    "size": {
      "x": 0.5,
      "y": 0.52,
      "z": 0.04
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/fish-large": {
    "id": "survival/fish-large",
    "shipped": false,
    "pack": "survival",
    "name": "fish-large",
    "kind": "static",
    "category": "resource",
    "usage": "Poisson (nourriture)",
    "url": "assets/survival/fish-large.gltf",
    "size": {
      "x": 0.31,
      "y": 0.16,
      "z": 0.1
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/fish": {
    "id": "survival/fish",
    "shipped": false,
    "pack": "survival",
    "name": "fish",
    "kind": "static",
    "category": "resource",
    "usage": "Poisson (nourriture)",
    "url": "assets/survival/fish.gltf",
    "size": {
      "x": 0.2,
      "y": 0.11,
      "z": 0.07
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/floor-hole": {
    "id": "survival/floor-hole",
    "shipped": false,
    "pack": "survival",
    "name": "floor-hole",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/floor-hole.gltf",
    "size": {
      "x": 0.5,
      "y": 0.07,
      "z": 0.5
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/floor-old": {
    "id": "survival/floor-old",
    "shipped": false,
    "pack": "survival",
    "name": "floor-old",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/floor-old.gltf",
    "size": {
      "x": 0.5,
      "y": 0.05,
      "z": 0.5
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/floor": {
    "id": "survival/floor",
    "shipped": false,
    "pack": "survival",
    "name": "floor",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/floor.gltf",
    "size": {
      "x": 0.5,
      "y": 0.05,
      "z": 0.5
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/grass-large": {
    "id": "survival/grass-large",
    "shipped": false,
    "pack": "survival",
    "name": "grass-large",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/grass-large.gltf",
    "size": {
      "x": 0.48,
      "y": 0.14,
      "z": 0.49
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/grass": {
    "id": "survival/grass",
    "shipped": false,
    "pack": "survival",
    "name": "grass",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/grass.gltf",
    "size": {
      "x": 0.23,
      "y": 0.14,
      "z": 0.26
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/metal-panel-narrow": {
    "id": "survival/metal-panel-narrow",
    "shipped": false,
    "pack": "survival",
    "name": "metal-panel-narrow",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/metal-panel-narrow.gltf",
    "size": {
      "x": 0.25,
      "y": 0.5,
      "z": 0.05
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/metal-panel-screws-half": {
    "id": "survival/metal-panel-screws-half",
    "shipped": false,
    "pack": "survival",
    "name": "metal-panel-screws-half",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/metal-panel-screws-half.gltf",
    "size": {
      "x": 0.5,
      "y": 0.25,
      "z": 0.06
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/metal-panel-screws-narrow": {
    "id": "survival/metal-panel-screws-narrow",
    "shipped": false,
    "pack": "survival",
    "name": "metal-panel-screws-narrow",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/metal-panel-screws-narrow.gltf",
    "size": {
      "x": 0.25,
      "y": 0.5,
      "z": 0.06
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/metal-panel-screws": {
    "id": "survival/metal-panel-screws",
    "shipped": false,
    "pack": "survival",
    "name": "metal-panel-screws",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/metal-panel-screws.gltf",
    "size": {
      "x": 0.5,
      "y": 0.5,
      "z": 0.06
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/metal-panel": {
    "id": "survival/metal-panel",
    "shipped": false,
    "pack": "survival",
    "name": "metal-panel",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/metal-panel.gltf",
    "size": {
      "x": 0.5,
      "y": 0.5,
      "z": 0.05
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/patch-grass-large": {
    "id": "survival/patch-grass-large",
    "shipped": false,
    "pack": "survival",
    "name": "patch-grass-large",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/patch-grass-large.gltf",
    "size": {
      "x": 1.4,
      "y": 0,
      "z": 1.2
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/patch-grass": {
    "id": "survival/patch-grass",
    "shipped": false,
    "pack": "survival",
    "name": "patch-grass",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/patch-grass.gltf",
    "size": {
      "x": 1.2,
      "y": 0,
      "z": 1.2
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/resource-planks": {
    "id": "survival/resource-planks",
    "shipped": false,
    "pack": "survival",
    "name": "resource-planks",
    "kind": "static",
    "category": "resource",
    "usage": "Ressource au sol (drop à ramasser, tas dans l'entrepôt)",
    "url": "assets/survival/resource-planks.gltf",
    "size": {
      "x": 0.37,
      "y": 0.09,
      "z": 0.63
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/resource-stone-large": {
    "id": "survival/resource-stone-large",
    "shipped": false,
    "pack": "survival",
    "name": "resource-stone-large",
    "kind": "static",
    "category": "resource",
    "usage": "Ressource au sol (drop à ramasser, tas dans l'entrepôt)",
    "url": "assets/survival/resource-stone-large.gltf",
    "size": {
      "x": 0.38,
      "y": 0.16,
      "z": 0.34
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/resource-stone": {
    "id": "survival/resource-stone",
    "shipped": false,
    "pack": "survival",
    "name": "resource-stone",
    "kind": "static",
    "category": "resource",
    "usage": "Ressource au sol (drop à ramasser, tas dans l'entrepôt)",
    "url": "assets/survival/resource-stone.gltf",
    "size": {
      "x": 0.17,
      "y": 0.11,
      "z": 0.14
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/resource-wood": {
    "id": "survival/resource-wood",
    "shipped": false,
    "pack": "survival",
    "name": "resource-wood",
    "kind": "static",
    "category": "resource",
    "usage": "Ressource au sol (drop à ramasser, tas dans l'entrepôt)",
    "url": "assets/survival/resource-wood.gltf",
    "size": {
      "x": 0.21,
      "y": 0.06,
      "z": 0.09
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/rock-a": {
    "id": "survival/rock-a",
    "shipped": false,
    "pack": "survival",
    "name": "rock-a",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/rock-a.gltf",
    "size": {
      "x": 0.56,
      "y": 0.39,
      "z": 0.62
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/rock-b": {
    "id": "survival/rock-b",
    "shipped": false,
    "pack": "survival",
    "name": "rock-b",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/rock-b.gltf",
    "size": {
      "x": 0.83,
      "y": 0.42,
      "z": 0.72
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/rock-c": {
    "id": "survival/rock-c",
    "shipped": false,
    "pack": "survival",
    "name": "rock-c",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/rock-c.gltf",
    "size": {
      "x": 0.78,
      "y": 0.51,
      "z": 0.57
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/rock-flat-grass": {
    "id": "survival/rock-flat-grass",
    "shipped": false,
    "pack": "survival",
    "name": "rock-flat-grass",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/rock-flat-grass.gltf",
    "size": {
      "x": 1.79,
      "y": 0.23,
      "z": 1.45
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/rock-flat": {
    "id": "survival/rock-flat",
    "shipped": false,
    "pack": "survival",
    "name": "rock-flat",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/rock-flat.gltf",
    "size": {
      "x": 1.79,
      "y": 0.19,
      "z": 1.45
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/rock-sand-a": {
    "id": "survival/rock-sand-a",
    "shipped": false,
    "pack": "survival",
    "name": "rock-sand-a",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/rock-sand-a.gltf",
    "size": {
      "x": 0.56,
      "y": 0.39,
      "z": 0.48
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/rock-sand-b": {
    "id": "survival/rock-sand-b",
    "shipped": false,
    "pack": "survival",
    "name": "rock-sand-b",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/rock-sand-b.gltf",
    "size": {
      "x": 0.8,
      "y": 0.45,
      "z": 0.79
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/rock-sand-c": {
    "id": "survival/rock-sand-c",
    "shipped": false,
    "pack": "survival",
    "name": "rock-sand-c",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/rock-sand-c.gltf",
    "size": {
      "x": 0.78,
      "y": 0.51,
      "z": 0.57
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/signpost-single": {
    "id": "survival/signpost-single",
    "shipped": false,
    "pack": "survival",
    "name": "signpost-single",
    "kind": "static",
    "category": "prop",
    "usage": "Panneau (entrée du camp, zone à débloquer)",
    "url": "assets/survival/signpost-single.gltf",
    "size": {
      "x": 0.21,
      "y": 0.46,
      "z": 0.04
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/signpost": {
    "id": "survival/signpost",
    "shipped": false,
    "pack": "survival",
    "name": "signpost",
    "kind": "static",
    "category": "prop",
    "usage": "Panneau (entrée du camp, zone à débloquer)",
    "url": "assets/survival/signpost.gltf",
    "size": {
      "x": 0.21,
      "y": 0.46,
      "z": 0.04
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/structure-canvas": {
    "id": "survival/structure-canvas",
    "shipped": false,
    "pack": "survival",
    "name": "structure-canvas",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/structure-canvas.gltf",
    "size": {
      "x": 0.5,
      "y": 0.5,
      "z": 0.5
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/structure-floor": {
    "id": "survival/structure-floor",
    "shipped": false,
    "pack": "survival",
    "name": "structure-floor",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/structure-floor.gltf",
    "size": {
      "x": 0.5,
      "y": 0.55,
      "z": 0.5
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/structure-metal-doorway": {
    "id": "survival/structure-metal-doorway",
    "shipped": false,
    "pack": "survival",
    "name": "structure-metal-doorway",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/structure-metal-doorway.gltf",
    "size": {
      "x": 0.54,
      "y": 0.52,
      "z": 0.09
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/structure-metal-floor": {
    "id": "survival/structure-metal-floor",
    "shipped": false,
    "pack": "survival",
    "name": "structure-metal-floor",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/structure-metal-floor.gltf",
    "size": {
      "x": 0.5,
      "y": 0.51,
      "z": 0.5
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/structure-metal-roof": {
    "id": "survival/structure-metal-roof",
    "shipped": false,
    "pack": "survival",
    "name": "structure-metal-roof",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/structure-metal-roof.gltf",
    "size": {
      "x": 0.54,
      "y": 0.5,
      "z": 0.55
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/structure-metal-wall": {
    "id": "survival/structure-metal-wall",
    "shipped": false,
    "pack": "survival",
    "name": "structure-metal-wall",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/structure-metal-wall.gltf",
    "size": {
      "x": 0.54,
      "y": 0.5,
      "z": 0.09
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/structure-metal": {
    "id": "survival/structure-metal",
    "shipped": false,
    "pack": "survival",
    "name": "structure-metal",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/structure-metal.gltf",
    "size": {
      "x": 0.54,
      "y": 0.5,
      "z": 0.54
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/structure-roof": {
    "id": "survival/structure-roof",
    "shipped": false,
    "pack": "survival",
    "name": "structure-roof",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/structure-roof.gltf",
    "size": {
      "x": 0.54,
      "y": 0.66,
      "z": 0.55
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/structure": {
    "id": "survival/structure",
    "shipped": false,
    "pack": "survival",
    "name": "structure",
    "kind": "static",
    "category": "structure",
    "usage": "Éléments de bâtiment (murs, sol, toit)",
    "url": "assets/survival/structure.gltf",
    "size": {
      "x": 0.5,
      "y": 0.5,
      "z": 0.5
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tent-canvas-half": {
    "id": "survival/tent-canvas-half",
    "shipped": false,
    "pack": "survival",
    "name": "tent-canvas-half",
    "kind": "static",
    "category": "shelter",
    "usage": "Tente : logement des survivants",
    "url": "assets/survival/tent-canvas-half.gltf",
    "size": {
      "x": 0.56,
      "y": 0.49,
      "z": 0.56
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tent-canvas": {
    "id": "survival/tent-canvas",
    "shipped": true,
    "pack": "survival",
    "name": "tent-canvas",
    "kind": "static",
    "category": "shelter",
    "usage": "Tente : logement des survivants",
    "url": "assets/survival/tent-canvas.gltf",
    "size": {
      "x": 0.56,
      "y": 0.49,
      "z": 0.56
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tent": {
    "id": "survival/tent",
    "shipped": false,
    "pack": "survival",
    "name": "tent",
    "kind": "static",
    "category": "shelter",
    "usage": "Tente : logement des survivants",
    "url": "assets/survival/tent.gltf",
    "size": {
      "x": 0.56,
      "y": 0.49,
      "z": 0.56
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-axe-upgraded": {
    "id": "survival/tool-axe-upgraded",
    "shipped": false,
    "pack": "survival",
    "name": "tool-axe-upgraded",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-axe-upgraded.gltf",
    "size": {
      "x": 0.15,
      "y": 0.26,
      "z": 0.04
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-axe": {
    "id": "survival/tool-axe",
    "shipped": false,
    "pack": "survival",
    "name": "tool-axe",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-axe.gltf",
    "size": {
      "x": 0.11,
      "y": 0.26,
      "z": 0.03
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-hammer-upgraded": {
    "id": "survival/tool-hammer-upgraded",
    "shipped": false,
    "pack": "survival",
    "name": "tool-hammer-upgraded",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-hammer-upgraded.gltf",
    "size": {
      "x": 0.12,
      "y": 0.18,
      "z": 0.05
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-hammer": {
    "id": "survival/tool-hammer",
    "shipped": false,
    "pack": "survival",
    "name": "tool-hammer",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-hammer.gltf",
    "size": {
      "x": 0.09,
      "y": 0.15,
      "z": 0.04
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-hoe-upgraded": {
    "id": "survival/tool-hoe-upgraded",
    "shipped": false,
    "pack": "survival",
    "name": "tool-hoe-upgraded",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-hoe-upgraded.gltf",
    "size": {
      "x": 0.09,
      "y": 0.24,
      "z": 0.09
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-hoe": {
    "id": "survival/tool-hoe",
    "shipped": false,
    "pack": "survival",
    "name": "tool-hoe",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-hoe.gltf",
    "size": {
      "x": 0.08,
      "y": 0.24,
      "z": 0.07
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-pickaxe-upgraded": {
    "id": "survival/tool-pickaxe-upgraded",
    "shipped": false,
    "pack": "survival",
    "name": "tool-pickaxe-upgraded",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-pickaxe-upgraded.gltf",
    "size": {
      "x": 0.18,
      "y": 0.24,
      "z": 0.04
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-pickaxe": {
    "id": "survival/tool-pickaxe",
    "shipped": false,
    "pack": "survival",
    "name": "tool-pickaxe",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-pickaxe.gltf",
    "size": {
      "x": 0.18,
      "y": 0.24,
      "z": 0.04
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-shovel-upgraded": {
    "id": "survival/tool-shovel-upgraded",
    "shipped": false,
    "pack": "survival",
    "name": "tool-shovel-upgraded",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-shovel-upgraded.gltf",
    "size": {
      "x": 0.09,
      "y": 0.29,
      "z": 0.05
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tool-shovel": {
    "id": "survival/tool-shovel",
    "shipped": false,
    "pack": "survival",
    "name": "tool-shovel",
    "kind": "static",
    "category": "tool",
    "usage": "Outil tenu par un travailleur (handslot.r) / icône d'amélioration",
    "url": "assets/survival/tool-shovel.gltf",
    "size": {
      "x": 0.07,
      "y": 0.29,
      "z": 0.03
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tree-autumn-tall": {
    "id": "survival/tree-autumn-tall",
    "shipped": false,
    "pack": "survival",
    "name": "tree-autumn-tall",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/tree-autumn-tall.gltf",
    "size": {
      "x": 0.55,
      "y": 1.71,
      "z": 0.53
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tree-autumn-trunk": {
    "id": "survival/tree-autumn-trunk",
    "shipped": false,
    "pack": "survival",
    "name": "tree-autumn-trunk",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/tree-autumn-trunk.gltf",
    "size": {
      "x": 0.2,
      "y": 0.26,
      "z": 0.2
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tree-autumn": {
    "id": "survival/tree-autumn",
    "shipped": false,
    "pack": "survival",
    "name": "tree-autumn",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/tree-autumn.gltf",
    "size": {
      "x": 0.55,
      "y": 1.41,
      "z": 0.53
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tree-log-small": {
    "id": "survival/tree-log-small",
    "shipped": false,
    "pack": "survival",
    "name": "tree-log-small",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/tree-log-small.gltf",
    "size": {
      "x": 0.25,
      "y": 0.28,
      "z": 0.65
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tree-log": {
    "id": "survival/tree-log",
    "shipped": false,
    "pack": "survival",
    "name": "tree-log",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/tree-log.gltf",
    "size": {
      "x": 0.25,
      "y": 0.28,
      "z": 1
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tree-tall": {
    "id": "survival/tree-tall",
    "shipped": false,
    "pack": "survival",
    "name": "tree-tall",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/tree-tall.gltf",
    "size": {
      "x": 0.55,
      "y": 1.71,
      "z": 0.53
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tree-trunk": {
    "id": "survival/tree-trunk",
    "shipped": false,
    "pack": "survival",
    "name": "tree-trunk",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/tree-trunk.gltf",
    "size": {
      "x": 0.2,
      "y": 0.26,
      "z": 0.2
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/tree": {
    "id": "survival/tree",
    "shipped": false,
    "pack": "survival",
    "name": "tree",
    "kind": "static",
    "category": "natureAlt",
    "usage": "Nature style Kenney (alternative)",
    "url": "assets/survival/tree.gltf",
    "size": {
      "x": 0.55,
      "y": 1.41,
      "z": 0.53
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/workbench-anvil": {
    "id": "survival/workbench-anvil",
    "shipped": false,
    "pack": "survival",
    "name": "workbench-anvil",
    "kind": "static",
    "category": "workshop",
    "usage": "Établi / atelier (construction, amélioration)",
    "url": "assets/survival/workbench-anvil.gltf",
    "size": {
      "x": 0.32,
      "y": 0.34,
      "z": 0.3
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/workbench-grind": {
    "id": "survival/workbench-grind",
    "shipped": false,
    "pack": "survival",
    "name": "workbench-grind",
    "kind": "static",
    "category": "workshop",
    "usage": "Établi / atelier (construction, amélioration)",
    "url": "assets/survival/workbench-grind.gltf",
    "size": {
      "x": 0.26,
      "y": 0.28,
      "z": 0.33
    },
    "clips": [],
    "shippedClips": []
  },
  "survival/workbench": {
    "id": "survival/workbench",
    "shipped": false,
    "pack": "survival",
    "name": "workbench",
    "kind": "static",
    "category": "workshop",
    "usage": "Établi / atelier (construction, amélioration)",
    "url": "assets/survival/workbench.gltf",
    "size": {
      "x": 0.33,
      "y": 0.29,
      "z": 0.3
    },
    "clips": [],
    "shippedClips": []
  },
  "characters/Barbarian": {
    "id": "characters/Barbarian",
    "shipped": false,
    "pack": "characters",
    "name": "Barbarian",
    "kind": "skinned",
    "category": "character",
    "usage": "Personnage animé (Rig_Medium) : joueur, survivant, travailleur",
    "url": "assets/characters/Barbarian.gltf",
    "size": {
      "x": 1.94,
      "y": 2.4,
      "z": 1.26
    },
    "clips": [],
    "shippedClips": []
  },
  "characters/Knight": {
    "id": "characters/Knight",
    "shipped": true,
    "pack": "characters",
    "name": "Knight",
    "kind": "skinned",
    "category": "character",
    "usage": "Personnage animé (Rig_Medium) : joueur, survivant, travailleur",
    "url": "assets/characters/Knight.gltf",
    "size": {
      "x": 1.94,
      "y": 2.54,
      "z": 1.31
    },
    "clips": [],
    "shippedClips": []
  },
  "characters/Mage": {
    "id": "characters/Mage",
    "shipped": true,
    "pack": "characters",
    "name": "Mage",
    "kind": "skinned",
    "category": "character",
    "usage": "Personnage animé (Rig_Medium) : joueur, survivant, travailleur",
    "url": "assets/characters/Mage.gltf",
    "size": {
      "x": 1.94,
      "y": 2.65,
      "z": 1.97
    },
    "clips": [],
    "shippedClips": []
  },
  "characters/Ranger": {
    "id": "characters/Ranger",
    "shipped": true,
    "pack": "characters",
    "name": "Ranger",
    "kind": "skinned",
    "category": "character",
    "usage": "Personnage animé (Rig_Medium) : joueur, survivant, travailleur",
    "url": "assets/characters/Ranger.gltf",
    "size": {
      "x": 1.94,
      "y": 2.27,
      "z": 1.05
    },
    "clips": [],
    "shippedClips": []
  },
  "characters/Rogue": {
    "id": "characters/Rogue",
    "shipped": true,
    "pack": "characters",
    "name": "Rogue",
    "kind": "skinned",
    "category": "character",
    "usage": "Personnage animé (Rig_Medium) : joueur, survivant, travailleur",
    "url": "assets/characters/Rogue.gltf",
    "size": {
      "x": 1.94,
      "y": 2.18,
      "z": 1.14
    },
    "clips": [],
    "shippedClips": []
  },
  "characters/Rogue_Hooded": {
    "id": "characters/Rogue_Hooded",
    "shipped": true,
    "pack": "characters",
    "name": "Rogue_Hooded",
    "kind": "skinned",
    "category": "character",
    "usage": "Personnage animé (Rig_Medium) : joueur, survivant, travailleur",
    "url": "assets/characters/Rogue_Hooded.gltf",
    "size": {
      "x": 1.94,
      "y": 2.17,
      "z": 1.1
    },
    "clips": [],
    "shippedClips": []
  },
  "items/arrow_bow": {
    "id": "items/arrow_bow",
    "shipped": false,
    "pack": "items",
    "name": "arrow_bow",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/arrow_bow.gltf",
    "size": {
      "x": 0.16,
      "y": 0.14,
      "z": 1.26
    },
    "clips": [],
    "shippedClips": []
  },
  "items/arrow_bow_bundle": {
    "id": "items/arrow_bow_bundle",
    "shipped": false,
    "pack": "items",
    "name": "arrow_bow_bundle",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/arrow_bow_bundle.gltf",
    "size": {
      "x": 0.44,
      "y": 1.1,
      "z": 0.43
    },
    "clips": [],
    "shippedClips": []
  },
  "items/arrow_crossbow": {
    "id": "items/arrow_crossbow",
    "shipped": false,
    "pack": "items",
    "name": "arrow_crossbow",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/arrow_crossbow.gltf",
    "size": {
      "x": 0.12,
      "y": 0.1,
      "z": 0.75
    },
    "clips": [],
    "shippedClips": []
  },
  "items/arrow_crossbow_bundle": {
    "id": "items/arrow_crossbow_bundle",
    "shipped": false,
    "pack": "items",
    "name": "arrow_crossbow_bundle",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/arrow_crossbow_bundle.gltf",
    "size": {
      "x": 0.29,
      "y": 0.73,
      "z": 0.29
    },
    "clips": [],
    "shippedClips": []
  },
  "items/axe_1handed": {
    "id": "items/axe_1handed",
    "shipped": false,
    "pack": "items",
    "name": "axe_1handed",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/axe_1handed.gltf",
    "size": {
      "x": 0.71,
      "y": 1.24,
      "z": 0.18
    },
    "clips": [],
    "shippedClips": []
  },
  "items/axe_2handed": {
    "id": "items/axe_2handed",
    "shipped": false,
    "pack": "items",
    "name": "axe_2handed",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/axe_2handed.gltf",
    "size": {
      "x": 1.24,
      "y": 1.72,
      "z": 0.26
    },
    "clips": [],
    "shippedClips": []
  },
  "items/bow": {
    "id": "items/bow",
    "shipped": false,
    "pack": "items",
    "name": "bow",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/bow.gltf",
    "size": {
      "x": 0.49,
      "y": 0.16,
      "z": 1.98
    },
    "clips": [],
    "shippedClips": []
  },
  "items/bow_withString": {
    "id": "items/bow_withString",
    "shipped": false,
    "pack": "items",
    "name": "bow_withString",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/bow_withString.gltf",
    "size": {
      "x": 0.49,
      "y": 0.16,
      "z": 1.98
    },
    "clips": [],
    "shippedClips": []
  },
  "items/crossbow_1handed": {
    "id": "items/crossbow_1handed",
    "shipped": false,
    "pack": "items",
    "name": "crossbow_1handed",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/crossbow_1handed.gltf",
    "size": {
      "x": 0.91,
      "y": 0.41,
      "z": 1.22
    },
    "clips": [],
    "shippedClips": []
  },
  "items/crossbow_2handed": {
    "id": "items/crossbow_2handed",
    "shipped": false,
    "pack": "items",
    "name": "crossbow_2handed",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/crossbow_2handed.gltf",
    "size": {
      "x": 1.22,
      "y": 0.48,
      "z": 1.44
    },
    "clips": [],
    "shippedClips": []
  },
  "items/dagger": {
    "id": "items/dagger",
    "shipped": false,
    "pack": "items",
    "name": "dagger",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/dagger.gltf",
    "size": {
      "x": 0.26,
      "y": 1.21,
      "z": 0.15
    },
    "clips": [],
    "shippedClips": []
  },
  "items/mug_empty": {
    "id": "items/mug_empty",
    "shipped": false,
    "pack": "items",
    "name": "mug_empty",
    "kind": "static",
    "category": "item",
    "usage": "Chope (survivant servi à la cantine)",
    "url": "assets/items/mug_empty.gltf",
    "size": {
      "x": 0.53,
      "y": 0.49,
      "z": 0.4
    },
    "clips": [],
    "shippedClips": []
  },
  "items/mug_full": {
    "id": "items/mug_full",
    "shipped": false,
    "pack": "items",
    "name": "mug_full",
    "kind": "static",
    "category": "item",
    "usage": "Chope (survivant servi à la cantine)",
    "url": "assets/items/mug_full.gltf",
    "size": {
      "x": 0.53,
      "y": 0.55,
      "z": 0.4
    },
    "clips": [],
    "shippedClips": []
  },
  "items/quiver": {
    "id": "items/quiver",
    "shipped": false,
    "pack": "items",
    "name": "quiver",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/quiver.gltf",
    "size": {
      "x": 0.31,
      "y": 0.93,
      "z": 0.19
    },
    "clips": [],
    "shippedClips": []
  },
  "items/shield_badge": {
    "id": "items/shield_badge",
    "shipped": false,
    "pack": "items",
    "name": "shield_badge",
    "kind": "static",
    "category": "shield",
    "usage": "Bouclier à attacher à handslot.l (garde)",
    "url": "assets/items/shield_badge.gltf",
    "size": {
      "x": 0.88,
      "y": 1.02,
      "z": 0.25
    },
    "clips": [],
    "shippedClips": []
  },
  "items/shield_badge_color": {
    "id": "items/shield_badge_color",
    "shipped": false,
    "pack": "items",
    "name": "shield_badge_color",
    "kind": "static",
    "category": "shield",
    "usage": "Bouclier à attacher à handslot.l (garde)",
    "url": "assets/items/shield_badge_color.gltf",
    "size": {
      "x": 0.88,
      "y": 1.02,
      "z": 0.25
    },
    "clips": [],
    "shippedClips": []
  },
  "items/shield_round": {
    "id": "items/shield_round",
    "shipped": false,
    "pack": "items",
    "name": "shield_round",
    "kind": "static",
    "category": "shield",
    "usage": "Bouclier à attacher à handslot.l (garde)",
    "url": "assets/items/shield_round.gltf",
    "size": {
      "x": 0.88,
      "y": 0.88,
      "z": 0.33
    },
    "clips": [],
    "shippedClips": []
  },
  "items/shield_round_barbarian": {
    "id": "items/shield_round_barbarian",
    "shipped": false,
    "pack": "items",
    "name": "shield_round_barbarian",
    "kind": "static",
    "category": "shield",
    "usage": "Bouclier à attacher à handslot.l (garde)",
    "url": "assets/items/shield_round_barbarian.gltf",
    "size": {
      "x": 0.88,
      "y": 0.88,
      "z": 0.33
    },
    "clips": [],
    "shippedClips": []
  },
  "items/shield_round_color": {
    "id": "items/shield_round_color",
    "shipped": false,
    "pack": "items",
    "name": "shield_round_color",
    "kind": "static",
    "category": "shield",
    "usage": "Bouclier à attacher à handslot.l (garde)",
    "url": "assets/items/shield_round_color.gltf",
    "size": {
      "x": 0.88,
      "y": 0.88,
      "z": 0.33
    },
    "clips": [],
    "shippedClips": []
  },
  "items/shield_spikes": {
    "id": "items/shield_spikes",
    "shipped": false,
    "pack": "items",
    "name": "shield_spikes",
    "kind": "static",
    "category": "shield",
    "usage": "Bouclier à attacher à handslot.l (garde)",
    "url": "assets/items/shield_spikes.gltf",
    "size": {
      "x": 1.01,
      "y": 1.04,
      "z": 0.46
    },
    "clips": [],
    "shippedClips": []
  },
  "items/shield_spikes_color": {
    "id": "items/shield_spikes_color",
    "shipped": false,
    "pack": "items",
    "name": "shield_spikes_color",
    "kind": "static",
    "category": "shield",
    "usage": "Bouclier à attacher à handslot.l (garde)",
    "url": "assets/items/shield_spikes_color.gltf",
    "size": {
      "x": 1.01,
      "y": 1.04,
      "z": 0.46
    },
    "clips": [],
    "shippedClips": []
  },
  "items/shield_square": {
    "id": "items/shield_square",
    "shipped": false,
    "pack": "items",
    "name": "shield_square",
    "kind": "static",
    "category": "shield",
    "usage": "Bouclier à attacher à handslot.l (garde)",
    "url": "assets/items/shield_square.gltf",
    "size": {
      "x": 0.88,
      "y": 1.19,
      "z": 0.3
    },
    "clips": [],
    "shippedClips": []
  },
  "items/shield_square_color": {
    "id": "items/shield_square_color",
    "shipped": false,
    "pack": "items",
    "name": "shield_square_color",
    "kind": "static",
    "category": "shield",
    "usage": "Bouclier à attacher à handslot.l (garde)",
    "url": "assets/items/shield_square_color.gltf",
    "size": {
      "x": 0.88,
      "y": 1.19,
      "z": 0.3
    },
    "clips": [],
    "shippedClips": []
  },
  "items/smokebomb": {
    "id": "items/smokebomb",
    "shipped": false,
    "pack": "items",
    "name": "smokebomb",
    "kind": "static",
    "category": "item",
    "usage": "Accessoire",
    "url": "assets/items/smokebomb.gltf",
    "size": {
      "x": 0.38,
      "y": 0.42,
      "z": 0.36
    },
    "clips": [],
    "shippedClips": []
  },
  "items/spellbook_closed": {
    "id": "items/spellbook_closed",
    "shipped": false,
    "pack": "items",
    "name": "spellbook_closed",
    "kind": "static",
    "category": "item",
    "usage": "Accessoire",
    "url": "assets/items/spellbook_closed.gltf",
    "size": {
      "x": 0.29,
      "y": 0.57,
      "z": 0.43
    },
    "clips": [],
    "shippedClips": []
  },
  "items/spellbook_open": {
    "id": "items/spellbook_open",
    "shipped": false,
    "pack": "items",
    "name": "spellbook_open",
    "kind": "static",
    "category": "item",
    "usage": "Accessoire",
    "url": "assets/items/spellbook_open.gltf",
    "size": {
      "x": 0.83,
      "y": 0.57,
      "z": 0.22
    },
    "clips": [],
    "shippedClips": []
  },
  "items/staff": {
    "id": "items/staff",
    "shipped": false,
    "pack": "items",
    "name": "staff",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/staff.gltf",
    "size": {
      "x": 0.58,
      "y": 2.15,
      "z": 0.29
    },
    "clips": [],
    "shippedClips": []
  },
  "items/sword_1handed": {
    "id": "items/sword_1handed",
    "shipped": false,
    "pack": "items",
    "name": "sword_1handed",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/sword_1handed.gltf",
    "size": {
      "x": 0.5,
      "y": 1.78,
      "z": 0.13
    },
    "clips": [],
    "shippedClips": []
  },
  "items/sword_2handed": {
    "id": "items/sword_2handed",
    "shipped": false,
    "pack": "items",
    "name": "sword_2handed",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/sword_2handed.gltf",
    "size": {
      "x": 0.84,
      "y": 2.37,
      "z": 0.25
    },
    "clips": [],
    "shippedClips": []
  },
  "items/sword_2handed_color": {
    "id": "items/sword_2handed_color",
    "shipped": false,
    "pack": "items",
    "name": "sword_2handed_color",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/sword_2handed_color.gltf",
    "size": {
      "x": 0.84,
      "y": 2.37,
      "z": 0.25
    },
    "clips": [],
    "shippedClips": []
  },
  "items/wand": {
    "id": "items/wand",
    "shipped": false,
    "pack": "items",
    "name": "wand",
    "kind": "static",
    "category": "weapon",
    "usage": "Arme/outil à attacher à handslot.r ou handslot.l (gardes, travailleurs)",
    "url": "assets/items/wand.gltf",
    "size": {
      "x": 0.16,
      "y": 0.97,
      "z": 0.16
    },
    "clips": [],
    "shippedClips": []
  },
  "animations/Rig_Medium_General": {
    "id": "animations/Rig_Medium_General",
    "shipped": true,
    "pack": "animations",
    "name": "Rig_Medium_General",
    "kind": "animation",
    "category": "animation",
    "usage": "Clips d'animation pour les personnages Rig_Medium (même squelette)",
    "url": "assets/animations/Rig_Medium_General.gltf",
    "size": {
      "x": 0,
      "y": 0,
      "z": 0
    },
    "clips": [
      "Death_A",
      "Death_A_Pose",
      "Death_B",
      "Death_B_Pose",
      "Hit_A",
      "Hit_B",
      "Idle_A",
      "Idle_B",
      "Interact",
      "PickUp",
      "Spawn_Air",
      "Spawn_Ground",
      "T-Pose",
      "Throw",
      "Use_Item"
    ],
    "shippedClips": [
      "Idle_A",
      "Interact",
      "Use_Item"
    ]
  },
  "animations/Rig_Medium_MovementBasic": {
    "id": "animations/Rig_Medium_MovementBasic",
    "shipped": true,
    "pack": "animations",
    "name": "Rig_Medium_MovementBasic",
    "kind": "animation",
    "category": "animation",
    "usage": "Clips d'animation pour les personnages Rig_Medium (même squelette)",
    "url": "assets/animations/Rig_Medium_MovementBasic.gltf",
    "size": {
      "x": 0,
      "y": 0,
      "z": 0
    },
    "clips": [
      "Jump_Full_Long",
      "Jump_Full_Short",
      "Jump_Idle",
      "Jump_Land",
      "Jump_Start",
      "Running_A",
      "Running_B",
      "T-Pose",
      "Walking_A",
      "Walking_B",
      "Walking_C"
    ],
    "shippedClips": [
      "Walking_A"
    ]
  },
  "creatures/Wolf": {
    "id": "creatures/Wolf",
    "shipped": false,
    "pack": "creatures",
    "name": "Wolf",
    "kind": "skinned",
    "category": "enemy",
    "usage": "Loup : menace nocturne (Walk, Gallop, Attack, Death…)",
    "url": "assets/creatures/Wolf.gltf",
    "size": {
      "x": 1.07,
      "y": 2.68,
      "z": 5.55
    },
    "clips": [
      "Attack",
      "Death",
      "Eating",
      "Gallop",
      "Gallop_Jump",
      "Idle_HitReact_Left",
      "Idle_HitReact_Right",
      "Jump_ToIdle",
      "Walk",
      "Idle_2_HeadLow",
      "Idle_2",
      "Idle"
    ],
    "shippedClips": []
  }
} as const satisfies Record<string, AssetEntry>;

export type AssetId = keyof typeof ASSETS;

/** Modèles livrés dans le jeu (liste blanche tools/shipped-assets.json). Le jeu ne doit référencer que ceux-là. */
export const SHIPPED_IDS = ["forest/Bush_2_A_Color1","forest/Grass_1_A_Color1","forest/Grass_2_A_Color1","forest/Rock_3_A_Color1","forest/Rock_3_C_Color1","forest/Tree_1_A_Color1","forest/Tree_2_A_Color1","forest/Tree_3_A_Color1","forest/Tree_4_A_Color1","survival/bedroll","survival/campfire-pit","survival/tent-canvas","characters/Knight","characters/Mage","characters/Ranger","characters/Rogue","characters/Rogue_Hooded","animations/Rig_Medium_General","animations/Rig_Medium_MovementBasic"] as const satisfies readonly AssetId[];

export type ShippedAssetId = (typeof SHIPPED_IDS)[number];

export const ASSETS_BY_CATEGORY = {
  "bush": [
    "nature/Bush_Common",
    "forest/Bush_1_A_Color1",
    "forest/Bush_1_B_Color1",
    "forest/Bush_1_C_Color1",
    "forest/Bush_1_D_Color1",
    "forest/Bush_1_E_Color1",
    "forest/Bush_1_F_Color1",
    "forest/Bush_1_G_Color1",
    "forest/Bush_2_A_Color1",
    "forest/Bush_2_B_Color1",
    "forest/Bush_2_C_Color1",
    "forest/Bush_2_D_Color1",
    "forest/Bush_2_E_Color1",
    "forest/Bush_2_F_Color1",
    "forest/Bush_3_A_Color1",
    "forest/Bush_3_B_Color1",
    "forest/Bush_3_C_Color1",
    "forest/Bush_4_A_Color1",
    "forest/Bush_4_B_Color1",
    "forest/Bush_4_C_Color1",
    "forest/Bush_4_D_Color1",
    "forest/Bush_4_E_Color1",
    "forest/Bush_4_F_Color1"
  ],
  "berryBush": [
    "nature/Bush_Common_Flowers"
  ],
  "plant": [
    "nature/Clover_1",
    "nature/Clover_2",
    "nature/Fern_1",
    "nature/Flower_3_Group",
    "nature/Flower_3_Single",
    "nature/Flower_4_Group",
    "nature/Flower_4_Single",
    "nature/Plant_1",
    "nature/Plant_1_Big",
    "nature/Plant_7",
    "nature/Plant_7_Big"
  ],
  "tree": [
    "nature/CommonTree_1",
    "nature/CommonTree_2",
    "nature/CommonTree_3",
    "nature/CommonTree_4",
    "nature/CommonTree_5",
    "nature/TwistedTree_1",
    "nature/TwistedTree_2",
    "nature/TwistedTree_3",
    "nature/TwistedTree_4",
    "nature/TwistedTree_5",
    "forest/Tree_1_A_Color1",
    "forest/Tree_1_B_Color1",
    "forest/Tree_1_C_Color1",
    "forest/Tree_2_A_Color1",
    "forest/Tree_2_B_Color1",
    "forest/Tree_2_C_Color1",
    "forest/Tree_2_D_Color1",
    "forest/Tree_2_E_Color1",
    "forest/Tree_3_A_Color1",
    "forest/Tree_3_B_Color1",
    "forest/Tree_3_C_Color1",
    "forest/Tree_4_A_Color1",
    "forest/Tree_4_B_Color1",
    "forest/Tree_4_C_Color1"
  ],
  "deadTree": [
    "nature/DeadTree_1",
    "nature/DeadTree_2",
    "nature/DeadTree_3",
    "nature/DeadTree_4",
    "nature/DeadTree_5",
    "forest/Tree_Bare_1_A_Color1",
    "forest/Tree_Bare_1_B_Color1",
    "forest/Tree_Bare_1_C_Color1",
    "forest/Tree_Bare_2_A_Color1",
    "forest/Tree_Bare_2_B_Color1",
    "forest/Tree_Bare_2_C_Color1"
  ],
  "grass": [
    "nature/Grass_Common_Short",
    "nature/Grass_Common_Tall",
    "nature/Grass_Wispy_Short",
    "nature/Grass_Wispy_Tall",
    "forest/Grass_1_A_Color1",
    "forest/Grass_1_A_Singlesided_Color1",
    "forest/Grass_1_B_Color1",
    "forest/Grass_1_B_Singlesided_Color1",
    "forest/Grass_1_C_Color1",
    "forest/Grass_1_C_Singlesided_Color1",
    "forest/Grass_1_D_Color1",
    "forest/Grass_1_D_Singlesided_Color1",
    "forest/Grass_2_A_Color1",
    "forest/Grass_2_A_Singlesided_Color1",
    "forest/Grass_2_B_Color1",
    "forest/Grass_2_B_Singlesided_Color1",
    "forest/Grass_2_C_Color1",
    "forest/Grass_2_C_Singlesided_Color1",
    "forest/Grass_2_D_Color1",
    "forest/Grass_2_D_Singlesided_Color1"
  ],
  "mushroom": [
    "nature/Mushroom_Common",
    "nature/Mushroom_Laetiporus"
  ],
  "pebble": [
    "nature/Pebble_Round_1",
    "nature/Pebble_Round_2",
    "nature/Pebble_Round_3",
    "nature/Pebble_Round_4",
    "nature/Pebble_Round_5",
    "nature/Pebble_Square_1",
    "nature/Pebble_Square_2",
    "nature/Pebble_Square_3",
    "nature/Pebble_Square_4",
    "nature/Pebble_Square_5",
    "nature/Pebble_Square_6"
  ],
  "particle": [
    "nature/Petal_1",
    "nature/Petal_2",
    "nature/Petal_3",
    "nature/Petal_4",
    "nature/Petal_5"
  ],
  "pine": [
    "nature/Pine_1",
    "nature/Pine_2",
    "nature/Pine_3",
    "nature/Pine_4",
    "nature/Pine_5"
  ],
  "path": [
    "nature/RockPath_Round_Small_1",
    "nature/RockPath_Round_Small_2",
    "nature/RockPath_Round_Small_3",
    "nature/RockPath_Round_Thin",
    "nature/RockPath_Round_Wide",
    "nature/RockPath_Square_Small_1",
    "nature/RockPath_Square_Small_2",
    "nature/RockPath_Square_Small_3",
    "nature/RockPath_Square_Thin",
    "nature/RockPath_Square_Wide"
  ],
  "rock": [
    "nature/Rock_Medium_1",
    "nature/Rock_Medium_2",
    "nature/Rock_Medium_3",
    "forest/Rock_1_A_Color1",
    "forest/Rock_1_B_Color1",
    "forest/Rock_1_C_Color1",
    "forest/Rock_1_D_Color1",
    "forest/Rock_1_E_Color1",
    "forest/Rock_1_F_Color1",
    "forest/Rock_1_G_Color1",
    "forest/Rock_1_H_Color1",
    "forest/Rock_1_I_Color1",
    "forest/Rock_1_J_Color1",
    "forest/Rock_1_K_Color1",
    "forest/Rock_1_L_Color1",
    "forest/Rock_1_M_Color1",
    "forest/Rock_1_N_Color1",
    "forest/Rock_1_O_Color1",
    "forest/Rock_1_P_Color1",
    "forest/Rock_1_Q_Color1",
    "forest/Rock_2_A_Color1",
    "forest/Rock_2_B_Color1",
    "forest/Rock_2_C_Color1",
    "forest/Rock_2_D_Color1",
    "forest/Rock_2_E_Color1",
    "forest/Rock_2_F_Color1",
    "forest/Rock_2_G_Color1",
    "forest/Rock_2_H_Color1",
    "forest/Rock_3_A_Color1",
    "forest/Rock_3_B_Color1",
    "forest/Rock_3_C_Color1",
    "forest/Rock_3_D_Color1",
    "forest/Rock_3_E_Color1",
    "forest/Rock_3_F_Color1",
    "forest/Rock_3_G_Color1",
    "forest/Rock_3_H_Color1",
    "forest/Rock_3_I_Color1",
    "forest/Rock_3_J_Color1",
    "forest/Rock_3_K_Color1",
    "forest/Rock_3_L_Color1",
    "forest/Rock_3_M_Color1",
    "forest/Rock_3_N_Color1",
    "forest/Rock_3_O_Color1",
    "forest/Rock_3_P_Color1",
    "forest/Rock_3_Q_Color1",
    "forest/Rock_3_R_Color1"
  ],
  "storage": [
    "survival/barrel-open",
    "survival/barrel",
    "survival/bottle-large",
    "survival/bottle",
    "survival/box-large-open",
    "survival/box-large",
    "survival/box-open",
    "survival/box",
    "survival/bucket",
    "survival/chest"
  ],
  "shelter": [
    "survival/bedroll-frame",
    "survival/bedroll-packed",
    "survival/bedroll",
    "survival/tent-canvas-half",
    "survival/tent-canvas",
    "survival/tent"
  ],
  "campfire": [
    "survival/campfire-fishing-stand",
    "survival/campfire-pit",
    "survival/campfire-stand"
  ],
  "defense": [
    "survival/fence-doorway",
    "survival/fence-fortified",
    "survival/fence"
  ],
  "resource": [
    "survival/fish-large",
    "survival/fish",
    "survival/resource-planks",
    "survival/resource-stone-large",
    "survival/resource-stone",
    "survival/resource-wood"
  ],
  "structure": [
    "survival/floor-hole",
    "survival/floor-old",
    "survival/floor",
    "survival/metal-panel-narrow",
    "survival/metal-panel-screws-half",
    "survival/metal-panel-screws-narrow",
    "survival/metal-panel-screws",
    "survival/metal-panel",
    "survival/structure-canvas",
    "survival/structure-floor",
    "survival/structure-metal-doorway",
    "survival/structure-metal-floor",
    "survival/structure-metal-roof",
    "survival/structure-metal-wall",
    "survival/structure-metal",
    "survival/structure-roof",
    "survival/structure"
  ],
  "natureAlt": [
    "survival/grass-large",
    "survival/grass",
    "survival/patch-grass-large",
    "survival/patch-grass",
    "survival/rock-a",
    "survival/rock-b",
    "survival/rock-c",
    "survival/rock-flat-grass",
    "survival/rock-flat",
    "survival/rock-sand-a",
    "survival/rock-sand-b",
    "survival/rock-sand-c",
    "survival/tree-autumn-tall",
    "survival/tree-autumn-trunk",
    "survival/tree-autumn",
    "survival/tree-log-small",
    "survival/tree-log",
    "survival/tree-tall",
    "survival/tree-trunk",
    "survival/tree"
  ],
  "prop": [
    "survival/signpost-single",
    "survival/signpost"
  ],
  "tool": [
    "survival/tool-axe-upgraded",
    "survival/tool-axe",
    "survival/tool-hammer-upgraded",
    "survival/tool-hammer",
    "survival/tool-hoe-upgraded",
    "survival/tool-hoe",
    "survival/tool-pickaxe-upgraded",
    "survival/tool-pickaxe",
    "survival/tool-shovel-upgraded",
    "survival/tool-shovel"
  ],
  "workshop": [
    "survival/workbench-anvil",
    "survival/workbench-grind",
    "survival/workbench"
  ],
  "character": [
    "characters/Barbarian",
    "characters/Knight",
    "characters/Mage",
    "characters/Ranger",
    "characters/Rogue",
    "characters/Rogue_Hooded"
  ],
  "weapon": [
    "items/arrow_bow",
    "items/arrow_bow_bundle",
    "items/arrow_crossbow",
    "items/arrow_crossbow_bundle",
    "items/axe_1handed",
    "items/axe_2handed",
    "items/bow",
    "items/bow_withString",
    "items/crossbow_1handed",
    "items/crossbow_2handed",
    "items/dagger",
    "items/quiver",
    "items/staff",
    "items/sword_1handed",
    "items/sword_2handed",
    "items/sword_2handed_color",
    "items/wand"
  ],
  "item": [
    "items/mug_empty",
    "items/mug_full",
    "items/smokebomb",
    "items/spellbook_closed",
    "items/spellbook_open"
  ],
  "shield": [
    "items/shield_badge",
    "items/shield_badge_color",
    "items/shield_round",
    "items/shield_round_barbarian",
    "items/shield_round_color",
    "items/shield_spikes",
    "items/shield_spikes_color",
    "items/shield_square",
    "items/shield_square_color"
  ],
  "animation": [
    "animations/Rig_Medium_General",
    "animations/Rig_Medium_MovementBasic"
  ],
  "enemy": [
    "creatures/Wolf"
  ]
} as const satisfies Partial<Record<AssetCategory, readonly AssetId[]>>;

export const PACKS = {
  "nature": {
    "credit": "Stylized Nature MegaKit (Standard) — Quaternius",
    "license": "assets/nature/LICENSE.txt"
  },
  "forest": {
    "credit": "KayKit Forest Nature Pack 1.0 — Kay Lousberg",
    "license": "assets/forest/LICENSE.txt"
  },
  "survival": {
    "credit": "Survival Kit 2.0 — Kenney",
    "license": "assets/survival/LICENSE.txt"
  },
  "characters": {
    "credit": "KayKit Adventurers 2.0 — Kay Lousberg",
    "license": "assets/characters/LICENSE.txt"
  },
  "items": {
    "credit": "KayKit Adventurers 2.0 — Kay Lousberg",
    "license": "assets/items/LICENSE.txt"
  },
  "animations": {
    "credit": "KayKit Adventurers 2.0 — Kay Lousberg",
    "license": "assets/animations/LICENSE.txt"
  },
  "creatures": {
    "credit": "Wolf — Quaternius",
    "license": "assets/creatures/LICENSE.txt"
  }
} as const satisfies Record<AssetPack, { credit: string; license: string }>;
