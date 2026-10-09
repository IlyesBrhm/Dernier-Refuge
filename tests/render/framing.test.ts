// Cadrage portrait de la file d'attente (docs/design/day-night.md §4.7 et §6.4) :
// src/render/three/framing.ts, pur (sans three). Critère 390×844 : joueur sur W, file pleine ⇒
// places 0 à 3 entièrement visibles, joueur visible.

import { QUEUE } from "../../src/data/balance";
import { tileCenter } from "../../src/core/map";
import type { GameState } from "../../src/core/state";
import { CAMERA, TILE_METERS } from "../../src/render/three/config";
import { FRAMING, framingWeight, portraitFraming, type Framing, type FramingInput } from "../../src/render/three/framing";
import { buildScene } from "../../src/render/three/scene-model";
import { edit, fresh } from "../core/helpers";

vi.mock("three", () => {
  throw new Error("three ne doit pas être chargé par framing.ts");
});

const T = TILE_METERS;
/** Largeur de base au point visé pour un écran portrait de 390 px CSS (comme stage.ts). */
const BASE_390 = Math.min(CAMERA.portraitMaxTilesWide, Math.max(CAMERA.portraitMinTilesWide, 390 / CAMERA.portraitTilePx));

const map = fresh().map;
const center = (tx: number, ty: number): { x: number; z: number } => ({ x: (tx + 0.5) * T, z: (ty + 0.5) * T });
const W = center(map.welcome.tx, map.welcome.ty);
const PLACES = map.queueTiles.map((q) => center(q.tx, q.ty));

function input(player: { x: number; z: number }, queued: number): FramingInput {
  return { player, welcome: W, queue: PLACES.slice(0, queued) };
}

/** Intervalle horizontal visible (m) au point visé, avec le cadrage appliqué. */
function view(inp: FramingInput, f: Framing, base: number): { lo: number; hi: number } {
  const c = inp.player.x + f.offsetX;
  const half = ((base + f.extraTilesWide) * T) / 2;
  return { lo: c - half, hi: c + half };
}

function fullyVisible(v: { lo: number; hi: number }, x: number): boolean {
  return x - T / 2 >= v.lo - 1e-9 && x + T / 2 <= v.hi + 1e-9;
}

describe("portraitFraming — config et carte", () => {
  it("W (7,9) et file Q (7..11,10) à l'est-sud de W ; constantes du plan (2, 3, 0,75, +1)", () => {
    expect(map.welcome).toEqual({ tx: 7, ty: 9 });
    expect(map.queueTiles).toHaveLength(QUEUE.maxLength);
    expect(PLACES[0]).toEqual(center(7, 10));
    expect(FRAMING).toMatchObject({ fullWithinTiles: 2, noneBeyondTiles: 3, playerMarginTiles: 0.75, extraTilesWide: 1 });
    expect(BASE_390).toBeGreaterThanOrEqual(5);
    expect(BASE_390).toBeLessThan(6);
  });
});

describe("portraitFraming — critère 390×844", () => {
  it("joueur sur W, file pleine ⇒ places 0 à 3 entièrement visibles, joueur visible (≥ 0,75 tuile du bord), +1 tuile de large", () => {
    const inp = input(W, QUEUE.maxLength);
    const f = portraitFraming(inp, BASE_390);
    const v = view(inp, f, BASE_390);
    expect(f.extraTilesWide).toBe(1);
    for (let i = 0; i <= 3; i++) expect(fullyVisible(v, (PLACES[i] as { x: number }).x), `place ${i}`).toBe(true);
    expect(W.x - v.lo).toBeGreaterThanOrEqual(0.75 * T - 1e-9);
    expect(v.hi - W.x).toBeGreaterThanOrEqual(0.75 * T - 1e-9);
    // La file est à l'est : la caméra se décale vers l'est.
    expect(f.offsetX).toBeGreaterThan(0);
  });

  it("sans cadrage (ancien comportement), la file pleine n'est PAS entièrement visible : le cadrage sert", () => {
    const inp = input(W, QUEUE.maxLength);
    const v = view(inp, { offsetX: 0, extraTilesWide: 0 }, BASE_390);
    const visible = PLACES.slice(0, 4).filter((p) => fullyVisible(v, p.x)).length;
    expect(visible).toBeLessThan(4);
  });

  it("même critère depuis l'état du jeu : buildScene(joueur sur W, file pleine).framing", () => {
    const c = tileCenter(map.welcome);
    const s: GameState = edit(fresh(), (d) => {
      d.player.pos = { ...c };
      d.queue = [101, 102, 103, 104, 105];
    });
    const frameInput = buildScene(s, s, 1).framing;
    expect(frameInput.queue).toHaveLength(5);
    const f = portraitFraming(frameInput, BASE_390);
    const v = view(frameInput, f, BASE_390);
    for (let i = 0; i <= 3; i++) expect(fullyVisible(v, (frameInput.queue[i] as { x: number }).x)).toBe(true);
    expect(fullyVisible(v, frameInput.player.x)).toBe(true);
  });
});

