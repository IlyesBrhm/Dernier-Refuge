// Import d'un fichier de sauvegarde (docs/design/save.md §4 menu « Importer », §6 import.test.ts).
// Complète api.test.ts (vide, 1 octet, {"hello":"world"}, 10 Mo, autre seed, aller-retour simple).

import { createInitialState, tick, type GameState } from "../../src/core/index";
import {
  commitFresh,
  createMemoryStorage,
  CURRENT_VERSION,
  exportSave,
  importErrorMessage,
  importSave,
  loadGame,
  SAVE_CONFIG,
  SAVE_KEYS,
  SAVE_MESSAGES,
  type DecodeError,
} from "../../src/save/index";
import { botStep, midgame, OWNER, resign, SAVED_AT, signed } from "./helpers";

/** U+FEFF (BOM UTF-8 une fois décodé), construit par code pour éviter un caractère invisible dans le source. */
const BOM = String.fromCharCode(0xfeff);

function exported(s: GameState, seed = 4242, savedAt = SAVED_AT): string {
  const e = exportSave(s, { seed, savedAt });
  if (!e.ok) throw new Error(e.error);
  return e.text;
}

function expectRefused(input: unknown, error: DecodeError): void {
  let r: ReturnType<typeof importSave> | undefined;
  expect(() => (r = importSave(input))).not.toThrow();
  expect(r).toMatchObject({ ok: false, error });
}

let MID: GameState;
let MID_TEXT: string;
beforeAll(() => {
  MID = midgame();
  MID_TEXT = exported(MID);
});

describe("fichiers vides ou blancs", () => {
  it.each([
    ["un espace", " "],
    ["espaces et retours", "  \n\t \r\n "],
    ["BOM seul", BOM],
    ["octet nul", "\u0000"],
  ])("%s ⇒ not_json, message « illisible »", (_n, text) => {
    expectRefused(text, "not_json");
    expect(importErrorMessage("not_json")).toBe(SAVE_MESSAGES.importUnreadable);
  });
});

describe("JSON valide qui n'est pas une sauvegarde", () => {
  it.each([
    ["null", "null"],
    ["true", "true"],
    ["nombre", "123"],
    ["chaîne", '"sauvegarde"'],
    ["tableau", "[1,2,3]"],
    ["objet vide", "{}"],
    ["enveloppe partielle", '{"version":1,"state":{}}'],
    ["enveloppe complète mal typée", '{"version":"1","savedAt":0,"seed":0,"checksum":"0000000000000000","state":{}}'],
    ["la sauvegarde imbriquée dans un autre objet", ""],
  ])("%s ⇒ bad_envelope, message « invalide ou modifié »", (name, text) => {
    const input = name.startsWith("la sauvegarde imbriquée") ? JSON.stringify({ save: JSON.parse(MID_TEXT) as unknown }) : text;
    expectRefused(input, "bad_envelope");
    expect(importErrorMessage("bad_envelope")).toBe(SAVE_MESSAGES.importInvalid);
  });

  it("enveloppe correcte et signée mais état vide ⇒ bad_shape", () => {
    expectRefused(signed({}), "bad_shape");
  });

  it("la sauvegarde exportée en chaîne JSON (double encodage) ⇒ bad_envelope", () => {
    expectRefused(JSON.stringify(MID_TEXT), "bad_envelope");
  });
});

describe("autres versions", () => {
  it("version future (2, 99) ⇒ future_version + message dédié, sans écriture possible", () => {
    for (const v of [CURRENT_VERSION + 1, 99]) {
      const r = importSave(signed({ anything: 1 }, v));
      expect(r).toMatchObject({ ok: false, error: "future_version", version: v });
    }
    // Même avec un état v1 parfaitement valide : la version prime.
    const env = JSON.parse(MID_TEXT) as Record<string, unknown>;
    expectRefused(signed(env.state, CURRENT_VERSION + 1), "future_version");
    expect(importErrorMessage("future_version")).toBe(SAVE_MESSAGES.importFuture);
  });

  it("version 0 ou négative ⇒ unsupported_version ; non entière ou chaîne ⇒ bad_envelope", () => {
    const state = (JSON.parse(MID_TEXT) as { state: unknown }).state;
    expectRefused(signed(state, 0), "unsupported_version");
    expectRefused(signed(state, -1), "unsupported_version");
    expectRefused(resign(MID_TEXT, (_s, env) => void (env.version = "1")), "bad_envelope");
    expectRefused(resign(MID_TEXT, (_s, env) => void (env.version = 1.5)), "bad_envelope");
  });

  it('comportement documenté : "version":2.0 écrit à la main est lu comme 2 (JSON) ⇒ accepté', () => {
    // JSON.parse("2.0") === 2 : le checksum porte sur la valeur, pas sur le texte. Sans danger.
    const t = MID_TEXT.replace(/"version":2}$/, '"version":2.0}');
    expect(t).not.toBe(MID_TEXT);
    expect(importSave(t)).toMatchObject({ ok: true });
  });
});

