// Simulation longue jour/nuit, deux stratégies (exigence utilisateur, docs/design/day-night.md §6.2) :
// - bot « attentif » : remplit le feu à fond au crépuscule (cyclePos ≥ 2100), ne revient la nuit que
//   si wood ≤ FIRE.lowWood, garde une réserve de bois à partir de cyclePos 1500 pour le remplir ;
//   Pour verser, il s'ARRÊTE sur une voisine du feu (FIRE.feedDelayTicks immobile) ;
// - bot « ignorant » : ne s'arrête jamais au feu. Comme un vrai joueur, il passe devant sans
//   détour (la ligne 6, route principale, contient trois voisines du feu) : passer sans s'arrêter
//   ne verse rien (vérifié : 0 bois versé, passages dans la zone comptés).
// Invariants + conservation STRICTE du bois (stock + sol + chantiers + réserve du feu + brûlé =
// départ + réserve initiale du feu + produit) vérifiés à chaque tick.
//
// Comparaison équitable (critère 3) : parties indépendantes des deux bots, plafonnées au MÊME nombre
// de tentes T ∈ {2, 3, 4} (le bot ne construit que T − 1 emplacements ; les deux bots les terminent
// avant la 1re nuit, vérifié). Comparaison nuit par nuit, n = 1..CYCLES :
//   bilan(n) = night.woodEarned lu à l'aube n − bois versé au feu pendant le cycle n (ticks
//   ]3600(n − 1), 3600 n]).
// Le bois resté dans le feu à l'aube est compté comme dépense (mesure défavorable à l'attentif).
// Le bot « mixte » (voir plus bas) est comparé de la même façon : attentif > mixte, nuit après nuit.

import { FIRE, TIME, WELCOME } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { checkInvariants } from "../../src/core/invariants";
import { isWalkable, tileOf } from "../../src/core/map";
import { findPath } from "../../src/core/path";
import { welcomeBlockReason } from "../../src/core/selectors";
import type { GameState, MapState, TilePos } from "../../src/core/state";
import { isInFeedZone } from "../../src/core/systems/fire";
import { tick } from "../../src/core/tick";
import { CYCLE_TICKS, countBurnTicks, cyclePos, isNight } from "../../src/core/time";
import {
  accumulate,
  attentiveFireGoal,
  conservationErrors,
  DUSK_START,
  emptyProduced,
  feedSpot,
  fireReserve,
  fresh,
  harvestSpot,
  steer,
} from "./helpers";

// Bot « mixte » (exigence utilisateur, règle « accueil fermé jusqu'à l'aube après un départ au
// froid ») : au crépuscule, il met juste assez de bois pour que le feu s'éteigne au MILIEU de la nuit
// (MIXED_DUSK_LEVEL = combustions de [2400, 3000]) ; à l'extinction, les dormeurs partent au froid ;
// il nettoie les tentes, rallume avec quelques bois (MIXED_RELIGHT, une fois par nuit), puis TENTE
// d'accueillir la file (il ignore la raison "coldLeavers" et va sur W) ; constatant que l'accueil
// reste fermé (progression à 0 après WELCOME.ticks + 1 ticks sur W), il abandonne jusqu'à l'aube.
type Policy = "attentive" | "ignorant" | "mixed";

const MIXED_DUSK_LEVEL = countBurnTicks(TIME.dayTicks, TIME.dayTicks + TIME.nightTicks / 2);
const MIXED_RELIGHT = 3;

/** Mémoire du bot mixte, remise à zéro à chaque crépuscule. */
interface BotMemory {
  relit: boolean; // a déjà rallumé cette nuit
  blockedOnW: number; // ticks passés sur W, accueil fermé par "coldLeavers"
  gaveUp: boolean; // a constaté que l'accueil est fermé jusqu'à l'aube
}
const newMemory = (): BotMemory => ({ relit: false, blockedOnW: 0, gaveUp: false });

/** Objectif « feu » du bot mixte, ou null. */
function mixedFireGoal(s: GameState, mem: BotMemory): TilePos | null {
  if (s.resources.wood <= 0) return null;
  const p = cyclePos(s.tick);
  if (p >= DUSK_START && p < TIME.dayTicks && s.fire.wood < MIXED_DUSK_LEVEL) return feedSpot(s);
  if (!isNight(s.tick) || mem.relit || s.tents.some((t) => t.status === "messy")) return null;
  const atFire = s.fire.feedProgress > 0;
  if (s.fire.wood === 0 || (atFire && s.fire.wood < MIXED_RELIGHT)) return feedSpot(s);
  return null;
}

