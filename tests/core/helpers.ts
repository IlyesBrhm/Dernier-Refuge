// Utilitaires de test pour le cœur logique (pas un fichier de test).

import {
  COLD,
  FIRE,
  NODES,
  PLAUSIBILITY,
  PLAYER,
  SLEEP,
  STARTING_RESOURCES,
  SURVIVOR,
  TIME,
  WORLD,
} from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { checkInvariants, heldTotal, plausibleMax } from "../../src/core/invariants";
import { isWalkable, tileCenter, tileOf, sameTile } from "../../src/core/map";
import { findPath } from "../../src/core/path";
import {
  cloneState,
  createInitialState,
  type DropResource,
  type GameState,
  type ResourceNode,
  type SurvivorStatus,
  type TilePos,
} from "../../src/core/state";
import { feedZone, isFeedingFire } from "../../src/core/selectors";
import { tick } from "../../src/core/tick";
import { CYCLE_TICKS, cyclePos, isNight } from "../../src/core/time";

export const SEED = 12345;

export function fresh(seed = SEED): GameState {
  return createInitialState(seed);
}

/** Fixture : copie de l'état avec le joueur au centre de `tile` (input conservé). */
export function place(state: GameState, tile: TilePos): GameState {
  const s = cloneState(state);
  s.player.pos = tileCenter(tile);
  return s;
}

/**
 * Fixture : modifie une copie de l'état et RIEN d'autre (en particulier `tick` n'est jamais touché).
 * Si la fixture gonfle des stocks, elle doit soit fixer elle-même `d.tick` (préféré, lisible),
 * soit passer explicitement par `editPlausible`.
 */
export function edit(state: GameState, fn: (draft: GameState) => void): GameState {
  const s = cloneState(state);
  fn(s);
  return s;
}

/**
 * Fixture explicite aux stocks gonflés : applique `fn` comme `edit`, PUIS avance `tick` au minimum
 * nécessaire pour que bois et nourriture restent plausibles (invariant de plausibilité,
 * docs/design/save.md §5). `tick` n'est jamais reculé et n'est modifié que si l'état serait sinon
 * implausible.
 *
 * Attention : avancer `tick` peut changer tout ce qui en dépend (saison, jour/nuit au Jalon 4). À
 * réserver aux fixtures qui ont réellement besoin de stocks gonflés. Sur un état issu d'une
 * simulation, l'ajustement pourrait masquer une duplication de ressources à l'invariant de
 * plausibilité : le test doit alors vérifier lui-même la conservation (ledgerDeltaErrors, totaux).
 */
export function editPlausible(state: GameState, fn: (draft: GameState) => void): GameState {
  const s = edit(state, fn);
  s.tick = plausibleTick(s);
  return s;
}

/**
 * Comme `editPlausible`, mais si le tick obtenu tombe la nuit, l'avance jusqu'à l'aube suivante
 * (premier tick de jour) : pour les fixtures qui supposent le jour (survivant `resting`, arrivées).
 */
export function editPlausibleDay(state: GameState, fn: (draft: GameState) => void): GameState {
  const s = editPlausible(state, fn);
  if (isNight(s.tick)) s.tick = s.tick - cyclePos(s.tick) + CYCLE_TICKS;
  return s;
}

/** Plus petit `tick` ≥ `state.tick` pour lequel bois et nourriture détenus sont plausibles. */
export function plausibleTick(state: GameState): number {
  const perTick: Record<DropResource, number> = { wood: PLAUSIBILITY.woodPerTick, food: PLAUSIBILITY.foodPerTick };
  let t = state.tick;
  const atZero = { ...state, tick: 0 };
  for (const r of ["wood", "food"] as const) {
    // Plafond au tick 0 = départ (+ réserve initiale du feu pour le bois).
    const excess = heldTotal(state, r) - plausibleMax(atZero, r);
    if (Number.isSafeInteger(excess) && excess > 0) t = Math.max(t, Math.ceil(excess / perTick[r]));
  }
  return t;
}

export function expectValid(state: GameState): void {
  expect(checkInvariants(state)).toEqual([]);
}

/** Avance de n ticks un par un en vérifiant les invariants après chaque tick. */
export function run(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = tick(s);
    expectValid(s);
  }
  return s;
}

/** Avance jusqu'à ce que `pred` soit vrai (vérifie les invariants) ; échoue après `max` ticks. */
export function runUntil(state: GameState, pred: (s: GameState) => boolean, max = 2000): GameState {
  let s = state;
  for (let i = 0; i < max; i++) {
    if (pred(s)) return s;
    s = tick(s);
    expectValid(s);
  }
  if (pred(s)) return s;
  throw new Error(`condition non atteinte en ${max} ticks`);
}

