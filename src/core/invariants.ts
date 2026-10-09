// Invariants anti-triche / cohérence (docs/design/core-loop.md §5). Liste vide = état valide.

import {
  BUILD,
  COLD,
  FIRE,
  LIMITS,
  MAP_LAYOUT,
  NODES,
  PLAUSIBILITY,
  PLAYER,
  QUEUE,
  RESOURCES,
  SLEEP,
  STARTING_RESOURCES,
  SURVIVOR,
  TENT,
  TIME,
  WELCOME,
  WORLD,
  type NodeKind,
} from "../data/balance";
import { hitboxBlocked } from "./collision";
import { maxRegrowDelay } from "./harvest-rules";
import { isWalkable, parseMap, referenceMap, sameTile, tileAt, tileCenter, tileOf } from "./map";
import type { GameState, ResourceId, Survivor, TilePos, Vec } from "./state";
import { isInFeedZone } from "./systems/fire";
import { countBurnTicks, cyclePos, isNight, nightStartTick } from "./time";

const PARSED_LAYOUT = parseMap(MAP_LAYOUT);
/** Carte de référence (instance unique gelée, cf. referenceMap). */
const REF_MAP = referenceMap();
const INITIAL_TENT_TILES = PARSED_LAYOUT.tentTiles;
const SLOT_TILES = PARSED_LAYOUT.slotTiles;
const EXPECTED_NODES = PARSED_LAYOUT.nodes;
/** Ressources possibles d'un drop = ressources produites par les nœuds + récompense des survivants (bois). */
const DROP_RESOURCES = new Set<string>(["wood", ...Object.values(NODES).map((n) => n.resource)]);
const U = WORLD.unitsPerTile;
const MAX_RNG = 0xffffffff;
/** Valeur maximale du minuteur d'arrivée : valeur initiale ou plus grand intervalle tiré. */
const MAX_SPAWN_TIMER = Math.max(SURVIVOR.firstSpawnTicks, SURVIVOR.spawnIntervalMax);
const MAX_PAY_COOLDOWN = Math.max(0, BUILD.payIntervalTicks - 1);
/** Toutes les ressources du stock (clés de STARTING_RESOURCES = ResourceId, vérifié par typage). */
const RESOURCE_IDS = Object.keys(STARTING_RESOURCES satisfies Record<ResourceId, number>) as ResourceId[];

/**
 * Production maximale plausible par tick (docs/design/save.md §5) : PLAUSIBILITY.<res>PerTick.
 * L'indexation par `${ResourceId}PerTick` ne compile que si chaque ResourceId a son entrée.
 */
function plausiblePerTick(resource: ResourceId): number {
  const key = `${resource}PerTick` as const;
  return PLAUSIBILITY[key];
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}

function isAxis(v: unknown): boolean {
  return v === -1 || v === 0 || v === 1;
}

function isValidTile(t: TilePos | undefined): t is TilePos {
  return !!t && isInt(t.tx) && isInt(t.ty) && tileAt(REF_MAP, t.tx, t.ty) !== undefined;
}

function tileKey(t: TilePos): string {
  return `${t.tx},${t.ty}`;
}

function atCenter(p: Vec, t: TilePos): boolean {
  const c = tileCenter(t);
  return p.x === c.x && p.y === c.y;
}

/**
 * Quantité détenue par le camp pour une ressource : stock + drops au sol de cette ressource
 * (+ versé dans les emplacements de construction pour le bois, seule ressource versée).
 * Base de la plausibilité.
 */
export function heldTotal(state: GameState, resource: ResourceId): number {
  let total = state.resources[resource];
  for (const d of state.drops) if (d.resource === resource) total += d.amount;
  if (resource === "wood") {
    for (const b of state.buildSlots) total += b.paid;
    // Bois versé au feu : en réserve ou déjà brûlé (docs/design/day-night.md §5).
    total += state.fire.wood + state.fire.burnedTotal;
  }
  return total;
}

