// Ratios de récolte / repousse affichés, interpolés entre deux ticks. Partagés par le rendu 2D et
// le modèle de scène 3D (scene-model.ts). Lecture seule, sans three, sans horloge.

import { nodeHarvestRatio, nodeRegrowRatio, type GameState, type ResourceNode } from "../core";

/** Nœud de même id dans l'état précédent (même index : liste statique triée par id). */
export function prevNodeOf(prev: Readonly<GameState>, i: number, id: number): ResourceNode | undefined {
  const p = prev.nodes[i];
  return p && p.id === id ? p : undefined;
}

/** Avancement de récolte affiché, interpolé entre deux ticks quand il progresse. */
export function shownHarvestRatio(p: ResourceNode | undefined, c: ResourceNode, a: number): number {
  const r = nodeHarvestRatio(c);
  if (!p || p.status !== "ready" || c.status !== "ready" || c.progress < p.progress) return r;
  const r0 = nodeHarvestRatio(p);
  return r0 + (r - r0) * a;
}

/** Avancement de repousse affiché (1 si prêt), interpolé entre deux ticks. */
export function shownRegrowRatio(p: ResourceNode | undefined, c: ResourceNode, a: number): number {
  const r = nodeRegrowRatio(c);
  if (!p || p.status !== "depleted" || c.status !== "depleted") return r;
  const r0 = nodeRegrowRatio(p);
  return r0 + (r - r0) * a;
}
