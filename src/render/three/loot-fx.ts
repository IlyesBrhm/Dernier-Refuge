// Butin 3D en vol (phase « fly » de fx.sample) : bûches / baies procédurales qui sautent en arc
// du nœud vers le joueur. Pool fixe, aucune allocation par image.

import * as THREE from "three";
import type { DropResource } from "../../core";
import type { FxSample } from "../fx";
import { LOOT, POOLS, TILE_METERS, toMeters } from "./config";
import { lootMesh } from "./views/drop-view";
import type { ViewKit } from "./views/kit";

export interface LootFx {
  readonly group: THREE.Group;
  /** `nowMs` : horloge d'affichage (performance.now()), pour une rotation indépendante de la cadence. */
  update(samples: readonly FxSample[], nowMs: number): void;
  hideAll(): void;
  dispose(): void;
}

export function createLootFx(kit: ViewKit): LootFx {
  const group = new THREE.Group();
  group.name = "loot";
  const pools: Record<DropResource, THREE.Mesh[]> = { wood: [], food: [] };
  for (const r of ["wood", "food"] as const) {
    for (let i = 0; i < POOLS.loot / 2; i++) {
      const m = lootMesh(kit, r);
      m.visible = false;
      pools[r].push(m);
      group.add(m);
    }
  }

  const used: Record<DropResource, number> = { wood: 0, food: 0 };

  function hideAll(): void {
    for (const r of ["wood", "food"] as const) for (const m of pools[r]) m.visible = false;
  }

  return {
    group,
    update(samples, nowMs): void {
      used.wood = 0;
      used.food = 0;
      for (const s of samples) {
        if (s.phase !== "fly") continue;
        const m = pools[s.resource][used[s.resource]];
        if (!m) continue;
        used[s.resource]++;
        m.visible = true;
        m.position.set(toMeters(s.x), LOOT.baseHeight + s.lift * TILE_METERS, toMeters(s.y));
        m.scale.setScalar(Math.max(LOOT.minScale, s.size / LOOT.sizeRef));
        // Rotation dérivée du temps (même vitesse à 30, 60 ou 120 Hz), déphasée par emplacement du pool.
        m.rotation.y = (nowMs / 1000) * LOOT.spinRate + used[s.resource];
      }
      for (const r of ["wood", "food"] as const) {
        const list = pools[r];
        for (let i = used[r]; i < list.length; i++) {
          const m = list[i];
          if (m) m.visible = false;
        }
      }
    },
    hideAll,
    dispose(): void {
      group.removeFromParent();
      group.clear();
    },
  };
}
