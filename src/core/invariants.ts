// Invariants anti-triche / cohérence (docs/design/core-loop.md §5). Liste vide = état valide.

import {
  MAP_LAYOUT,
  NODES,
  PLAYER,
  QUEUE,
  RESOURCES,
  STARTING_RESOURCES,
  TENT,
  WELCOME,
  WORLD,
  type NodeKind,
} from "../data/balance";
import { hitboxBlocked } from "./collision";
import { maxRegrowDelay } from "./harvest-rules";
import { parseMap, sameTile, tileAt, tileOf } from "./map";
import type { GameState, Survivor } from "./state";

const PARSED_LAYOUT = parseMap(MAP_LAYOUT);
/** Carte de référence, calculée une seule fois au chargement du module. */
const REF_MAP = PARSED_LAYOUT.map;
const INITIAL_TENT_COUNT = PARSED_LAYOUT.tentTiles.length;
const EXPECTED_NODES = PARSED_LAYOUT.nodes;
/** Ressources possibles d'un drop = ressources produites par les nœuds + récompense des survivants (bois). */
const DROP_RESOURCES = new Set<string>(["wood", ...Object.values(NODES).map((n) => n.resource)]);

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