export function move(state: GameState, dx: number, dy: number): GameState {
  const r = applyCommand(state, { type: "setMoveInput", dx, dy });
  expect(r.ok).toBe(true);
  return r.state;
}

/** État où la tête de file est arrivée à l'emplacement 0 (joueur hors de W). */
export function withHeadQueued(seed = SEED): GameState {
  return runUntil(fresh(seed), (s) => {
    const head = s.survivors.find((v) => v.id === s.queue[0]);
    return head?.status === "queued";
  });
}

export function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

// ---------------------------------------------------------------------------
// Conservation par ressource (docs/design/harvest.md §5). Rien n'est stocké dans l'état :
// le test observe les transitions entre deux états consécutifs (un tick d'écart).
// ---------------------------------------------------------------------------

/** Quantités produites depuis le début de la partie, par ressource de drop. */
export type Produced = Record<DropResource, number>;

export function emptyProduced(): Produced {
  return { wood: 0, food: 0 };
}

/** Nœuds épuisés pendant le tick prev → next (robuste même si harvestTicks valait 1). */
export function justDepleted(prev: GameState, next: GameState): ResourceNode[] {
  return next.nodes.filter((n) => {
    if (n.status !== "depleted") return false;
    const p = prev.nodes.find((x) => x.id === n.id);
    return !p || p.status !== "depleted" || n.regrowTicksLeft !== p.regrowTicksLeft - 1;
  });
}

/** Rendements des récoltes terminées pendant le tick prev → next, par ressource. */
export function harvestYields(prev: GameState, next: GameState): Produced {
  const out = emptyProduced();
  for (const n of justDepleted(prev, next)) out[NODES[n.kind].resource] += NODES[n.kind].yield;
  return out;
}

/**
 * Récompense attendue d'un départ observé entre prev et next (survivant installé ⇒ leaving) :
 * - nuit : départ au froid, floor(R / D) (y compris « arrivé, endormi et parti dans le même pas ») ;
 * - jour, dormeur : paiement de l'aube, R + dawnBonus ;
 * - jour, au repos : fin de repos, R.
 * 0 si ce n'est pas un départ.
 */
export function departReward(prevStatus: SurvivorStatus | undefined, next: GameState, nextStatus: SurvivorStatus): number {
  if (nextStatus !== "leaving") return 0;
  if (prevStatus !== "resting" && prevStatus !== "sleeping" && prevStatus !== "walkingToTent") return 0;
  if (isNight(next.tick)) return COLD_REWARD_T;
  if (prevStatus === "sleeping") return DAWN_REWARD_T;
  if (prevStatus === "resting") return SURVIVOR.woodReward;
  return 0;
}

export const COLD_REWARD_T = Math.floor(SURVIVOR.woodReward / COLD.rewardDivisor);
export const DAWN_REWARD_T = SURVIVOR.woodReward + SLEEP.dawnBonus;

/** Bois versé par les survivants partis pendant le tick prev → next. */
export function survivorRewards(prev: GameState, next: GameState): number {
  let r = 0;
  for (const v of next.survivors) {
    const p = prev.survivors.find((x) => x.id === v.id);
    r += departReward(p?.status, next, v.status);
  }
  return r;
}

/** Ajoute au registre tout ce qui a été produit pendant le tick prev → next. */
export function accumulate(produced: Produced, prev: GameState, next: GameState): Produced {
  const y = harvestYields(prev, next);
  return { wood: produced.wood + y.wood + survivorRewards(prev, next), food: produced.food + y.food };
}

export function dropTotal(s: GameState, resource: DropResource): number {
  return s.drops.filter((d) => d.resource === resource).reduce((a, d) => a + d.amount, 0);
}

/**
 * Ce que possède le camp pour une ressource : stock + au sol (+ pour le bois : versé dans les
 * emplacements, réserve du feu et bois brûlé cumulé).
 */
export function ledger(s: GameState): Produced {
  return {
    wood:
      s.resources.wood +
      dropTotal(s, "wood") +
      s.buildSlots.reduce((a, b) => a + b.paid, 0) +
      s.fire.wood +
      s.fire.burnedTotal,
    food: s.resources.food + dropTotal(s, "food"),
  };
}

