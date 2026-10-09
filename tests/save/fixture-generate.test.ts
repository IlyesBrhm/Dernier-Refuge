// Génération UNIQUE des fixtures figées de sauvegarde (tests/save/fixtures/).
//
// Ces fichiers ne doivent JAMAIS être régénérés une fois commités : ils représentent des sauvegardes déjà
// présentes chez les joueurs. Si un test de fixture casse après un changement du core / de la carte, c'est
// qu'il faut une NOUVELLE version de sauvegarde + une migration + une nouvelle fixture, pas une
// régénération.
//
// --- Fixtures v1 (générateur RETIRÉ) ---------------------------------------------------------------
// v1-initial.json et v1-midgame.json ont été produites une fois, le 2026-10-08 (branche feature/save),
// par l'ancien générateur v1 : createInitialState(4242) et midgame(4242), savedAt = 1 760 000 000 000,
// seed 4242, encodées en version 1. Depuis la v2 (jour/nuit), encodeSave écrit la version 2 et la carte
// a changé : le générateur ne peut plus les reproduire. Elles sont GELÉES et testées par
// fixture-v1.test.ts (chargement via la migration v1 → v2, état attendu vérifié).
//
// --- Fixtures v2 ------------------------------------------------------------------------------------
// - v2-initial.json : createInitialState(4242).
// - v2-night.json   : nightState(4242) (tests/save/helpers.ts) : bot « attentif » (entretient le feu)
//                     jusqu'au premier tick ≥ 2900 de la nuit 1 avec feu allumé, ≥ 1 dormeur et
//                     night.woodBurned > 0.
// - v2-dawn.json    : bot attentif jusqu'au tick 3601 (lendemain de l'aube, bilan de nuit non nul).
// Toutes : savedAt = 1 760 000 000 000, seed = 4242.
// Commande (une fois, puis commit) :
//   UPDATE_SAVE_FIXTURES=1 npx vitest run tests/save/fixture-generate.test.ts
//
// Garde-fous :
// - UPDATE_SAVE_FIXTURES=1     : crée les fixtures v2 ABSENTES ; lève une erreur si l'une existe déjà
//                                (rien n'est écrit dans ce cas).
// - UPDATE_SAVE_FIXTURES=force : écrase (à ne faire que pour une fixture jamais publiée/commitée).
// - CHECK_SAVE_FIXTURES=1      : n'écrit rien ; vérifie que le générateur reproduit à l'identique les
//                                fixtures v2 commitées.
// Sans variable d'environnement, ce fichier ne fait rien (tests ignorés). Les fixtures v1 ne sont jamais
// écrites par ce fichier.

import { createInitialState, type GameState } from "../../src/core/index";
import { encodeSave } from "../../src/save/index";
import { attentiveUntil, nightState, SAVED_AT, SEED } from "./helpers";

// Pas de @types/node dans le projet : accès minimal typé à la main.
interface NodeFs {
  existsSync(p: URL): boolean;
  mkdirSync(p: URL, o: { recursive: boolean }): void;
  writeFileSync(p: URL, data: string): void;
  readFileSync(p: URL, enc: "utf8"): string;
}
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const UPDATE = env.UPDATE_SAVE_FIXTURES;
const WRITE_ENABLED = UPDATE === "1" || UPDATE === "force";
const FORCE = UPDATE === "force";
const CHECK_ENABLED = env.CHECK_SAVE_FIXTURES === "1";

/** Fixtures v2 et l'état qui les produit (calcul paresseux : coûteux). */
const V2_FIXTURES: Readonly<Record<string, () => GameState>> = {
  "v2-initial.json": () => createInitialState(SEED),
  "v2-night.json": () => nightState(SEED),
  "v2-dawn.json": () => attentiveUntil(3601, SEED),
};

/** Encode exactement comme à la génération (même seed, même savedAt). */
function encodeFixture(state: GameState): string {
  const enc = encodeSave(state, { seed: SEED, savedAt: SAVED_AT });
  if (!enc.ok) throw new Error(enc.error);
  return enc.text;
}

async function nodeFs(): Promise<NodeFs> {
  const fsModule = "node:fs";
  return (await import(/* @vite-ignore */ fsModule)) as NodeFs;
}

const urlOf = (name: string): URL => new URL(`./fixtures/${name}`, import.meta.url);

describe("génération des fixtures v2 (UPDATE_SAVE_FIXTURES=1|force seulement)", () => {
  it.runIf(WRITE_ENABLED)("écrit les fixtures v2 absentes (refuse d'écraser sans force)", async () => {
    const fs = await nodeFs();
    fs.mkdirSync(new URL("./fixtures/", import.meta.url), { recursive: true });
    const names = Object.keys(V2_FIXTURES);
    if (names.some((n) => !n.startsWith("v2-"))) throw new Error("seules les fixtures v2 sont générables");
    // Vérification AVANT toute écriture : pas d'écriture partielle si un seul fichier existe.
    const existing = names.filter((n) => fs.existsSync(urlOf(n)));
    if (existing.length > 0 && !FORCE) {
      throw new Error(
        `Fixture(s) déjà présente(s) : ${existing.join(", ")}. Une fixture commitée ne se régénère JAMAIS ` +
          `(elle représente des sauvegardes de joueurs). Pour vérifier sans écrire : CHECK_SAVE_FIXTURES=1. ` +
          `Pour écraser malgré tout (fixture jamais publiée) : UPDATE_SAVE_FIXTURES=force.`,
      );
    }
    for (const name of names) {
      const state = V2_FIXTURES[name]!();
      const text = encodeFixture(state);
      console.log(`${fs.existsSync(urlOf(name)) ? "ÉCRASE (force)" : "crée"} ${name} (tick ${state.tick}, ${text.length} car.)`);
      fs.writeFileSync(urlOf(name), text);
    }
  }, 60_000);
});

describe.runIf(CHECK_ENABLED)("reproductibilité des fixtures v2 (CHECK_SAVE_FIXTURES=1 seulement, n'écrit rien)", () => {
  it.each(Object.keys(V2_FIXTURES))("le générateur reproduit %s commité", async (name) => {
    const fs = await nodeFs();
    expect(fs.existsSync(urlOf(name)), `${name} absente`).toBe(true);
    expect(encodeFixture(V2_FIXTURES[name]!())).toBe(fs.readFileSync(urlOf(name), "utf8"));
  }, 60_000);
});
