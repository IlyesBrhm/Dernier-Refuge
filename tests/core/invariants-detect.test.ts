// checkInvariants doit DÉTECTER chaque corruption (anti-triche / chargement de save futur).
// + sélecteurs en lecture seule.

import { NODES, PICKUP, RESOURCES, TENT, WELCOME, WORLD } from "../../src/data/balance";
import * as coreIndex from "../../src/core/index";
import { maxRegrowDelay } from "../../src/core/harvest-rules";
import { checkInvariants } from "../../src/core/invariants";
import { isWalkable, tileCenter, tileOf } from "../../src/core/map";
import {
  freeTentCount,
  isPlayerOn,
  isStockFull,
  playerTile,
  queueLength,
  slotRemaining,
} from "../../src/core/selectors";
import { pickupSystem } from "../../src/core/systems/pickup";
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
    // Nœuds : le premier épuisé, le deuxième en cours de récolte.
    const n0 = d.nodes[0]!;
    n0.status = "depleted";
    n0.regrowTicksLeft = 10;
    d.nodes[1]!.progress = 3;
  });
}

const walker = (d: GameState) => d.survivors.find((v) => v.status === "walkingToTent")!;
/** Survivant en tête de file (statut toQueue ou queued). */
const queued = (d: GameState) => d.survivors.find((v) => v.id === d.queue[0])!;