/** Réserve de bois du bot mixte : de 1500 au crépuscule, de quoi atteindre le niveau visé + rallumer. */
function mixedReserve(s: GameState): number {
  const p = cyclePos(s.tick);
  return p >= 1500 && p < TIME.dayTicks ? Math.max(0, MIXED_DUSK_LEVEL - s.fire.wood) + MIXED_RELIGHT : 0;
}

const SEEDS = [1, 42, 2024];
const CYCLES = 5;

/** Carte avec des tuiles supplémentaires comptées comme obstacles (navigation des bots seulement). */
function withObstacles(map: MapState, tiles: TilePos[]): MapState {
  if (tiles.length === 0) return map;
  const blocked = new Set(tiles.map((t) => t.ty * map.width + t.tx));
  return { ...map, tiles: map.tiles.map((t, i) => (blocked.has(i) ? "rock" : t)) };
}
/**
 * Carte de navigation : la construction dépend seulement de la position, donc un bot plafonné à
 * `maxTents` contourne les emplacements non construits (sinon il y verserait en passant).
 * Le feu, lui, n'est PAS contourné : l'alimentation exige un arrêt, passer devant ne verse rien.
 */
// Mémoïsation (performance seulement, résultats identiques) : la carte de navigation ne dépend que
// de (carte, tuiles à contourner) et findPath est pur en (carte, départ, arrivée). Le joueur reste
// plusieurs ticks sur la même tuile : sans cache, chaque tick refaisait 1 carte + 1 chemin par nœud.
const NAV_CACHE = new WeakMap<MapState, Map<string, MapState>>();
const PATH_CACHE = new WeakMap<MapState, Map<string, number>>();

function navMap(s: GameState, maxTents: number): MapState {
  const extra: TilePos[] = [];
  if (s.tents.length >= maxTents) {
    for (const b of s.buildSlots) if (b.builtTentId === null) extra.push(b.tile);
  }
  // Jamais la tuile où se trouve le joueur (sinon aucun chemin pour en sortir).
  const here = tileOf(s.player.pos);
  const blocked = extra.filter((t) => t.tx !== here.tx || t.ty !== here.ty);
  if (blocked.length === 0) return s.map;
  let byKey = NAV_CACHE.get(s.map);
  if (!byKey) NAV_CACHE.set(s.map, (byKey = new Map()));
  const key = blocked.map((t) => `${t.tx},${t.ty}`).join(";");
  let nav = byKey.get(key);
  if (!nav) byKey.set(key, (nav = withObstacles(s.map, blocked)));
  return nav;
}

function pathLength(nav: MapState, s: GameState, to: TilePos): number {
  const from = tileOf(s.player.pos);
  let byKey = PATH_CACHE.get(nav);
  if (!byKey) PATH_CACHE.set(nav, (byKey = new Map()));
  const key = `${from.tx},${from.ty}>${to.tx},${to.ty}`;
  let len = byKey.get(key);
  if (len === undefined) byKey.set(key, (len = findPath(nav, from, to)?.length ?? Number.POSITIVE_INFINITY));
  return len;
}

/**
 * Objectif du bot et carte pour l'atteindre : [attentif : feu] > tente en désordre > butin au sol >
 * emplacement (si le plafond de tentes n'est pas atteint, au-delà de la réserve du feu) > accueil
 * (si possible) > nœud prêt le plus proche (ou qui repousse le plus tôt).
 */
function plan(s: GameState, policy: Policy, maxTents: number, mem: BotMemory): { target: TilePos; nav: MapState } {
  if (policy === "attentive") {
    const fire = attentiveFireGoal(s);
    if (fire) return { target: fire, nav: navMap(s, maxTents) };
  }
  if (policy === "mixed") {
    const fire = mixedFireGoal(s, mem);
    if (fire) return { target: fire, nav: navMap(s, maxTents) };
  }
  const nav = navMap(s, maxTents);
  return { target: goal(s, policy, maxTents, nav, mem), nav };
}

