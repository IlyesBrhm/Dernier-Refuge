// Scénarios jour/nuit pour les e2e et les captures (docs/design/day-night.md §6.4). Pas un fichier de
// test. Construits avec le core UNIQUEMENT (seed fixe, joueur piloté par commandes `setMoveInput` +
// `tick`, invariants vérifiés à chaque tick), puis encodés avec src/save : la page les importe par le
// menu. Partagé par Playwright (render-3d.spec.ts, captures.spec.ts) et Vitest
// (daynight-scenario.test.ts). Aucune dépendance à Vitest ni à Playwright ici (pas d'`expect`).
//
// Deux parties jouées depuis createInitialState(seed) :
// - bot « attentif » (entretient le feu, tests/core/helpers.ts) : jour (1200), crépuscule (2250),
//   nuit feu allumé avec dormeurs (≥ 2900), aube (3602, bilan de la nuit 1) ;
// - bot « ignorant » (ne va jamais au feu) : nuit, feu qui faiblit (≥ 2700), puis nuit feu éteint
//   (3200) après le départ au froid des dormeurs, joueur ramené à côté de l'accueil (W) : l'accueil est
//   fermé jusqu'à l'aube (welcomeBlockReason = "coldLeavers", « Fermé / jusqu'à l'aube »).
// Troisième partie, joueur immobile (n'accueille personne) : personne ne dort quand le feu s'éteint,
// donc aucun départ au froid ; nuit feu éteint (3200), joueur à côté de W : welcomeBlockReason =
// "fireOut", « Feu éteint » sur le tapis.

