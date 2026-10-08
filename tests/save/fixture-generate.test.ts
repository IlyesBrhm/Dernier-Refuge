// Génération UNIQUE des fixtures figées de sauvegarde v1 (tests/save/fixtures/).
//
// Ces fichiers ne doivent JAMAIS être régénérés : ils représentent des sauvegardes déjà présentes chez
// les joueurs. Si fixture-v1.test.ts casse après un changement du core ou de MAP_LAYOUT, c'est qu'il faut
// une nouvelle version de sauvegarde + une migration (et une fixture v2), pas une nouvelle fixture v1.
//
// Comment elles ont été produites (une fois, le 2026-10-08, sur la branche feature/save, puis commit) :
//   UPDATE_SAVE_FIXTURES=1 npx vitest run tests/save/fixture-generate.test.ts
// - v1-initial.json : createInitialState(4242), savedAt = 1 760 000 000 000, seed = 4242.
// - v1-midgame.json : midgame(4242) de tests/save/helpers.ts : bot « utile » (botGoal/steer de
//   tests/core/helpers.ts) qui joue uniquement par commandes, jusqu'au premier tick ≥ 600 réunissant
//   drops au sol, nœud épuisé, survivant au repos, survivant en marche, file non vide, emplacement
//   construit et emplacement partiellement payé (atteint au tick 925) ; puis une commande setMoveInput
//   sans tick (commandsThisTick = 1, input ≠ 0). Même savedAt et seed.
//
// Garde-fous :
// - UPDATE_SAVE_FIXTURES=1     : crée les fixtures ABSENTES ; lève une erreur si un fichier existe déjà.
// - UPDATE_SAVE_FIXTURES=force : écrase (à ne faire que pour une fixture jamais publiée/commitée).
// - CHECK_SAVE_FIXTURES=1      : n'écrit rien ; vérifie que le générateur reproduit à l'identique les
//   fichiers commités (preuve que la procédure ci-dessus est bien celle qui les a produits).
// Sans variable d'environnement, ce fichier ne fait rien (tests ignorés).

import { createInitialState, type GameState } from "../../src/core/index";
import { encodeSave } from "../../src/save/index";
// Texte brut, exactement tel que commité (import Vite `?raw`).
import V1_INITIAL from "./fixtures/v1-initial.json?raw";
import V1_MIDGAME from "./fixtures/v1-midgame.json?raw";
import { features, midgame, SAVED_AT, SEED } from "./helpers";

// Pas de @types/node dans le projet : accès minimal typé à la main.
interface NodeFs {
  existsSync(p: URL): boolean;
  mkdirSync(p: URL, o: { recursive: boolean }): void;
  writeFileSync(p: URL, data: string): void;
}
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const UPDATE = env.UPDATE_SAVE_FIXTURES;
const WRITE_ENABLED = UPDATE === "1" || UPDATE === "force";
const FORCE = UPDATE === "force";
const CHECK_ENABLED = env.CHECK_SAVE_FIXTURES === "1";

/** Encode exactement comme à la génération (même seed, même savedAt). */
function encodeFixture(state: GameState): string {
  const enc = encodeSave(state, { seed: SEED, savedAt: SAVED_AT });
  if (!enc.ok) throw new Error(enc.error);
  return enc.text;
}

describe("génération des fixtures v1 (UPDATE_SAVE_FIXTURES=1|force seulement)", () => {
  it.runIf(WRITE_ENABLED)("écrit v1-initial.json et v1-midgame.json (refuse d'écraser sans force)", async () => {
    const fsModule = "node:fs";
    const fs = (await import(/* @vite-ignore */ fsModule)) as NodeFs;
    fs.mkdirSync(new URL("./fixtures/", import.meta.url), { recursive: true });
    const states = { "v1-initial.json": createInitialState(SEED), "v1-midgame.json": midgame(SEED) };
    // Vérification AVANT toute écriture : pas d'écriture partielle si un seul fichier existe.
    const files = Object.keys(states).map((name) => ({ name, url: new URL(`./fixtures/${name}`, import.meta.url) }));
    const existing = files.filter((f) => fs.existsSync(f.url)).map((f) => f.name);
    if (existing.length > 0 && !FORCE) {
      throw new Error(
        `Fixture(s) déjà présente(s) : ${existing.join(", ")}. Une fixture v1 ne se régénère JAMAIS ` +
          `(elle représente des sauvegardes de joueurs). Pour vérifier sans écrire : CHECK_SAVE_FIXTURES=1. ` +
          `Pour écraser malgré tout (fixture jamais publiée) : UPDATE_SAVE_FIXTURES=force.`,
      );
    }
    for (const [name, state] of Object.entries(states)) {
      const text = encodeFixture(state);
      const file = new URL(`./fixtures/${name}`, import.meta.url);
      console.log(`${fs.existsSync(file) ? "ÉCRASE (force)" : "crée"} ${name} (${text.length} car.)`, features(state));
      fs.writeFileSync(file, text);
    }
  });
});

describe("reproductibilité des fixtures v1 (CHECK_SAVE_FIXTURES=1 seulement, n'écrit rien)", () => {
  it.runIf(CHECK_ENABLED)("encodeSave(createInitialState(SEED)) === v1-initial.json commité", () => {
    expect(encodeFixture(createInitialState(SEED))).toBe(V1_INITIAL);
  });

  it.runIf(CHECK_ENABLED)("encodeSave(midgame(SEED)) === v1-midgame.json commité", () => {
    expect(encodeFixture(midgame(SEED))).toBe(V1_MIDGAME);
  });
});
