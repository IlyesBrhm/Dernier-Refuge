// Migration v1 → v2 (docs/design/day-night.md §2.2) : jour/nuit, feu de camp, sommeil.
//
// Fonction PURE sur `unknown`, qui ne mute jamais son entrée. Elle ne « répare » rien :
// - une entrée qui n'est pas une v1 bien formée est renvoyée TELLE QUELLE (sans `fire`/`night`), donc
//   refusée par la validation de forme v2 qui suit (`bad_shape`) ;
// - une entrée qui contient déjà `fire` ou `night` n'est pas une v1 : refus (`migration_failed`) ;
// - les seules transformations sont celles qu'impose le passage en v2, et chacune n'est appliquée qu'à un
//   élément cohérent en v1 (sinon refus) ; le résultat passe ensuite par la validation v2 complète
//   (forme stricte + checkInvariants sur la carte v2), comme une sauvegarde native.
//
// Transformations :
// 1. `fire = { wood: FIRE.initialWood, burnedTotal: 0, feedProgress: 0 }` (feu plein, comme une partie neuve ; la
//    plausibilité du core ajoute `FIRE.initialWood` au plafond du bois) et `night` à 0.
// 2. Sommeil : si `tick` tombe la nuit (une v1 a pu dépasser 2400 ticks), chaque `resting` (avec un
//    `restTicksLeft` valide en v1) devient `sleeping`, `restTicksLeft = 0` — exactement ce qu'aurait fait la
//    règle v2 au crépuscule. Le feu migré est plein, donc « dormeur ⇒ feu allumé » tient.
// 3. Carte : la tuile F (9,5), herbe en v1, devient un obstacle.
//    - Joueur dont la hitbox chevauche F : placé au centre de la voisine 4-connexe de F la plus proche
//      (distance euclidienne² au centre ; égalité : N, E, S, O). `input` conservé.
//    - Survivant `toQueue` / `walkingToTent` / `leaving` dont la tuile est F ou dont le chemin passe par F :
//      ancre = sa tuile si ce n'est pas F, sinon la voisine la plus proche (même règle) ; `pos` = centre de
//      l'ancre ; `path` = BFS du core (carte v2) vers sa destination (place de file, tente ou entrée).
//      Déplacement ≤ ½ tuile quand il n'est pas sur F ; jusqu'à 1 tuile s'il est sur F (limite assumée).
//      Chemin v1 incohérent, destination introuvable, ou nouveau chemin impossible/vide ⇒ refus.
//    - Les autres statuts ne sont jamais sur F dans une v1 valide : laissés tels quels (la validation v2 les
//      refusera s'ils y sont).
// Ressources, compteurs, ids, RNG, drops (même sur F) : intacts.

import { FIRE, PLAYER, SURVIVOR, WORLD } from "../data/balance";
import {
  emptyNightStats,
  findPath,
  isNight,
  isWalkable,
  referenceMap,
  sameTile,
  tileCenter,
  tileOf,
  type Survivor,
  type TilePos,
  type Vec,
} from "../core/index";
import { validateSavedStateV1, type SavedState, type SavedStateV1 } from "./schema";

/** Refus typé d'une migration (remonté par `migrate` en `migration_failed`). */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

const MAP = referenceMap();
const F = MAP.fire;
const U = WORLD.unitsPerTile;
const HALF = PLAYER.halfSize;

