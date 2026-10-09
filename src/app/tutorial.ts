// Tutoriel (docs/design/ui-polish.md §1.6). Logique PURE : ne lit que l'état via le core, sans DOM ni
// horloge ; entrées jamais mutées ; même référence renvoyée quand rien ne change. La progression est
// persistée dans les préférences (clé séparée) : aucun effet de jeu.

import {
  CYCLE_TICKS,
  clockInfo,
  cyclePos,
  isNight,
  slotRemaining,
  tileCenter,
  type GameState,
  type Vec,
} from "../core";
import { FIRE, TIME } from "../data/balance";

export type TutorialStepId = "welcome" | "pickupWood" | "cleanTent" | "harvestTree" | "buildTent" | "feedFire";

export const TUTORIAL_STEPS: readonly TutorialStepId[] = Object.freeze([
  "welcome",
  "pickupWood",
  "cleanTent",
  "harvestTree",
  "buildTent",
  "feedFire",
]);

export type TutorialStatus = "pending" | "active" | "done" | "skipped";

export interface TutorialProgress {
  readonly status: TutorialStatus;
  /** Masque des objectifs accomplis (bit i = TUTORIAL_STEPS[i]). */
  readonly done: number;
}

export const ALL_DONE = (1 << TUTORIAL_STEPS.length) - 1;

export function stepBit(step: TutorialStepId): number {
  return 1 << TUTORIAL_STEPS.indexOf(step);
}

export function isStepDone(p: TutorialProgress, step: TutorialStepId): boolean {
  return (p.done & stepBit(step)) !== 0;
}

/** Numéro affiché (1..6) d'une étape. */
export function stepNumber(step: TutorialStepId): number {
  return TUTORIAL_STEPS.indexOf(step) + 1;
}

function woodOnGround(s: Readonly<GameState>): number {
  let n = 0;
  for (const d of s.drops) if (d.resource === "wood") n += d.amount;
  return n;
}

/** Objectifs accomplis par la transition prev → curr (masque). */
export function completedBy(prev: Readonly<GameState>, curr: Readonly<GameState>): number {
  let bits = 0;
  // 1. Un survivant passe de la file à « en route vers sa tente ».
  for (const sv of curr.survivors) {
    if (sv.status !== "walkingToTent") continue;
    const before = prev.survivors.find((o) => o.id === sv.id);
    if (before && before.status === "queued") {
      bits |= stepBit("welcome");
      break;
    }
  }
  // 2. Bois ramassé : stock en hausse et bois au sol en baisse.
  if (curr.resources.wood > prev.resources.wood && woodOnGround(curr) < woodOnGround(prev)) {
    bits |= stepBit("pickupWood");
  }
  // 3. Tente nettoyée.
  for (const t of curr.tents) {
    if (t.status !== "free") continue;
    const before = prev.tents.find((o) => o.id === t.id);
    if (before && before.status === "messy") {
      bits |= stepBit("cleanTent");
      break;
    }
  }
  // 4. Arbre récolté.
  for (const n of curr.nodes) {
    if (n.kind !== "tree" || n.status !== "depleted") continue;
    const before = prev.nodes.find((o) => o.id === n.id);
    if (before && before.status === "ready") {
      bits |= stepBit("harvestTree");
      break;
    }
  }
  // 5. Tente construite.
  for (const b of curr.buildSlots) {
    if (b.builtTentId === null) continue;
    const before = prev.buildSlots.find((o) => o.id === b.id);
    if (before && before.builtTentId === null) {
      bits |= stepBit("buildTent");
      break;
    }
  }
  // 6. Feu alimenté (ou plein).
  if (curr.fire.wood > prev.fire.wood || curr.fire.wood === FIRE.capacity) bits |= stepBit("feedFire");
  return bits;
}

/** Observe un tick joué. Seul le statut `active` progresse ; tous faits ⇒ `done`. */
export function observeTick(
  p: TutorialProgress,
  prev: Readonly<GameState>,
  curr: Readonly<GameState>,
): TutorialProgress {
  if (p.status !== "active") return p;
  const done = (p.done | completedBy(prev, curr)) & ALL_DONE;
  if (done === p.done) return p;
  return { status: done === ALL_DONE ? "done" : "active", done };
}

