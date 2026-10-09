// Modèle de scène 3D pur (docs/design/render-3d.md §4.3 et §6.1) : sans WebGL, sans three.

import { WORLD } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { harvestTarget, isPlayerOn, nodeHarvestRatio, nodeRegrowRatio, slotRemaining } from "../../src/core/selectors";
import type { Drop, GameState, Survivor } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { interpolate } from "../../src/render/interpolate";
import { prevNodeOf, shownHarvestRatio, shownRegrowRatio } from "../../src/render/ratios";
import { MODEL_IDS, PLAYER_TINT, SURVIVOR_TINTS, SURVIVOR_VARIANTS, TILE_METERS, toMeters } from "../../src/render/three/config";
import { hash32 } from "../../src/render/three/hash";
import {
  buildScene,
  survivorVariant,
  type CharacterItem,
  type DropItem,
  type NodeItem,
  type SceneFrame,
  type SceneItem,
  type SlotItem,
  type TentItem,
} from "../../src/render/three/scene-model";
import { deepFreeze, edit, fresh } from "../core/helpers";
import { findPair, numbersIn, simulate } from "./helpers";

// Filet de sécurité : si un module du graphe de scene-model importait three, son chargement échouerait.
vi.mock("three", () => {
  throw new Error("three ne doit pas être chargé par le modèle de scène");
});

const U = WORLD.unitsPerTile;

// Plusieurs tests balaient une simulation de 3000 ticks.
vi.setConfig({ testTimeout: 30_000 });

// Une simulation longue partagée (bot de tests/core), couvrant tous les statuts.
const SIM = simulate(2024, 3000);

function frame(prev: GameState, curr: GameState, alpha = 1): SceneFrame {
  return buildScene(prev, curr, alpha);
}

function item<T extends SceneItem>(f: SceneFrame, key: string): T {
  const it = f.items.find((i) => i.key === key);
  if (!it) throw new Error(`élément ${key} absent`);
  return it as T;
}

function player(f: SceneFrame): CharacterItem {
  return item<CharacterItem>(f, "player");
}

function withPlayerAt(s: GameState, x: number, y: number): GameState {
  return edit(s, (d) => {
    d.player.pos = { x, y };
  });
}

const RANK: Record<string, number> = { player: 0, survivor: 1, node: 2, tent: 3, slot: 4, drop: 5 };
function rankOf(key: string): number {
  const prefix = key.split(":")[0] as string;
  const r = RANK[prefix];
  if (r === undefined) throw new Error(`clé inattendue ${key}`);
  return r;
}

/** Décalage « tuile partagée » attendu (m), recalculé indépendamment du code testé. */
function expectedDropOffset(drops: readonly Drop[], d: Drop): number {
  const tx = Math.floor(d.pos.x / U);
  const ty = Math.floor(d.pos.y / U);
  const shared = drops.some(
    (o) => o.id !== d.id && o.resource !== d.resource && Math.floor(o.pos.x / U) === tx && Math.floor(o.pos.y / U) === ty,
  );
  if (!shared) return 0;
  return (d.resource === "food" ? 1 : -1) * 0.15 * TILE_METERS;
}

// ------------------------------------------------------------------------------------------------

