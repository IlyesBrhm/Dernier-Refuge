// Validation de FORME stricte de l'état sauvegardé v1, écrite à la main (aucune dépendance).
// Vérifiée AVANT les invariants du core (qui supposent des types corrects) : types exacts, entiers sûrs,
// enums exacts, objets stricts (clé manquante ou inconnue = erreur, `__proto__` refusé), tailles max.
// Ne répare rien : renvoie la liste des erreurs (vide = forme valide).

import { WORLD } from "../data/balance";
import {
  referenceMap,
  type DropResource,
  type GameState,
  type NodeKind,
  type NodeStatus,
  type ResourceId,
  type SurvivorStatus,
  type TentStatus,
} from "../core/index";
import { SAVE_CONFIG } from "./config";

/** Ce qui est sérialisé : tout l'état sauf la carte (statique, reconstruite au chargement). */
export type SavedStateV1 = Omit<GameState, "map">;

type Validator = (v: unknown, path: string, errs: string[]) => void;

function push(errs: string[], msg: string): void {
  if (errs.length < SAVE_CONFIG.maxShapeErrors) errs.push(msg);
  else if (errs.length === SAVE_CONFIG.maxShapeErrors) errs.push("… (erreurs suivantes tronquées)");
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "tableau";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return JSON.stringify(v.length > 20 ? `${v.slice(0, 20)}…` : v);
  return typeof v;
}

// --- Combinateurs ----------------------------------------------------------------------------

export function int(min: number = -Number.MAX_SAFE_INTEGER, max: number = Number.MAX_SAFE_INTEGER): Validator {
  return (v, path, errs) => {
    if (typeof v !== "number" || !Number.isSafeInteger(v)) push(errs, `${path}: entier sûr attendu (${describe(v)})`);
    else if (v < min || v > max) push(errs, `${path}: hors bornes [${min}, ${max}] (${v})`);
  };
}

export function literal(...values: readonly (string | number)[]): Validator {
  return (v, path, errs) => {
    if (!values.some((x) => x === v)) push(errs, `${path}: valeur inattendue (${describe(v)})`);
  };
}

/** Alias lisible pour les enums de chaînes. */
export const oneOf = (values: readonly string[]): Validator => literal(...values);