/**
 * Plafond plausible de `heldTotal` au tick courant : départ + tick × PLAUSIBILITY.<res>PerTick
 * (+ réserve initiale du feu pour le bois).
 */
export function plausibleMax(state: GameState, resource: ResourceId): number {
  const base = STARTING_RESOURCES[resource] + state.tick * plausiblePerTick(resource);
  return resource === "wood" ? base + FIRE.initialWood : base;
}

/** Plafond de la récompense d'un départ au froid. */
const COLD_REWARD_MAX = Math.floor(SURVIVOR.woodReward / COLD.rewardDivisor);
/** Plafond de la récompense d'un dormeur payé à l'aube. */
const DAWN_REWARD_MAX = SURVIVOR.woodReward + SLEEP.dawnBonus;

/** Feu et bilan de la nuit (docs/design/day-night.md §5). */
function checkFireAndNight(state: GameState, err: (m: string) => void): void {
  const tickOk = isInt(state.tick) && state.tick >= 0;
  const fire = state.fire;
  if (!isInt(fire.wood) || fire.wood < 0 || fire.wood > FIRE.capacity) err(`fire.wood hors bornes: ${fire.wood}`);
  const maxBurned = tickOk ? countBurnTicks(1, state.tick) * FIRE.burnPerStep : 0;
  if (!isInt(fire.burnedTotal) || fire.burnedTotal < 0 || fire.burnedTotal > maxBurned) {
    err(`fire.burnedTotal hors bornes: ${fire.burnedTotal} (max ${maxBurned})`);
  }
  // Délai d'arrêt avant alimentation : entier borné ; > 0 seulement si le joueur est dans la zone
  // (l'input peut avoir changé par commande depuis le dernier tick : il n'est pas contraint ici).
  if (!isInt(fire.feedProgress) || fire.feedProgress < 0 || fire.feedProgress > FIRE.feedDelayTicks) {
    err(`fire.feedProgress hors bornes: ${fire.feedProgress} (max ${FIRE.feedDelayTicks})`);
  } else if (fire.feedProgress > 0 && !isInFeedZone(state.map.fire, tileOf(state.player.pos))) {
    err(`fire.feedProgress ${fire.feedProgress} > 0 hors de la zone d'alimentation`);
  }

  const n = state.night;
  const fields = [n.coldLeavers, n.sleepersPaid, n.woodEarned, n.woodBurned];
  if (!fields.every((v) => isInt(v) && v >= 0)) {
    err(`night: compteurs invalides (${fields.map(String).join(", ")})`);
    return;
  }
  if (!tickOk) return;
  if (state.tick < TIME.dayTicks && fields.some((v) => v !== 0)) err("night: bilan non nul avant la première nuit");
  // Borne supérieure (décision utilisateur, Q3) : égalité en jeu honnête.
  const maxEarned = n.coldLeavers * COLD_REWARD_MAX + n.sleepersPaid * DAWN_REWARD_MAX;
  if (n.woodEarned > maxEarned) err(`night.woodEarned ${n.woodEarned} > ${maxEarned} possible`);
  if (isNight(state.tick)) {
    if (n.sleepersPaid !== 0) err(`night.sleepersPaid ${n.sleepersPaid} pendant la nuit`);
    const maxBurnedNight = countBurnTicks(nightStartTick(state.tick), state.tick) * FIRE.burnPerStep;
    if (n.woodBurned > maxBurnedNight) err(`night.woodBurned ${n.woodBurned} > ${maxBurnedNight} possible cette nuit`);
  } else if (state.tick >= TIME.dayTicks) {
    if (n.sleepersPaid > state.tents.length) err(`night.sleepersPaid ${n.sleepersPaid} > ${state.tents.length} tentes`);
    const lastNightStart = state.tick - cyclePos(state.tick) - TIME.nightTicks;
    const maxBurnedNight =
      countBurnTicks(lastNightStart, lastNightStart + TIME.nightTicks - 1) * FIRE.burnPerStep;
    if (n.woodBurned > maxBurnedNight) err(`night.woodBurned ${n.woodBurned} > ${maxBurnedNight} possible par nuit`);
  }
  if (n.woodBurned > fire.burnedTotal) err(`night.woodBurned ${n.woodBurned} > fire.burnedTotal ${fire.burnedTotal}`);
  if (isInt(state.nextId) && n.coldLeavers + n.sleepersPaid >= state.nextId) {
    err(`night: ${n.coldLeavers + n.sleepersPaid} départs ≥ nextId ${state.nextId}`);
  }
}

