// Plausibilité (docs/design/save.md §5) : un joueur honnête qui produit LE PLUS VITE POSSIBLE doit
// rester LARGEMENT sous la limite anti-triche `départ + tick × PLAUSIBILITY.<res>PerTick`.
//
// Si ce test casse : une feature a rendu le jeu plus rapide (travailleurs, nouveaux nœuds, bonus,
// rendement ou vitesse relevés...). Il faut alors RELEVER PLAUSIBILITY dans src/data/balance.ts
// (balance-designer), sinon des sauvegardes honnêtes finiront par être rejetées au chargement.

import { NODES, PLAUSIBILITY, STARTING_RESOURCES, TIME } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { checkInvariants, heldTotal, plausibleMax } from "../../src/core/invariants";
import { isWalkable, tileOf } from "../../src/core/map";
import { findPath } from "../../src/core/path";
import type { DropResource, GameState, TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { attentiveFireGoal, fireReserve, fresh, harvestSpot, steer } from "./helpers";

/** Part maximale de la limite qu'un joueur honnête peut atteindre (marge de sécurité ×2). */
const MAX_SHARE = 0.5;
const THIRTY_MINUTES = 30 * 60 * TIME.ticksPerSecond;
/** Taux observés seulement après 1 min de jeu (au début, un seul rendement pèse lourd). */
const WARMUP = 60 * TIME.ticksPerSecond;
const RESOURCES_CHECKED: DropResource[] = ["wood", "food"];
const PER_TICK: Record<DropResource, number> = { wood: PLAUSIBILITY.woodPerTick, food: PLAUSIBILITY.foodPerTick };
/** Ressources qu'aucun système ne produit : leur stock ne doit jamais bouger. */
const UNPRODUCED = ["stone", "water", "coins"] as const;

function pathLength(s: GameState, to: TilePos): number {
  return findPath(s.map, tileOf(s.player.pos), to)?.length ?? Number.POSITIVE_INFINITY;
}

/** Pénalité (en ticks) des nœuds de l'autre ressource : le bot ne les récolte que s'il n'a rien d'autre. */
const OFF_PREFERENCE_PENALTY = 1_000_000;

/**
 * Bot « producteur maximal » : tente en désordre (nettoyage immédiat) > butin au sol >
 * emplacement dès que le stock couvre ce qui reste à verser > accueil dès qu'une tente est libre >
 * nœud prêt le plus proche > attente à côté du nœud qui repousse le plus tôt.
 * `prefer` : ressource dont on cherche le pire cas (ses nœuds passent toujours en premier).
 */
function fastGoal(s: GameState, prefer: DropResource): TilePos {
  // Feu entretenu (docs/design/day-night.md) : c'est ce qui maximise les gains (paiement de l'aube).
  const fire = attentiveFireGoal(s);
  if (fire) return fire;
  const messy = s.tents.find((t) => t.status === "messy");
  if (messy) return messy.tile;
  const drop = s.drops.find((d) => isWalkable(s.map, tileOf(d.pos)));
  if (drop) return tileOf(drop.pos);
  const slot = s.buildSlots.find((b) => b.builtTentId === null);
  if (slot && s.resources.wood - fireReserve(s) >= slot.cost - slot.paid && s.resources.wood > 0) return slot.tile;
  const head = s.survivors.find((v) => v.id === s.queue[0]);
  if (head?.status === "queued" && s.tents.some((t) => t.status === "free")) return s.map.welcome;
  let best: { spot: TilePos; cost: number } | null = null;
  for (const n of s.nodes) {
    const spot = harvestSpot(s, n);
    if (!spot) continue;
    // Coût = max(trajet, repousse restante) + durée de récolte restante ⇒ prêt le plus proche d'abord.
    const cost =
      Math.max(pathLength(s, spot), n.regrowTicksLeft) +
      (n.status === "ready" ? -n.progress : 0) +
      (NODES[n.kind].resource === prefer ? 0 : OFF_PREFERENCE_PENALTY);
    if (!best || cost < best.cost) best = { spot, cost };
  }
  return best?.spot ?? s.map.welcome;
}

interface RunStats {
  final: GameState;
  /** Plus grand taux (production / tick) observé après WARMUP, par ressource. */
  maxRate: Record<DropResource, number>;
  /** Plus grande part de la limite (production / (tick × perTick)) observée à n'importe quel tick. */
  maxShare: Record<DropResource, number>;
  welcomed: number;
  allBuiltAt: number | null;
}

/** Production depuis le départ : détenu − détenu au tick 0 (départ + réserve initiale du feu). */
function produced(s: GameState, r: DropResource): number {
  return heldTotal(s, r) - plausibleMax({ ...s, tick: 0 }, r);
}

function runFastBot(seed: number, ticks: number, prefer: DropResource): RunStats {
  let s = fresh(seed);
  const maxRate: Record<DropResource, number> = { wood: 0, food: 0 };
  const maxShare: Record<DropResource, number> = { wood: 0, food: 0 };
  let welcomed = 0;
  let allBuiltAt: number | null = null;
  for (let i = 0; i < ticks; i++) {
    const want = steer(s, fastGoal(s, prefer));
    if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) {
      const r = applyCommand(s, { type: "setMoveInput", ...want });
      if (!r.ok) throw new Error(`seed ${seed}, tick ${s.tick}: commande refusée (${r.error})`);
      s = r.state;
    }
    const next = tick(s);
    for (const v of next.survivors) {
      if (v.status === "walkingToTent" && s.survivors.find((p) => p.id === v.id)?.status !== "walkingToTent") welcomed++;
    }
    s = next;

    const errors = checkInvariants(s);
    if (errors.length > 0) {
      throw new Error(`seed ${seed}, tick ${s.tick} : checkInvariants rejette un état honnête : ${errors.join("; ")}`);
    }
    for (const r of RESOURCES_CHECKED) {
      const p = produced(s, r);
      const limit = s.tick * PER_TICK[r];
      maxShare[r] = Math.max(maxShare[r], p / limit);
      if (s.tick >= WARMUP) maxRate[r] = Math.max(maxRate[r], p / s.tick);
      if (p > MAX_SHARE * limit) {
        throw new Error(
          `seed ${seed}, tick ${s.tick} : production de ${r} = ${p} > ${MAX_SHARE * 100} % de la limite ` +
            `(${s.tick} × PLAUSIBILITY.${r}PerTick = ${limit}). Une feature a rendu le jeu plus rapide : ` +
            `relever PLAUSIBILITY.${r}PerTick dans src/data/balance.ts.`,
        );
      }
    }
    // Ressources que rien ne produit (PLAUSIBILITY.<res>PerTick = 0) : stock figé au départ, rien au sol.
    for (const r of UNPRODUCED) {
      if (s.resources[r] !== STARTING_RESOURCES[r] || heldTotal(s, r) !== STARTING_RESOURCES[r]) {
        throw new Error(
          `seed ${seed}, tick ${s.tick} : ${r} a bougé (${s.resources[r]}, détenu ${heldTotal(s, r)}) alors que ` +
            `PLAUSIBILITY.${r}PerTick = ${PLAUSIBILITY[`${r}PerTick`]} : relever cette borne.`,
        );
      }
    }
    if (allBuiltAt === null && s.buildSlots.every((b) => b.builtTentId !== null)) allBuiltAt = s.tick;
  }
  return { final: s, maxRate, maxShare, welcomed, allBuiltAt };
}

