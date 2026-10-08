// checkInvariants doit DÉTECTER chaque corruption (anti-triche / chargement de save futur).
// + sélecteurs en lecture seule.

import { RESOURCES, TENT, WELCOME } from "../../src/data/balance";
import { checkInvariants } from "../../src/core/invariants";
import { tileCenter } from "../../src/core/map";
import { freeTentCount, isPlayerOn, playerTile, queueLength, slotRemaining } from "../../src/core/selectors";
import type { GameState } from "../../src/core/state";
import { deepFreeze, edit, expectValid, fresh, place, run, runUntil } from "./helpers";

/** État de milieu de partie cohérent : 1 survivant vers la tente, 1 en file, 1 drop, slot 0 construit. */
function midGame(): GameState {
  const two = runUntil(fresh(), (st) => st.queue.length === 2 && st.survivors.every((v) => v.status === "queued"));
  const welcomed = run(place(two, two.map.welcome), WELCOME.ticks);
  return edit(welcomed, (d) => {
    d.drops.push({ id: d.nextId++, pos: tileCenter({ tx: 3, ty: 3 }), resource: "wood", amount: 5 });
    const slot = d.buildSlots[0]!;
    const id = d.nextId++;
    slot.paid = slot.cost;
    slot.builtTentId = id;
    d.tents.push({ id, tile: { ...slot.tile }, status: "free", occupantId: null, cleanProgress: 0 });
  });
}

const walker = (d: GameState) => d.survivors.find((v) => v.status === "walkingToTent")!;
/** Survivant en tête de file (statut toQueue ou queued). */
const queued = (d: GameState) => d.survivors.find((v) => v.id === d.queue[0])!;

