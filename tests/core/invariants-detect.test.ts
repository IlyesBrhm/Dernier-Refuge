// checkInvariants doit DÉTECTER chaque corruption (anti-triche / chargement de save futur).
// + sélecteurs en lecture seule.

import {
  BUILD,
  FIRE,
  LIMITS,
  MAP_LAYOUT,
  NODES,
  PICKUP,
  PLAUSIBILITY,
  RESOURCES,
  STARTING_RESOURCES,
  SURVIVOR,
  TENT,
  WELCOME,
  WORLD,
} from "../../src/data/balance";
import * as coreIndex from "../../src/core/index";
import { maxRegrowDelay } from "../../src/core/harvest-rules";
import { checkInvariants, heldTotal, plausibleMax } from "../../src/core/invariants";
import { isWalkable, parseMap, referenceMap, tileCenter, tileOf } from "../../src/core/map";
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
import { deepFreeze, edit, editPlausible, expectValid, fresh, place, run, runUntil, withHeadQueued } from "./helpers";

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
    expectValid(editPlausible(base, (d) => void (d.drops[0]!.amount = RESOURCES.cap + 1)));
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
    const before = editPlausible(fresh(), (d) => {
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
    const fullAfter = editPlausible(after, (d) => void (d.resources.wood = RESOURCES.cap));
    expectValid(pickupSystem(fullAfter));
    expect(pickupSystem(fullAfter).drops[0]!.pos).toEqual(drop.pos);
  });

  it("ne mute pas l'état inspecté", () => {
    const s = deepFreeze(midGame());
    expect(() => checkInvariants(s)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Invariants ajoutés pour la sauvegarde (docs/design/save.md §5). Chaque corruption doit produire
// une violation précise (regex), pas seulement « une erreur quelconque ».
// ---------------------------------------------------------------------------

/** Tête de file arrivée à sa place (statut queued, chemin vide). */
function queuedState(): GameState {
  const s = withHeadQueued();
  expect(s.survivors.find((v) => v.id === s.queue[0])?.status).toBe("queued");
  return s;
}

/** Un survivant au repos dans la tente initiale (joueur resté sur W). */
function restingState(): GameState {
  return runUntil(place(withHeadQueued(), fresh().map.welcome), (s) => s.survivors.some((v) => v.status === "resting"), 600);
}

/** Un survivant qui repart vers l'entrée avec un chemin d'au moins 2 tuiles. */
function leavingState(): GameState {
  return runUntil(restingState(), (s) => s.survivors.some((v) => v.status === "leaving" && v.path.length >= 2), 600);
}

const resting = (d: GameState) => d.survivors.find((v) => v.status === "resting")!;
const leaving = (d: GameState) => d.survivors.find((v) => v.status === "leaving")!;

type Corruption = [name: string, corrupt: (d: GameState) => void, expected: RegExp];

const saveCorruptions: [base: string, make: () => GameState, list: Corruption[]][] = [
  [
    "milieu de partie",
    midGame,
    [
      // RNG : entier 32 bits non signé (rng.ts : seed >>> 0).
      ["rng négatif", (d) => void (d.rng = -1), /^rng invalide/],
      ["rng = 2^32", (d) => void (d.rng = 2 ** 32), /^rng invalide/],
      ["rng non entier", (d) => void (d.rng = 1.5), /^rng invalide/],
      ["rng NaN", (d) => void (d.rng = NaN), /^rng invalide/],
      // Compteurs bornés.
      ["commandsThisTick > LIMITS", (d) => void (d.commandsThisTick = LIMITS.maxCommandsPerTick + 1), /^commandsThisTick/],
      [
        "spawnTimer > max(firstSpawnTicks, spawnIntervalMax)",
        (d) => void (d.spawnTimer = Math.max(SURVIVOR.firstSpawnTicks, SURVIVOR.spawnIntervalMax) + 1),
        /^spawnTimer/,
      ],
      ["welcomeProgress = WELCOME.ticks", (d) => void (d.welcomeProgress = WELCOME.ticks), /^welcomeProgress/],
      ["payCooldown > payIntervalTicks - 1", (d) => void (d.buildSlots[1]!.payCooldown = BUILD.payIntervalTicks), /payCooldown/],
      ["cleanProgress > 0 sur une tente libre", (d) => void (d.tents[1]!.cleanProgress = 1), /cleanProgress/],
      [
        "cleanProgress = cleanTicks sur une tente en désordre",
        (d) => {
          d.tents[1]!.status = "messy";
          d.tents[1]!.cleanProgress = TENT.cleanTicks;
        },
        /cleanProgress/,
      ],
      // Entrée joueur.
      ["input dx = 2", (d) => void ((d.player.input as { dx: number }).dx = 2), /^player\.input/],
      ["input dy = 0.5", (d) => void ((d.player.input as { dy: number }).dy = 0.5), /^player\.input/],
      // Tri par id.
      [
        "survivants dans le désordre",
        (d) => void (d.survivors = [d.survivors[1]!, d.survivors[0]!, ...d.survivors.slice(2)]),
        /survivants non triés/,
      ],
      ["tentes dans le désordre", (d) => void (d.tents = [d.tents[1]!, d.tents[0]!, ...d.tents.slice(2)]), /tentes non triées/],
      // Emplacements conformes à la carte.
      ["slot cost: 1", (d) => void (d.buildSlots[1]!.cost = 1), /slot \d+: coût 1 au lieu de/],
      [
        "coûts de slots échangés",
        (d) => {
          d.buildSlots[1]!.cost = BUILD.slotCosts[2]!;
          d.buildSlots[2]!.cost = BUILD.slotCosts[1]!;
        },
        /coût/,
      ],
      ["slot déplacé", (d) => void (d.buildSlots[1]!.tile = { tx: 3, ty: 3 }), /slot \d+: tuile/],
      ["slot supprimé", (d) => void d.buildSlots.pop(), /nombre d'emplacements/],
      [
        "slot en trop",
        (d) => void d.buildSlots.push({ ...d.buildSlots[1]!, tile: { tx: 3, ty: 3 }, id: d.nextId++ }),
        /nombre d'emplacements/,
      ],
      // Tentes conformes à la carte.
      ["tente initiale déplacée", (d) => void (d.tents[0]!.tile = { tx: 3, ty: 3 }), /tente \d+: tuile .* ni tente initiale/],
      ["deux tentes sur la même tuile", (d) => void (d.tents[1]!.tile = { ...d.tents[0]!.tile }), /plusieurs tentes sur la tuile/],
      // Chemins des survivants.
      ["chemin : tuile hors carte", (d) => void (walker(d).path[1] = { tx: -1, ty: 3 }), /hors carte ou non entière/],
      ["chemin : tuile non entière", (d) => void (walker(d).path[1] = { tx: 1.5, ty: 3 }), /hors carte ou non entière/],
      ["chemin : tuile non praticable (arbre)", (d) => void (walker(d).path[1] = { tx: 0, ty: 0 }), /non praticable/],
      ["chemin : tuile non praticable (rocher)", (d) => void (walker(d).path[1] = { tx: 5, ty: 4 }), /non praticable/],
      ["chemin : saut (tuile manquante)", (d) => void walker(d).path.splice(1, 1), /non contigu/],
      [
        "survivant téléporté loin de son pas",
        (d) => void (walker(d).pos = tileCenter({ tx: 3, ty: 3 })),
        /non alignée/,
      ],
      [
        "survivant en diagonale de son pas",
        (d) => {
          const w = walker(d);
          w.pos = { x: w.pos.x + 1, y: w.pos.y + 1 };
        },
        /non alignée/,
      ],
      ["survivant dans un rocher", (d) => void (walker(d).pos = tileCenter({ tx: 5, ty: 4 })), /sur une tuile non praticable/],
      ["marche vers une autre tuile que sa tente", (d) => void walker(d).path.pop(), /pas vers sa tente/],
      ["en route vers la file sans chemin", (d) => void (queued(d).path = []), /pas vers sa place de file/],
      ["statut inconnu", (d) => void ((walker(d) as { status: string }).status = "dancing"), /statut inconnu/],
      // Plausibilité.
      ["drop de bois de 999 999 au tick courant", (d) => void (d.drops[0]!.amount = 999_999), /^plausibilité wood/],
      [
        "nourriture au-delà du plausible",
        (d) => void (d.resources.food = plausibleMax(d, "food") + 1),
        /^plausibilité food/,
      ],
      [
        "drop de nourriture au-delà du plausible",
        (d) =>
          void d.drops.push({ id: d.nextId++, pos: tileCenter({ tx: 9, ty: 6 }), resource: "food", amount: plausibleMax(d, "food") }),
        /^plausibilité food/,
      ],
      ["même état, tick remis à 0", (d) => void (d.tick = 0), /^plausibilité wood/],
      // Ressources que rien ne produit (PLAUSIBILITY.<res>PerTick = 0) : plafond = stock de départ.
      ["pièces au-dessus du départ (re-signé coins 9999)", (d) => void (d.resources.coins = 9999), /^plausibilité coins/],
      ["pièces : départ + 1", (d) => void (d.resources.coins = STARTING_RESOURCES.coins + 1), /^plausibilité coins/],
      ["pierre : départ + 1", (d) => void (d.resources.stone = STARTING_RESOURCES.stone + 1), /^plausibilité stone/],
      ["eau : départ + 1", (d) => void (d.resources.water = STARTING_RESOURCES.water + 1), /^plausibilité water/],
      ["pièces au-dessus du départ même à un tick énorme", (d) => {
        d.tick = 1_000_000_000;
        d.resources.coins = STARTING_RESOURCES.coins + 1;
      }, /^plausibilité coins/],
    ],
  ],
  [
    "tête de file arrivée",
    queuedState,
    [
      [
        "en file mais décalé de sa place",
        (d) => {
          const h = queued(d);
          h.pos = { x: h.pos.x + 1, y: h.pos.y };
        },
        /en file mais pas à sa place/,
      ],
      ["en file avec un chemin", (d) => void (queued(d).path = [{ tx: 8, ty: 10 }]), /en file mais pas à sa place/],
    ],
  ],
  [
    "survivant au repos",
    restingState,
    [
      ["restTicksLeft > SURVIVOR.restTicks", (d) => void (resting(d).restTicksLeft = SURVIVOR.restTicks + 1), /restTicksLeft invalide/],
      ["au repos hors de sa tente", (d) => void (resting(d).pos = tileCenter({ tx: 2, ty: 3 })), /au repos hors de sa tente/],
    ],
  ],
  [
    "survivant qui repart",
    leavingState,
    [["part vers une autre tuile que l'entrée", (d) => void leaving(d).path.pop(), /pas vers l'entrée/]],
  ],
];

describe("checkInvariants — invariants de sauvegarde (save.md §5)", () => {
  for (const [baseName, make, list] of saveCorruptions) {
    describe(baseName, () => {
      const base = make();

      it("l'état de base est valide", () => expectValid(base));

      for (const [name, corrupt, expected] of list) {
        it(`détecte : ${name}`, () => {
          const errors = checkInvariants(edit(base, corrupt));
          expect(errors.some((e) => expected.test(e)), `aucune erreur ${String(expected)} dans ${JSON.stringify(errors)}`).toBe(
            true,
          );
        });
      }
    });
  }

  const base = midGame();

  it("bornes valides : rng 0 et 2^32 - 1, commandsThisTick = LIMITS, spawnTimer max, welcomeProgress max - 1", () => {
    expectValid(edit(base, (d) => void (d.rng = 0)));
    expectValid(edit(base, (d) => void (d.rng = 2 ** 32 - 1)));
    expectValid(edit(base, (d) => void (d.commandsThisTick = LIMITS.maxCommandsPerTick)));
    expectValid(
      edit(base, (d) => void (d.spawnTimer = Math.max(SURVIVOR.firstSpawnTicks, SURVIVOR.spawnIntervalMax))),
    );
    expectValid(edit(base, (d) => void (d.welcomeProgress = WELCOME.ticks - 1)));
  });

  it("bornes valides : tente en désordre à cleanTicks - 1, repos à SURVIVOR.restTicks", () => {
    expectValid(
      edit(base, (d) => {
        d.tents[1]!.status = "messy";
        d.tents[1]!.cleanProgress = TENT.cleanTicks - 1;
      }),
    );
    expectValid(edit(restingState(), (d) => void (resting(d).restTicksLeft = SURVIVOR.restTicks)));
  });

  it("le RNG produit par rng.ts reste dans [0, 2^32 - 1] (seeds extrêmes)", () => {
    for (const seed of [0, 1, 2 ** 31, 2 ** 32 - 1, -1, 2 ** 40 + 3]) {
      expectValid(run(fresh(seed), 30));
    }
  });

  it("plausibilité : la limite est exactement départ + tick × PLAUSIBILITY (bornes incluse / exclue)", () => {
    for (const r of ["wood", "food", "stone", "water", "coins"] as const) {
      const at = edit(base, (d) => {
        d.resources[r] += plausibleMax(d, r) - heldTotal(d, r);
      });
      expect(heldTotal(at, r)).toBe(plausibleMax(at, r));
      expectValid(at);
      const over = edit(at, (d) => void (d.resources[r] += 1));
      expect(checkInvariants(over).some((e) => e.startsWith(`plausibilité ${r}`))).toBe(true);
    }
    // Bois : + réserve initiale du feu (docs/design/day-night.md §5).
    expect(plausibleMax(base, "wood")).toBe(
      STARTING_RESOURCES.wood + FIRE.initialWood + base.tick * PLAUSIBILITY.woodPerTick,
    );
    expect(plausibleMax(base, "food")).toBe(STARTING_RESOURCES.food + base.tick * PLAUSIBILITY.foodPerTick);
  });

  it("plausibilité : pierre, eau, pièces (PerTick = 0) : égal au départ ⇒ accepté, au-dessus ⇒ rejeté, à tout tick", () => {
    for (const r of ["stone", "water", "coins"] as const) {
      expect(PLAUSIBILITY[`${r}PerTick`]).toBe(0);
      for (const t of [0, base.tick, 1_000_000]) {
        const at = edit(base, (d) => {
          d.tick = Math.max(t, d.tick); // ne pas rendre bois/nourriture implausibles
          d.resources[r] = STARTING_RESOURCES[r];
        });
        expect(plausibleMax(at, r)).toBe(STARTING_RESOURCES[r]);
        expect(heldTotal(at, r)).toBe(STARTING_RESOURCES[r]);
        expectValid(at);
        const over = edit(at, (d) => void (d.resources[r] = STARTING_RESOURCES[r] + 1));
        expect(checkInvariants(over).filter((e) => e.startsWith("plausibilité"))).toEqual([
          `plausibilité ${r}: ${STARTING_RESOURCES[r] + 1} détenu > ${STARTING_RESOURCES[r]} possible au tick ${over.tick}`,
        ]);
      }
    }
  });

  it("plausibilité : le bois versé dans les chantiers compte (le déplacer du stock au chantier ne change rien)", () => {
    const s = edit(base, (d) => void (d.resources.wood = 7));
    const moved = edit(s, (d) => {
      d.resources.wood -= 4;
      d.buildSlots[1]!.paid += 4;
    });
    expect(heldTotal(moved, "wood")).toBe(heldTotal(s, "wood"));
    // Bois versé au-delà du plausible : tick ramené juste sous ce qu'exige le total détenu.
    const tooEarly = edit(moved, (d) => {
      d.tick =
        Math.ceil((heldTotal(d, "wood") - STARTING_RESOURCES.wood - FIRE.initialWood) / PLAUSIBILITY.woodPerTick) - 1;
    });
    expect(checkInvariants(tooEarly).some((e) => e.startsWith("plausibilité wood"))).toBe(true);
  });

  it("plausibilité : un état initial (tick 0) est plausible", () => {
    expectValid(fresh());
    // Le bois détenu inclut la réserve initiale du feu.
    expect(heldTotal(fresh(), "wood")).toBe(STARTING_RESOURCES.wood + FIRE.initialWood);
    expect(heldTotal(fresh(), "food")).toBe(STARTING_RESOURCES.food);
  });

  it("toutes les violations sont détectées sans exception sur un état très corrompu", () => {
    const bad = edit(base, (d) => {
      d.rng = -5;
      d.survivors.reverse();
      d.tents.reverse();
      walker(d).path = [{ tx: 99, ty: 99 }];
    });
    expect(() => checkInvariants(bad)).not.toThrow();
    expect(checkInvariants(bad).length).toBeGreaterThan(3);
  });
});

describe("referenceMap", () => {
  it("égale à la carte de createInitialState, même instance pour toutes les parties", () => {
    const ref = referenceMap();
    expect(fresh(1).map).toEqual(ref);
    expect(fresh(1).map).toBe(ref);
    expect(fresh(2).map).toBe(ref);
    expect(referenceMap()).toBe(ref);
    expect(ref).toEqual(parseMap(MAP_LAYOUT).map);
  });

  it("gelée en profondeur : aucune mutation possible", () => {
    const ref = referenceMap();
    expect(Object.isFrozen(ref)).toBe(true);
    expect(Object.isFrozen(ref.tiles)).toBe(true);
    expect(Object.isFrozen(ref.queueTiles)).toBe(true);
    expect(ref.queueTiles.every((t) => Object.isFrozen(t))).toBe(true);
    expect(Object.isFrozen(ref.entrance) && Object.isFrozen(ref.welcome)).toBe(true);
    expect(() => {
      (ref.tiles as string[])[0] = "grass";
    }).toThrow(TypeError);
    expect(ref.tiles[0]).toBe("tree");
  });

  it("un état rechargé sans carte puis reconstruit avec referenceMap() est valide et identique", () => {
    const s = midGame();
    const saved = JSON.parse(JSON.stringify(s)) as Partial<GameState>;
    delete saved.map;
    expect("map" in saved).toBe(false);
    const reloaded = { ...saved, map: referenceMap() } as GameState;
    expect(reloaded).toEqual(s);
    expectValid(reloaded);
  });

  it("est exportée par l'index du core (avec heldTotal / plausibleMax)", () => {
    expect(coreIndex.referenceMap).toBe(referenceMap);
    expect(coreIndex.heldTotal).toBe(heldTotal);
    expect(coreIndex.plausibleMax).toBe(plausibleMax);
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
