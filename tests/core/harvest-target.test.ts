// findHarvestTarget (version sans allocation) ≡ définition de référence : nœuds prêts à portée
// (nodesInRange), centre de tuile le plus proche (distance² euclidienne), égalité ⇒ plus petit id.

import { NODES, WORLD } from "../../src/data/balance";
import { findHarvestTarget, nodesInRange } from "../../src/core/harvest-rules";
import { tileCenter } from "../../src/core/map";
import type { GameState, ResourceNode } from "../../src/core/state";
import { deepFreeze, edit, fresh } from "./helpers";

function referenceTarget(state: GameState): ResourceNode | null {
  const p = state.player.pos;
  let best: ResourceNode | null = null;
  let bestD = 0;
  for (const n of nodesInRange(state)) {
    const c = tileCenter(n.tile);
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (best === null || d < bestD || (d === bestD && n.id < best.id)) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

describe("findHarvestTarget sans allocation", () => {
  it("identique à la définition de référence sur toute la carte (pas de 125 unités), nœuds prêts ou épuisés", () => {
    const U = WORLD.unitsPerTile;
    const base = fresh();
    const variants = [
      base,
      // Un nœud sur deux épuisé.
      edit(base, (d) =>
        d.nodes.forEach((n, i) => {
          if (i % 2 === 0) {
            n.status = "depleted";
            n.regrowTicksLeft = NODES[n.kind].regrowTicks;
          }
        }),
      ),
    ];
    let checked = 0;
    let found = 0;
    for (const v of variants) {
      for (let y = 0; y < base.map.height * U; y += 125) {
        for (let x = 0; x < base.map.width * U; x += 125) {
          const s = edit(v, (d) => void (d.player.pos = { x, y }));
          const got = findHarvestTarget(s);
          expect(got?.id ?? null).toBe(referenceTarget(s)?.id ?? null);
          if (got) found++;
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(found).toBeGreaterThan(0);
  });

  it("égalité de distance entre deux nœuds ⇒ plus petit id (joueur à mi-chemin de (2,9) et (4,9))", () => {
    const U = WORLD.unitsPerTile;
    const s = deepFreeze(edit(fresh(), (d) => void (d.player.pos = { x: 3 * U + U / 2, y: 9 * U + U / 2 })));
    const a = s.nodes.find((n) => n.tile.tx === 2 && n.tile.ty === 9)!;
    const b = s.nodes.find((n) => n.tile.tx === 4 && n.tile.ty === 9)!;
    expect(a.id).toBeLessThan(b.id);
    expect(findHarvestTarget(s)?.id).toBe(a.id);
  });
});