/** Le bot va-t-il sur W ? Attentif/ignorant : seulement si l'accueil est ouvert (selon l'UI). */
function wantsWelcome(s: GameState, policy: Policy, mem: BotMemory): boolean {
  const reason = welcomeBlockReason(s);
  if (reason === null) return true;
  // Le mixte « tente » malgré un départ au froid, jusqu'à constater que c'est fermé.
  return policy === "mixed" && reason === "coldLeavers" && !mem.gaveUp;
}

function goal(s: GameState, policy: Policy, maxTents: number, nav: MapState, mem: BotMemory): TilePos {
  const messy = s.tents.find((t) => t.status === "messy");
  if (messy) return messy.tile;
  const drop = s.drops.find((d) => isWalkable(nav, tileOf(d.pos)));
  if (drop) return tileOf(drop.pos);
  const slot = s.buildSlots.find((b) => b.builtTentId === null);
  const reserve = policy === "attentive" ? fireReserve(s) : policy === "mixed" ? mixedReserve(s) : 0;
  if (slot && s.tents.length < maxTents && s.resources.wood > reserve) return slot.tile;
  const head = s.survivors.find((v) => v.id === s.queue[0]);
  if (head?.status === "queued" && s.tents.some((t) => t.status === "free") && wantsWelcome(s, policy, mem)) {
    return s.map.welcome;
  }
  let best: { spot: TilePos; cost: number } | null = null;
  for (const n of s.nodes) {
    const spot = harvestSpot(s, n);
    if (!spot) continue;
    const cost = Math.max(pathLength(nav, s, spot), n.regrowTicksLeft);
    if (!best || cost < best.cost) best = { spot, cost };
  }
  return best?.spot ?? s.map.welcome;
}

interface NightRecord {
  night: number;
  tents: number; // tentes au crépuscule
  firstOut: number | null; // cyclePos de la première extinction de la nuit
  litAllNight: boolean;
  coldLeavers: number;
  sleepersPaid: number;
  woodEarned: number;
  woodBurned: number;
  fedInCycle: number; // bois versé au feu pendant ]3600(n − 1), 3600 n]
  net: number; // woodEarned − fedInCycle
  welcomedAfterCold: number; // survivants accueillis la nuit après un départ au froid (attendu : 0)
  litAfterCold: number; // ticks de nuit feu allumé avec coldLeavers > 0 (rallumage effectif)
  triedBlocked: boolean; // le bot est resté sur W accueil fermé par "coldLeavers"
}

interface RunResult {
  final: GameState;
  nights: NightRecord[];
  produced: number;
  fedTotal: number;
  builtAt: (number | null)[];
  zoneTicks: number; // ticks passés dans la zone d'alimentation (8 voisines du feu)
}

/** Ticks entre deux retours à la boucle d'événements (le worker Vitest doit répondre à ses RPC). */
const YIELD_EVERY = 500;
const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Joue la partie du bot. Asynchrone UNIQUEMENT pour rendre la main au worker tous les YIELD_EVERY
 * ticks : la simulation elle-même reste synchrone et déterministe (aucune donnée ne dépend du
 * temps réel ni de l'ordre d'exécution).
 */