/** Voisines 4-connexes de F dans l'ordre de départage N, E, S, O. */
const F_NEIGHBOURS: readonly TilePos[] = [
  { tx: F.tx, ty: F.ty - 1 },
  { tx: F.tx + 1, ty: F.ty },
  { tx: F.tx, ty: F.ty + 1 },
  { tx: F.tx - 1, ty: F.ty },
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Praticable sur la carte v1 = carte v2 où F était encore de l'herbe. */
function walkableV1(t: TilePos): boolean {
  return isWalkable(MAP, t) || sameTile(t, F);
}

/** Voisine 4-connexe praticable de F la plus proche de `p` (égalité : N, E, S, O). */
function nearestFireNeighbour(p: Vec): TilePos {
  let best: TilePos | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const t of F_NEIGHBOURS) {
    if (!isWalkable(MAP, t)) continue;
    const c = tileCenter(t);
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  if (!best) throw new MigrationError("aucune voisine praticable du feu de camp");
  return best;
}

/** La hitbox du joueur (chevauchement strict, comme la collision du core) recouvre-t-elle F ? */
function playerOverlapsFire(p: Vec): boolean {
  const x0 = F.tx * U;
  const y0 = F.ty * U;
  return p.x - HALF < x0 + U && p.x + HALF > x0 && p.y - HALF < y0 + U && p.y + HALF > y0;
}

function touchesFire(s: Survivor): boolean {
  return sameTile(tileOf(s.pos), F) || s.path.some((t) => sameTile(t, F));
}

/**
 * Destination v1 du survivant, après vérification que son déplacement en cours était cohérent EN V1
 * (mêmes règles que les invariants du core, carte v1). Incohérent ⇒ refus : on ne recalcule jamais le
 * chemin d'un survivant qui n'était déjà pas valide.
 */
function v1Destination(state: SavedStateV1, s: Survivor): TilePos {
  const fail = (why: string): never => {
    throw new MigrationError(`survivant ${s.id} (${s.status}) sur le trajet du feu : ${why} (refus, aucune réparation)`);
  };
  if (!walkableV1(tileOf(s.pos))) fail("position non praticable en v1");
  let prev: TilePos | null = null;
  for (const t of s.path) {
    if (t.tx >= MAP.width || t.ty >= MAP.height || !walkableV1(t)) fail(`tuile de chemin (${t.tx},${t.ty}) invalide en v1`);
    if (prev && Math.abs(prev.tx - t.tx) + Math.abs(prev.ty - t.ty) !== 1) fail("chemin v1 non contigu");
    prev = t;
  }
  const first = s.path[0];
  if (first) {
    const c = tileCenter(first);
    const dx = Math.abs(c.x - s.pos.x);
    const dy = Math.abs(c.y - s.pos.y);
    if ((dx !== 0 && dy !== 0) || dx + dy === 0 || dx + dy > U) fail("position non alignée sur le chemin v1");
  }
  const last = s.path[s.path.length - 1];
  switch (s.status) {
    case "toQueue": {
      const qi = state.queue.indexOf(s.id);
      const q = qi >= 0 ? MAP.queueTiles[qi] : undefined;
      if (!q) return fail("place de file introuvable");
      if (!last || !sameTile(last, q)) fail("chemin v1 ne menant pas à sa place de file");
      return q;
    }
    case "walkingToTent": {
      const tent = s.tentId === null ? undefined : state.tents.find((t) => t.id === s.tentId);
      if (!tent) return fail("tente introuvable");
      if (!last || !sameTile(last, tent.tile)) fail("chemin v1 ne menant pas à sa tente");
      return tent.tile;
    }
    case "leaving":
      if (last && !sameTile(last, MAP.entrance)) fail("chemin v1 ne menant pas à l'entrée");
      return MAP.entrance;
    default:
      return fail("statut non déplaçable");
  }
}

function moveSurvivor(state: SavedStateV1, s: Survivor): Survivor {
  const dest = v1Destination(state, s);
  const here = tileOf(s.pos);
  const anchor = sameTile(here, F) ? nearestFireNeighbour(s.pos) : here;
  const path = findPath(MAP, anchor, dest);
  if (!path || path.length === 0) {
    throw new MigrationError(
      `survivant ${s.id} (${s.status}) : aucun chemin v2 de (${anchor.tx},${anchor.ty}) vers (${dest.tx},${dest.ty})`,
    );
  }
  return { ...s, pos: tileCenter(anchor), path };
}

/** migrations[1] : état brut v1 → état brut v2. Pure, ne mute pas `raw`. Lève `MigrationError` si refus. */
export function migrateV1toV2(raw: unknown): unknown {
  // Pas un objet : laissé tel quel, la validation de forme le refusera.
  if (!isPlainObject(raw)) return raw;
  if (Object.hasOwn(raw, "fire") || Object.hasOwn(raw, "night")) {
    throw new MigrationError("une sauvegarde v1 ne peut pas contenir `fire` ni `night` (fichier incohérent)");
  }
  // v1 mal formée : renvoyée telle quelle (sans fire/night) ⇒ bad_shape garanti à la validation v2.
  // On ne la transforme pas : ses types ne sont pas sûrs et la migrer pourrait la rendre valide.
  if (validateSavedStateV1(raw).length > 0) return raw;
  const v1 = raw as unknown as SavedStateV1;

  const night = isNight(v1.tick);
  const survivors = v1.survivors.map((s): Survivor => {
    if (
      night &&
      s.status === "resting" &&
      s.restTicksLeft > 0 &&
      s.restTicksLeft <= SURVIVOR.restTicks
    ) {
      return { ...s, pos: { ...s.pos }, path: [], status: "sleeping", restTicksLeft: 0 };
    }
    if ((s.status === "toQueue" || s.status === "walkingToTent" || s.status === "leaving") && touchesFire(s)) {
      return moveSurvivor(v1, s);
    }
    return { ...s, pos: { ...s.pos }, path: s.path.map((t) => ({ ...t })) };
  });

  const p = v1.player;
  const player = {
    pos: playerOverlapsFire(p.pos) ? tileCenter(nearestFireNeighbour(p.pos)) : { ...p.pos },
    input: { ...p.input },
  };

  // Feu plein, jamais brûlé, aucune alimentation en cours.
  const fire = { wood: FIRE.initialWood, burnedTotal: 0, feedProgress: 0 };
  const v2: SavedState = {
    ...v1,
    player,
    survivors,
    fire,
    night: emptyNightStats(),
  };
  return v2;
}
