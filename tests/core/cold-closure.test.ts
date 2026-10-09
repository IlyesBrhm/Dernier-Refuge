// Accueil fermé jusqu'à l'aube après un départ au froid (règle utilisateur, docs/design/day-night.md
// §9 Q1, branche feature/day-night) : la nuit, dès qu'au moins un survivant est parti à cause du
// froid (night.coldLeavers > 0), l'accueil reste fermé jusqu'à l'aube, MÊME SI le feu est rallumé.
// Sélecteur unique pour l'UI : welcomeBlockReason(state) ∈ { null, "fireOut", "coldLeavers" }.
//
// Rien n'est ajouté à l'état : la règle est dérivée de isNight(tick) et night.coldLeavers. Le bilan
// est remis à 0 au pas du crépuscule (clock, avant tout autre système) et coldLeavers n'augmente
// que de nuit : la nuit, il ne compte que la nuit en cours ; le jour, isNight est faux.

import { FIRE, WELCOME } from "../../src/data/balance";
import * as coreIndex from "../../src/core";
import { sameTile, tileCenter, tileOf } from "../../src/core/map";
import { welcomeBlockReason, welcomeBlockedByCold } from "../../src/core/selectors";
import type { GameState, TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { countBurnTicks, isNight } from "../../src/core/time";
import { buildSlots, FEED_SPOT, AWAY, install } from "./day-night-fixtures";
import {
  COLD_REWARD_T,
  edit,
  expectValid,
  ledgerDeltaErrors,
  move,
  steer,
  withHeadQueued,
} from "./helpers";

interface Base {
  tick: number;
  fireWood: number;
  sleepers?: number;
  player?: TilePos;
  wood?: number;
  coldLeavers?: number;
}

/**
 * Tête de file arrivée (place 0), 3 tentes (T + 2 emplacements construits), `sleepers` dormeurs
 * dans les premières tentes, feu à `fireWood`, joueur sur `player` (défaut : loin de tout).
 */
function base(o: Base): GameState {
  return edit(withHeadQueued(), (d) => {
    d.tick = o.tick;
    buildSlots(d, 2);
    for (let k = 0; k < (o.sleepers ?? 0); k++) install(d, k, "sleeping");
    d.fire.wood = o.fireWood;
    d.fire.burnedTotal = countBurnTicks(1, o.tick);
    d.player.pos = tileCenter(o.player ?? AWAY);
    if (o.wood !== undefined) d.resources.wood = o.wood;
    if (o.coldLeavers !== undefined) {
      d.night.coldLeavers = o.coldLeavers;
      d.night.woodEarned = o.coldLeavers * COLD_REWARD_T;
    }
  });
}

/** Un pas : invariants + conservation locale du bois vérifiés. */
function step(s: GameState): GameState {
  const n = tick(s);
  expectValid(n);
  expect(ledgerDeltaErrors(s, n)).toEqual([]);
  return n;
}

/** Marche jusqu'à `target` par commandes (setMoveInput) puis s'arrête ; `check` après chaque pas. */
function walk(s0: GameState, target: TilePos, check: (s: GameState) => void = () => {}, max = 400): GameState {
  let s = s0;
  for (let i = 0; i < max; i++) {
    const want = steer(s, target);
    if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) s = move(s, want.dx, want.dy);
    if (sameTile(tileOf(s.player.pos), target)) return want.dx === 0 && want.dy === 0 ? s : move(s, 0, 0);
    s = step(s);
    check(s);
  }
  throw new Error(`(${target.tx},${target.ty}) non atteinte`);
}

function headStatus(s: GameState, id: number): string | undefined {
  return s.survivors.find((v) => v.id === id)?.status;
}