/** Étape affichée : la première non faite, sauf `feedFire` prioritaire au crépuscule et la nuit. */
export function currentStep(p: TutorialProgress, s: Readonly<GameState>): TutorialStepId | null {
  if (p.status !== "active") return null;
  if (!isStepDone(p, "feedFire")) {
    const light = clockInfo(s as GameState).light;
    if (light === "dusk" || light === "night") return "feedFire";
  }
  for (const step of TUTORIAL_STEPS) if (!isStepDone(p, step)) return step;
  return null;
}

function dist2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function occupiedTent(s: Readonly<GameState>): Vec | null {
  const t = s.tents.find((x) => x.status === "occupied");
  return t ? tileCenter(t.tile) : null;
}

/** Cible de la flèche, en unités du core ; null si rien à montrer. */
export function guideTarget(step: TutorialStepId, s: Readonly<GameState>): Vec | null {
  const player = s.player.pos;
  switch (step) {
    case "welcome":
      return tileCenter(s.map.welcome);
    case "pickupWood": {
      let best: Vec | null = null;
      let bestD = Infinity;
      for (const d of s.drops) {
        if (d.resource !== "wood") continue;
        const dd = dist2(d.pos, player);
        if (dd < bestD) {
          bestD = dd;
          best = { x: d.pos.x, y: d.pos.y };
        }
      }
      return best ?? occupiedTent(s);
    }
    case "cleanTent": {
      const messy = s.tents.find((t) => t.status === "messy");
      return messy ? tileCenter(messy.tile) : occupiedTent(s);
    }
    case "harvestTree": {
      let best: Vec | null = null;
      let bestD = Infinity;
      for (const n of s.nodes) {
        if (n.kind !== "tree" || n.status !== "ready") continue;
        const c = tileCenter(n.tile);
        const dd = dist2(c, player);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      return best;
    }
    case "buildTent": {
      const slot = s.buildSlots.find((b) => b.builtTentId === null);
      return slot ? tileCenter(slot.tile) : null;
    }
    case "feedFire":
      return tileCenter(s.map.fire);
  }
}

export interface TutorialHint {
  /** pickupWood : aucun bois au sol (le survivant se repose avant de payer). */
  waitingForPay: boolean;
  /** buildTent : bois manquant pour terminer le premier emplacement libre (0 = assez). */
  missingWood: number;
  /** feedFire : secondes avant la nuit (null : déjà la nuit). */
  secondsToNight: number | null;
}

export function stepHint(step: TutorialStepId, s: Readonly<GameState>): TutorialHint {
  const hint: TutorialHint = { waitingForPay: false, missingWood: 0, secondsToNight: null };
  if (step === "pickupWood") {
    hint.waitingForPay = !s.drops.some((d) => d.resource === "wood");
  } else if (step === "buildTent") {
    const slot = s.buildSlots.find((b) => b.builtTentId === null);
    if (slot) hint.missingWood = Math.max(0, slotRemaining(slot) - s.resources.wood);
  } else if (step === "feedFire") {
    hint.secondsToNight = isNight(s.tick)
      ? null
      : Math.max(0, Math.ceil((TIME.dayTicks - cyclePos(s.tick)) / TIME.ticksPerSecond));
  }
  return hint;
}

/** Sauvegarde avancée : première nuit passée ou un emplacement construit ⇒ tutoriel sauté. */
export function isAdvancedSave(s: Readonly<GameState>): boolean {
  return s.tick >= CYCLE_TICKS || s.buildSlots.some((b) => b.builtTentId !== null);
}

/** Saut automatique (Continuer, import réussi, reprise du verrou) : pending/active ⇒ skipped. */
export function skipIfAdvanced(p: TutorialProgress, s: Readonly<GameState>): TutorialProgress {
  if ((p.status === "pending" || p.status === "active") && isAdvancedSave(s)) return { status: "skipped", done: p.done };
  return p;
}

/** Premier `play` : pending ⇒ active. */
export function startTutorial(p: TutorialProgress): TutorialProgress {
  return p.status === "pending" ? { status: "active", done: p.done } : p;
}

/** Nouvelle partie : un tutoriel actif repart de zéro (le camp aussi). */
export function restartForNewGame(p: TutorialProgress): TutorialProgress {
  return p.status === "active" && p.done !== 0 ? { status: "active", done: 0 } : p;
}

/** « Passer le tutoriel » confirmé. */
export function skipTutorial(p: TutorialProgress): TutorialProgress {
  return p.status === "done" || p.status === "skipped" ? p : { status: "skipped", done: p.done };
}
