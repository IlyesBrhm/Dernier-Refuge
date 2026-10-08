// API publique pour src/app : newGame, export / import, messages.

import { createInitialState, tick } from "../../src/core/index";
import {
  exportFileName,
  exportSave,
  importErrorMessage,
  importSave,
  newGame,
  SAVE_CONFIG,
  SAVE_MESSAGES,
  writeErrorMessage,
  type DecodeError,
  type WriteError,
} from "../../src/save/index";
import { midgame, resign, SAVED_AT } from "./helpers";

describe("newGame", () => {
  it("état initial du core pour le seed donné", () => {
    expect(newGame(99)).toEqual({ state: createInitialState(99), seed: 99 });
    expect(newGame(0xffffffff).seed).toBe(0xffffffff);
  });
  it("seed invalide ⇒ RangeError (erreur de programmation de l'appelant)", () => {
    for (const s of [-1, 2 ** 32, 1.5, NaN]) expect(() => newGame(s)).toThrow(RangeError);
  });
});

describe("export / import", () => {
  it("export ⇒ import ⇒ état identique ; texte non indenté identique au stockage", () => {
    const s = midgame();
    const e = exportSave(s, { seed: 4242, savedAt: SAVED_AT });
    if (!e.ok) throw new Error(e.error);
    expect(e.text).not.toContain("\n");
    const r = importSave(e.text);
    expect(r.ok && r.state).toEqual(s);
    expect(exportFileName(s)).toBe(`dernier-refuge-tick${s.tick}.json`);
  });

  it("save valide d'un autre seed ⇒ acceptée avec son seed", () => {
    const other = tick(createInitialState(31337), 200);
    const e = exportSave(other, { seed: 31337, savedAt: 5 });
    const r = importSave(e.ok ? e.text : "");
    expect(r.ok && r.seed).toBe(31337);
    expect(r.ok && r.state).toEqual(other);
  });

  it.each([
    ["vide", "", "empty"],
    ["1 octet", "{", "not_json"],
    ["JSON valide non-save", '{"hello":"world"}', "bad_envelope"],
    ["non chaîne", 12, "not_json"],
  ] as [string, unknown, DecodeError][])("%s ⇒ %s", (_n, input, error) => {
    expect(importSave(input)).toMatchObject({ ok: false, error });
  });

  it("énorme (10 Mo) ⇒ too_large sans parser, rapidement", () => {
    const huge = `{"a":"${"x".repeat(10 * 1024 * 1024)}"}`;
    const parse = vi.spyOn(JSON, "parse");
    const r = importSave(huge);
    expect(r).toMatchObject({ ok: false, error: "too_large" });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("juste au-dessus de la limite d'import ⇒ too_large", () => {
    expect(importSave(" ".repeat(SAVE_CONFIG.maxImportBytes + 1))).toMatchObject({ ok: false, error: "too_large" });
  });

  it("import trafiqué et re-signé ⇒ refusé par la même validation que le chargement", () => {
    const e = exportSave(createInitialState(1), { seed: 1, savedAt: 1 });
    const text = resign(e.ok ? e.text : "", (s) => void ((s.resources as Record<string, number>).coins = 50_000));
    expect(importSave(text)).toMatchObject({ ok: false, error: "invariants" });
  });
});

describe("messages", () => {
  it("import : message par catégorie d'erreur", () => {
    const all: DecodeError[] = [
      "too_large",
      "empty",
      "not_json",
      "bad_envelope",
      "unsupported_version",
      "future_version",
      "bad_checksum",
      "migration_failed",
      "bad_shape",
      "invariants",
    ];
    expect(importErrorMessage("too_large")).toBe("Fichier trop volumineux (max 256 Ko)");
    expect(importErrorMessage("empty")).toBe(SAVE_MESSAGES.importUnreadable);
    expect(importErrorMessage("not_json")).toBe("Fichier vide ou illisible");
    expect(importErrorMessage("future_version")).toBe("Sauvegarde d'une version plus récente du jeu");
    for (const e of ["bad_checksum", "invariants", "bad_shape", "bad_envelope"] as DecodeError[]) {
      expect(importErrorMessage(e)).toBe("Fichier de sauvegarde invalide ou modifié");
    }
    for (const e of all) expect(importErrorMessage(e).length).toBeGreaterThan(0);
  });

  it("écriture : un message pour chaque erreur", () => {
    const all: WriteError[] = [
      "not_owner",
      "unavailable",
      "quota",
      "too_large",
      "serialize_error",
      "invalid_state",
      "readback_mismatch",
      "future_version",
      "quarantine_failed",
    ];
    for (const e of all) expect(writeErrorMessage(e).length).toBeGreaterThan(0);
    expect(writeErrorMessage("quota")).toContain("stockage plein");
    expect(writeErrorMessage("invalid_state")).toBe("Sauvegarde refusée : état de jeu invalide (bug)");
    expect(writeErrorMessage("invalid_state")).not.toBe(writeErrorMessage("unavailable"));
  });

  it("textes clés du plan", () => {
    expect(SAVE_MESSAGES.corrupt).toMatch(/^Sauvegarde endommagée, nouvelle partie lancée/);
  });
});
