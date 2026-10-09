// Fixtures figées de sauvegardes v2 (tests/save/fixtures/v2-*.json). NE JAMAIS LES RÉGÉNÉRER une fois
// commitées. Production et garde-fous : fixture-generate.test.ts.
// Chargées via import.meta.glob : une fixture absente fait échouer UN test explicite (avec la commande à
// lancer) au lieu de casser l'import de tout le fichier.

import { checkInvariants, isNight, nightReport, tick, type GameState } from "../../src/core/index";
import { CURRENT_VERSION, decodeSave, encodeSave } from "../../src/save/index";
import { isRichNight } from "./helpers";

const FILES = import.meta.glob<string>("./fixtures/v2-*.json", { query: "?raw", import: "default", eager: true });
const GENERATE = "UPDATE_SAVE_FIXTURES=1 npx vitest run tests/save/fixture-generate.test.ts";

function load(name: string): { text: string; state: GameState } {
  const text = FILES[`./fixtures/${name}`];
  if (text === undefined) throw new Error(`${name} absente : la générer avec « ${GENERATE} » puis la commiter`);
  const r = decodeSave(text);
  if (!r.ok) throw new Error(`${name}: ${r.error}: ${r.details.join("; ")}`);
  expect(r.version).toBe(2);
  expect(r.seed).toBe(4242);
  expect(r.savedAt).toBe(1_760_000_000_000);
  return { text, state: r.state };
}

describe.each([
  ["v2-initial.json", (s: GameState) => expect(s.tick).toBe(0)],
  [
    "v2-night.json",
    (s: GameState) => {
      expect(isNight(s.tick)).toBe(true);
      expect(s.tick).toBeGreaterThanOrEqual(2900);
      expect(isRichNight(s)).toBe(true);
    },
  ],
  [
    "v2-dawn.json",
    (s: GameState) => {
      expect(s.tick).toBe(3601);
      expect(isNight(s.tick)).toBe(false);
      expect(nightReport(s)).not.toBeNull();
    },
  ],
] as [string, (s: GameState) => void][])("fixture %s", (name, characteristics) => {
  it("présente, se charge en v2, caractéristiques attendues", () => {
    const { state } = load(name);
    expect(checkInvariants(state)).toEqual([]);
    characteristics(state);
  });

  it("ré-encodée à l'identique (format canonique stable, version courante)", () => {
    const { text, state } = load(name);
    expect(CURRENT_VERSION).toBe(2);
    const again = encodeSave(state, { seed: 4242, savedAt: 1_760_000_000_000 });
    expect(again.ok && again.text).toBe(text.trim());
  });

  it("la partie reprend : 300 ticks sans violation d'invariant", () => {
    let s = load(name).state;
    for (let i = 0; i < 300; i++) {
      s = tick(s);
      expect(checkInvariants(s)).toEqual([]);
    }
  });
});
