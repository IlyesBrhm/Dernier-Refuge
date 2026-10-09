// Vérifie sous Vitest les états importés par les e2e de l'interface (tests/e2e/ui-scenario.ts) :
// construits, valides, exportables, rechargeables, et l'événement attendu arrive bien au bon tick.

import { detectUiEvents } from "../../src/app/ui-events";
import { checkInvariants, isFireLow, isFireOutAtNight, tick } from "../../src/core";
import { FIRE } from "../../src/data/balance";
import { importSave } from "../../src/save/index";
import { buildUiScenarios } from "./ui-scenario";

const SC = buildUiScenarios();

describe("scénarios UI", () => {
  for (const c of Object.values(SC)) {
    it(`${c.key} : invariants, export → import identique, joueur arrêté`, () => {
      expect(checkInvariants(c.state)).toEqual([]);
      const r = importSave(c.saveText);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.state).toEqual(c.state);
      expect(c.state.player.input).toEqual({ dx: 0, dy: 0 });
    });
  }

  it("preLow : « Le feu faiblit » (fireLow) exactement après ticksToEvent ticks, pas avant", () => {
    let s = SC.preLow.state;
    expect(isFireLow(s)).toBe(false);
    for (let i = 1; i <= SC.preLow.ticksToEvent; i++) {
      const prev = s;
      s = tick(s);
      const ev = detectUiEvents(prev, s).map((e) => e.type);
      if (i < SC.preLow.ticksToEvent) expect(ev).not.toContain("fireLow");
      else expect(ev).toContain("fireLow");
    }
    expect(s.fire.wood).toBe(FIRE.lowWood);
  });

  it("preOut : « Le feu est éteint » (fireOut) exactement après ticksToEvent ticks", () => {
    let s = SC.preOut.state;
    expect(isFireOutAtNight(s)).toBe(false);
    for (let i = 1; i <= SC.preOut.ticksToEvent; i++) {
      const prev = s;
      s = tick(s);
      const ev = detectUiEvents(prev, s).map((e) => e.type);
      if (i < SC.preOut.ticksToEvent) expect(ev).not.toContain("fireOut");
      else expect(ev).toContain("fireOut");
    }
  });

  // Les e2e jouent 10 ticks de plus après l'événement (le toast info de l'import doit être vu 1 s) :
  // le feu doit rester faible / éteint, sans nouvel événement de feu.
  it("preLow / preOut : feu toujours faible / éteint 10 ticks après l'événement", () => {
    let low = SC.preLow.state;
    for (let i = 0; i < SC.preLow.ticksToEvent; i++) low = tick(low);
    let out = SC.preOut.state;
    for (let i = 0; i < SC.preOut.ticksToEvent; i++) out = tick(out);
    for (let i = 0; i < 10; i++) {
      low = tick(low);
      out = tick(out);
      expect(isFireLow(low)).toBe(true);
      expect(isFireOutAtNight(out)).toBe(true);
    }
    expect(low.fire.wood).toBe(FIRE.lowWood);
    expect(out.fire.wood).toBe(0);
  });

  it("bigStock : 9 999 bois et nourriture, de jour ; libellés exacts du HUD", () => {
    const s = SC.bigStock.state;
    expect(s.resources.wood).toBe(9999);
    expect(s.resources.food).toBe(9999);
    expect(SC.bigStock.hud.woodLabel).toBe("Bois : 9 999");
    expect(SC.bigStock.hud.clockLabel).toMatch(/^Jour \d+, jour, \d+ min avant la nuit$/);
  });

  it("déterministe : reconstruits à l'identique (mêmes textes de sauvegarde)", () => {
    const again = buildUiScenarios();
    for (const k of Object.keys(SC) as (keyof typeof SC)[]) expect(again[k].saveText).toBe(SC[k].saveText);
  });
});