const corruptions: [string, (d: GameState) => void][] = [
  ["tick négatif", (d) => void (d.tick = -1)],
  ["tick non entier", (d) => void (d.tick = 1.5)],
  ["spawnTimer négatif", (d) => void (d.spawnTimer = -1)],
  ["nextId à 0", (d) => void (d.nextId = 0)],
  ["commandsThisTick négatif", (d) => void (d.commandsThisTick = -1)],
  ["welcomeProgress > max", (d) => void (d.welcomeProgress = WELCOME.ticks + 1)],
  ["welcomeProgress non entier", (d) => void (d.welcomeProgress = 0.5)],
  ["bois négatif", (d) => void (d.resources.wood = -1)],
  ["bois > plafond", (d) => void (d.resources.wood = RESOURCES.cap + 1)],
  ["nourriture non entière", (d) => void (d.resources.food = 1.5)],
  ["pièces NaN", (d) => void (d.resources.coins = NaN)],
  ["pièces Infinity", (d) => void (d.resources.coins = Infinity)],
  ["id dupliqué", (d) => void (d.drops[0]!.id = d.tents[0]!.id)],
  ["id ≥ nextId", (d) => void (d.drops[0]!.id = d.nextId)],
  ["drop de 0", (d) => void (d.drops[0]!.amount = 0)],
  ["drop négatif", (d) => void (d.drops[0]!.amount = -3)],
  ["drop non entier", (d) => void (d.drops[0]!.amount = 2.5)],
  ["drop non sûr (> MAX_SAFE_INTEGER)", (d) => void (d.drops[0]!.amount = Number.MAX_SAFE_INTEGER + 1)],
  ["drop Infinity", (d) => void (d.drops[0]!.amount = Infinity)],
  ["drop NaN", (d) => void (d.drops[0]!.amount = NaN)],
  [
    "deux drops sur la même tuile",
    (d) => void d.drops.push({ id: d.nextId++, pos: { ...d.drops[0]!.pos }, resource: "wood", amount: 1 }),
  ],
  ["file > 5", (d) => void (d.queue = [1, 2, 3, 4, 5, 6].map(() => queued(d).id))],
  ["file : id dupliqué", (d) => void d.queue.push(d.queue[0]!)],
  ["file : survivant inexistant", (d) => void (d.queue[0] = 99_999)],
  ["file : survivant au mauvais statut", (d) => void (queued(d).status = "leaving")],
  ["survivant en file absent de la file", (d) => void (d.queue = [])],
  ["survivant en marche sans tente", (d) => void (walker(d).tentId = null)],
  ["restTicksLeft hors repos", (d) => void (queued(d).restTicksLeft = 3)],
  ["repos avec restTicksLeft 0", (d) => void (walker(d).status = "resting")],
  [
    "deux survivants sur une tente",
    (d) => {
      const q = queued(d);
      d.queue = d.queue.filter((id) => id !== q.id);
      q.status = "walkingToTent";
      q.tentId = walker(d).tentId;
    },
  ],
  ["survivant hors carte", (d) => void (queued(d).pos = { x: -1, y: 0 })],
  ["survivant position non entière", (d) => void (queued(d).pos = { x: 1000.5, y: 1000 })],
  ["tente libre avec occupant", (d) => void (d.tents[1]!.occupantId = queued(d).id)],
  ["tente assignée sans occupant", (d) => void (d.tents[0]!.occupantId = null)],
  ["tente occupée par quelqu'un qui ne la pointe pas", (d) => void (walker(d).tentId = d.tents[1]!.id)],
  ["cleanProgress > max", (d) => void (d.tents[1]!.cleanProgress = TENT.cleanTicks + 1)],
  ["cleanProgress négatif", (d) => void (d.tents[1]!.cleanProgress = -1)],
  ["slot payé au-delà du coût", (d) => void (d.buildSlots[1]!.paid = d.buildSlots[1]!.cost + 1)],
  ["slot payé négatif", (d) => void (d.buildSlots[1]!.paid = -1)],
  ["slot payé mais non construit", (d) => void (d.buildSlots[1]!.paid = d.buildSlots[1]!.cost)],
  ["slot construit mais pas payé", (d) => void (d.buildSlots[0]!.paid = 0)],
  ["payCooldown négatif", (d) => void (d.buildSlots[1]!.payCooldown = -1)],
  ["tente construite supprimée", (d) => void d.tents.pop()],
  ["tente construite sur la mauvaise tuile", (d) => void (d.tents[1]!.tile = { tx: 1, ty: 1 })],
  [
    "deux slots pointent la même tente",
    (d) => {
      const b = d.buildSlots[1]!;
      b.paid = b.cost;
      b.builtTentId = d.buildSlots[0]!.builtTentId;
    },
  ],
  [
    "tente en trop (gratuite)",
    (d) => void d.tents.push({ id: d.nextId++, tile: { tx: 1, ty: 1 }, status: "free", occupantId: null, cleanProgress: 0 }),
  ],
  ["joueur dans un arbre", (d) => void (d.player.pos = tileCenter({ tx: 0, ty: 0 }))],
  ["joueur hors carte", (d) => void (d.player.pos = { x: -5000, y: 500 })],
  ["joueur position non entière", (d) => void (d.player.pos = { x: 7500.5, y: 8500 })],
];

describe("checkInvariants détecte les corruptions", () => {
  const base = midGame();

  it("l'état de base est valide", () => {
    expectValid(base);
    expect(base.survivors.some((v) => v.status === "walkingToTent")).toBe(true);
    expect(base.queue).toHaveLength(1);
  });

  for (const [name, corrupt] of corruptions) {
    it(`détecte : ${name}`, () => {
      const bad = edit(base, corrupt);
      expect(checkInvariants(bad).length).toBeGreaterThan(0);
    });
  }

  it("un drop au sol au-delà de RESOURCES.cap reste valide (le plafond ne s'applique qu'au stock)", () => {
    expectValid(edit(base, (d) => void (d.drops[0]!.amount = RESOURCES.cap + 1)));
  });

  it("ne mute pas l'état inspecté", () => {
    const s = deepFreeze(midGame());
    expect(() => checkInvariants(s)).not.toThrow();
  });
});

describe("sélecteurs", () => {
  it("lisent l'état sans le muter", () => {
    const s = deepFreeze(midGame());
    expect(freeTentCount(s)).toBe(1); // tente initiale assignée, tente construite libre
    expect(queueLength(s)).toBe(1);
    expect(playerTile(s)).toEqual(s.map.welcome);
    expect(isPlayerOn(s, s.map.welcome)).toBe(true);
    expect(isPlayerOn(s, s.map.entrance)).toBe(false);
    expect(slotRemaining(s.buildSlots[0]!)).toBe(0);
    expect(slotRemaining(s.buildSlots[1]!)).toBe(s.buildSlots[1]!.cost);
  });
});
