// Vérifie (sous Vitest, sans navigateur) le scénario de la capture camp-3d-midgame-*.png :
// il doit rester constructible, déterministe et importable tel quel par la page.

import { NODES } from "../../src/data/balance";
import { importSave } from "../../src/save/index";
import { buildMidgameScenario, MIDGAME_FINISH_TICKS, midgameProblems } from "./midgame-scenario";

describe("scénario de capture « partie en cours »", () => {
  const sc = buildMidgameScenario();

  it("montre file ≥ 2, tente occupée, tente en désordre, ≥ 2 tentes, récolte presque finie", () => {
    expect(midgameProblems(sc.state)).toEqual([]);
    expect(sc.state.queue.length).toBeGreaterThanOrEqual(2);    const tree = sc.state.nodes.find((n) => n.tile.tx === 4 && n.tile.ty === 9)!;
    expect(tree.progress).toBe(NODES.tree.harvestTicks - MIDGAME_FINISH_TICKS);
  });

  it("sans commande, la récolte se termine en MIDGAME_FINISH_TICKS ticks (+3 bois, ramassé aussitôt)", () => {
    expect(sc.finishInTicks).toBe(MIDGAME_FINISH_TICKS);
    expect(sc.woodAfter - sc.woodBefore).toBe(NODES.tree.yield);
    expect(midgameProblems(sc.atFinish, false)).toEqual([]);
  });

  it("déterministe : même seed ⇒ même état et même texte de sauvegarde", () => {
    const again = buildMidgameScenario();
    expect(again.state).toEqual(sc.state);
    expect(again.saveText).toBe(sc.saveText);
  });

  it("la sauvegarde est acceptée par l'import (checksum, forme, invariants) et redonne l'état", () => {
    const r = importSave(sc.saveText);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seed).toBe(sc.seed);
    expect(r.state).toEqual(sc.state);
  });
});
