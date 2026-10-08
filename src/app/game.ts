// Câblage : boucle à pas fixe (10 ticks/s) + rendu interpolé à la fréquence d'affichage.
// - Le nombre de ticks par image vient de `stepBudget` (core), alimenté par le delta BRUT mesuré
//   (le plafond de 250 ms et le max de ticks par image y sont déjà appliqués).
// - On garde l'état précédent et l'état courant ; le rendu dessine lerp(prev, curr, acc / tickMs).
// - Les entrées ne deviennent des commandes `setMoveInput` que lorsqu'elles changent.

import { applyCommand, checkInvariants, stepBudget, tick, type Axis, type GameState } from "../core";
import { LOOP } from "../data/balance";
import type { Renderer } from "../render/renderer";
import type { Hud } from "../ui/hud";
import type { InputController } from "./input";
import { startLoop, type LoopHandle } from "./loop";

export interface GameDeps {
  /** État de départ (nouvelle partie ou sauvegarde chargée) : la boucle ne crée jamais l'état. */
  initialState: GameState;
  renderer: Renderer;
  hud: Hud;
  input: InputController;
}

export interface Game {
  stop(): void;
  /**
   * État courant, toujours ENTRE DEUX TICKS (JS mono-thread, ticks exécutés dans onFrame) : c'est ce
   * que lit l'autosave. Lecture seule : l'app ne le modifie que via des commandes.
   */
  readonly state: GameState;
  /**
   * Remplace l'état par un état VALIDÉ (chargement, import, nouvelle partie). Ce n'est pas une mutation
   * de gameplay : prev = curr = state, accumulateur à 0, entrées et effets visuels réinitialisés.
   */
  replaceState(state: GameState): void;
  /** Pause : plus de tick ni de commande d'entrée (le rendu continue, l'état ne change pas). */
  setPaused(paused: boolean): void;
}

export function startGame({ initialState, renderer, hud, input }: GameDeps): Game {
  let curr: GameState = initialState;
  let prev: GameState = curr;
  let acc = 0;
  let paused = false;
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
    if (!paused) {
      syncInput();
      const budget = stepBudget(acc, rawDeltaMs);
      acc = budget.acc;
      for (let i = 0; i < budget.steps; i++) {
        prev = curr;
        curr = tick(curr);
        // Détection d'événements visuels tick par tick (jamais par image) : un effet par récolte.
        renderer.onTick(prev, curr);
        if (import.meta.env.DEV) checkDev(curr);
      }
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
    replaceState(state: GameState): void {
      curr = state;
      prev = state;
      acc = 0;
      // La direction « envoyée » est celle de l'état chargé : au premier frame, syncInput enverra
      // setMoveInput si les touches réelles diffèrent (commande normale, comme un relâchement).
      sent = { dx: state.player.input.dx, dy: state.player.input.dy };
      lastViolations = "";
      input.releaseAll();
      renderer.reset();
      if (import.meta.env.DEV) checkDev(curr);
    },
    setPaused(p: boolean): void {
      if (p === paused) return;
      // Pas de rattrapage à la reprise : en pause, l'accumulateur est figé (aucun delta ajouté).
      paused = p;
      input.releaseAll();
    },
  };
}