/** Ce que possède le camp au départ : stocks de départ (+ réserve initiale du feu pour le bois). */
export const LEDGER_START: Produced = {
  wood: STARTING_RESOURCES.wood + FIRE.initialWood,
  food: STARTING_RESOURCES.food,
};

/**
 * Erreurs de conservation (stricte) : `ledger = départ + produit` pour bois et nourriture,
 * autres ressources constantes. Liste vide = conservé.
 */
export function conservationErrors(s: GameState, produced: Produced): string[] {
  const errors: string[] = [];
  const l = ledger(s);
  for (const r of ["wood", "food"] as const) {
    const expected = LEDGER_START[r] + produced[r];
    if (l[r] !== expected) errors.push(`${r} non conservé : ${l[r]} ≠ ${LEDGER_START[r]} + ${produced[r]}`);
  }
  for (const r of ["stone", "water", "coins"] as const) {
    if (s.resources[r] !== STARTING_RESOURCES[r]) errors.push(`${r} a changé : ${s.resources[r]}`);
  }
  return errors;
}

/**
 * Conservation « locale » sur un seul tick : la variation du registre entre prev et next est exactement
 * ce qui a été produit pendant ce tick (récoltes + récompenses), autres ressources inchangées.
 * Contrairement à `conservationErrors`, reste valable si une fixture a modifié les stocks avant le tick.
 */
export function ledgerDeltaErrors(prev: GameState, next: GameState): string[] {
  const errors: string[] = [];
  const a = ledger(prev);
  const b = ledger(next);
  const y = harvestYields(prev, next);
  const expectedWood = y.wood + survivorRewards(prev, next);
  if (b.wood - a.wood !== expectedWood) errors.push(`bois : Δ${b.wood - a.wood} ≠ produit ${expectedWood}`);
  if (b.food - a.food !== y.food) errors.push(`nourriture : Δ${b.food - a.food} ≠ produit ${y.food}`);
  for (const r of ["stone", "water", "coins"] as const) {
    if (next.resources[r] !== prev.resources[r]) errors.push(`${r} a changé : ${prev.resources[r]} → ${next.resources[r]}`);
  }
  return errors;
}

/**
 * Propriétés de la récolte vérifiées indépendamment de `checkInvariants` :
 * au plus un drop par (tuile, ressource), aucun nœud praticable (tuile "node", obstacle),
 * ni le joueur ni un survivant sur la tuile d'un nœud.
 */
export function harvestPropertyErrors(s: GameState): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const d of s.drops) {
    const t = tileOf(d.pos);
    const key = `${t.tx},${t.ty},${d.resource}`;
    if (keys.has(key)) errors.push(`deux drops ${d.resource} sur (${t.tx},${t.ty})`);
    keys.add(key);
  }
  const player = tileOf(s.player.pos);
  for (const n of s.nodes) {
    if (isWalkable(s.map, n.tile)) errors.push(`nœud ${n.id} praticable`);
    if (s.map.tiles[n.tile.ty * s.map.width + n.tile.tx] !== "node") errors.push(`nœud ${n.id} : tuile non "node"`);
    if (sameTile(player, n.tile)) errors.push(`joueur sur le nœud ${n.id}`);
    for (const v of s.survivors) if (sameTile(tileOf(v.pos), n.tile)) errors.push(`survivant ${v.id} sur le nœud ${n.id}`);
  }
  return errors;
}

/** Première voisine 4-connexe praticable d'un nœud (ordre N, E, S, O). */
export function harvestSpot(s: GameState, node: ResourceNode): TilePos | null {
  const { tx, ty } = node.tile;
  for (const t of [
    { tx, ty: ty - 1 },
    { tx: tx + 1, ty },
    { tx, ty: ty + 1 },
    { tx: tx - 1, ty },
  ]) {
    if (isWalkable(s.map, t)) return t;
  }
  return null;
}

/**
 * Objectif d'un bot « utile » : tente en désordre > drop > emplacement payable >
 * (tête de file arrivée et tente libre ⇒ W) > nœud prêt (sa première voisine praticable) > W.
 */
export function botGoal(s: GameState): TilePos {
  const messy = s.tents.find((t) => t.status === "messy");
  if (messy) return messy.tile;
  const drop = s.drops[0];
  if (drop) return tileOf(drop.pos);
  const slot = s.buildSlots.find((b) => b.builtTentId === null);
  if (slot && s.resources.wood > 0) return slot.tile;
  const head = s.survivors.find((v) => v.id === s.queue[0]);
  if (head?.status === "queued" && s.tents.some((t) => t.status === "free")) return s.map.welcome;
  for (const n of s.nodes) {
    if (n.status !== "ready") continue;
    const spot = harvestSpot(s, n);
    if (spot) return spot;
  }
  return s.map.welcome;
}

