// Effets de récolte : `fx.sample()` (coordonnées monde, partagé 2D/3D) et `fx.draw` 2D réécrit
// par-dessus (docs/design/render-3d.md §4.7). Sans DOM : contexte 2D factice qui enregistre les appels.

import { RESOURCES, WORLD } from "../../src/data/balance";
import { tileCenter, tileOf } from "../../src/core/map";
import type { GameState } from "../../src/core/state";
import { createFxLayer, type FxSample, type FxView } from "../../src/render/fx";
import { edit, fresh } from "../core/helpers";

const U = WORLD.unitsPerTile;

/** Récolte du nœud d'index `i` entre prev et curr (ready → depleted), avec gain crédité. */
function harvestPair(i: number, opts: { fullStock?: boolean } = {}): [GameState, GameState] {
  const prev = edit(fresh(), (d) => {
    if (opts.fullStock) d.resources.wood = RESOURCES.cap;
  });
  const curr = edit(prev, (d) => {
    const n = d.nodes[i]!;
    n.status = "depleted";
    n.progress = 0;
    n.regrowTicksLeft = 100;
    if (!opts.fullStock) d.resources[n.kind === "tree" ? "wood" : "food"] += n.kind === "tree" ? 3 : 2;
  });
  return [prev, curr];
}

interface Call {
  name: string;
  args: unknown[];
}