import { FIRE } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { checkInvariants } from "../../src/core/invariants";
import { sameTile, tileOf } from "../../src/core/map";
import {
  clockInfo,
  isFireLit,
  isFireLow,
  nightReport,
  sleepersCount,
  welcomeBlockedByCold,
  welcomeBlockReason,
  type NightReport,
} from "../../src/core/selectors";
import type { WelcomeBlockReason } from "../../src/core/systems/welcome";
import { createInitialState, type GameState, type TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import type { LightPhase } from "../../src/core/time";
import { exportSave } from "../../src/save/index";
import { attentiveFireGoal, botGoal, steer } from "../core/helpers";
import { hudExpect, type HudExpect } from "./hud-expect";

/** Seed fixe des scénarios (même seed que les autres captures). */
export const DAYNIGHT_SEED = 7;
/** Horodatage fixe des sauvegardes (informatif) : textes exportés reproductibles. */
export const DAYNIGHT_SAVED_AT = Date.UTC(2026, 0, 1);

export const DAYNIGHT_KEYS = ["day", "dusk", "nightLit", "nightLow", "nightOut", "nightFireOut", "dawn"] as const;
export type DayNightKey = (typeof DAYNIGHT_KEYS)[number];
/** Les 5 états du budget de draw calls (le 6e, nightLow, ne sert qu'à l'alerte « Le feu faiblit »). */
export const BUDGET_KEYS: readonly DayNightKey[] = ["day", "dusk", "nightLit", "nightOut", "dawn"];

/** Ce que la page doit afficher pour un état importé (horloge gelée : aucun tick après l'import). */
export interface DayNightExpect {
  /** Texte du HUD « Jour N ». */
  dayLabel: string;
  /** aria-label de l'icône soleil/lune. */
  sky: "Jour" | "Nuit";
  /** Sous-phase de lumière (`__render3d.info().light`). */
  light: LightPhase;
  /** Lumière qui porte l'ombre (`__render3d.info().shadow`). */
  shadow: "sun" | "fire";
  fireWood: number;
  fireLit: boolean;
  fireLow: boolean;
  /** Accueil fermé la nuit (= welcomeBlockReason ≠ null). */
  blockedByCold: boolean;
  /**
   * Raison de fermeture (welcomeBlockReason du core) : "coldLeavers" (prioritaire) ⇒ « Fermé / jusqu'à
   * l'aube » sur W ; "fireOut" ⇒ « Feu éteint » ; null ⇒ accueil ouvert.
   */
  blockReason: WelcomeBlockReason | null;
  /** Dormeurs (HUD, affiché la nuit seulement). */
  sleepers: number;
  isNight: boolean;
  /** Bilan affiché par #dawn-report (aube seulement), sinon null. */
  report: NightReport | null;
  /** Textes accessibles du HUD (contrat `data-hud`, docs/design/ui-polish.md §1.8). */
  hud: HudExpect;
}

export interface DayNightCase {
  key: DayNightKey;
  /** État exporté (entrée du joueur 0,0). */
  state: GameState;
  /** Texte de sauvegarde (exportSave) à importer dans la page. */
  saveText: string;
  expect: DayNightExpect;
}

export type DayNightScenarios = Record<DayNightKey, DayNightCase>;

/** Pilote : uniquement des commandes validées + tick ; invariants vérifiés après chaque tick. */
class Driver {
  s: GameState;
  constructor(seed: number) {
    this.s = createInitialState(seed);
  }

  input(dx: number, dy: number): void {
    if (dx === this.s.player.input.dx && dy === this.s.player.input.dy) return;
    const r = applyCommand(this.s, { type: "setMoveInput", dx, dy });
    if (!r.ok) throw new Error(`setMoveInput(${dx},${dy}) refusée au tick ${this.s.tick} : ${r.error}`);
    this.s = r.state;
  }

  step(): void {
    this.s = tick(this.s);
    const v = checkInvariants(this.s);
    if (v.length > 0) throw new Error(`invariants violés au tick ${this.s.tick} : ${v.join(" ; ")}`);
  }

  /** Un pas de bot : direction vers `goal(s)` (commande si elle change), puis tick. */
  botStep(goal: (s: GameState) => TilePos): void {
    const want = steer(this.s, goal(this.s));
    this.input(want.dx, want.dy);
    this.step();
  }

  /** Rejoint `target` puis s'arrête (entrée 0,0). */
  walk(target: TilePos, max = 400): void {
    for (let i = 0; ; i++) {
      const want = steer(this.s, target);
      this.input(want.dx, want.dy);
      if (sameTile(tileOf(this.s.player.pos), target)) break;
      if (i > max) throw new Error(`(${target.tx},${target.ty}) non atteinte en ${max} ticks (tick ${this.s.tick})`);
      this.step();
    }
    this.input(0, 0);
  }

  /** Copie de l'état courant, joueur arrêté (commande validée, sans tick). */
  snapshot(): GameState {
    if (this.s.player.input.dx === 0 && this.s.player.input.dy === 0) return this.s;
    const r = applyCommand(this.s, { type: "setMoveInput", dx: 0, dy: 0 });
    if (!r.ok) throw new Error(`arrêt refusé au tick ${this.s.tick} : ${r.error}`);
    const v = checkInvariants(r.state);
    if (v.length > 0) throw new Error(`instantané invalide au tick ${this.s.tick} : ${v.join(" ; ")}`);
    return r.state;
  }
}

const attentive = (s: GameState): TilePos => attentiveFireGoal(s) ?? botGoal(s);
const ignorant = (s: GameState): TilePos => botGoal(s);

/** Valeurs attendues à l'écran, dérivées des sélecteurs du core. */
export function expectedFor(s: GameState): DayNightExpect {
  const clock = clockInfo(s);
  const night = clock.phase === "night";
  return {
    dayLabel: `Jour ${clock.day}`,
    sky: night ? "Nuit" : "Jour",
    light: clock.light,
    shadow: night ? "fire" : "sun",
    fireWood: s.fire.wood,
    fireLit: isFireLit(s),
    fireLow: isFireLow(s),
    blockedByCold: welcomeBlockedByCold(s),
    blockReason: welcomeBlockReason(s),
    sleepers: sleepersCount(s),
    isNight: night,
    report: clock.light === "dawn" ? nightReport(s) : null,
    hud: hudExpect(s),
  };
}

function makeCase(key: DayNightKey, state: GameState, seed: number): DayNightCase {
  const enc = exportSave(state, { seed, savedAt: DAYNIGHT_SAVED_AT });
  if (!enc.ok) throw new Error(`${key} : exportSave refusé : ${enc.error} ${enc.details.join(" ; ")}`);
  return { key, state, saveText: enc.text, expect: expectedFor(state) };
}

/** Avance le bot jusqu'au tick `t` exactement. */
function until(d: Driver, goal: (s: GameState) => TilePos, t: number): void {
  if (d.s.tick > t) throw new Error(`tick ${t} déjà dépassé (${d.s.tick})`);
  while (d.s.tick < t) d.botStep(goal);
}

/** Avance le bot jusqu'au premier tick ≥ from où `pred` est vrai, au plus jusqu'à `to`. */
function firstFrom(d: Driver, goal: (s: GameState) => TilePos, from: number, to: number, label: string, pred: (s: GameState) => boolean): void {
  until(d, goal, from);
  while (!pred(d.snapshot())) {
    if (d.s.tick >= to) throw new Error(`scénario : « ${label} » introuvable sur [${from}, ${to}]`);
    d.botStep(goal);
  }
}

/** Ce que chaque capture doit montrer ; liste vide = OK. */
export function dayNightProblems(c: DayNightCase): string[] {
  const s = c.state;
  const e = c.expect;
  const out: string[] = [];
  const need = (ok: boolean, what: string): void => {
    if (!ok) out.push(`${c.key} : ${what}`);
  };
  need(s.player.input.dx === 0 && s.player.input.dy === 0, "joueur en mouvement");
  switch (c.key) {
    case "day":
      need(e.light === "day" && !e.isNight, `phase ${e.light}`);
      need(e.fireLit, "feu éteint");
      break;
    case "dusk":
      need(e.light === "dusk", `phase ${e.light}`);
      need(e.fireLit, "feu éteint");
      break;
    case "nightLit":
      need(e.light === "night", `phase ${e.light}`);
      need(e.fireLit && !e.fireLow, `feu ${e.fireWood} (allumé, pas faible attendu)`);
      need(e.sleepers >= 1, "aucun dormeur");
      need(s.night.woodBurned > 0, "aucun bois brûlé cette nuit");
      need(!e.blockedByCold, "accueil suspendu");
      break;
    case "nightLow":
      need(e.light === "night", `phase ${e.light}`);
      need(e.fireLow, `feu ${e.fireWood} pas faible`);
      need(e.sleepers >= 1, "aucun dormeur");
      break;
    case "nightOut":
      need(e.light === "night", `phase ${e.light}`);
      need(e.fireWood === 0 && e.blockedByCold, `feu ${e.fireWood} (éteint attendu)`);
      need(e.sleepers === 0, "dormeur avec un feu éteint");
      need(s.night.coldLeavers >= 1, "aucun départ au froid");
      need(e.blockReason === "coldLeavers", `raison ${String(e.blockReason)} (coldLeavers attendu)`);
      need(s.queue.length >= 1, "file vide (l'accueil suspendu ne se voit pas)");
      need(Math.max(Math.abs(tileOf(s.player.pos).tx - s.map.welcome.tx), Math.abs(tileOf(s.player.pos).ty - s.map.welcome.ty)) <= 1, "joueur loin de W");
      break;
    case "nightFireOut":
      need(e.light === "night", `phase ${e.light}`);
      need(e.fireWood === 0 && e.blockedByCold, `feu ${e.fireWood} (éteint attendu)`);
      need(e.sleepers === 0, "dormeur avec un feu éteint");
      need(s.night.coldLeavers === 0, `${s.night.coldLeavers} départ(s) au froid (aucun attendu)`);
      need(e.blockReason === "fireOut", `raison ${String(e.blockReason)} (fireOut attendu)`);
      need(s.queue.length >= 1, "file vide (l'accueil suspendu ne se voit pas)");
      need(Math.max(Math.abs(tileOf(s.player.pos).tx - s.map.welcome.tx), Math.abs(tileOf(s.player.pos).ty - s.map.welcome.ty)) <= 1, "joueur loin de W");
      break;
    case "dawn":
      need(e.light === "dawn", `phase ${e.light}`);
      need(e.report !== null && e.report.night === 1, "pas de bilan de la nuit 1");
      need((e.report?.sleepersPaid ?? 0) >= 1, "aucun dormeur payé à l'aube");
      need(s.tents.some((t) => t.status === "messy"), "aucune tente en désordre");
      break;
  }
  if (e.fireWood < 0 || e.fireWood > FIRE.capacity) out.push(`${c.key} : feu hors bornes`);
  return out;
}

/** Construit les 6 états (déterministe : même seed ⇒ mêmes états et mêmes textes). */
export function buildDayNightScenarios(seed = DAYNIGHT_SEED): DayNightScenarios {
  // Partie 1 : bot attentif.
  const a = new Driver(seed);
  until(a, attentive, 1200);
  const day = makeCase("day", a.snapshot(), seed);
  until(a, attentive, 2250);
  const dusk = makeCase("dusk", a.snapshot(), seed);
  firstFrom(a, attentive, 2900, 3400, "nuit, feu allumé (non faible), dormeurs", (s) => {
    return isFireLit(s) && !isFireLow(s) && sleepersCount(s) >= 1 && s.night.woodBurned > 0;
  });
  const nightLit = makeCase("nightLit", a.snapshot(), seed);
  until(a, attentive, 3602);
  const dawn = makeCase("dawn", a.snapshot(), seed);

  // Partie 2 : bot ignorant (ne va jamais au feu).
  const b = new Driver(seed);
  firstFrom(b, ignorant, 2700, 2990, "nuit, feu qui faiblit, dormeurs", (s) => isFireLow(s) && sleepersCount(s) >= 1);
  const nightLow = makeCase("nightLow", b.snapshot(), seed);
  until(b, ignorant, 3200);
  if (b.s.fire.wood !== 0) throw new Error(`bot ignorant : feu à ${b.s.fire.wood} au tick 3200 (éteint attendu)`);
  b.walk({ tx: 8, ty: 8 });
  const nightOut = makeCase("nightOut", b.snapshot(), seed);

  // Partie 3 : joueur immobile sur P (n'accueille personne : aucune tente occupée, aucun dormeur).
  const c = new Driver(seed);
  while (c.s.tick < 3200) c.step();
  if (c.s.fire.wood !== 0) throw new Error(`joueur immobile : feu à ${c.s.fire.wood} au tick 3200 (éteint attendu)`);
  c.walk({ tx: 8, ty: 8 });
  const nightFireOut = makeCase("nightFireOut", c.snapshot(), seed);

  const all: DayNightScenarios = { day, dusk, nightLit, nightLow, nightOut, nightFireOut, dawn };
  const problems = DAYNIGHT_KEYS.flatMap((k) => dayNightProblems(all[k]));
  if (problems.length > 0) throw new Error(`scénarios jour/nuit (seed ${seed}) incomplets : ${problems.join(" ; ")}`);
  return all;
}