describe("buildScene — pureté (sans three, sans WebGL)", () => {
  it("le module se charge sous Vitest/node, sans WebGL ni document", () => {
    expect(typeof buildScene).toBe("function");
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
  });

  it("aucun module du graphe d'import (hors `import type`) de scene-model ne référence three", () => {
    const sources = import.meta.glob("/src/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<
      string,
      string
    >;
    const resolve = (from: string, spec: string): string | null => {
      if (!spec.startsWith(".")) return null;
      const parts = from.split("/").slice(0, -1);
      for (const p of spec.split("/")) {
        if (p === "..") parts.pop();
        else if (p !== ".") parts.push(p);
      }
      const base = parts.join("/");
      for (const cand of [base, `${base}.ts`, `${base}/index.ts`]) if (cand in sources) return cand;
      throw new Error(`import introuvable ${spec} depuis ${from}`);
    };
    const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^;]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
    const seen = new Set<string>();
    const offenders: string[] = [];
    const stack = ["/src/render/three/scene-model.ts"];
    while (stack.length > 0) {
      const file = stack.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      const src = sources[file];
      expect(src, file).toBeTypeOf("string");
      for (const m of (src as string).matchAll(re)) {
        const typeOnly = m[1] !== undefined;
        const spec = (m[2] ?? m[3]) as string;
        if (typeOnly) continue;
        if (spec === "three" || spec.startsWith("three/")) offenders.push(`${file} → ${spec}`);
        const next = resolve(file, spec);
        if (next) stack.push(next);
      }
    }
    expect(seen.has("/src/render/three/config.ts")).toBe(true);
    expect(seen.has("/src/render/three/hash.ts")).toBe(true);
    expect(offenders).toEqual([]);
  });

  it("n'altère pas les entrées (états gelés en profondeur), sur toute une simulation", () => {
    for (let i = 1; i < SIM.length; i += 7) {
      const prev = deepFreeze(structuredClone(SIM[i - 1] as GameState));
      const curr = deepFreeze(structuredClone(SIM[i] as GameState));
      const before = JSON.stringify([prev, curr]);
      expect(() => buildScene(prev, curr, 0.37)).not.toThrow();
      expect(JSON.stringify([prev, curr])).toBe(before);
    }
  });

  it("même entrée ⇒ même sortie, sans Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    try {
      for (let i = 1; i < SIM.length; i += 50) {
        const p = SIM[i - 1] as GameState;
        const c = SIM[i] as GameState;
        const a = buildScene(p, c, 0.4);
        const b = buildScene(structuredClone(p), structuredClone(c), 0.4);
        expect(b).toEqual(a);
      }
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("simulation 600 ticks (bot) : buildScene à chaque tick, aucune exception, aucun NaN/Infinity", () => {
    const states = simulate(7, 600);
    for (let i = 1; i < states.length; i++) {
      for (const a of [0, 0.25, 0.5, 1]) {
        const f = buildScene(states[i - 1] as GameState, states[i] as GameState, a);
        for (const n of numbersIn(f)) expect(Number.isFinite(n)).toBe(true);
      }
    }
  });
});

describe("buildScene — état initial et clés", () => {
  it("1 joueur, 1 tente libre, 3 slots, 5 nœuds, 0 survivant, 0 drop", () => {
    const s = fresh();
    const f = frame(s, s);
    const count = (t: string): number => f.items.filter((i) => i.type === t).length;
    expect(f.items.filter((i) => i.key === "player")).toHaveLength(1);
    expect(f.items.filter((i) => i.type === "character" && i.role === "survivor")).toHaveLength(0);
    expect(count("tent")).toBe(1);
    expect((f.items.find((i) => i.type === "tent") as TentItem).status).toBe("free");
    expect(count("slot")).toBe(3);
    expect(count("tree") + count("bush")).toBe(5);
    expect(count("tree")).toBe(3);
    expect(count("bush")).toBe(2);
    expect(count("drop")).toBe(0);
  });

  it("joueur au centre de P (7,8) ⇒ x = 15 m, z = 17 m ; focus = joueur ; modèle Knight, teinte PLAYER_TINT", () => {
    const s = fresh();
    const p = player(frame(s, s));
    expect(p.x).toBe(15);
    expect(p.z).toBe(17);
    expect(p.model).toBe("characters/Knight");
    expect(p.model).toBe(MODEL_IDS.player);
    expect(p.tint).toBe(PLAYER_TINT);
    expect(PLAYER_TINT).toBe(0xffffff);
    expect(p.role).toBe("player");
    expect(p.visible).toBe(true);
    expect(frame(s, s).focus).toEqual({ x: 15, z: 17 });
  });

  it("clés au bon format, uniques, dans l'ordre player, survivants (id croissant), nœuds, tentes, slots, drops", () => {
    let sawSurvivors = 0;
    let sawDrops = 0;
    for (let i = 1; i < SIM.length; i++) {
      const f = frame(SIM[i - 1] as GameState, SIM[i] as GameState, 0.5);
      const keys = f.items.map((it) => it.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys[0]).toBe("player");
      for (const k of keys) expect(k).toMatch(/^(player|(survivor|node|tent|slot|drop):\d+)$/);
      for (let k = 1; k < keys.length; k++) expect(rankOf(keys[k] as string)).toBeGreaterThanOrEqual(rankOf(keys[k - 1] as string));
      const survivorIds = keys.filter((k) => k.startsWith("survivor:")).map((k) => Number(k.slice(9)));
      expect(survivorIds).toEqual([...survivorIds].sort((a, b) => a - b));
      // Type cohérent avec le préfixe.
      for (const it of f.items) {
        const prefix = it.key.split(":")[0];
        if (prefix === "player" || prefix === "survivor") expect(it.type).toBe("character");
        else if (prefix === "node") expect(["tree", "bush"]).toContain(it.type);
        else expect(it.type).toBe(prefix);
      }
      sawSurvivors += survivorIds.length;
      sawDrops += keys.filter((k) => k.startsWith("drop:")).length;
    }
    expect(sawSurvivors).toBeGreaterThan(0);
    expect(sawDrops).toBeGreaterThan(0);
  });

  it("ids stables d'une image à l'autre : même entité ⇒ même clé et même type", () => {
    for (let i = 2; i < SIM.length; i++) {
      const a = frame(SIM[i - 2] as GameState, SIM[i - 1] as GameState);
      const b = frame(SIM[i - 1] as GameState, SIM[i] as GameState);
      const typeA = new Map(a.items.map((it) => [it.key, it.type]));
      for (const it of b.items) {
        const t = typeA.get(it.key);
        // Seule transformation de type autorisée : aucune (un nœud reste arbre/buisson).
        if (t !== undefined) expect(it.type).toBe(t);
      }
      // Les survivants et drops de l'état ont exactement leur clé.
      const curr = SIM[i] as GameState;
      for (const s of curr.survivors) expect(typeA.has(`survivor:${s.id}`) || !(SIM[i - 1] as GameState).survivors.some((x) => x.id === s.id)).toBe(true);
      expect(b.items.filter((it) => it.key.startsWith("survivor:")).map((it) => it.key)).toEqual(
        curr.survivors.map((s) => `survivor:${s.id}`),
      );
      expect(b.items.filter((it) => it.key.startsWith("drop:")).map((it) => it.key)).toEqual(curr.drops.map((d) => `drop:${d.id}`));
    }
  });
});

describe("buildScene — alpha et interpolation", () => {
  const s0 = fresh();
  const prev = withPlayerAt(s0, 7500, 8500);
  const curr = withPlayerAt(s0, 7800, 8300);

  it("alpha 0 / 0,5 / 1 ⇒ prev / milieu / curr", () => {
    expect(player(frame(prev, curr, 0))).toMatchObject({ x: toMeters(7500), z: toMeters(8500) });
    expect(player(frame(prev, curr, 0.5)).x).toBeCloseTo(toMeters(7650), 10);
    expect(player(frame(prev, curr, 0.5)).z).toBeCloseTo(toMeters(8400), 10);
    expect(player(frame(prev, curr, 1))).toMatchObject({ x: toMeters(7800), z: toMeters(8300) });
  });

  it("alpha borné : −1 ⇒ 0, 2 ⇒ 1, NaN ⇒ 1, ±Infinity ⇒ 1", () => {
    expect(frame(prev, curr, -1)).toEqual(frame(prev, curr, 0));
    expect(frame(prev, curr, 2)).toEqual(frame(prev, curr, 1));
    expect(frame(prev, curr, NaN)).toEqual(frame(prev, curr, 1));
    expect(frame(prev, curr, Infinity)).toEqual(frame(prev, curr, 1));
    expect(frame(prev, curr, -Infinity)).toEqual(frame(prev, curr, 1));
    expect(frame(prev, curr, -0.0001)).toEqual(frame(prev, curr, 0));
  });

  it("saut > 1 tuile (Chebyshev > U) ⇒ pas d'interpolation, immobile, heading null", () => {
    const far = withPlayerAt(s0, 7500 + 2 * U, 8500);
    const p = player(frame(prev, far, 0.5));
    expect(p.x).toBe(toMeters(7500 + 2 * U));
    expect(p.moving).toBe(false);
    expect(p.heading).toBeNull();
    const justOver = withPlayerAt(s0, 7500, 8500 - U - 1);
    const q = player(frame(prev, justOver, 0));
    expect(q.z).toBe(toMeters(8500 - U - 1));
    expect(q.moving).toBe(false);
    expect(q.heading).toBeNull();
  });

  it("saut d'exactement 1 tuile ⇒ encore interpolé et en mouvement", () => {
    const one = withPlayerAt(s0, 7500 + U, 8500);
    const p = player(frame(prev, one, 0.5));
    expect(p.x).toBeCloseTo(toMeters(7500 + U / 2), 10);
    expect(p.moving).toBe(true);
    expect(p.heading).toBeCloseTo(Math.PI / 2, 12);
  });

  it("positions = lerp(prev, curr, alpha) comme en 2D (interpolate.ts), sur toute une simulation", () => {
    let checkedDrops = 0;
    for (let i = 1; i < SIM.length; i += 3) {
      const p = SIM[i - 1] as GameState;
      const c = SIM[i] as GameState;
      for (const a of [0, 0.3, 0.75, 1]) {
        const f = frame(p, c, a);
        const pos = interpolate(p, c, a);
        expect(player(f).x).toBeCloseTo(toMeters(pos.player.x), 9);
        expect(player(f).z).toBeCloseTo(toMeters(pos.player.y), 9);
        expect(f.focus).toEqual({ x: player(f).x, z: player(f).z });
        for (const s of c.survivors) {
          const it = item<CharacterItem>(f, `survivor:${s.id}`);
          const v = pos.survivors.get(s.id);
          expect(it.x).toBeCloseTo(toMeters(v!.x), 9);
          expect(it.z).toBeCloseTo(toMeters(v!.y), 9);
        }
        for (const d of c.drops) {
          const it = item<DropItem>(f, `drop:${d.id}`);
          const v = pos.drops.get(d.id);
          expect(it.x).toBeCloseTo(toMeters(v!.x) + expectedDropOffset(c.drops, d), 9);
          expect(it.z).toBeCloseTo(toMeters(v!.y), 9);
          checkedDrops++;
        }
      }
    }
    expect(checkedDrops).toBeGreaterThan(0);
  });
});

describe("buildScene — moving / heading", () => {
  const s0 = fresh();
  const base = withPlayerAt(s0, 7500, 8500);
  const cases: [string, number, number, number][] = [
    ["+x (droite)", 100, 0, Math.PI / 2],
    ["−x (gauche)", -100, 0, -Math.PI / 2],
    ["+y (vers la caméra)", 0, 100, 0],
    ["−y (vers le fond)", 0, -100, Math.PI],
    ["diagonale +x+y", 100, 100, Math.PI / 4],
    ["diagonale +x−y", 100, -100, (3 * Math.PI) / 4],
    ["diagonale −x+y", -100, 100, -Math.PI / 4],
    ["diagonale −x−y", -100, -100, (-3 * Math.PI) / 4],
  ];
  for (const [name, dx, dy, heading] of cases) {
    it(`déplacement ${name} ⇒ heading = atan2(dx, dz) = ${heading.toFixed(3)}`, () => {
      const p = player(frame(base, withPlayerAt(s0, 7500 + dx, 8500 + dy), 0.5));
      expect(p.moving).toBe(true);
      expect(p.heading).not.toBeNull();
      expect(Math.abs(Math.atan2(Math.sin(p.heading! - heading), Math.cos(p.heading! - heading)))).toBeLessThan(1e-12);
    });
  }

  it("immobile ⇒ moving false, heading null", () => {
    const p = player(frame(base, base, 0.5));
    expect(p.moving).toBe(false);
    expect(p.heading).toBeNull();
  });

  it("déplacement réel par commande vers +x ⇒ heading π/2", () => {
    const r = applyCommand(fresh(), { type: "setMoveInput", dx: 1, dy: 0 });
    expect(r.ok).toBe(true);
    const next = tick(r.state);
    const p = player(frame(r.state, next, 0.5));
    expect(p.moving).toBe(true);
    expect(p.heading).toBeCloseTo(Math.PI / 2, 12);
  });

  it("survivant nouveau (absent de prev) ⇒ moving false, heading null, position courante", () => {
    const [p, c] = findPair(SIM, (a, b) => b.survivors.some((s) => !a.survivors.some((x) => x.id === s.id)), "apparition");
    const born = c.survivors.find((s) => !p.survivors.some((x) => x.id === s.id)) as Survivor;
    const it = item<CharacterItem>(frame(p, c, 0.2), `survivor:${born.id}`);
    expect(it.moving).toBe(false);
    expect(it.heading).toBeNull();
    expect(it.x).toBe(toMeters(born.pos.x));
    expect(it.z).toBe(toMeters(born.pos.y));
  });

  it("survivant qui marche ⇒ moving true, heading conforme au déplacement", () => {
    const [p, c] = findPair(
      SIM,
      (a, b) => b.survivors.some((s) => {
        const o = a.survivors.find((x) => x.id === s.id);
        return !!o && (o.pos.x !== s.pos.x || o.pos.y !== s.pos.y);
      }),
      "survivant en marche",
    );
    const f = frame(p, c, 0.5);
    for (const s of c.survivors) {
      const o = p.survivors.find((x) => x.id === s.id);
      const it = item<CharacterItem>(f, `survivor:${s.id}`);
      if (!o || (o.pos.x === s.pos.x && o.pos.y === s.pos.y)) {
        expect(it.moving).toBe(false);
        expect(it.heading).toBeNull();
      } else {
        expect(it.moving).toBe(true);
        expect(it.heading).toBeCloseTo(Math.atan2(s.pos.x - o.pos.x, s.pos.y - o.pos.y), 12);
      }
    }
  });
});

describe("buildScene — survivants (variantes, visibilité)", () => {
  it("config : 4 modèles de survivants × 5 teintes = SURVIVOR_VARIANTS (20)", () => {
    expect(MODEL_IDS.survivors).toEqual(["characters/Mage", "characters/Ranger", "characters/Rogue", "characters/Rogue_Hooded"]);
    expect(SURVIVOR_TINTS).toEqual([0xffffff, 0xffd6a5, 0xbde0fe, 0xcaffbf, 0xffadd6]);
    expect(SURVIVOR_VARIANTS).toBe(MODEL_IDS.survivors.length * SURVIVOR_TINTS.length);
    expect(SURVIVOR_VARIANTS).toBe(20);
  });

  it("survivorVariant(id) = hash32(id) % 20 ⇒ modèle survivors[v % 4], teinte SURVIVOR_TINTS[floor(v / 4)]", () => {
    const nModels = MODEL_IDS.survivors.length;
    for (let id = 0; id < 300; id++) {
      const v = hash32(id) % SURVIVOR_VARIANTS;
      expect(survivorVariant(id)).toEqual({ model: MODEL_IDS.survivors[v % nModels], tint: SURVIVOR_TINTS[Math.floor(v / nModels)] });
    }
  });

  it("les 20 variantes (modèle, teinte) sont toutes atteintes et distinctes", () => {
    const seen = new Set<string>();
    for (let id = 0; id < 5000 && seen.size < SURVIVOR_VARIANTS; id++) {
      const v = survivorVariant(id);
      seen.add(`${v.model}|${v.tint}`);
    }
    expect(seen.size).toBe(SURVIVOR_VARIANTS);
  });

  it("variantes réparties : ids 1..200 ⇒ au moins 10 variantes distinctes, tous modèles et teintes valides", () => {
    const seen = new Set<string>();
    for (let id = 1; id <= 200; id++) {
      const v = survivorVariant(id);
      expect(MODEL_IDS.survivors).toContain(v.model);
      expect(SURVIVOR_TINTS).toContain(v.tint);
      seen.add(`${v.model}|${v.tint}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });

  it("le modèle du joueur n'est utilisé par aucune variante de survivant", () => {
    expect(MODEL_IDS.survivors as readonly string[]).not.toContain(MODEL_IDS.player);
    for (let id = 0; id <= 2000; id++) expect(survivorVariant(id).model).not.toBe(MODEL_IDS.player);
  });

  it("même id ⇒ même (modèle, teinte), quel que soit l'ordre des survivants dans l'état", () => {
    const [p, c] = findPair(SIM, (_a, b) => b.survivors.length >= 2, "≥ 2 survivants");
    const f1 = frame(p, c);
    const reversed = edit(c, (d) => {
      d.survivors.reverse();
    });
    const f2 = frame(p, reversed);
    for (const s of c.survivors) {
      const a = item<CharacterItem>(f1, `survivor:${s.id}`);
      const b = item<CharacterItem>(f2, `survivor:${s.id}`);
      expect({ model: b.model, tint: b.tint }).toEqual({ model: a.model, tint: a.tint });
      expect({ model: a.model, tint: a.tint }).toEqual(survivorVariant(s.id));
    }
  });

  it("survivant « resting » ⇒ visible false ; tous les autres statuts ⇒ visible true", () => {
    const statuses = new Set<string>();
    let resting = 0;
    for (let i = 1; i < SIM.length; i++) {
      const c = SIM[i] as GameState;
      if (c.survivors.length === 0) continue;
      const f = frame(SIM[i - 1] as GameState, c);
      for (const s of c.survivors) {
        statuses.add(s.status);
        const it = item<CharacterItem>(f, `survivor:${s.id}`);
        expect(it.visible).toBe(s.status !== "resting");
        expect(it.role).toBe("survivor");
        if (s.status === "resting") resting++;
      }
    }
    expect(resting).toBeGreaterThan(0);
    expect(statuses).toEqual(new Set(["toQueue", "queued", "walkingToTent", "resting", "leaving"]));
  });
});

describe("buildScene — nœuds", () => {
  it("targeted ssi harvestTarget(curr), au plus un nœud ciblé ; ratios = ceux de la 2D, bornés", () => {
    // Erreurs collectées (un `expect` par valeur serait trop lent sur 3000 ticks × 3 alphas).
    const errors: string[] = [];
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-12;
    let targetedFrames = 0;
    let midHarvest = 0;
    let midRegrow = 0;
    for (let i = 1; i < SIM.length; i++) {
      const p = SIM[i - 1] as GameState;
      const c = SIM[i] as GameState;
      const target = harvestTarget(c);
      for (const a of [0, 0.5, 1]) {
        const f = frame(p, c, a);
        const nodes = f.items.filter((it): it is NodeItem => it.type === "tree" || it.type === "bush");
        const at = `tick ${c.tick} α=${a}`;
        if (nodes.length !== c.nodes.length) errors.push(`${at}: ${nodes.length} nœuds`);
        if (nodes.filter((n) => n.targeted).length !== (target ? 1 : 0)) errors.push(`${at}: nombre de cibles`);
        c.nodes.forEach((n, idx) => {
          const it = nodes.find((x) => x.key === `node:${n.id}`);
          if (!it) {
            errors.push(`${at}: node:${n.id} absent`);
            return;
          }
          const pn = prevNodeOf(p, idx, n.id);
          const bad = (what: string): number => errors.push(`${at} node:${n.id}: ${what}`);
          if (it.type !== n.kind) bad("type");
          if (it.targeted !== (target?.id === n.id)) bad("targeted");
          if (it.ready !== (n.status === "ready")) bad("ready");
          if (!near(it.harvest, Math.min(1, Math.max(0, shownHarvestRatio(pn, n, a))))) bad(`harvest ${it.harvest}`);
          if (!near(it.regrow, Math.min(1, Math.max(0, shownRegrowRatio(pn, n, a))))) bad(`regrow ${it.regrow}`);
          if (!(it.harvest >= 0 && it.harvest < 1)) bad(`harvest hors [0,1[ ${it.harvest}`);
          if (!(it.regrow >= 0 && it.regrow <= 1)) bad(`regrow hors [0,1] ${it.regrow}`);
          if (n.status === "ready" && it.regrow !== 1) bad("regrow ≠ 1 alors que prêt");
          if (a === 1 && (!near(it.harvest, nodeHarvestRatio(n)) || !near(it.regrow, nodeRegrowRatio(n)))) bad("α=1 ≠ ratios courants");
          if (it.x !== (n.tile.tx + 0.5) * TILE_METERS || it.z !== (n.tile.ty + 0.5) * TILE_METERS) bad("position");
          if (!(it.yaw >= 0 && it.yaw < Math.PI * 2)) bad(`yaw ${it.yaw}`);
          if (a === 0.5 && it.harvest > 0) midHarvest++;
          if (a === 0.5 && !it.ready && it.regrow > 0) midRegrow++;
        });
        if (target) targetedFrames++;
      }
    }
    expect(errors.slice(0, 10)).toEqual([]);
    expect(targetedFrames).toBeGreaterThan(0);
    expect(midHarvest).toBeGreaterThan(0);
    expect(midRegrow).toBeGreaterThan(0);
  });

  it("récolte en cours : harvest interpolé entre les deux ticks", () => {
    const [p, c] = findPair(
      SIM,
      (a, b) => b.nodes.some((n, i) => n.status === "ready" && a.nodes[i]?.status === "ready" && n.progress > (a.nodes[i]?.progress ?? 0)),
      "récolte qui progresse",
    );
    const idx = c.nodes.findIndex((n, i) => n.status === "ready" && n.progress > (p.nodes[i]?.progress ?? 0));
    const n = c.nodes[idx]!;
    const r0 = nodeHarvestRatio(p.nodes[idx]!);
    const r1 = nodeHarvestRatio(n);
    expect(item<NodeItem>(frame(p, c, 0.5), `node:${n.id}`).harvest).toBeCloseTo((r0 + r1) / 2, 12);
    expect(item<NodeItem>(frame(p, c, 0.5), `node:${n.id}`).targeted).toBe(true);
  });

  it("buisson épuisé ⇒ ready false, regrow < 1 ; arbre épuisé idem", () => {
    for (const kind of ["bush", "tree"] as const) {
      const [p, c] = findPair(SIM, (_a, b) => b.nodes.some((n) => n.kind === kind && n.status === "depleted"), `${kind} épuisé`);
      const n = c.nodes.find((x) => x.kind === kind && x.status === "depleted")!;
      const it = item<NodeItem>(frame(p, c), `node:${n.id}`);
      expect(it.type).toBe(kind);
      expect(it.ready).toBe(false);
      expect(it.regrow).toBeLessThan(1);
      expect(it.harvest).toBe(0);
    }
  });

  it("yaw stable d'une image à l'autre (ne dépend que de l'id)", () => {
    const a = frame(SIM[0] as GameState, SIM[1] as GameState);
    const b = frame(SIM[1999] as GameState, SIM[2000] as GameState);
    for (const it of a.items) if (it.type === "tree" || it.type === "bush") expect(item<NodeItem>(b, it.key).yaw).toBe(it.yaw);
  });
});

describe("buildScene — tentes", () => {
  it("chaque statut libre / assignée / occupée / désordre est rendu tel quel ; clean et playerOn cohérents", () => {
    const seen = new Set<string>();
    for (let i = 1; i < SIM.length; i++) {
      const p = SIM[i - 1] as GameState;
      const c = SIM[i] as GameState;
      const f = frame(p, c, 0.5);
      const tents = f.items.filter((it): it is TentItem => it.type === "tent");
      expect(tents.map((t) => t.key)).toEqual(c.tents.map((t) => `tent:${t.id}`));
      for (const t of c.tents) {
        const it = item<TentItem>(f, `tent:${t.id}`);
        seen.add(it.status);
        expect(it.status).toBe(t.status);
        expect(it.clean).toBeCloseTo(t.cleanProgress / 30, 12);
        expect(it.clean).toBeGreaterThanOrEqual(0);
        expect(it.clean).toBeLessThanOrEqual(1);
        expect(it.playerOn).toBe(isPlayerOn(c, t.tile));
        expect(it.x).toBe((t.tile.tx + 0.5) * TILE_METERS);
        expect(it.z).toBe((t.tile.ty + 0.5) * TILE_METERS);
        const occ = t.occupantId === null ? undefined : c.survivors.find((s) => s.id === t.occupantId);
        if (t.status === "occupied" && occ?.status === "resting") {
          expect(it.rest).not.toBeNull();
          expect(it.rest!).toBeGreaterThanOrEqual(0);
          expect(it.rest!).toBeLessThanOrEqual(1);
        } else {
          expect(it.rest).toBeNull();
        }
      }
    }
    expect(seen).toEqual(new Set(["free", "assigned", "occupied", "messy"]));
  });

  it("tente occupée : rest croît d'un tick à l'autre (alpha 1) et vaut 1 − restTicksLeft/restTicks", () => {
    const [, c0] = findPair(
      SIM,
      (_a, b) => b.tents.some((t) => t.status === "occupied"),
      "tente occupée",
    );
    const start = SIM.indexOf(c0);
    const tent = c0.tents.find((t) => t.status === "occupied")!;
    let last = -1;
    let steps = 0;
    for (let i = start; i < SIM.length; i++) {
      const c = SIM[i] as GameState;
      const t = c.tents.find((x) => x.id === tent.id)!;
      if (t.status !== "occupied") break;
      const occ = c.survivors.find((s) => s.id === t.occupantId)!;
      const it = item<TentItem>(frame(SIM[i - 1] as GameState, c, 1), `tent:${t.id}`);
      expect(it.rest).toBeCloseTo(1 - occ.restTicksLeft / 150, 12);
      expect(it.rest!).toBeGreaterThan(last);
      last = it.rest!;
      steps++;
    }
    expect(steps).toBeGreaterThan(10);
  });

  it("rest interpolé entre r0 et r1 (monotone en alpha), jamais au-delà de la valeur courante", () => {
    const [p, c] = findPair(
      SIM,
      (a, b) =>
        b.tents.some((t) => {
          if (t.status !== "occupied") return false;
          const s1 = b.survivors.find((s) => s.id === t.occupantId);
          const s0 = a.survivors.find((s) => s.id === t.occupantId);
          return s1?.status === "resting" && s0?.status === "resting";
        }),
      "repos sur deux ticks",
    );
    const t = c.tents.find((x) => x.status === "occupied" && c.survivors.find((s) => s.id === x.occupantId)?.status === "resting")!;
    const r0 = 1 - p.survivors.find((s) => s.id === t.occupantId)!.restTicksLeft / 150;
    const r1 = 1 - c.survivors.find((s) => s.id === t.occupantId)!.restTicksLeft / 150;
    expect(r1).toBeGreaterThan(r0);
    let prevRest = -Infinity;
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      const rest = item<TentItem>(frame(p, c, a), `tent:${t.id}`).rest!;
      expect(rest).toBeCloseTo(r0 + (r1 - r0) * a, 12);
      expect(rest).toBeGreaterThanOrEqual(prevRest);
      expect(rest).toBeLessThanOrEqual(r1 + 1e-12);
      prevRest = rest;
    }
  });

  it("nouveau repos (r0 > r1, ex. occupant remplacé) ⇒ rest = valeur courante, pas d'interpolation à rebours", () => {
    const [p, c] = findPair(
      SIM,
      (a, b) =>
        b.tents.some((t) => {
          const s1 = b.survivors.find((s) => s.id === t.occupantId);
          const s0 = a.survivors.find((s) => s.id === t.occupantId);
          return t.status === "occupied" && s1?.status === "resting" && s0?.status === "resting";
        }),
      "repos sur deux ticks",
    );
    const t = c.tents.find((x) => x.status === "occupied" && c.survivors.find((s) => s.id === x.occupantId)?.status === "resting")!;
    const prevMoreRested = edit(p, (d) => {
      d.survivors.find((s) => s.id === t.occupantId)!.restTicksLeft = 1;
    });
    const r1 = 1 - c.survivors.find((s) => s.id === t.occupantId)!.restTicksLeft / 150;
    for (const a of [0, 0.5, 1]) expect(item<TentItem>(frame(prevMoreRested, c, a), `tent:${t.id}`).rest).toBeCloseTo(r1, 12);
  });

  it("occupant absent de prev ⇒ rest = valeur courante", () => {
    const [p, c] = findPair(
      SIM,
      (_a, b) => b.tents.some((t) => t.status === "occupied" && b.survivors.find((s) => s.id === t.occupantId)?.status === "resting"),
      "tente occupée",
    );
    const t = c.tents.find((x) => x.status === "occupied" && c.survivors.find((s) => s.id === x.occupantId)?.status === "resting")!;
    const noOcc = edit(p, (d) => {
      d.survivors = d.survivors.filter((s) => s.id !== t.occupantId);
    });
    const r1 = 1 - c.survivors.find((s) => s.id === t.occupantId)!.restTicksLeft / 150;
    expect(item<TentItem>(frame(noOcc, c, 0), `tent:${t.id}`).rest).toBeCloseTo(r1, 12);
  });

  it("clean borné à [0, 1] même sur des valeurs hors bornes", () => {
    const s = edit(fresh(), (d) => {
      d.tents[0]!.status = "messy";
      d.tents[0]!.cleanProgress = 999;
    });
    expect((frame(s, s).items.find((i) => i.type === "tent") as TentItem).clean).toBe(1);
    const n = edit(s, (d) => {
      d.tents[0]!.cleanProgress = -5;
    });
    expect((frame(n, n).items.find((i) => i.type === "tent") as TentItem).clean).toBe(0);
  });

  it("tente en désordre en cours de nettoyage : clean progresse", () => {
    const [p, c] = findPair(
      SIM,
      (_a, b) => b.tents.some((t) => t.status === "messy" && t.cleanProgress > 0),
      "nettoyage en cours",
    );
    const t = c.tents.find((x) => x.status === "messy" && x.cleanProgress > 0)!;
    const it = item<TentItem>(frame(p, c), `tent:${t.id}`);
    expect(it.clean).toBeGreaterThan(0);
    expect(it.clean).toBeLessThan(1);
    expect(it.rest).toBeNull();
  });
});

describe("buildScene — emplacements de construction", () => {
  it("coût restant, montant versé, ratio de paiement, playerOn", () => {
    let partial = 0;
    for (let i = 1; i < SIM.length; i++) {
      const c = SIM[i] as GameState;
      const f = frame(SIM[i - 1] as GameState, c);
      for (const b of c.buildSlots) {
        const key = `slot:${b.id}`;
        if (b.builtTentId !== null) {
          expect(f.items.some((it) => it.key === key)).toBe(false);
          continue;
        }
        const it = item<SlotItem>(f, key);
        expect(it.paid).toBe(b.paid);
        expect(it.remaining).toBe(slotRemaining(b));
        expect(it.remaining).toBe(b.cost - b.paid);
        expect(it.ratio).toBeCloseTo(b.paid / b.cost, 12);
        expect(it.ratio).toBeGreaterThanOrEqual(0);
        expect(it.ratio).toBeLessThanOrEqual(1);
        expect(it.playerOn).toBe(isPlayerOn(c, b.tile));
        if (b.paid > 0 && b.paid < b.cost && it.playerOn) partial++;
      }
    }
    expect(partial).toBeGreaterThan(0);
  });

  it("emplacement construit ⇒ plus de SlotItem, tente correspondante présente", () => {
    const [p, c] = findPair(SIM, (_a, b) => b.buildSlots.some((x) => x.builtTentId !== null), "emplacement construit");
    const slot = c.buildSlots.find((x) => x.builtTentId !== null)!;
    const f = frame(p, c);
    expect(f.items.some((it) => it.key === `slot:${slot.id}`)).toBe(false);
    const tent = item<TentItem>(f, `tent:${slot.builtTentId}`);
    expect(tent.x).toBe((slot.tile.tx + 0.5) * TILE_METERS);
    expect(tent.z).toBe((slot.tile.ty + 0.5) * TILE_METERS);
  });

  it("coût nul (valeur limite) ⇒ ratio 0, pas de NaN", () => {
    const s = edit(fresh(), (d) => {
      d.buildSlots[0]!.cost = 0;
      d.buildSlots[0]!.paid = 0;
    });
    const it = item<SlotItem>(frame(s, s), `slot:${s.buildSlots[0]!.id}`);
    expect(it.ratio).toBe(0);
    expect(it.remaining).toBe(0);
  });

  it("joueur sur l'emplacement ⇒ playerOn true", () => {
    const b = fresh().buildSlots[0]!;
    const s = withPlayerAt(fresh(), (b.tile.tx + 0.5) * U, (b.tile.ty + 0.5) * U);
    expect(item<SlotItem>(frame(s, s), `slot:${b.id}`).playerOn).toBe(true);
    expect(item<SlotItem>(frame(fresh(), fresh()), `slot:${b.id}`).playerOn).toBe(false);
  });
});

describe("buildScene — drops", () => {
  function withDrops(drops: Drop[]): GameState {
    return edit(fresh(), (d) => {
      d.drops = drops;
    });
  }

  it("ressource et montant recopiés ; drop seul ⇒ pas de décalage", () => {
    const s = withDrops([{ id: 100, pos: { x: 3500, y: 6500 }, resource: "wood", amount: 3 }]);
    const it = item<DropItem>(frame(s, s), "drop:100");
    expect(it).toMatchObject({ type: "drop", resource: "wood", amount: 3, x: toMeters(3500), z: toMeters(6500) });
  });

  it("bois + nourriture sur la même tuile ⇒ décalages opposés de ±0,3 m (bois −x, nourriture +x)", () => {
    const s = withDrops([
      { id: 100, pos: { x: 3500, y: 6500 }, resource: "wood", amount: 3 },
      { id: 101, pos: { x: 3200, y: 6900 }, resource: "food", amount: 2 },
    ]);
    const f = frame(s, s);
    const w = item<DropItem>(f, "drop:100");
    const n = item<DropItem>(f, "drop:101");
    expect(w.x).toBeCloseTo(toMeters(3500) - 0.3, 12);
    expect(n.x).toBeCloseTo(toMeters(3200) + 0.3, 12);
    expect(w.z).toBe(toMeters(6500));
    expect(n.z).toBe(toMeters(6900));
    expect(n.resource).toBe("food");
    expect(n.amount).toBe(2);
  });

  it("deux drops de même ressource sur une tuile, ou ressources différentes sur des tuiles voisines ⇒ pas de décalage", () => {
    const s = withDrops([
      { id: 100, pos: { x: 3500, y: 6500 }, resource: "wood", amount: 3 },
      { id: 101, pos: { x: 3400, y: 6400 }, resource: "wood", amount: 1 },
      { id: 102, pos: { x: 4000, y: 6500 }, resource: "food", amount: 2 }, // tuile (4,6)
    ]);
    const f = frame(s, s);
    expect(item<DropItem>(f, "drop:100").x).toBe(toMeters(3500));
    expect(item<DropItem>(f, "drop:101").x).toBe(toMeters(3400));
    expect(item<DropItem>(f, "drop:102").x).toBe(toMeters(4000));
  });

  it("drop en mouvement (aimant) : interpolé ; nouveau drop ⇒ position courante", () => {
    const prev = withDrops([{ id: 100, pos: { x: 3500, y: 6500 }, resource: "food", amount: 2 }]);
    const curr = withDrops([
      { id: 100, pos: { x: 3900, y: 6500 }, resource: "food", amount: 2 },
      { id: 101, pos: { x: 9500, y: 6500 }, resource: "wood", amount: 3 },
    ]);
    const f = frame(prev, curr, 0.5);
    expect(item<DropItem>(f, "drop:100").x).toBeCloseTo(toMeters(3700), 12);
    expect(item<DropItem>(f, "drop:101").x).toBe(toMeters(9500));
  });
});

describe("buildScene — accueil", () => {
  it("welcome.active = joueur sur W ; ratio = welcomeProgress / WELCOME.ticks borné", () => {
    let active = 0;
    for (let i = 1; i < SIM.length; i++) {
      const c = SIM[i] as GameState;
      const f = frame(SIM[i - 1] as GameState, c);
      expect(f.welcome.active).toBe(isPlayerOn(c, c.map.welcome));
      expect(f.welcome.ratio).toBeCloseTo(Math.min(1, c.welcomeProgress / 5), 12);
      if (f.welcome.active && f.welcome.ratio > 0) active++;
    }
    expect(active).toBeGreaterThan(0);
  });
});
