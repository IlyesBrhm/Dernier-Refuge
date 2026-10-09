// États pour les e2e de l'interface (tests/e2e/ui.spec.ts, captures). Pas un fichier de test.
// Construits avec le core UNIQUEMENT (seed fixe, commandes `setMoveInput` + `tick`, invariants vérifiés),
// encodés avec src/save : la page les importe par la pause. Vérifiés sous Vitest (ui-scenario.test.ts).
//
// - preLow : nuit, feu à lowWood + 1, 5 ticks avant une combustion ⇒ « Le feu faiblit » 0,5 s après
//   la reprise (toast warning, clé fireLow) ;
// - preOut : nuit, feu à 1, 5 ticks avant une combustion ⇒ « Le feu est éteint » 0,5 s après la reprise
//   (toast danger, clé fireOut) ;
// - bigStock : 9 999 bois et 9 999 nourriture (plafond), de jour (largeur maximale des compteurs du HUD).

import { FIRE } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { checkInvariants } from "../../src/core/invariants";
import { sleepersCount } from "../../src/core/selectors";
import { cloneState, createInitialState, type GameState } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { CYCLE_TICKS, cyclePos, isNight } from "../../src/core/time";
import { exportSave } from "../../src/save/index";
import { botGoal, plausibleTick, steer } from "../core/helpers";
import { hudExpect, type HudExpect } from "./hud-expect";

export const UI_SEED = 7;
export const UI_SAVED_AT = Date.UTC(2026, 0, 2);

export interface UiCase {
  key: "preLow" | "preOut" | "bigStock";
  state: GameState;
  saveText: string;
  /** Ticks à jouer après l'import avant l'événement attendu (0 si aucun). */
  ticksToEvent: number;
  hud: HudExpect;
}

function invariantsOk(s: GameState, what: string): void {
  const v = checkInvariants(s);
  if (v.length > 0) throw new Error(`${what} : invariants violés au tick ${s.tick} : ${v.join(" ; ")}`);
}

function stopped(s: GameState): GameState {
  if (s.player.input.dx === 0 && s.player.input.dy === 0) return s;
  const r = applyCommand(s, { type: "setMoveInput", dx: 0, dy: 0 });
  if (!r.ok) throw new Error(`arrêt refusé au tick ${s.tick} : ${r.error}`);
  invariantsOk(r.state, "arrêt");
  return r.state;
}

/** Bot « ignorant » (ne va jamais au feu) jusqu'au premier état (joueur arrêté) qui vérifie `pred`. */
function ignorantUntil(seed: number, maxTick: number, label: string, pred: (s: GameState) => boolean): GameState {
  let s = createInitialState(seed);
  while (s.tick <= maxTick) {
    const snap = stopped(s);
    if (pred(snap)) return snap;
    const want = steer(s, botGoal(s));
    if (want.dx !== s.player.input.dx || want.dy !== s.player.input.dy) {
      const r = applyCommand(s, { type: "setMoveInput", dx: want.dx, dy: want.dy });
      if (!r.ok) throw new Error(`setMoveInput refusée au tick ${s.tick} : ${r.error}`);
      s = r.state;
    }
    s = tick(s);
    invariantsOk(s, label);
  }
  throw new Error(`scénario UI « ${label} » introuvable avant le tick ${maxTick} (seed ${seed})`);
}

function makeCase(key: UiCase["key"], state: GameState, ticksToEvent: number): UiCase {
  invariantsOk(state, key);
  const enc = exportSave(state, { seed: UI_SEED, savedAt: UI_SAVED_AT });
  if (!enc.ok) throw new Error(`${key} : exportSave refusé : ${enc.error} ${enc.details.join(" ; ")}`);
  return { key, state, saveText: enc.text, ticksToEvent, hud: hudExpect(state) };
}

/** Combustion de nuit dans exactement 5 ticks (calendrier fixe : multiples de nightBurnIntervalTicks). */
const fiveBeforeBurn = (s: GameState): boolean =>
  isNight(s.tick) && isNight(s.tick + 5) && (s.tick + 5) % FIRE.nightBurnIntervalTicks === 0;

export function buildUiScenarios(seed = UI_SEED): Record<UiCase["key"], UiCase> {
  const preLow = ignorantUntil(seed, CYCLE_TICKS, "preLow", (s) => fiveBeforeBurn(s) && s.fire.wood === FIRE.lowWood + 1 && sleepersCount(s) >= 1);
  const preOut = ignorantUntil(seed, CYCLE_TICKS, "preOut", (s) => fiveBeforeBurn(s) && s.fire.wood === 1);

  // Stocks au plafond, tick rendu plausible puis ramené au jour suivant si besoin (jour, pas l'aube).
  const big = cloneState(createInitialState(seed));
  big.resources.wood = 9999;
  big.resources.food = 9999;
  big.tick = plausibleTick(big);
  if (cyclePos(big.tick) < 600 || isNight(big.tick)) big.tick += CYCLE_TICKS - cyclePos(big.tick) + 600;

  return {
    preLow: makeCase("preLow", preLow, 5),
    preOut: makeCase("preOut", preOut, 5),
    bigStock: makeCase("bigStock", big, 0),
  };
}
