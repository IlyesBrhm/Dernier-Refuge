// Câblage : boucle à pas fixe (10 ticks/s) + rendu interpolé à la fréquence d'affichage.
// - Le nombre de ticks par image vient de `stepBudget` (core), alimenté par le delta BRUT mesuré
//   (le plafond de 250 ms et le max de ticks par image y sont déjà appliqués).
// - On garde l'état précédent et l'état courant ; le rendu dessine lerp(prev, curr, acc / tickMs).
// - Les entrées ne deviennent des commandes `setMoveInput` que lorsqu'elles changent.

import {
  applyCommand,
  checkInvariants,
  createInitialState,
  stepBudget,
  tick,
  type Axis,
  type GameState,
} from "../core";
import { LOOP } from "../data/balance";
import type { Renderer } from "../render/renderer";
import type { Hud } from "../ui/hud";
import type { InputController } from "./input";
import { startLoop, type LoopHandle } from "./loop";

export interface GameDeps {
  seed: number;
  renderer: Renderer;
  hud: Hud;
  input: InputController;
}

export interface Game {
  stop(): void;
  /** Lecture seule (débogage). */
  readonly state: Readonly<GameState>;
}

export function startGame({ seed, renderer, hud, input }: GameDeps): Game {
  let curr: GameState = createInitialState(seed);
  let prev: GameState = curr;
  let acc = 0;
  // Dernière direction ACCEPTÉE par le core. Si une commande est refusée (ex. rate_limited),
  // elle sera renvoyée à l'image suivante puisque la direction voulue diffère toujours.
  let sent: { dx: Axis; dy: Axis } = { dx: curr.player.input.dx, dy: curr.player.input.dy };
  let lastViolations = "";

  function syncInput(): void {
    const wanted = input.read();
    if (wanted.dx === sent.dx && wanted.dy === sent.dy) return;
    const res = applyCommand(curr, { type: "setMoveInput", dx: wanted.dx, dy: wanted.dy });
    if (res.ok) {
      curr = res.state;
      sent = { dx: wanted.dx, dy: wanted.dy };
    } else if (import.meta.env.DEV) {
      console.warn(`[input] commande refusée : ${res.error}`);
    }
  }

  function checkDev(state: GameState): void {
    const violations = checkInvariants(state);
    const key = violations.join("\n");
    // Une violation persistante n'est relogguée que si la liste change (évite 10 logs/s identiques).
    if (violations.length > 0 && key !== lastViolations) {
      console.error(`[invariants] tick ${state.tick} :`, violations);
    }
    lastViolations = key;
  }

  function onFrame(rawDeltaMs: number): void {
    syncInput();
    const budget = stepBudget(acc, rawDeltaMs);
    acc = budget.acc;
    for (let i = 0; i < budget.steps; i++) {
      prev = curr;
      curr = tick(curr);
      if (import.meta.env.DEV) checkDev(curr);
    }
    renderer.draw(prev, curr, acc / LOOP.tickMs);
    hud.update(curr);
  }

  const loop: LoopHandle = startLoop({
    onFrame,
    onPause: () => input.releaseAll(),
  });

  return {
    stop: () => loop.stop(),
    get state() {
      return curr;
    },
  };
}