// ---------------------------------------------------------------------------
// Feu de camp : bot « attentif » (docs/design/day-night.md §6.2, consigne utilisateur).
// ---------------------------------------------------------------------------

/** Début du crépuscule visuel (cyclePos ≥ 2100) : le bot attentif remplit le feu à fond. */
export const DUSK_START = TIME.dayTicks - TIME.duskTicks;

/** Voisine du feu (zone d'alimentation) la plus proche du joueur en BFS. */
export function feedSpot(s: GameState): TilePos {
  const here = tileOf(s.player.pos);
  let best: { t: TilePos; d: number } | null = null;
  for (const t of feedZone(s.map)) {
    const d = findPath(s.map, here, t)?.length ?? Number.POSITIVE_INFINITY;
    if (!best || d < best.d) best = { t, d };
  }
  if (!best) throw new Error("aucune voisine praticable du feu");
  return best.t;
}

/**
 * Objectif « feu » du bot attentif, ou null : remplit à fond au crépuscule (cyclePos ≥ 2100) ;
 * la nuit, ne revient que si wood ≤ FIRE.lowWood (et reste jusqu'au plein une fois sur place).
 * L'alimentation exige un arrêt de FIRE.feedDelayTicks : arrivé sur la voisine visée, `steer`
 * renvoie (0,0) et le bot reste immobile ; « sur place » = délai entamé (feedProgress > 0, donc
 * arrêté dans la zone au dernier tick) ou alimentation en cours.
 */
export function attentiveFireGoal(s: GameState): TilePos | null {
  if (s.resources.wood <= 0 || s.fire.wood >= FIRE.capacity) return null;
  const p = cyclePos(s.tick);
  const atFire = s.fire.feedProgress > 0 || isFeedingFire(s);
  if (p >= DUSK_START && p < TIME.dayTicks) return feedSpot(s);
  if (isNight(s.tick) && (s.fire.wood <= FIRE.lowWood || atFire)) return feedSpot(s);
  return null;
}

/**
 * Bois à garder en réserve pour le feu (bot attentif) : de 1500 au crépuscule, de quoi le
 * remplir ; sinon rien.
 */
export function fireReserve(s: GameState): number {
  const p = cyclePos(s.tick);
  return p >= 1500 && p < TIME.dayTicks ? FIRE.capacity - s.fire.wood : 0;
}

/**
 * Marche jusqu'à `target` par commandes uniquement (setMoveInput + tick), invariants vérifiés,
 * puis s'arrête (input 0,0). Échoue après `max` ticks.
 */
export function walkTo(state: GameState, target: TilePos, max = 500): GameState {
  let s = state;
  for (let i = 0; i < max; i++) {
    const want = steer(s, target);
    if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) s = move(s, want.dx, want.dy);
    if (sameTile(tileOf(s.player.pos), target)) return s.player.input.dx === 0 && s.player.input.dy === 0 ? s : move(s, 0, 0);
    s = tick(s);
    expectValid(s);
  }
  throw new Error(`(${target.tx},${target.ty}) non atteinte en ${max} ticks`);
}

/**
 * Direction de déplacement pour qu'un bot rejoigne `target` via les commandes uniquement :
 * suit le chemin BFS de tuile en tuile en s'alignant sur l'axe perpendiculaire.
 */
export function steer(state: GameState, target: TilePos): { dx: number; dy: number } {
  const here = tileOf(state.player.pos);
  if (sameTile(here, target)) return { dx: 0, dy: 0 };
  const next = findPath(state.map, here, target)?.[0];
  if (!next) return { dx: 0, dy: 0 };
  const c = tileCenter(next);
  const p = state.player.pos;
  const tol = WORLD.unitsPerTile / 2 - PLAYER.halfSize;
  const horizontal = next.tx !== here.tx;
  const dA = horizontal ? c.x - p.x : c.y - p.y;
  const dB = horizontal ? c.y - p.y : c.x - p.x;
  const sA = Math.sign(dA);
  const sB = Math.sign(dB);
  let a = sA;
  let b = 0;
  if (Math.abs(dB) > tol) {
    b = sB;
    if (Math.abs(dB) > PLAYER.diagonalSpeed + tol) a = 0;
  }
  return horizontal ? { dx: a, dy: b } : { dx: b, dy: a };
}
