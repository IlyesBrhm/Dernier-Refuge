// Décor statique 3D (docs/design/render-3d.md §4.3 et §6.2) : buildStaticLayout(map), pur, sans three.

import { MAP_LAYOUT } from "../../src/data/balance";
import { doorOf, referenceMap } from "../../src/core/map";
import type { MapState } from "../../src/core/state";
import { DECOR, FOREST_MARGIN_TILES, MODEL_IDS, TILE_METERS } from "../../src/render/three/config";
import { buildStaticLayout, entrancePathTiles, type Placement } from "../../src/render/three/scene-model";
import { deepFreeze, fresh } from "../core/helpers";

vi.mock("three", () => {
  throw new Error("three ne doit pas être chargé par le décor statique");
});

const T = TILE_METERS;
const M = FOREST_MARGIN_TILES;
const map = referenceMap();
const W = map.width;
const H = map.height;
const layout = buildStaticLayout(map);

const key = (tx: number, ty: number): string => `${tx},${ty}`;
/** Tuile d'un placement (le jitter est < 0,5 tuile : il ne change jamais de tuile). */
const tileOfPlacement = (p: Placement): string => key(Math.floor(p.x / T), Math.floor(p.z / T));

function charTiles(...chars: string[]): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  MAP_LAYOUT.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) if (chars.includes(row[tx] as string)) out.push({ tx, ty });
  });
  return out;
}

describe("buildStaticLayout — arbres de bordure", () => {
  it("une entrée par « # » + anneau de 2 tuiles, MOINS les tuiles du chemin d'entrée sous E qui tombent dans l'anneau", () => {
    expect(M).toBe(2);
    const expected = new Set<string>();
    for (const t of charTiles("#")) expected.add(key(t.tx, t.ty));
    for (let ty = -M; ty < H + M; ty++) {
      for (let tx = -M; tx < W + M; tx++) {
        if (tx >= 0 && ty >= 0 && tx < W && ty < H) continue;
        expected.add(key(tx, ty));
      }
    }
    // Chemin (11,12..14) : l'anneau ne couvre que les lignes 12 et 13 (H + M − 1 = 13) ;
    // (11,14) est déjà au-delà de l'anneau (sol lointain), il n'y a donc que 2 arbres en moins.
    for (const p of ["11,12", "11,13"]) {
      expect(expected.has(p)).toBe(true);
      expected.delete(p);
    }
    expect(expected.has("11,14")).toBe(false);
    const got = layout.borderTrees.map(tileOfPlacement);
    expect(new Set(got).size).toBe(got.length); // une seule par tuile
    expect(new Set(got)).toEqual(expected);
    const hashCount = MAP_LAYOUT.join("").split("").filter((c) => c === "#").length;
    expect(layout.borderTrees).toHaveLength(hashCount + ((W + 2 * M) * (H + 2 * M) - W * H) - 2);
  });

  it("le chemin d'entrée hors carte est exactement (11,12), (11,13), (11,14), sans arbre", () => {
    expect(entrancePathTiles(map)).toEqual([
      { tx: 11, ty: 12 },
      { tx: 11, ty: 13 },
      { tx: 11, ty: 14 },
    ]);
    const trees = new Set(layout.borderTrees.map(tileOfPlacement));
    for (const t of entrancePathTiles(map)) expect(trees.has(key(t.tx, t.ty))).toBe(false);
    // La tuile E elle-même n'a pas d'arbre non plus.
    expect(trees.has(key(map.entrance.tx, map.entrance.ty))).toBe(false);
  });

  it("arbres des « # » de la carte dans [0, W×2] × [0, H×2] (jitter ≤ ±0,5 m)", () => {
    const hashes = new Set(charTiles("#").map((t) => key(t.tx, t.ty)));
    let n = 0;
    for (const p of layout.borderTrees) {
      const tx = Math.floor(p.x / T);
      const ty = Math.floor(p.z / T);
      if (!hashes.has(key(tx, ty))) continue;
      n++;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W * T);
      expect(p.z).toBeGreaterThanOrEqual(0);
      expect(p.z).toBeLessThanOrEqual(H * T);
      expect(Math.abs(p.x - (tx + 0.5) * T)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.z - (ty + 0.5) * T)).toBeLessThanOrEqual(0.5);
    }
    expect(n).toBe(hashes.size);
  });

  it("modèle, échelle (0,85–1,15) et rotation valides ; tout dans les bornes", () => {
    const b = layout.bounds;
    for (const p of layout.borderTrees) {
      expect(Number.isInteger(p.model)).toBe(true);
      expect(p.model).toBeGreaterThanOrEqual(0);
      expect(p.model).toBeLessThan(MODEL_IDS.borderTrees.length);
      expect(p.scale).toBeGreaterThanOrEqual(DECOR.borderScaleMin);
      expect(p.scale).toBeLessThanOrEqual(DECOR.borderScaleMax);
      expect(p.yaw).toBeGreaterThanOrEqual(0);
      expect(p.yaw).toBeLessThan(Math.PI * 2);
      expect(p.x).toBeGreaterThanOrEqual(b.minX);
      expect(p.x).toBeLessThanOrEqual(b.maxX);
      expect(p.z).toBeGreaterThanOrEqual(b.minZ);
      expect(p.z).toBeLessThanOrEqual(b.maxZ);
    }
    // Les trois modèles sont utilisés (variété visuelle).
    expect(new Set(layout.borderTrees.map((p) => p.model)).size).toBe(MODEL_IDS.borderTrees.length);
  });
});