describe("plausibilité — bot producteur maximal, 30 min de jeu, plusieurs seeds", () => {
  const cases = [1, 2024, 77777].flatMap((seed) => (["wood", "food"] as const).map((prefer) => [seed, prefer] as const));
  for (const [seed, prefer] of cases) {
    it(`seed ${seed}, priorité ${prefer} : production ≤ ${MAX_SHARE * 100} % de la limite à chaque tick, 4 tentes construites`, () => {
      const res = runFastBot(seed, THIRTY_MINUTES, prefer);
      expect(res.final.tick).toBe(THIRTY_MINUTES);
      // Pire cas réellement atteint : toutes les tentes construites, et tôt (pas en fin de partie).
      expect(res.allBuiltAt, "le bot n'a pas construit toutes les tentes : il ne teste pas le pire cas").not.toBeNull();
      expect(res.final.tents).toHaveLength(1 + res.final.buildSlots.length);
      expect(res.final.tents).toHaveLength(4);
      expect(res.allBuiltAt!).toBeLessThan(THIRTY_MINUTES / 3);
      // Le bot produit vraiment (sinon le test ne prouve rien) : accueils en continu de jour
      // (≈ 1 / 100 ticks ; aucune arrivée la nuit, soit 1/3 du temps : 115 à 122 observés sur 30 min)
      // et, pour la ressource visée, une part substantielle du maximum permis par la repousse.
      expect(res.welcomed).toBeGreaterThan(100);
      expect(produced(res.final, "wood")).toBeGreaterThan(1000);
      if (prefer === "food") expect(produced(res.final, "food")).toBeGreaterThan(150);
      // Taux observés, en clair dans le rapport en cas d'échec.
      for (const r of RESOURCES_CHECKED) {
        expect(res.maxRate[r], `${r} : taux max ${res.maxRate[r].toFixed(3)}/tick`).toBeLessThanOrEqual(
          MAX_SHARE * PER_TICK[r],
        );
      }
      // Observé (PLAUSIBILITY = 1/tick) : bois ≤ 0,103/tick (part max 0,13 de la limite, pic au 1er départ
      // de survivant), nourriture ≤ 0,018/tick (part max 0,07). Tentes toutes construites vers le tick 1050-1840.
      for (const r of RESOURCES_CHECKED) expect(res.maxShare[r]).toBeLessThanOrEqual(MAX_SHARE);
      // Pierre, eau, pièces : jamais produites (vérifié à chaque tick dans runFastBot), PerTick = 0.
      for (const r of UNPRODUCED) {
        expect(res.final.resources[r]).toBe(STARTING_RESOURCES[r]);
        expect(PLAUSIBILITY[`${r}PerTick`]).toBe(0);
      }
    }, 120_000);
  }
});