/** Remplace la carte (partagée entre clones) par une copie propre au brouillon et la renvoie. */
function ownMap(d: GameState): GameState["map"] {
  d.map = { ...d.map, tiles: [...d.map.tiles], queueTiles: d.map.queueTiles.map((t) => ({ ...t })) };
  return d.map;
}

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
  // Ressources.
  ["nourriture > plafond", (d) => void (d.resources.food = RESOURCES.cap + 1)],
  ["nourriture négative", (d) => void (d.resources.food = -1)],
  ["nourriture manquante", (d) => void delete (d.resources as Partial<GameState["resources"]>).food],
  // Drops typés.
  ["drop de ressource inconnue", (d) => void ((d.drops[0] as { resource: string }).resource = "stone")],
  [
    "deux drops de nourriture sur la même tuile",
    (d) => {
      d.drops.push({ id: d.nextId++, pos: { ...d.drops[0]!.pos }, resource: "food", amount: 1 });
      d.drops.push({ id: d.nextId++, pos: { ...d.drops[0]!.pos }, resource: "food", amount: 2 });
    },
  ],
  // Nœuds : états.
  ["nœud : progress = harvestTicks", (d) => void (d.nodes[1]!.progress = NODES[d.nodes[1]!.kind].harvestTicks)],
  ["nœud : progress négatif", (d) => void (d.nodes[1]!.progress = -1)],
  ["nœud : progress non entier", (d) => void (d.nodes[1]!.progress = 1.5)],
  ["nœud : progress NaN", (d) => void (d.nodes[1]!.progress = NaN)],
  ["nœud épuisé avec progress > 0", (d) => void (d.nodes[0]!.progress = 1)],
  ["nœud épuisé avec regrowTicksLeft 0", (d) => void (d.nodes[0]!.regrowTicksLeft = 0)],
  [
    "nœud épuisé avec regrowTicksLeft > max",
    (d) => void (d.nodes[0]!.regrowTicksLeft = maxRegrowDelay(d.nodes[0]!.kind) + 1),
  ],
  ["nœud prêt avec regrowTicksLeft > 0", (d) => void (d.nodes[1]!.regrowTicksLeft = 5)],
  ["nœud au statut inconnu", (d) => void ((d.nodes[1] as { status: string }).status = "burning")],
  // Nœuds : identité vs carte.
  ["nœud déplacé", (d) => void (d.nodes[1]!.tile = { tx: 1, ty: 1 })],
  ["nœud de sorte changée", (d) => void (d.nodes[1]!.kind = d.nodes[1]!.kind === "tree" ? "bush" : "tree")],
  ["nœud de sorte inconnue", (d) => void ((d.nodes[1] as { kind: string }).kind = "gold")],
  ["nœud supprimé", (d) => void d.nodes.pop()],
  ["nœud dupliqué (nouvel id)", (d) => void d.nodes.push({ ...d.nodes[1]!, tile: { ...d.nodes[1]!.tile }, id: d.nextId++ })],
  ["nœud : id ≥ nextId", (d) => void (d.nodes[4]!.id = d.nextId)],
  ["nœud : id dupliqué avec une tente", (d) => void (d.nodes[2]!.id = d.tents[0]!.id)],
  [
    "nœuds dans le désordre",
    (d) => {
      const a = d.nodes[0]!;
      d.nodes[0] = d.nodes[1]!;
      d.nodes[1] = a;
    },
  ],
  ["joueur dans un nœud", (d) => void (d.player.pos = tileCenter(d.nodes[2]!.tile))],
  ["joueur dans un arbre", (d) => void (d.player.pos = tileCenter({ tx: 0, ty: 0 }))],
  ["joueur hors carte", (d) => void (d.player.pos = { x: -5000, y: 500 })],
  ["joueur position non entière", (d) => void (d.player.pos = { x: 7500.5, y: 8500 })],
  // Drops : position dans la carte.
  ["drop hors carte (x négatif)", (d) => void (d.drops[0]!.pos = { x: -1, y: 3500 })],
  ["drop hors carte (y négatif)", (d) => void (d.drops[0]!.pos = { x: 3500, y: -500 })],
  ["drop hors carte (x = largeur)", (d) => void (d.drops[0]!.pos = { x: d.map.width * WORLD.unitsPerTile, y: 3500 })],
  ["drop hors carte (y = hauteur)", (d) => void (d.drops[0]!.pos = { x: 3500, y: d.map.height * WORLD.unitsPerTile })],
  ["drop position non entière", (d) => void (d.drops[0]!.pos = { x: 3500.5, y: 3500 })],
  // Carte : identique à la référence parseMap(MAP_LAYOUT). cloneState partage la carte : on la copie
  // avant de la corrompre (ownMap) pour ne pas polluer l'état de base.
  ["tuile modifiée (herbe → rocher)", (d) => void (ownMap(d).tiles[3 * d.map.width + 3] = "rock")],
  ["tuile modifiée (arbre → herbe)", (d) => void (ownMap(d).tiles[0] = "grass")],
  ["tuile de nœud en trop (sans nœud)", (d) => void (ownMap(d).tiles[3 * d.map.width + 5] = "node")],
  [
    "tuile de nœud supprimée (nœud sans tuile node)",
    (d) => void (ownMap(d).tiles[d.nodes[0]!.tile.ty * d.map.width + d.nodes[0]!.tile.tx] = "grass"),
  ],
  ["carte tronquée", (d) => void ownMap(d).tiles.pop()],
  ["carte avec une tuile en plus", (d) => void ownMap(d).tiles.push("grass")],
  ["largeur de carte modifiée", (d) => void (ownMap(d).width += 1)],
  ["hauteur de carte modifiée", (d) => void (ownMap(d).height -= 1)],
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

  it("bois + nourriture sur la même tuile reste valide (un drop par (tuile, ressource))", () => {
    expectValid(edit(base, (d) => void d.drops.push({ id: d.nextId++, pos: { ...d.drops[0]!.pos }, resource: "food", amount: 2 })));
  });

  it("nœuds aux bornes valides : progress = harvestTicks - 1, regrowTicksLeft = max", () => {
    expectValid(
      edit(base, (d) => {
        d.nodes[1]!.progress = NODES[d.nodes[1]!.kind].harvestTicks - 1;
        d.nodes[0]!.regrowTicksLeft = maxRegrowDelay(d.nodes[0]!.kind);
      }),
    );
  });

  it("un drop aux bords intérieurs de la carte reste valide", () => {
    const U = WORLD.unitsPerTile;
    expectValid(edit(base, (d) => void (d.drops[0]!.pos = { x: 0, y: 0 })));
    expectValid(edit(base, (d) => void (d.drops[0]!.pos = { x: d.map.width * U - 1, y: d.map.height * U - 1 })));
  });

  // Pourquoi l'invariant n'exige PAS « drop sur une tuile praticable » : l'aimantation déplace le drop
  // en ligne droite vers le joueur sans collision. Depuis un état valide, un seul tick suffit à poser
  // un drop sur la tuile d'un nœud ; si le stock se remplit à ce moment, il y reste.
  it("l'aimantation peut amener un drop sur la tuile d'un nœud depuis un état valide (toléré)", () => {
    const node = fresh().nodes.find((n) => n.tile.tx === 2 && n.tile.ty === 9)!;
    expect(node.kind).toBe("tree");
    const U = WORLD.unitsPerTile;
    // Joueur juste au-dessus du nœud (tuile (2,8), hitbox libre), drop juste en dessous (tuile (2,10)),
    // à exactement PICKUP.magnetRadius en Chebyshev.
    const before = edit(fresh(), (d) => {
      d.player.pos = { x: 2 * U + U / 2, y: 8 * U + 600 };
      d.drops.push({
        id: d.nextId++,
        pos: { x: 2 * U + U / 2, y: 8 * U + 600 + PICKUP.magnetRadius },
        resource: "wood",
        amount: 1,
      });
    });
    expectValid(before);
    expect(isWalkable(before.map, tileOf(before.drops[0]!.pos))).toBe(true);
    const after = pickupSystem(before);
    const drop = after.drops[0]!;
    expect(tileOf(drop.pos)).toEqual(node.tile);
    expect(isWalkable(after.map, tileOf(drop.pos))).toBe(false);
    expectValid(after);
    // Stock plein à cet instant : le drop reste sur le nœud, l'état reste valide.
    expectValid(pickupSystem(edit(after, (d) => void (d.resources.wood = RESOURCES.cap))));
    expect(pickupSystem(edit(after, (d) => void (d.resources.wood = RESOURCES.cap))).drops[0]!.pos).toEqual(drop.pos);
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

  it("isStockFull : vrai ssi resources[r] >= RESOURCES.cap, par ressource", () => {
    const s = deepFreeze(fresh());
    for (const r of ["wood", "food", "stone", "water", "coins"] as const) {
      expect(isStockFull(s, r)).toBe(s.resources[r] >= RESOURCES.cap);
    }
    const below = deepFreeze(edit(s, (d) => void (d.resources.wood = RESOURCES.cap - 1)));
    expect(isStockFull(below, "wood")).toBe(false);
    const full = deepFreeze(edit(s, (d) => void (d.resources.wood = RESOURCES.cap)));
    expect(isStockFull(full, "wood")).toBe(true);
    expect(isStockFull(full, "food")).toBe(full.resources.food >= RESOURCES.cap); // indépendant par ressource
  });

  it("isStockFull concorde avec le ramassage : stock plein ⇒ le drop ne bouge pas", () => {
    const s = edit(place(fresh(), { tx: 3, ty: 3 }), (d) => {
      d.resources.food = RESOURCES.cap;
      d.drops.push({ id: d.nextId++, pos: tileCenter({ tx: 4, ty: 3 }), resource: "food", amount: 2 });
      d.drops.push({ id: d.nextId++, pos: tileCenter({ tx: 4, ty: 3 }), resource: "wood", amount: 2 });
    });
    expect(isStockFull(s, "food")).toBe(true);
    expect(isStockFull(s, "wood")).toBe(false);
    const next = pickupSystem(s);
    expect(next.drops.find((d) => d.resource === "food")!.pos).toEqual(tileCenter({ tx: 4, ty: 3 }));
    expect(next.drops.find((d) => d.resource === "wood")?.pos ?? null).not.toEqual(tileCenter({ tx: 4, ty: 3 }));
  });

  it("isStockFull est exporté par l'index du core", () => {
    expect(coreIndex.isStockFull).toBe(isStockFull);
  });
});