describe("buildStaticLayout — sol, rochers, touffes", () => {
  it("bornes = carte + marge (m)", () => {
    expect(layout.bounds).toEqual({ minX: -M * T, minZ: -M * T, maxX: (W + M) * T, maxZ: (H + M) * T });
  });

  it("groundTiles : une tuile par case de la carte + marge ; sous-bois (2) hors carte et sur « # », herbe A/B ailleurs", () => {
    expect(layout.groundTiles).toHaveLength((W + 2 * M) * (H + 2 * M));
    const seen = new Set<string>();
    for (const g of layout.groundTiles) {
      seen.add(key(g.tx, g.ty));
      const inMap = g.tx >= 0 && g.ty >= 0 && g.tx < W && g.ty < H;
      const ch = inMap ? MAP_LAYOUT[g.ty]?.[g.tx] : undefined;
      if (!inMap || ch === "#") expect(g.shade).toBe(2);
      else {
        expect([0, 1]).toContain(g.shade);
        expect(g.shade).toBe((g.tx + g.ty) & 1);
      }
    }
    expect(seen.size).toBe(layout.groundTiles.length);
    for (let ty = -M; ty < H + M; ty++) for (let tx = -M; tx < W + M; tx++) expect(seen.has(key(tx, ty))).toBe(true);
  });

  it("un rocher par « R », sur sa tuile", () => {
    const rocks = charTiles("R").map((t) => key(t.tx, t.ty));
    expect(layout.rocks).toHaveLength(rocks.length);
    expect(new Set(layout.rocks.map(tileOfPlacement))).toEqual(new Set(rocks));
    for (const r of layout.rocks) {
      expect(r.model).toBeGreaterThanOrEqual(0);
      expect(r.model).toBeLessThan(MODEL_IDS.rocks.length);
      expect(r.scale).toBe(DECOR.rockScale);
    }
  });

  it("touffes uniquement sur l'herbe libre : jamais sur W, Q, E, T, B, portes de T/B, nœuds, obstacles ; ≤ 2 par tuile", () => {
    const forbidden = new Set<string>();
    for (const t of charTiles("W", "Q", "E", "T", "B", "A", "M", "#", "R")) forbidden.add(key(t.tx, t.ty));
    for (const t of charTiles("T", "B")) {
      const d = doorOf(t);
      forbidden.add(key(d.tx, d.ty));
    }
    for (const n of fresh().nodes) forbidden.add(key(n.tile.tx, n.tile.ty));
    // Contrôle de la liste : W (7,9), Q (7..11,10), E (11,11), T (2,2), B (7,2) (12,2) (12,5) et leurs portes.
    for (const k of ["7,9", "7,10", "11,10", "11,11", "2,2", "2,3", "7,2", "7,3", "12,2", "12,3", "12,5", "12,6"]) {
      expect(forbidden.has(k)).toBe(true);
    }
    expect(layout.tufts.length).toBeGreaterThan(0);
    const perTile = new Map<string, number>();
    for (const p of layout.tufts) {
      const k = tileOfPlacement(p);
      const [tx, ty] = k.split(",").map(Number) as [number, number];
      expect(forbidden.has(k), `touffe sur ${k}`).toBe(false);
      expect(tx >= 0 && ty >= 0 && tx < W && ty < H, `touffe hors carte ${k}`).toBe(true);
      expect(map.tiles[ty * W + tx]).toBe("grass");
      perTile.set(k, (perTile.get(k) ?? 0) + 1);
      expect(p.model).toBeGreaterThanOrEqual(0);
      expect(p.model).toBeLessThan(MODEL_IDS.tufts.length);
      expect(p.scale).toBeGreaterThanOrEqual(DECOR.tuftScaleMin);
      expect(p.scale).toBeLessThanOrEqual(DECOR.tuftScaleMax);
    }
    for (const n of perTile.values()) expect(n).toBeLessThanOrEqual(DECOR.tuftsMaxPerTile);
  });
});

describe("buildStaticLayout — décalques", () => {
  it("accueil 1×1 sur W, file 5×1 sur Q, entrée 1×4 (E + 3 tuiles de chemin)", () => {
    const byKind = (k: string) => layout.decals.filter((d) => d.kind === k);
    expect(layout.decals).toHaveLength(3);
    expect(byKind("welcome")).toEqual([{ kind: "welcome", x: 7.5 * T, z: 9.5 * T, w: T, d: T }]);
    expect(byKind("queue")).toEqual([{ kind: "queue", x: ((7 + 12) / 2) * T, z: 10.5 * T, w: 5 * T, d: T }]);
    expect(byKind("entrance")).toEqual([{ kind: "entrance", x: 11.5 * T, z: ((11 + 15) / 2) * T, w: T, d: 4 * T }]);
  });
});

describe("buildStaticLayout — déterminisme et pureté", () => {
  it("deux appels ⇒ résultats égaux ; carte gelée non mutée ; copie de carte ⇒ même décor", () => {
    const frozen = deepFreeze(structuredClone(map) as MapState);
    const before = JSON.stringify(frozen);
    const a = buildStaticLayout(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(buildStaticLayout(frozen)).toEqual(a);
    expect(a).toEqual(layout);
    expect(buildStaticLayout(fresh(999).map)).toEqual(layout);
  });

  it("aucun Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    try {
      buildStaticLayout(map);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