describe("taille", () => {
  it("exactement la limite ⇒ analysé (et accepté si valide) ; limite + 1 ⇒ too_large", () => {
    // Des espaces en fin de fichier sont du JSON valide : le checksum porte sur l'état, pas sur le texte.
    const padded = MID_TEXT + " ".repeat(SAVE_CONFIG.maxImportBytes - MID_TEXT.length);
    expect(padded.length).toBe(SAVE_CONFIG.maxImportBytes);
    const r = importSave(padded);
    expect(r.ok && r.state).toEqual(MID);
    expectRefused(`${padded} `, "too_large");
    expect(importErrorMessage("too_large")).toBe(SAVE_MESSAGES.importTooLarge);
  });

  it("taille comptée en caractères UTF-16 (l'UI vérifie file.size en octets AVANT lecture)", () => {
    // 100 000 « é » = 200 000 octets UTF-8 mais 100 000 caractères : sous la limite de importSave,
    // refusé ensuite comme non-JSON. Le contrôle en octets est celui de l'UI (file.size), cf. §4.
    expectRefused("é".repeat(100_000), "not_json");
  });
});

describe("BOM, fins de ligne, réindentation (fichier retouché par un éditeur)", () => {
  it("BOM UTF-8 en tête ⇒ refusé (not_json) : comportement documenté", () => {
    // JSON.parse n'accepte pas U+FEFF. Dans le navigateur, `file.text()` décode en UTF-8 et RETIRE
    // le BOM (Encoding Standard, « UTF-8 decode ») : un fichier avec BOM importé via le menu passe
    // donc quand même. Seul un texte contenant encore le caractère U+FEFF est refusé ici.
    expectRefused(`${BOM}${MID_TEXT}`, "not_json");
    expect(importErrorMessage("not_json")).toBe("Fichier vide ou illisible");
  });

  it("fin de ligne finale (LF ou CRLF) ajoutée par un éditeur ⇒ accepté, état identique", () => {
    for (const suffix of ["\n", "\r\n", "\n\n"]) {
      const r = importSave(MID_TEXT + suffix);
      expect(r.ok && r.state).toEqual(MID);
    }
  });

  it("fichier réindenté (JSON.stringify(…, null, 2)) ⇒ accepté : le checksum porte sur l'état canonique", () => {
    const pretty = JSON.stringify(JSON.parse(MID_TEXT), null, 2);
    expect(pretty).not.toBe(MID_TEXT);
    const r = importSave(pretty);
    expect(r.ok && r.state).toEqual(MID);
  });

  it("une valeur modifiée dans le fichier réindenté ⇒ bad_checksum", () => {
    const pretty = JSON.stringify(JSON.parse(MID_TEXT), null, 2).replace(/"tick": (\d+)/, (_m, n: string) => `"tick": ${Number(n) + 1}`);
    expectRefused(pretty, "bad_checksum");
  });
});

describe("export puis import ⇒ identique", () => {
  it("états variés (plusieurs seeds et moments) : import(export(s)) toEqual s ; ré-export texte identique", () => {
    const states: [GameState, number][] = [[createInitialState(0), 0], [MID, 4242]];
    for (const seed of [3, 0xffffffff]) {
      let s = createInitialState(seed);
      for (let i = 0; i < 1500; i++) {
        s = botStep(s);
        if (i % 500 === 250) states.push([s, seed]);
      }
    }
    for (const [s, seed] of states) {
      const text = exported(s, seed, SAVED_AT + s.tick);
      const r = importSave(text);
      if (!r.ok) throw new Error(`${r.error}: ${r.details.join("; ")}`);
      expect(r.state).toEqual(s);
      expect(r.seed).toBe(seed);
      expect(r.savedAt).toBe(SAVED_AT + s.tick);
      expect(exported(r.state, r.seed, r.savedAt)).toBe(text);
      // L'état importé est jouable et identique à l'original dans la suite.
      expect(tick(r.state, 50)).toEqual(tick(s, 50));
    }
  });

  it("import ⇒ commitFresh ⇒ loadGame : les deux slots contiennent exactement le fichier importé", () => {
    const st = createMemoryStorage();
    commitFresh(st, createInitialState(1), { seed: 1, savedAt: 1 }, OWNER);
    const r = importSave(MID_TEXT);
    if (!r.ok) throw new Error(r.error);
    const w = commitFresh(st, r.state, { seed: r.seed, savedAt: r.savedAt }, OWNER);
    expect(w.ok).toBe(true);
    expect(st.raw.get(SAVE_KEYS.A)).toBe(MID_TEXT);
    expect(st.raw.get(SAVE_KEYS.B)).toBe(MID_TEXT);
    const l = loadGame(st);
    expect(l.kind === "loaded" && l.state).toEqual(MID);
  });

  it("importSave est pur : deux imports du même texte donnent deux états égaux mais distincts", () => {
    const a = importSave(MID_TEXT);
    const b = importSave(MID_TEXT);
    expect(a).toEqual(b);
    expect(a.ok && b.ok && a.state !== b.state).toBe(true);
  });
});
