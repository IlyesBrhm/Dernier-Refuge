// Vérifie (sous Vitest, sans navigateur) les scénarios jour/nuit des e2e et des captures :
// constructibles, déterministes, importables tels quels, et montrant bien ce qui est attendu.

import { FIRE } from "../../src/data/balance";
import { cyclePos, isNight } from "../../src/core/time";
import { importSave } from "../../src/save/index";
import { BUDGET_KEYS, buildDayNightScenarios, DAYNIGHT_KEYS, dayNightProblems, expectedFor } from "./daynight-scenario";

vi.setConfig({ testTimeout: 60_000 });

describe("scénarios jour/nuit (e2e et captures)", () => {
  const sc = buildDayNightScenarios();

  it("chaque état montre ce qui est attendu (phase, feu, dormeurs, bilan)", () => {
    for (const k of DAYNIGHT_KEYS) expect(dayNightProblems(sc[k]), k).toEqual([]);
  });

  it("ticks et phases : jour 1200, crépuscule 2250, nuit ≥ 2900 (feu allumé), nuit 3200+ (feu éteint), aube 3602", () => {
    expect(sc.day.state.tick).toBe(1200);
    expect(sc.dusk.state.tick).toBe(2250);
    expect(sc.nightLit.state.tick).toBeGreaterThanOrEqual(2900);
    expect(isNight(sc.nightLit.state.tick)).toBe(true);
    expect(sc.nightLow.state.tick).toBeGreaterThanOrEqual(2700);
    expect(sc.nightLow.state.tick).toBeLessThan(3000);
    expect(sc.nightOut.state.tick).toBeGreaterThanOrEqual(3200);
    expect(isNight(sc.nightOut.state.tick)).toBe(true);
    // Marge : la nuit feu éteint reste la nuit pendant au moins 20 s de jeu après l'import.
    expect(cyclePos(sc.nightOut.state.tick)).toBeLessThan(3600 - 200);
    expect(sc.nightFireOut.state.tick).toBeGreaterThanOrEqual(3200);
    expect(isNight(sc.nightFireOut.state.tick)).toBe(true);
    expect(cyclePos(sc.nightFireOut.state.tick)).toBeLessThan(3600 - 200);
    expect(sc.dawn.state.tick).toBe(3602);
    expect(BUDGET_KEYS).toEqual(["day", "dusk", "nightLit", "nightOut", "dawn"]);
  });

  it("valeurs attendues = sélecteurs du core ; ombre « sun » de jour, « fire » de nuit", () => {
    for (const k of DAYNIGHT_KEYS) {
      const c = sc[k];
      expect(c.expect).toEqual(expectedFor(c.state));
      expect(c.expect.shadow).toBe(c.expect.isNight ? "fire" : "sun");
      expect(c.expect.fireLit).toBe(c.state.fire.wood > 0);
    }
    expect(sc.day.expect).toMatchObject({ dayLabel: "Jour 1", sky: "Jour", light: "day", shadow: "sun", report: null });
    expect(sc.dusk.expect).toMatchObject({ dayLabel: "Jour 1", light: "dusk", shadow: "sun" });
    expect(sc.nightLit.expect).toMatchObject({ dayLabel: "Jour 1", sky: "Nuit", light: "night", shadow: "fire", fireLit: true, fireLow: false });
    expect(sc.nightLow.expect).toMatchObject({ light: "night", fireLow: true });
    expect(sc.nightLow.expect.fireWood).toBeLessThanOrEqual(FIRE.lowWood);
    expect(sc.nightOut.expect).toMatchObject({ light: "night", shadow: "fire", fireLit: false, blockedByCold: true, sleepers: 0 });
    // Départ au froid cette nuit ⇒ raison « coldLeavers » (prioritaire sur « fireOut »).
    expect(sc.nightOut.expect.blockReason).toBe("coldLeavers");
    expect(sc.nightOut.state.night.coldLeavers).toBeGreaterThanOrEqual(1);
    // Feu éteint sans dormeur (personne accueilli) ⇒ aucun départ au froid, raison « fireOut ».
    expect(sc.nightFireOut.expect).toMatchObject({
      light: "night",
      shadow: "fire",
      fireLit: false,
      fireWood: 0,
      blockedByCold: true,
      blockReason: "fireOut",
      sleepers: 0,
    });
    expect(sc.nightFireOut.state.night.coldLeavers).toBe(0);
    expect(sc.nightFireOut.state.queue.length).toBeGreaterThanOrEqual(1);
    for (const k of ["day", "dusk", "nightLit", "dawn"] as const) expect(sc[k].expect.blockReason, k).toBeNull();
    expect(sc.dawn.expect).toMatchObject({ dayLabel: "Jour 2", sky: "Jour", light: "dawn", shadow: "sun" });
  });

  it("textes accessibles du HUD (contrat data-hud, ui-polish §1.8) pour les états connus", () => {
    // Jour 1, tick 1200 : 1200 ticks avant la nuit = 2 min.
    expect(sc.day.expect.hud.clockLabel).toBe("Jour 1, jour, 2 min avant la nuit");
    expect(sc.day.expect.hud.fireState).toBe("ok");
    expect(sc.day.expect.hud.queueState).toBe("open");
    expect(sc.day.expect.hud.tentsLabel).toMatch(/^Tentes libres : \d+ sur \d+$/); // pas de dormeurs le jour
    // Nuit : « X min avant l'aube », dormeurs annoncés.
    expect(sc.nightLit.expect.hud.clockLabel).toMatch(/^Jour 1, nuit, \d+ min avant l'aube$/);
    expect(sc.nightLit.expect.hud.tentsLabel).toMatch(/, \d+ dormeurs?$/);
    expect(sc.nightLow.expect.hud.fireState).toBe("low");
    expect(sc.nightLow.expect.hud.fireValueText).toMatch(/, faible$/);
    expect(sc.nightOut.expect.hud).toMatchObject({ fireState: "out", queueState: "closed", fireValueText: `0 bois sur ${FIRE.capacity}, éteint` });
    expect(sc.nightOut.expect.hud.queueLabel).toMatch(/, accueil fermé jusqu'à l'aube$/);
    expect(sc.nightFireOut.expect.hud.queueLabel).toMatch(/, accueil fermé tant que le feu est éteint$/);
    expect(sc.dawn.expect.hud.clockLabel).toMatch(/^Jour 2, jour, \d+ min avant la nuit$/);
  });

  it("bilan de l'aube = compteurs de la nuit 1 (woodEarned cohérent avec les payés et les partis au froid)", () => {
    const r = sc.dawn.expect.report;
    expect(r).not.toBeNull();
    expect(r).toEqual({ night: 1, ...sc.dawn.state.night });
    expect(r!.sleepersPaid).toBeGreaterThanOrEqual(1);
    expect(r!.woodBurned).toBeGreaterThan(0);
  });

  it("déterministe : même seed ⇒ mêmes états et mêmes textes de sauvegarde", () => {
    const again = buildDayNightScenarios();
    for (const k of DAYNIGHT_KEYS) {
      expect(again[k].state, k).toEqual(sc[k].state);
      expect(again[k].saveText, k).toBe(sc[k].saveText);
    }
  });

  it("chaque sauvegarde est acceptée par l'import (checksum, forme, invariants) et redonne l'état", () => {
    for (const k of DAYNIGHT_KEYS) {
      const r = importSave(sc[k].saveText);
      expect(r.ok, k).toBe(true);
      if (!r.ok) continue;
      expect(r.state, k).toEqual(sc[k].state);
    }
  });
});