async function runBot(seed: number, policy: Policy, cycles: number, maxTents = 4): Promise<RunResult> {
  let s = fresh(seed);
  let produced = emptyProduced();
  let fedTotal = 0;
  let fedCycle = 0;
  let zoneTicks = 0;
  const nights: NightRecord[] = [];
  const builtAt: (number | null)[] = s.buildSlots.map(() => null);
  let current: NightRecord | null = null;
  let mem = newMemory();
  for (let i = 0; i < cycles * CYCLE_TICKS; i++) {
    if (i > 0 && i % YIELD_EVERY === 0) await yieldToEventLoop();
    let cur = s;
    const { target, nav } = plan(cur, policy, maxTents, mem);
    const want = steer({ ...cur, map: nav }, target);
    if (want.dx !== cur.player.input.dx || want.dy !== cur.player.input.dy) {
      const r = applyCommand(cur, { type: "setMoveInput", ...want });
      if (!r.ok) throw new Error(`${policy}, tick ${cur.tick}: commande refusée (${r.error})`);
      cur = r.state;
    }
    const next = tick(cur);
    const errors = checkInvariants(next);
    if (errors.length > 0) throw new Error(`${policy}, tick ${next.tick}: ${errors.join("; ")}`);
    produced = accumulate(produced, cur, next);
    const cons = conservationErrors(next, produced);
    if (cons.length > 0) throw new Error(`${policy}, tick ${next.tick}: ${cons.join("; ")}`);
    const fed = next.fire.wood + next.fire.burnedTotal - (cur.fire.wood + cur.fire.burnedTotal);
    fedTotal += fed;
    fedCycle += fed;
    if (isInFeedZone(next.map.fire, tileOf(next.player.pos))) zoneTicks++;
    const p = cyclePos(next.tick);
    const sameNight = isNight(cur.tick) && isNight(next.tick) && p !== TIME.dayTicks;
    // Accueils de nuit après un départ au froid (la règle les interdit jusqu'à l'aube).
    if (current && sameNight && cur.night.coldLeavers > 0) {
      for (const v of next.survivors) {
        const before = cur.survivors.find((x) => x.id === v.id);
        if (before?.status === "queued" && v.status === "walkingToTent") current.welcomedAfterCold++;
      }
    }
    if (current && isNight(next.tick) && next.night.coldLeavers > 0 && next.fire.wood > 0) current.litAfterCold++;
    if (policy === "mixed" && isNight(next.tick) && p !== TIME.dayTicks) {
      if (fed > 0 && next.fire.wood >= MIXED_RELIGHT) mem.relit = true;
      const onW = tileOf(next.player.pos).tx === next.map.welcome.tx && tileOf(next.player.pos).ty === next.map.welcome.ty;
      if (onW && welcomeBlockReason(next) === "coldLeavers" && next.welcomeProgress === 0) {
        mem.blockedOnW++;
        if (current) current.triedBlocked = true;
        if (mem.blockedOnW > WELCOME.ticks) mem.gaveUp = true;
      }
    }
    s = next;

    if (p === TIME.dayTicks) {
      mem = newMemory();
      current = {
        night: nights.length + 1,
        tents: s.tents.length,
        firstOut: null,
        litAllNight: true,
        coldLeavers: 0,
        sleepersPaid: 0,
        woodEarned: 0,
        woodBurned: 0,
        fedInCycle: 0,
        net: 0,
        welcomedAfterCold: 0,
        litAfterCold: 0,
        triedBlocked: false,
      };
    }
    if (current && isNight(s.tick) && s.fire.wood === 0) {
      current.litAllNight = false;
      current.firstOut ??= p;
    }
    if (current && p === 0) {
      current.coldLeavers = s.night.coldLeavers;
      current.sleepersPaid = s.night.sleepersPaid;
      current.woodEarned = s.night.woodEarned;
      current.woodBurned = s.night.woodBurned;
      current.fedInCycle = fedCycle;
      current.net = s.night.woodEarned - fedCycle;
      nights.push(current);
      current = null;
    }
    if (p === 0) fedCycle = 0;
    s.buildSlots.forEach((b, k) => {
      if (b.builtTentId !== null && builtAt[k] === null) builtAt[k] = s.tick;
    });
  }
  return { final: s, nights, produced: produced.wood, fedTotal, builtAt, zoneTicks };
}

// Chaque partie (seed, stratégie, T) est jouée UNE fois, dans le beforeAll de sa seed ; les `it` ne
// font que des assertions sur les résultats partagés (aucun `it` ne porte le coût d'une simulation).
const POLICIES: readonly Policy[] = ["attentive", "ignorant", "mixed"];
const TENT_CAPS = [2, 3, 4] as const; // T = 4 = plafond par défaut (maxTents) : partagé avec (1), (2), (3b)…
const cache = new Map<string, RunResult>();
const keyOf = (seed: number, policy: Policy, maxTents: number): string => `${seed}/${policy}/${maxTents}`;

async function computeSeed(seed: number): Promise<void> {
  for (const policy of POLICIES) {
    for (const T of TENT_CAPS) {
      const key = keyOf(seed, policy, T);
      if (!cache.has(key)) cache.set(key, await runBot(seed, policy, CYCLES, T));
    }
  }
}