export function nullable(inner: Validator): Validator {
  return (v, path, errs) => {
    if (v !== null) inner(v, path, errs);
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Objet strict : exactement les clés de `shape` (propriétés propres), ni plus ni moins. */
export function obj(shape: Readonly<Record<string, Validator>>): Validator {
  return (v, path, errs) => {
    if (!isPlainObject(v)) {
      push(errs, `${path}: objet attendu (${describe(v)})`);
      return;
    }
    for (const k of Object.keys(v)) {
      if (k === "__proto__" || !Object.hasOwn(shape, k)) push(errs, `${path}.${k}: clé inconnue`);
    }
    for (const k of Object.keys(shape)) {
      const check = shape[k];
      if (!check) continue;
      if (!Object.hasOwn(v, k)) {
        push(errs, `${path}.${k}: clé manquante`);
        continue;
      }
      const desc = Object.getOwnPropertyDescriptor(v, k);
      if (!desc || !("value" in desc)) {
        push(errs, `${path}.${k}: accesseur refusé`);
        continue;
      }
      check(desc.value, `${path}.${k}`, errs);
    }
  };
}

export function arr(item: Validator, maxLen: number): Validator {
  return (v, path, errs) => {
    if (!Array.isArray(v)) {
      push(errs, `${path}: tableau attendu (${describe(v)})`);
      return;
    }
    if (v.length > maxLen) {
      push(errs, `${path}: ${v.length} éléments > ${maxLen}`);
      return;
    }
    for (let i = 0; i < v.length; i++) {
      if (errs.length > SAVE_CONFIG.maxShapeErrors) return;
      item(v[i], `${path}[${i}]`, errs);
    }
  };
}

// --- Enums (vérifiés exhaustifs à la compilation) ---------------------------------------------

type Exhaustive<All, Listed> = [Exclude<All, Listed>] extends [never] ? true : false;

const SURVIVOR_STATUSES = ["toQueue", "queued", "walkingToTent", "resting", "leaving"] as const satisfies readonly SurvivorStatus[];
const TENT_STATUSES = ["free", "assigned", "occupied", "messy"] as const satisfies readonly TentStatus[];
const NODE_STATUSES = ["ready", "depleted"] as const satisfies readonly NodeStatus[];
const NODE_KINDS = ["tree", "bush"] as const satisfies readonly NodeKind[];
const DROP_RESOURCES = ["wood", "food"] as const satisfies readonly DropResource[];

// Si un de ces `true` ne compile plus, un enum du core a gagné une valeur : mettre à jour la liste
// (et donc la version de sauvegarde si l'ancienne forme ne l'acceptait pas).
const _exhaustive: [
  Exhaustive<SurvivorStatus, (typeof SURVIVOR_STATUSES)[number]>,
  Exhaustive<TentStatus, (typeof TENT_STATUSES)[number]>,
  Exhaustive<NodeStatus, (typeof NODE_STATUSES)[number]>,
  Exhaustive<NodeKind, (typeof NODE_KINDS)[number]>,
  Exhaustive<DropResource, (typeof DROP_RESOURCES)[number]>,
] = [true, true, true, true, true];
void _exhaustive;

// --- Schéma v1 ----------------------------------------------------------------------------------

const MAP = referenceMap();
const U = WORLD.unitsPerTile;
const L = SAVE_CONFIG.limits;

const id = int(1);
const posX = int(0, MAP.width * U - 1);
const posY = int(0, MAP.height * U - 1);
const vec = obj({ x: posX, y: posY });
const tilePos = obj({ tx: int(0, MAP.width - 1), ty: int(0, MAP.height - 1) });
const axis = literal(-1, 0, 1);

const RESOURCE_SHAPE: Record<ResourceId, Validator> = {
  wood: int(),
  food: int(),
  stone: int(),
  water: int(),
  coins: int(),
};

const STATE_SHAPE: { [K in keyof SavedStateV1]-?: Validator } = {
  tick: int(0),
  rng: int(0, 0xffffffff),
  nextId: int(1),
  player: obj({ pos: vec, input: obj({ dx: axis, dy: axis }) }),
  resources: obj(RESOURCE_SHAPE),
  queue: arr(id, L.queue),
  survivors: arr(
    obj({
      id,
      pos: vec,
      status: oneOf(SURVIVOR_STATUSES),
      path: arr(tilePos, L.path),
      tentId: nullable(id),
      restTicksLeft: int(),
    }),
    L.survivors,
  ),
  tents: arr(
    obj({ id, tile: tilePos, status: oneOf(TENT_STATUSES), occupantId: nullable(id), cleanProgress: int() }),
    L.tents,
  ),
  drops: arr(obj({ id, pos: vec, resource: oneOf(DROP_RESOURCES), amount: int() }), L.drops),
  buildSlots: arr(
    obj({ id, tile: tilePos, cost: int(), paid: int(), builtTentId: nullable(id), payCooldown: int() }),
    L.buildSlots,
  ),
  spawnTimer: int(),
  welcomeProgress: int(),
  commandsThisTick: int(),
  nodes: arr(
    obj({
      id,
      kind: oneOf(NODE_KINDS),
      tile: tilePos,
      status: oneOf(NODE_STATUSES),
      progress: int(),
      regrowTicksLeft: int(),
    }),
    L.nodes,
  ),
};

const validateRoot = obj(STATE_SHAPE);

/** Erreurs de forme de l'état v1 (chemins type `survivors[3].pos.x`). Vide = forme valide. Ne lève pas. */
export function validateSavedStateV1(raw: unknown): string[] {
  const errs: string[] = [];
  validateRoot(raw, "state", errs);
  return errs;
}
