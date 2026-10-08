// Invariants anti-triche / cohérence (docs/design/core-loop.md §5). Liste vide = état valide.

import { MAP_LAYOUT, PLAYER, QUEUE, RESOURCES, TENT, WELCOME, WORLD } from "../data/balance";
import { hitboxBlocked } from "./collision";
import { parseMap, sameTile, tileOf } from "./map";
import type { GameState, Survivor } from "./state";

const INITIAL_TENT_COUNT = parseMap(MAP_LAYOUT).tentTiles.length;

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}

export function checkInvariants(state: GameState): string[] {
  const errors: string[] = [];
  const err = (m: string): void => {
    errors.push(m);
  };

  // Temps, compteurs.
  if (!isInt(state.tick) || state.tick < 0) err(`tick invalide: ${state.tick}`);
  if (!isInt(state.spawnTimer) || state.spawnTimer < 0) err(`spawnTimer invalide: ${state.spawnTimer}`);
  if (!isInt(state.nextId) || state.nextId < 1) err(`nextId invalide: ${state.nextId}`);
  if (!isInt(state.commandsThisTick) || state.commandsThisTick < 0) err("commandsThisTick invalide");
  if (!isInt(state.welcomeProgress) || state.welcomeProgress < 0 || state.welcomeProgress > WELCOME.ticks) {
    err(`welcomeProgress hors bornes: ${state.welcomeProgress}`);
  }

  // Ressources.
  for (const [k, v] of Object.entries(state.resources)) {
    if (!isInt(v) || v < 0 || v > RESOURCES.cap) err(`ressource ${k} invalide: ${v}`);
  }

  // Ids uniques et < nextId.
  const ids = [
    ...state.survivors.map((s) => s.id),
    ...state.tents.map((t) => t.id),
    ...state.drops.map((d) => d.id),
    ...state.buildSlots.map((b) => b.id),
  ];
  const seen = new Set<number>();
  for (const id of ids) {
    if (!isInt(id) || id < 1 || id >= state.nextId) err(`id invalide: ${id}`);
    if (seen.has(id)) err(`id dupliqué: ${id}`);
    seen.add(id);
  }

  // Drops.
  const dropTiles = new Set<string>();
  for (const d of state.drops) {
    // Pas de plafond sur un tas au sol (RESOURCES.cap ne s'applique qu'au stock).
    if (!isInt(d.amount) || d.amount < 1) err(`drop ${d.id} montant invalide: ${d.amount}`);
    const t = tileOf(d.pos);
    const key = `${t.tx},${t.ty}`;
    if (dropTiles.has(key)) err(`plusieurs drops sur la tuile ${key}`);
    dropTiles.add(key);
  }

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
  for (const s of state.survivors) {
    const needsTent = s.status === "walkingToTent" || s.status === "resting";
    if (needsTent !== (s.tentId !== null)) err(`survivant ${s.id}: tentId incohérent avec ${s.status}`);
    if (s.status === "resting" ? !(isInt(s.restTicksLeft) && s.restTicksLeft > 0) : s.restTicksLeft !== 0) {
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
    }
  }
  const occupants = new Set<number>();
  for (const t of state.tents) {
    const hasOccupant = t.status === "assigned" || t.status === "occupied";
    if (hasOccupant !== (t.occupantId !== null)) err(`tente ${t.id}: occupantId incohérent avec ${t.status}`);
    if (t.occupantId !== null) {
      if (occupants.has(t.occupantId)) err(`survivant ${t.occupantId} occupe plusieurs tentes`);
      occupants.add(t.occupantId);
      if (byId.get(t.occupantId)?.tentId !== t.id) err(`tente ${t.id}: occupant ne la pointe pas`);
    }
    if (!isInt(t.cleanProgress) || t.cleanProgress < 0 || t.cleanProgress > TENT.cleanTicks) {
      err(`tente ${t.id}: cleanProgress hors bornes (${t.cleanProgress})`);
    }
  }

  // Emplacements.
  const builtIds = new Set<number>();
  for (const b of state.buildSlots) {
    if (!isInt(b.paid) || b.paid < 0 || b.paid > b.cost) err(`slot ${b.id}: paid hors bornes (${b.paid}/${b.cost})`);
    if ((b.builtTentId !== null) !== (b.paid === b.cost)) err(`slot ${b.id}: builtTentId incohérent`);
    if (!isInt(b.payCooldown) || b.payCooldown < 0) err(`slot ${b.id}: payCooldown invalide`);
    if (b.builtTentId !== null) {
      if (builtIds.has(b.builtTentId)) err(`slot ${b.id}: tente construite partagée`);
      builtIds.add(b.builtTentId);
      const t = tentById.get(b.builtTentId);
      if (!t || !sameTile(t.tile, b.tile)) err(`slot ${b.id}: tente construite introuvable`);
    }
  }
  if (state.tents.length !== INITIAL_TENT_COUNT + builtIds.size) {
    err(`nombre de tentes ${state.tents.length} ≠ ${INITIAL_TENT_COUNT} + ${builtIds.size} construites`);
  }

  // Joueur.
  const p = state.player.pos;
  if (!isInt(p.x) || !isInt(p.y)) err("position joueur non entière");
  else if (hitboxBlocked(state.map, p.x, p.y, PLAYER.halfSize)) err(`joueur dans un obstacle ou hors carte (${p.x},${p.y})`);

  return errors;
}