export function checkInvariants(state: GameState): string[] {
  const errors: string[] = [];
  const err = (m: string): void => {
    errors.push(m);
  };

  // Temps, compteurs.
  if (!isInt(state.tick) || state.tick < 0) err(`tick invalide: ${state.tick}`);
  if (!isInt(state.rng) || state.rng < 0 || state.rng > MAX_RNG) err(`rng invalide: ${state.rng}`);
  if (!isInt(state.spawnTimer) || state.spawnTimer < 0 || state.spawnTimer > MAX_SPAWN_TIMER) {
    err(`spawnTimer hors bornes: ${state.spawnTimer}`);
  }
  if (!isInt(state.nextId) || state.nextId < 1) err(`nextId invalide: ${state.nextId}`);
  if (
    !isInt(state.commandsThisTick) ||
    state.commandsThisTick < 0 ||
    state.commandsThisTick > LIMITS.maxCommandsPerTick
  ) {
    err(`commandsThisTick hors bornes: ${state.commandsThisTick}`);
  }
  // Atteindre WELCOME.ticks déclenche l'accueil et remet à 0 dans le même tick.
  if (!isInt(state.welcomeProgress) || state.welcomeProgress < 0 || state.welcomeProgress >= WELCOME.ticks) {
    err(`welcomeProgress hors bornes: ${state.welcomeProgress}`);
  }
  if (!isAxis(state.player.input.dx) || !isAxis(state.player.input.dy)) {
    err(`player.input invalide: (${String(state.player.input.dx)},${String(state.player.input.dy)})`);
  }

  // Ressources.
  for (const [k, v] of Object.entries(state.resources)) {
    if (!isInt(v) || v < 0 || v > RESOURCES.cap) err(`ressource ${k} invalide: ${v}`);
  }
  for (const k of Object.keys(STARTING_RESOURCES)) {
    if (!(k in state.resources)) err(`ressource ${k} manquante`);
  }

  // Ids uniques et < nextId.
  const ids = [
    ...state.survivors.map((s) => s.id),
    ...state.tents.map((t) => t.id),
    ...state.drops.map((d) => d.id),
    ...state.buildSlots.map((b) => b.id),
    ...state.nodes.map((n) => n.id),
  ];
  const seen = new Set<number>();
  for (const id of ids) {
    if (!isInt(id) || id < 1 || id >= state.nextId) err(`id invalide: ${id}`);
    if (seen.has(id)) err(`id dupliqué: ${id}`);
    seen.add(id);
  }

  // Carte : statique, identique à la carte de référence (dimensions + contenu).
  if (state.map.width !== REF_MAP.width || state.map.height !== REF_MAP.height) {
    err(`carte ${state.map.width}x${state.map.height} ≠ référence ${REF_MAP.width}x${REF_MAP.height}`);
  }
  if (state.map.tiles.length !== REF_MAP.tiles.length) {
    err(`carte: ${state.map.tiles.length} tuiles au lieu de ${REF_MAP.tiles.length}`);
  } else {
    for (let i = 0; i < REF_MAP.tiles.length; i++) {
      if (state.map.tiles[i] !== REF_MAP.tiles[i]) {
        err(`carte: tuile ${i % REF_MAP.width},${Math.floor(i / REF_MAP.width)} = ${String(state.map.tiles[i])} au lieu de ${String(REF_MAP.tiles[i])}`);
      }
    }
  }
  if (!sameTile(state.map.fire, REF_MAP.fire)) err("carte: feu de camp absent ou déplacé");

  // Feu de camp et bilan de la nuit.
  checkFireAndNight(state, err);

  // Drops : dans la carte, au plus un par (tuile, ressource).
  // Pas d'exigence « tuile praticable » : l'aimantation (systems/pickup.ts) déplace le drop en ligne droite
  // vers le joueur sans collision ; il peut donc traverser — et rester sur, si le stock se remplit ou si
  // le joueur s'éloigne — une tuile nœud/arbre/rocher (cf. tests/core/invariants-detect.test.ts).
  // Ce qui est garanti : il reste entre sa position et celle du joueur, donc dans la carte.
  const mapW = REF_MAP.width * WORLD.unitsPerTile;
  const mapH = REF_MAP.height * WORLD.unitsPerTile;
  const dropKeys = new Set<string>();
  for (const d of state.drops) {
    // Pas de plafond sur un tas au sol (RESOURCES.cap ne s'applique qu'au stock).
    if (!isInt(d.amount) || d.amount < 1) err(`drop ${d.id} montant invalide: ${d.amount}`);
    if (!DROP_RESOURCES.has(d.resource)) err(`drop ${d.id} ressource invalide: ${String(d.resource)}`);
    if (!isInt(d.pos.x) || !isInt(d.pos.y)) err(`drop ${d.id} position non entière`);
    else if (d.pos.x < 0 || d.pos.y < 0 || d.pos.x >= mapW || d.pos.y >= mapH) {
      err(`drop ${d.id} hors carte (${d.pos.x},${d.pos.y})`);
    }
    const t = tileOf(d.pos);
    const key = `${t.tx},${t.ty},${String(d.resource)}`;
    if (dropKeys.has(key)) err(`plusieurs drops ${String(d.resource)} sur la tuile ${t.tx},${t.ty}`);
    dropKeys.add(key);
  }

  // Nœuds : mêmes nœuds que la carte (sorte, tuile, ordre), états cohérents.
  if (state.nodes.length !== EXPECTED_NODES.length) {
    err(`nombre de nœuds ${state.nodes.length} ≠ ${EXPECTED_NODES.length}`);
  }
  state.nodes.forEach((n, i) => {
    const exp = EXPECTED_NODES[i];
    if (i > 0 && !(n.id > (state.nodes[i - 1]?.id ?? 0))) err(`nœuds non triés par id (${n.id})`);
    if (exp && (n.kind !== exp.kind || !sameTile(n.tile, exp.tile))) {
      err(`nœud ${n.id}: ${String(n.kind)} en (${n.tile.tx},${n.tile.ty}) au lieu de ${exp.kind} en (${exp.tile.tx},${exp.tile.ty})`);
    }
    if (tileAt(state.map, n.tile.tx, n.tile.ty) !== "node") err(`nœud ${n.id}: tuile de carte non "node"`);
    if (!isInt(n.progress) || !isInt(n.regrowTicksLeft)) {
      err(`nœud ${n.id}: compteurs non entiers`);
      return;
    }
    const spec = (NODES as Record<string, (typeof NODES)[NodeKind] | undefined>)[n.kind];
    if (!spec) {
      err(`nœud ${n.id}: sorte inconnue ${String(n.kind)}`);
      return;
    }
    if (n.status === "ready") {
      if (n.regrowTicksLeft !== 0) err(`nœud ${n.id}: prêt avec regrowTicksLeft ${n.regrowTicksLeft}`);
      if (n.progress < 0 || n.progress >= spec.harvestTicks) err(`nœud ${n.id}: progress hors bornes (${n.progress})`);
    } else if (n.status === "depleted") {
      if (n.progress !== 0) err(`nœud ${n.id}: épuisé avec progress ${n.progress}`);
      if (n.regrowTicksLeft < 1 || n.regrowTicksLeft > maxRegrowDelay(n.kind)) {
        err(`nœud ${n.id}: regrowTicksLeft hors bornes (${n.regrowTicksLeft})`);
      }
    } else {
      err(`nœud ${n.id}: statut inconnu ${String(n.status)}`);
    }
  });

  // File.
  const byId = new Map<number, Survivor>(state.survivors.map((s) => [s.id, s]));
  if (state.queue.length > QUEUE.maxLength) err(`file trop longue: ${state.queue.length}`);
  if (new Set(state.queue).size !== state.queue.length) err("ids dupliqués dans la file");
  for (const id of state.queue) {
    const s = byId.get(id);
    if (!s) err(`file: survivant ${id} inexistant`);
    else if (s.status !== "toQueue" && s.status !== "queued") err(`file: survivant ${id} au statut ${s.status}`);
  }
  for (const s of state.survivors) {
    const inQueue = state.queue.includes(s.id);
    if ((s.status === "toQueue" || s.status === "queued") !== inQueue) err(`survivant ${s.id} incohérent avec la file`);
  }

  // Survivants ↔ tentes.
  const tentById = new Map(state.tents.map((t) => [t.id, t]));
  const usedTents = new Set<number>();
  const nightNow = isInt(state.tick) && isNight(state.tick);
  for (const s of state.survivors) {
    const needsTent = s.status === "walkingToTent" || s.status === "resting" || s.status === "sleeping";
    if (needsTent !== (s.tentId !== null)) err(`survivant ${s.id}: tentId incohérent avec ${s.status}`);
    // Sommeil ↔ heure ↔ feu (docs/design/day-night.md §5).
    if (s.status === "sleeping" && !nightNow) err(`survivant ${s.id}: endormi de jour`);
    if (s.status === "sleeping" && state.fire.wood === 0) err(`survivant ${s.id}: endormi avec le feu éteint`);
    if (s.status === "resting" && nightNow) err(`survivant ${s.id}: au repos (non endormi) la nuit`);
    if (
      s.status === "resting"
        ? !(isInt(s.restTicksLeft) && s.restTicksLeft > 0 && s.restTicksLeft <= SURVIVOR.restTicks)
        : s.restTicksLeft !== 0
    ) {
      err(`survivant ${s.id}: restTicksLeft invalide (${s.restTicksLeft})`);
    }
    if (s.tentId !== null) {
      if (usedTents.has(s.tentId)) err(`tente ${s.tentId} partagée par plusieurs survivants`);
      usedTents.add(s.tentId);
      const t = tentById.get(s.tentId);
      if (!t || t.occupantId !== s.id) err(`survivant ${s.id} pointe vers une tente qui ne le pointe pas`);
    }
    const w = state.map.width * WORLD.unitsPerTile;
    const h = state.map.height * WORLD.unitsPerTile;
    if (!isInt(s.pos.x) || !isInt(s.pos.y) || s.pos.x < 0 || s.pos.y < 0 || s.pos.x >= w || s.pos.y >= h) {
      err(`survivant ${s.id} hors carte`);
    } else {
      checkSurvivorPath(state, s, err);
    }
  }
  state.survivors.forEach((s, i) => {
    if (i > 0 && !(s.id > (state.survivors[i - 1]?.id ?? 0))) err(`survivants non triés par id (${s.id})`);
  });
  const occupants = new Set<number>();
  for (const t of state.tents) {
    const hasOccupant = t.status === "assigned" || t.status === "occupied";
    if (hasOccupant !== (t.occupantId !== null)) err(`tente ${t.id}: occupantId incohérent avec ${t.status}`);
    if (t.occupantId !== null) {
      if (occupants.has(t.occupantId)) err(`survivant ${t.occupantId} occupe plusieurs tentes`);
      occupants.add(t.occupantId);
      const occ = byId.get(t.occupantId);
      if (occ?.tentId !== t.id) err(`tente ${t.id}: occupant ne la pointe pas`);
      // assigned ⇔ occupant en route ; occupied ⇔ occupant au repos ou endormi.
      const expected = t.status === "occupied" ? ["resting", "sleeping"] : ["walkingToTent"];
      if (occ && !expected.includes(occ.status)) err(`tente ${t.id} (${t.status}): occupant au statut ${occ.status}`);
    }
    // Atteindre TENT.cleanTicks libère la tente et remet à 0 dans le même tick ; seule une tente
    // en désordre a une progression non nulle.
    const maxClean = t.status === "messy" ? TENT.cleanTicks - 1 : 0;
    if (!isInt(t.cleanProgress) || t.cleanProgress < 0 || t.cleanProgress > maxClean) {
      err(`tente ${t.id}: cleanProgress hors bornes (${t.cleanProgress}, ${t.status})`);
    }
  }
  state.tents.forEach((t, i) => {
    if (i > 0 && !(t.id > (state.tents[i - 1]?.id ?? 0))) err(`tentes non triées par id (${t.id})`);
  });

  // Emplacements : exactement ceux de la carte (tuile, coût), dans l'ordre de lecture.
  if (state.buildSlots.length !== SLOT_TILES.length) {
    err(`nombre d'emplacements ${state.buildSlots.length} ≠ ${SLOT_TILES.length}`);
  }
  state.buildSlots.forEach((b, i) => {
    const tile = SLOT_TILES[i];
    if (tile && !sameTile(b.tile, tile)) {
      err(`slot ${b.id}: tuile (${b.tile.tx},${b.tile.ty}) au lieu de (${tile.tx},${tile.ty})`);
    }
    if (b.cost !== BUILD.slotCosts[i]) err(`slot ${b.id}: coût ${b.cost} au lieu de ${String(BUILD.slotCosts[i])}`);
  });
  const builtIds = new Set<number>();
  const expectedTentTiles = new Set<string>(INITIAL_TENT_TILES.map(tileKey));
  for (const b of state.buildSlots) {
    if (!isInt(b.paid) || b.paid < 0 || b.paid > b.cost) err(`slot ${b.id}: paid hors bornes (${b.paid}/${b.cost})`);
    if ((b.builtTentId !== null) !== (b.paid === b.cost)) err(`slot ${b.id}: builtTentId incohérent`);
    if (!isInt(b.payCooldown) || b.payCooldown < 0 || b.payCooldown > MAX_PAY_COOLDOWN) {
      err(`slot ${b.id}: payCooldown hors bornes (${b.payCooldown})`);
    }
    if (b.builtTentId !== null && b.payCooldown !== 0) err(`slot ${b.id}: construit avec payCooldown ${b.payCooldown}`);
    if (b.builtTentId !== null) expectedTentTiles.add(tileKey(b.tile));
    if (b.builtTentId !== null) {
      if (builtIds.has(b.builtTentId)) err(`slot ${b.id}: tente construite partagée`);
      builtIds.add(b.builtTentId);
      const t = tentById.get(b.builtTentId);
      if (!t || !sameTile(t.tile, b.tile)) err(`slot ${b.id}: tente construite introuvable`);
    }
  }
  if (state.tents.length !== INITIAL_TENT_TILES.length + builtIds.size) {
    err(`nombre de tentes ${state.tents.length} ≠ ${INITIAL_TENT_TILES.length} + ${builtIds.size} construites`);
  }
  // Tuiles des tentes = {T de la carte} ∪ {emplacements construits}, sans doublon.
  const tentTiles = new Set<string>();
  for (const t of state.tents) {
    const k = tileKey(t.tile);
    if (!expectedTentTiles.has(k)) err(`tente ${t.id}: tuile (${k}) ni tente initiale ni emplacement construit`);
    if (tentTiles.has(k)) err(`plusieurs tentes sur la tuile (${k})`);
    tentTiles.add(k);
  }

  // Plausibilité : rien ne peut avoir été produit plus vite que PLAUSIBILITY.<res>PerTick.
  // Toutes les ressources : une ressource que rien ne produit (PerTick = 0) ne peut pas dépasser le départ.
  for (const res of RESOURCE_IDS) {
    const held = heldTotal(state, res);
    const max = plausibleMax(state, res);
    if (!(held <= max)) err(`plausibilité ${res}: ${held} détenu > ${max} possible au tick ${state.tick}`);
  }

  // Joueur.
  const p = state.player.pos;
  if (!isInt(p.x) || !isInt(p.y)) err("position joueur non entière");
  else if (hitboxBlocked(state.map, p.x, p.y, PLAYER.halfSize)) err(`joueur dans un obstacle ou hors carte (${p.x},${p.y})`);

  return errors;
}