describe("welcomeBlockReason — table de vérité", () => {
  const cases: { name: string; o: Base; want: ReturnType<typeof welcomeBlockReason> }[] = [
    { name: "jour, feu allumé", o: { tick: 1000, fireWood: 5 }, want: null },
    { name: "jour, feu à 0", o: { tick: 1000, fireWood: 0 }, want: null },
    { name: "jour après une nuit avec départs au froid (bilan non nul)", o: { tick: 3700, fireWood: 0, coldLeavers: 2 }, want: null },
    { name: "nuit, feu allumé, aucun départ", o: { tick: 2600, fireWood: 5 }, want: null },
    { name: "nuit, feu à 0, aucun départ", o: { tick: 2600, fireWood: 0 }, want: "fireOut" },
    { name: "nuit, feu à 0, départs au froid (prioritaire)", o: { tick: 3100, fireWood: 0, coldLeavers: 1 }, want: "coldLeavers" },
    { name: "nuit, feu rallumé, départs au froid", o: { tick: 3100, fireWood: 5, coldLeavers: 1 }, want: "coldLeavers" },
  ];
  for (const c of cases) {
    it(`${c.name} ⇒ ${String(c.want)} ; welcomeBlockedByCold cohérent`, () => {
      const s = base(c.o);
      expectValid(s);
      expect(welcomeBlockReason(s)).toBe(c.want);
      expect(welcomeBlockedByCold(s)).toBe(c.want !== null);
    });
  }

  it("ne mute pas l'état ; exporté par l'API publique du core", () => {
    const s = base({ tick: 3100, fireWood: 5, coldLeavers: 1 });
    const snap = JSON.stringify(s);
    welcomeBlockReason(s);
    expect(JSON.stringify(s)).toBe(snap);
    expect(coreIndex.welcomeBlockReason).toBe(welcomeBlockReason);
  });
});