describe("portraitFraming — propriétés près de l'accueil (poids 1)", () => {
  it("joueur à Chebyshev ≤ 2 tuiles de W, file de 1 à 5, base 5..9 tuiles : tête de file visible, joueur à ≥ 0,75 tuile du bord", () => {
    const errors: string[] = [];
    for (let dx = -2; dx <= 2; dx += 0.25) {
      for (let dz = -2; dz <= 2; dz += 0.5) {
        for (let n = 1; n <= QUEUE.maxLength; n++) {
          for (const base of [CAMERA.portraitMinTilesWide, BASE_390, 6.5, CAMERA.portraitMaxTilesWide]) {
            const player = { x: W.x + dx * T, z: W.z + dz * T };
            const inp = input(player, n);
            const f = portraitFraming(inp, base);
            const v = view(inp, f, base);
            const at = `dx ${dx} dz ${dz} n ${n} base ${base}`;
            if (f.extraTilesWide !== 1) errors.push(`${at}: extra ${f.extraTilesWide}`);
            if (!fullyVisible(v, (PLACES[0] as { x: number }).x)) errors.push(`${at}: tête de file hors vue`);
            if (player.x - v.lo < 0.75 * T - 1e-9 || v.hi - player.x < 0.75 * T - 1e-9) errors.push(`${at}: joueur trop près du bord`);
            // Les places incluses forment un préfixe de la file (jamais la 3e sans la 2e).
            const vis = PLACES.slice(0, n).map((p) => fullyVisible(v, p.x));
            const firstHidden = vis.indexOf(false);
            if (firstHidden !== -1 && vis.slice(firstHidden).some(Boolean)) errors.push(`${at}: places visibles non contiguës`);
          }
        }
      }
    }
    expect(errors.slice(0, 10)).toEqual([]);
  });

  it("plus de places occupées ⇒ jamais moins de places visibles", () => {
    for (const dx of [-2, -1, 0, 1, 2]) {
      const player = { x: W.x + dx * T, z: W.z };
      let last = 0;
      for (let n = 1; n <= QUEUE.maxLength; n++) {
        const inp = input(player, n);
        const v = view(inp, portraitFraming(inp, BASE_390), BASE_390);
        const visible = PLACES.slice(0, n).filter((p) => fullyVisible(v, p.x)).length;
        expect(visible).toBeGreaterThanOrEqual(last);
        last = visible;
      }
    }
  });
});

describe("portraitFraming — atténuation et cas sans effet", () => {
  it("framingWeight : 1 jusqu'à 2 tuiles, linéaire entre 2 et 3, 0 au-delà (Chebyshev)", () => {
    const at = (dx: number, dz: number): number => framingWeight({ x: W.x + dx * T, z: W.z + dz * T }, W);
    expect(at(0, 0)).toBe(1);
    expect(at(2, 0)).toBe(1);
    expect(at(-2, 2)).toBe(1);
    expect(at(2.5, 0)).toBeCloseTo(0.5, 12);
    expect(at(0, -2.25)).toBeCloseTo(0.75, 12);
    expect(at(3, 0)).toBe(0);
    expect(at(0, 3)).toBe(0);
    expect(at(10, -10)).toBe(0);
  });

  it("poids 0 au-delà de 3 tuiles ⇒ aucun effet { offsetX: 0, extraTilesWide: 0 }", () => {
    for (const [dx, dz] of [
      [3, 0],
      [0, 3],
      [-3, 0],
      [0, -3.5],
      [5, 5],
      [-8, 1],
    ] as const) {
      const f = portraitFraming(input({ x: W.x + dx * T, z: W.z + dz * T }, QUEUE.maxLength), BASE_390);
      expect(f, `dx ${dx} dz ${dz}`).toEqual({ offsetX: 0, extraTilesWide: 0 });
    }
  });

  it("file vide ⇒ aucun effet, même sur W", () => {
    expect(portraitFraming(input(W, 0), BASE_390)).toEqual({ offsetX: 0, extraTilesWide: 0 });
  });

  it("effacement en s'éloignant de W (2 → 3 tuiles) : extra = poids (continu), décalage ≤ poids × largeur, nul à 3 tuiles", () => {
    // Note : la CIBLE peut sauter quand une place cesse de tenir dans la vue (choix « le plus de
    // places possible ») ; stage.follow amortit ce saut. Seul l'effacement vers 0 est testé ici.
    for (const dir of [-1, 1]) {
      let prev: Framing | null = null;
      for (let i = 150; i <= 350; i++) {
        const d = i / 100;
        const player = { x: W.x + dir * d * T, z: W.z };
        const f = portraitFraming(input(player, QUEUE.maxLength), BASE_390);
        const w = framingWeight(player, W);
        expect(f.extraTilesWide).toBeCloseTo(FRAMING.extraTilesWide * w, 12);
        expect(Math.abs(f.offsetX)).toBeLessThanOrEqual(w * (BASE_390 + 1) * T + 1e-9);
        if (prev) expect(Math.abs(f.extraTilesWide - prev.extraTilesWide)).toBeLessThan(0.011);
        if (d >= 3) expect(f).toEqual({ offsetX: 0, extraTilesWide: 0 });
        prev = f;
      }
    }
  });

  it("pur : entrées non mutées, résultat déterministe, valeurs finies (base dégénérée comprise)", () => {
    const inp = input(W, 3);
    const before = JSON.stringify(inp);
    const a = portraitFraming(inp, BASE_390);
    expect(portraitFraming(inp, BASE_390)).toEqual(a);
    expect(JSON.stringify(inp)).toBe(before);
    for (const base of [0, -5, 0.5, 100]) {
      const f = portraitFraming(inp, base);
      expect(Number.isFinite(f.offsetX)).toBe(true);
      expect(Number.isFinite(f.extraTilesWide)).toBe(true);
    }
  });
});