function result(seed: number, policy: Policy, maxTents = 4): RunResult {
  const r = cache.get(keyOf(seed, policy, maxTents));
  if (!r) throw new Error(`partie ${keyOf(seed, policy, maxTents)} non calculée (beforeAll)`);
  return r;
}

const fmt = (r: RunResult): string =>
  r.nights.map((n) => `n${n.night}:${n.woodEarned}-${n.fedInCycle}=${n.net}`).join(" ");

describe(`simulation jour/nuit — bots attentif, mixte et ignorant, ${CYCLES} cycles, seeds ${SEEDS.join(", ")}`, () => {
  // Les simulations sont longues et synchrones : on rend la main à la boucle d'événements avant
  // chaque test pour que le worker Vitest réponde à ses RPC (sinon « Timeout calling onTaskUpdate »).
  beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (const seed of SEEDS) {
    describe(`seed ${seed}`, () => {
      // 9 parties (3 stratégies × T ∈ {2, 3, 4}) de CYCLES cycles : coûteux, d'où un délai large ;
      // runBot rend la main au worker régulièrement (pas de « Timeout calling onTaskUpdate »).
      beforeAll(() => computeSeed(seed), 300_000);

      it("(1) attentif : feu jamais éteint la nuit dès la 1re nuit ; aucun départ au froid ; des dormeurs payés à chaque aube", () => {
        const r = result(seed, "attentive");
        expect(r.nights).toHaveLength(CYCLES);
        for (const n of r.nights) {
          expect(n.litAllNight, `nuit ${n.night}`).toBe(true);
          expect(n.coldLeavers, `nuit ${n.night}`).toBe(0);
          expect(n.sleepersPaid, `nuit ${n.night}`).toBeGreaterThanOrEqual(1);
          expect(n.woodBurned).toBe(TIME.nightTicks / FIRE.nightBurnIntervalTicks);
        }
      }, 120_000);

      it("(2) ignorant : passe devant le feu sans s'arrêter et ne verse jamais ; feu éteint au milieu de la 1re nuit (cyclePos 3000 ∈ [2900, 3100]), puis dès le crépuscule ; personne payé à l'aube", () => {
        const r = result(seed, "ignorant");
        console.info(`[day-night-sim] seed ${seed} ignorant — ticks dans la zone du feu : ${r.zoneTicks}, bois versé : ${r.fedTotal}`);
        expect(r.zoneTicks).toBeGreaterThan(0); // il traverse bien la zone d'alimentation
        expect(r.fedTotal).toBe(0);
        const [first, ...rest] = r.nights;
        expect(first!.firstOut).not.toBeNull();
        expect(first!.firstOut!).toBeGreaterThanOrEqual(2900);
        expect(first!.firstOut!).toBeLessThanOrEqual(3100);
        expect(first!.firstOut).toBe(3000); // valeur exacte attendue (src/data/balance.ts)
        for (const n of rest) expect(n.firstOut, `nuit ${n.night}`).toBe(TIME.dayTicks);
        for (const n of r.nights) expect(n.sleepersPaid, `nuit ${n.night}`).toBe(0);
      }, 120_000);

      for (const T of TENT_CAPS) {
        it(`(3) ${T} tentes : entretenir rapporte plus que laisser mourir (ignorant) ou que la stratégie mixte, nuit après nuit`, () => {
          const a = result(seed, "attentive", T);
          const g = result(seed, "ignorant", T);
          const m = result(seed, "mixed", T);
          console.info(`[day-night-sim] seed ${seed}, T=${T} — attentif ${fmt(a)} | mixte ${fmt(m)} | ignorant ${fmt(g)}`);
          expect(a.nights).toHaveLength(CYCLES);
          expect(g.nights).toHaveLength(CYCLES);
          expect(m.nights).toHaveLength(CYCLES);
          for (let k = 0; k < CYCLES; k++) {
            const na = a.nights[k]!;
            const ng = g.nights[k]!;
            const nm = m.nights[k]!;
            // À nombre de tentes égal (T, construites avant la 1re nuit par les trois bots).
            expect(na.tents, `attentif, nuit ${k + 1}`).toBe(T);
            expect(ng.tents, `ignorant, nuit ${k + 1}`).toBe(T);
            expect(nm.tents, `mixte, nuit ${k + 1}`).toBe(T);
            expect(na.net, `nuit ${k + 1} : attentif ${na.net} vs ignorant ${ng.net}`).toBeGreaterThan(ng.net);
            expect(na.net, `nuit ${k + 1} : attentif ${na.net} vs mixte ${nm.net}`).toBeGreaterThan(nm.net);
          }
        }, 120_000);
      }

      it("(3b) mixte : feu éteint au milieu de chaque nuit, départs au froid, rallumage, puis accueil refusé jusqu'à l'aube", () => {
        const m = result(seed, "mixed");
        console.info(
          `[day-night-sim] seed ${seed} mixte — ` +
            m.nights.map((n) => `n${n.night}: out@${n.firstOut} froid ${n.coldLeavers} rallumé ${n.litAfterCold} essai ${n.triedBlocked}`).join(" ; "),
        );
        for (const n of m.nights) {
          expect(n.firstOut, `nuit ${n.night}`).toBe(TIME.dayTicks + TIME.nightTicks / 2);
          expect(n.coldLeavers, `nuit ${n.night}`).toBeGreaterThan(0);
          expect(n.litAfterCold, `nuit ${n.night} : rallumé après les départs`).toBeGreaterThan(0);
          expect(n.welcomedAfterCold, `nuit ${n.night}`).toBe(0);
          expect(n.sleepersPaid, `nuit ${n.night}`).toBe(0);
        }
        // Le bot a réellement tenté d'accueillir pendant que l'accueil était fermé par le froid.
        expect(m.nights.some((n) => n.triedBlocked)).toBe(true);
      }, 120_000);

      it("aucun bot n'accueille la nuit après un départ au froid", () => {
        for (const policy of ["attentive", "ignorant", "mixed"] as const) {
          for (const n of result(seed, policy).nights) expect(n.welcomedAfterCold, `${policy}, nuit ${n.night}`).toBe(0);
        }
      }, 120_000);

      it("(4) le feu ne bloque pas la construction : l'attentif construit les 3 emplacements avant la 1re nuit", () => {
        const a = result(seed, "attentive");
        const g = result(seed, "ignorant");
        console.info(`[day-night-sim] seed ${seed} construction — attentif ${JSON.stringify(a.builtAt)} ; ignorant ${JSON.stringify(g.builtAt)}`);
        expect(a.builtAt.every((t) => t !== null)).toBe(true);
        expect(Math.max(...a.builtAt.map((t) => t ?? Infinity))).toBeLessThan(TIME.dayTicks);
      }, 120_000);

      it("bois net sur toute la partie (produit − versé au feu) : attentif > ignorant", () => {
        const a = result(seed, "attentive");
        const g = result(seed, "ignorant");
        console.info(
          `[day-night-sim] seed ${seed} — attentif : produit ${a.produced}, versé ${a.fedTotal} (${((100 * a.fedTotal) / a.produced).toFixed(1)} %), net ${a.produced - a.fedTotal} ; ` +
            `ignorant : produit ${g.produced}, net ${g.produced - g.fedTotal}`,
        );
        expect(a.produced - a.fedTotal).toBeGreaterThan(g.produced - g.fedTotal);
      }, 120_000);

      // Critère (5), décision utilisateur : on garde un coût d'environ 5 % du bois produit (le feu
      // brûle au plus 4 (jour) + 12 (nuit) = 16 bois par cycle). L'ancien seuil « ≥ 10 % » est
      // abandonné ; seul reste un coût réel non nul. À rééquilibrer avec les loups (Jalon 4).
      it("(5) le feu a un coût réel : l'attentif y verse du bois (part > 0, ≤ 50 %)", () => {
        const a = result(seed, "attentive");
        const share = a.fedTotal / a.produced;
        expect(a.fedTotal, `part versée au feu : ${(100 * share).toFixed(1)} %`).toBeGreaterThan(0);
        expect(share).toBeLessThanOrEqual(0.5);
      }, 120_000);
    });
  }

  it("déterminisme : même seed + même stratégie ⇒ même état final ; seeds différentes ⇒ états différents", async () => {
    const a = await runBot(7, "ignorant", 1);
    expect((await runBot(7, "ignorant", 1)).final).toEqual(a.final);
    expect((await runBot(8, "ignorant", 1)).final).not.toEqual(a.final);
  }, 120_000);
});