describe("accueil fermé jusqu'à l'aube après un départ au froid", () => {
  it("extinction ⇒ départ au froid ⇒ rallumage ⇒ accueil toujours fermé toute la nuit ⇒ rouvre à l'aube", () => {
    // 2999 : la combustion du pas 3000 éteint le feu (1 → 0) ; 1 dormeur dans T ; 2 tentes libres.
    const s0 = base({ tick: 2999, fireWood: 1, sleepers: 1, wood: 20 });
    expectValid(s0);
    const headId = s0.queue[0]!;
    expect(headStatus(s0, headId)).toBe("queued");
    expect(welcomeBlockReason(s0)).toBeNull();

    // 1. Extinction et départ au froid.
    let s = step(s0);
    expect(s.tick).toBe(3000);
    expect(s.fire.wood).toBe(0);
    expect(s.night.coldLeavers).toBe(1);
    expect(welcomeBlockReason(s)).toBe("coldLeavers");

    // 2. Rallumage (commandes uniquement : aller au feu, s'arrêter, verser).
    s = walk(s, FEED_SPOT);
    for (let i = 0; i < 200 && s.fire.wood < 10; i++) s = step(s);
    expect(s.fire.wood).toBeGreaterThanOrEqual(10);
    expect(isNight(s.tick)).toBe(true);
    expect(welcomeBlockReason(s)).toBe("coldLeavers"); // feu allumé, accueil toujours fermé
    expect(welcomeBlockedByCold(s)).toBe(true);

    // 3. Sur W jusqu'à la fin de la nuit : la file attend, la progression reste à 0.
    const closed = (st: GameState): void => {
      if (!isNight(st.tick)) return;
      expect(st.welcomeProgress).toBe(0);
      expect(st.queue[0]).toBe(headId);
      expect(headStatus(st, headId)).toBe("queued");
    };
    s = walk(s, s.map.welcome, closed);
    let litTicks = 0;
    while (isNight(s.tick)) {
      expect(welcomeBlockReason(s)).toBe("coldLeavers");
      if (s.fire.wood > 0) litTicks++;
      s = step(s);
      closed(s);
    }
    expect(litTicks).toBeGreaterThan(5 * WELCOME.ticks); // le feu était bien allumé pendant l'attente
    expect(s.tents.filter((t) => t.status === "free").length).toBeGreaterThan(0);

    // 4. Aube : rouvert au pas 3600, accueil en WELCOME.ticks pas.
    expect(s.tick).toBe(3600);
    expect(welcomeBlockReason(s)).toBeNull();
    expect(s.night.coldLeavers).toBe(1); // le bilan est conservé le jour, sans fermer l'accueil
    expect(s.welcomeProgress).toBe(1);
    for (let i = 1; i < WELCOME.ticks; i++) s = step(s);
    expect(headStatus(s, headId)).toBe("walkingToTent");
  });

  it("témoin : même état sans départ au froid (coldLeavers = 0), feu allumé ⇒ accueil possible de nuit", () => {
    const s0 = base({ tick: 3100, fireWood: 10 });
    const headId = s0.queue[0]!;
    let s = edit(s0, (d) => {
      d.player.pos = tileCenter(d.map.welcome);
    });
    expect(welcomeBlockReason(s)).toBeNull();
    for (let i = 0; i < WELCOME.ticks; i++) s = step(s);
    expect(headStatus(s, headId)).toBe("walkingToTent");
    // Même état avec un départ au froid enregistré : fermé.
    let c = edit(s0, (d) => {
      d.player.pos = tileCenter(d.map.welcome);
      d.night.coldLeavers = 1;
      d.night.woodEarned = COLD_REWARD_T;
    });
    expectValid(c);
    for (let i = 0; i < 3 * WELCOME.ticks; i++) c = step(c);
    expect(c.welcomeProgress).toBe(0);
    expect(headStatus(c, headId)).toBe("queued");
  });

  it("feu éteint SANS dormeur (coldLeavers = 0) puis rallumé ⇒ l'accueil rouvre la même nuit", () => {
    const s0 = base({ tick: 2600, fireWood: 0, wood: 20 });
    expectValid(s0);
    const headId = s0.queue[0]!;
    expect(welcomeBlockReason(s0)).toBe("fireOut");
    let s = walk(s0, FEED_SPOT, (st) => {
      expect(st.night.coldLeavers).toBe(0);
    });
    for (let i = 0; i < 100 && s.fire.wood < 3; i++) s = step(s);
    expect(s.fire.wood).toBeGreaterThanOrEqual(3);
    expect(s.night.coldLeavers).toBe(0);
    expect(welcomeBlockReason(s)).toBeNull();
    s = walk(s, s.map.welcome);
    for (let i = 0; i < 50 && headStatus(s, headId) !== "walkingToTent"; i++) s = step(s);
    expect(headStatus(s, headId)).toBe("walkingToTent");
    expect(isNight(s.tick)).toBe(true);
  });

  it("la remise à zéro du bilan au crépuscule ne ferme ni ne rouvre rien à tort", () => {
    // Jour 2 (tick 5999), bilan de la nuit 1 avec départs au froid, feu allumé, joueur sur W :
    // de jour l'accueil est ouvert malgré coldLeavers > 0 ; au crépuscule (6000) le bilan repart à 0.
    const s0 = base({ tick: 5999, fireWood: 10, coldLeavers: 2 });
    expectValid(s0);
    expect(welcomeBlockReason(s0)).toBeNull();
    const s1 = step(s0);
    expect(isNight(s1.tick)).toBe(true);
    expect(s1.night.coldLeavers).toBe(0);
    expect(welcomeBlockReason(s1)).toBeNull();
    // Nuit en cours : un départ au froid au pas du crépuscule (feu déjà à 0) ferme pour toute la nuit.
    const d0 = base({ tick: 5999, fireWood: 0, sleepers: 0, coldLeavers: 0 });
    const d1 = edit(d0, (d) => {
      // un survivant au repos dans T : il s'endort au crépuscule et part aussitôt (feu à 0).
      install(d, 0, "resting", 50);
    });
    expectValid(d1);
    let s = step(d1);
    expect(s.tick).toBe(6000);
    expect(s.night.coldLeavers).toBe(1);
    expect(welcomeBlockReason(s)).toBe("coldLeavers");
    s = edit(s, (d) => {
      d.fire.wood = FIRE.capacity; // rallumé (fixture) : reste fermé
    });
    expect(welcomeBlockReason(s)).toBe("coldLeavers");
  });

  it("accueil refusé ⇒ seule la progression est remise à 0, le reste de l'état évolue comme sans joueur sur W", () => {
    // Conservation : 200 pas de nuit, joueur sur W, accueil fermé par le froid.
    let s = edit(base({ tick: 3100, fireWood: 10, coldLeavers: 1 }), (d) => {
      d.player.pos = tileCenter(d.map.welcome);
    });
    const queue = [...s.queue];
    const tentsBefore = JSON.stringify(s.tents);
    for (let i = 0; i < 200; i++) s = step(s);
    expect(s.queue).toEqual(queue);
    expect(JSON.stringify(s.tents)).toBe(tentsBefore);
    expect(s.welcomeProgress).toBe(0);
  });
});