/** Contexte 2D factice : toute méthode est enregistrée, toute propriété est assignable. */
function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const props: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(props, {
    get(target, p) {
      if (p in target) return target[p];
      return (...args: unknown[]) => {
        calls.push({ name: String(p), args });
      };
    },
    set(target, p, v) {
      target[p] = v;
      calls.push({ name: `set:${String(p)}`, args: [v] });
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const TILE_PX = 48;
const view: FxView = { sx: (x) => (x / U) * TILE_PX, sy: (y) => (y / U) * TILE_PX, tilePx: TILE_PX };

describe("fx.sample", () => {
  it("vol (0–500 ms) puis texte (500–1400 ms) puis plus rien ; unités monde pour x/y, tuiles pour lift/size/rise", () => {
    const fx = createFxLayer();
    const [prev, curr] = harvestPair(0); // arbre (14,1)
    const node = curr.nodes[0]!;
    const from = tileCenter(node.tile);
    const player = { x: 7500, y: 8500 };
    fx.onTick(prev, curr, 1000);
    expect(fx.activeCount()).toBe(1);

    const out: FxSample[] = [{ phase: "text", x: 1, y: 1, rise: 0, alpha: 0, text: "déchet", muted: false }];
    const s0 = fx.sample(1000, player, out);
    expect(s0).toBe(out); // `out` est vidé puis rempli
    expect(s0).toHaveLength(1);
    expect(s0[0]).toMatchObject({ phase: "fly", x: from.x, y: from.y, resource: "wood" });
    expect((s0[0] as { lift: number }).lift).toBeCloseTo(0, 12);
    expect((s0[0] as { size: number }).size).toBeCloseTo(0.3, 12);

    const mid = fx.sample(1250, player, [])[0]!;
    expect(mid.phase).toBe("fly");
    if (mid.phase === "fly") {
      expect(mid.lift).toBeCloseTo(0.9, 12); // sommet de l'arc, en tuiles
      expect(mid.x).toBeCloseTo((from.x + player.x) / 2, 9); // smoothstep(0,5) = 0,5
      expect(mid.y).toBeCloseTo((from.y + player.y) / 2, 9);
      expect(mid.size).toBeLessThan(0.3);
      expect(mid.size).toBeGreaterThan(0.2);
    }

    const end = fx.sample(1499, player, [])[0]!;
    expect(end.phase).toBe("fly");
    if (end.phase === "fly") {
      expect(Math.abs(end.x - player.x)).toBeLessThan(U * 0.01);
      expect(end.lift).toBeLessThan(0.02);
    }

    const t0 = fx.sample(1500, player, [])[0]!;
    expect(t0).toMatchObject({ phase: "text", x: player.x, y: player.y, text: "+3 bois", muted: false });
    if (t0.phase === "text") {
      expect(t0.rise).toBeCloseTo(0.55, 12);
      expect(t0.alpha).toBeCloseTo(1, 12);
    }
    // Le texte suit le joueur affiché.
    const moved = { x: 9000, y: 8000 };
    const t1 = fx.sample(1950, moved, [])[0]!;
    expect(t1).toMatchObject({ phase: "text", x: moved.x, y: moved.y });
    if (t1.phase === "text") {
      expect(t1.rise).toBeCloseTo(0.55 + 0.6 * 0.5, 12);
      expect(t1.alpha).toBeCloseTo(0.75, 12);
    }

    expect(fx.sample(2399, player, [])).toHaveLength(1);
    expect(fx.sample(2400, player, [])).toHaveLength(0);
    expect(fx.activeCount()).toBe(0);
  });

  it("buisson ⇒ nourriture, « +2 nourriture »", () => {
    const fx = createFxLayer();
    const idx = fresh().nodes.findIndex((n) => n.kind === "bush");
    const [prev, curr] = harvestPair(idx);
    fx.onTick(prev, curr, 0);
    expect(fx.sample(0, { x: 0, y: 0 }, [])[0]).toMatchObject({ phase: "fly", resource: "food" });
    expect(fx.sample(600, { x: 0, y: 0 }, [])[0]).toMatchObject({ phase: "text", text: "+2 nourriture" });
  });

  it("stock plein ⇒ pas de vol, texte grisé immédiat ancré sur la tuile du joueur", () => {
    const fx = createFxLayer();
    const [prev, curr] = harvestPair(0, { fullStock: true });
    fx.onTick(prev, curr, 0);
    const s = fx.sample(0, { x: 1, y: 1 }, [])[0]!;
    const ground = tileCenter(tileOf(curr.player.pos));
    expect(s).toMatchObject({ phase: "text", muted: true, x: ground.x, y: ground.y, text: "Stock de bois plein" });
  });

  it("aucun effet sans transition ready → depleted ; reset() efface tout", () => {
    const fx = createFxLayer();
    const s = fresh();
    fx.onTick(s, s, 0);
    expect(fx.sample(0, { x: 0, y: 0 }, [])).toHaveLength(0);
    const [prev, curr] = harvestPair(0);
    fx.onTick(prev, curr, 0);
    expect(fx.activeCount()).toBe(1);
    fx.reset();
    expect(fx.activeCount()).toBe(0);
    expect(fx.sample(10, { x: 0, y: 0 }, [])).toHaveLength(0);
  });

  it("pool plein (16) : le 17ᵉ effet recycle le plus ancien, jamais plus de 16 échantillons", () => {
    const fx = createFxLayer();
    const [prev, curr] = harvestPair(0);
    for (let k = 0; k < 20; k++) fx.onTick(prev, curr, k);
    expect(fx.activeCount()).toBe(16);
    expect(fx.sample(20, { x: 0, y: 0 }, [])).toHaveLength(16);
  });
});

describe("fx.draw (2D) réécrit sur sample", () => {
  it("phase vol : ombre + icône au point projeté, soulevée de lift × tilePx", () => {
    const fx = createFxLayer();
    const [prev, curr] = harvestPair(0);
    const player = { x: 7500, y: 8500 };
    fx.onTick(prev, curr, 0);
    const { ctx, calls } = fakeCtx();
    fx.draw(ctx, view, player, 250);
    const s = fx.sample(250, player, [])[0]!;
    expect(s.phase).toBe("fly");
    if (s.phase !== "fly") return;
    const ellipse = calls.find((c) => c.name === "ellipse");
    expect(ellipse).toBeDefined();
    expect(ellipse!.args[0]).toBeCloseTo(view.sx(s.x), 9);
    const rect = calls.find((c) => c.name === "fillRect"); // bois = carré
    expect(rect).toBeDefined();
    const size = s.size * TILE_PX;
    expect(rect!.args[0]).toBeCloseTo(view.sx(s.x) - size / 2, 9);
    expect(rect!.args[1]).toBeCloseTo(view.sy(s.y) - s.lift * TILE_PX - size / 2, 9);
    expect(calls.some((c) => c.name === "fillText")).toBe(false);
  });

  it("phase texte : texte « +3 bois » au-dessus du joueur, opacité appliquée puis rétablie", () => {
    const fx = createFxLayer();
    const [prev, curr] = harvestPair(0);
    const player = { x: 7500, y: 8500 };
    fx.onTick(prev, curr, 0);
    const { ctx, calls } = fakeCtx();
    fx.draw(ctx, view, player, 950);
    const fill = calls.find((c) => c.name === "fillText");
    expect(fill).toBeDefined();
    expect(fill!.args[0]).toBe("+3 bois");
    expect(fill!.args[1]).toBeCloseTo(view.sx(player.x), 9);
    expect(fill!.args[2]).toBeCloseTo(view.sy(player.y) - (0.55 + 0.6 * 0.5) * TILE_PX, 9);
    expect(calls.some((c) => c.name === "strokeText" && c.args[0] === "+3 bois")).toBe(true);
    const alphas = calls.filter((c) => c.name === "set:globalAlpha").map((c) => c.args[0]);
    expect(alphas[0]).toBeCloseTo(0.75, 9);
    expect(alphas[alphas.length - 1]).toBe(1);
  });

  it("aucun effet ⇒ aucun dessin", () => {
    const fx = createFxLayer();
    const { ctx, calls } = fakeCtx();
    fx.draw(ctx, view, { x: 0, y: 0 }, 0);
    expect(calls.filter((c) => !c.name.startsWith("set:"))).toHaveLength(0);
  });
});