/**
 * Chemin d'un survivant (position déjà vérifiée entière et dans la carte). Ce que garantissent
 * spawn / survivorMove / welcome / retargetQueue / survivorLifecycle :
 * - chaque tuile du chemin est dans la carte et praticable, deux tuiles consécutives sont 4-adjacentes ;
 * - le survivant se déplace axialement entre centres de tuiles : s'il a un chemin, il est aligné sur un
 *   axe avec le centre de path[0], à une distance dans ]0, 1 tuile] ; sa tuile courante est praticable ;
 * - destination selon le statut : toQueue ⇒ sa place de file (chemin non vide) ; queued ⇒ au centre de
 *   sa place, chemin vide ; walkingToTent ⇒ sa tente (chemin non vide) ; resting / sleeping ⇒ au
 *   centre de sa tente, chemin vide ; leaving ⇒ l'entrée (ou chemin vide, retiré au tick suivant).
 */
function checkSurvivorPath(state: GameState, s: Survivor, err: (m: string) => void): void {
  const tag = `survivant ${s.id}`;
  if (!isWalkable(REF_MAP, tileOf(s.pos))) err(`${tag}: sur une tuile non praticable`);
  let prev: TilePos | null = null;
  for (const t of s.path) {
    if (!isValidTile(t)) {
      err(`${tag}: tuile de chemin hors carte ou non entière`);
      return;
    }
    if (!isWalkable(REF_MAP, t)) err(`${tag}: tuile de chemin (${t.tx},${t.ty}) non praticable`);
    if (prev && Math.abs(prev.tx - t.tx) + Math.abs(prev.ty - t.ty) !== 1) {
      err(`${tag}: chemin non contigu entre (${prev.tx},${prev.ty}) et (${t.tx},${t.ty})`);
    }
    prev = t;
  }
  const first = s.path[0];
  const last = s.path[s.path.length - 1];
  if (first) {
    const c = tileCenter(first);
    const dx = Math.abs(c.x - s.pos.x);
    const dy = Math.abs(c.y - s.pos.y);
    if ((dx !== 0 && dy !== 0) || dx + dy === 0 || dx + dy > U) {
      err(`${tag}: position (${s.pos.x},${s.pos.y}) non alignée sur le pas vers (${first.tx},${first.ty})`);
    }
  }
  const qi = state.queue.indexOf(s.id);
  const qTile = qi >= 0 ? state.map.queueTiles[qi] : undefined;
  const tent = s.tentId === null ? undefined : state.tents.find((t) => t.id === s.tentId);
  switch (s.status) {
    case "toQueue":
      if (!last || !qTile || !sameTile(last, qTile)) err(`${tag}: en route mais pas vers sa place de file`);
      break;
    case "queued":
      if (s.path.length > 0 || !qTile || !atCenter(s.pos, qTile)) err(`${tag}: en file mais pas à sa place`);
      break;
    case "walkingToTent":
      if (tent && (!last || !sameTile(last, tent.tile))) err(`${tag}: en route mais pas vers sa tente`);
      break;
    case "resting":
    case "sleeping":
      if (tent && (s.path.length > 0 || !atCenter(s.pos, tent.tile))) {
        err(`${tag}: ${s.status === "resting" ? "au repos" : "endormi"} hors de sa tente`);
      }
      break;
    case "leaving":
      if (last && !sameTile(last, state.map.entrance)) err(`${tag}: part mais pas vers l'entrée`);
      break;
    default:
      err(`${tag}: statut inconnu ${String(s.status)}`);
  }
}
