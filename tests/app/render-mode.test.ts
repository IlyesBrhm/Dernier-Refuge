// Choix du moteur d'affichage depuis l'URL (docs/design/render-3d.md §4.1 et §6.2).

import { parseRenderMode } from "../../src/app/render-mode";

describe("parseRenderMode", () => {
  it.each([
    "?render=3d",
    "?render=3D",
    "render=3d", // sans « ? » (URLSearchParams l'accepte)
    "?x=1&render=3d",
    "?render=3d&x=1",
    "?seed=42&render=3d&lang=fr",
    "?render=%33d", // encodé : « 3d »
    "?render=3d&render=2d", // premier paramètre retenu
  ])("%s ⇒ 3d", (search) => {
    expect(parseRenderMode(search)).toBe("3d");
  });

  it.each([
    "",
    "?",
    "?render",
    "?render=",
    "?render=2d",
    "?render=2D",
    "?render=3",
    "?render=d",
    "?render=3d3",
    "?render=33d",
    "?render= 3d",
    "?render=3d+", // « 3d » suivi d'un espace
    "?render=3d%00",
    "?render=webgl",
    "?render=true",
    "?RENDER=3d", // le nom du paramètre est sensible à la casse
    "?renderer=3d",
    "?x=3d",
    "?render=2d&render=3d", // premier paramètre retenu
    "#render=3d",
    "?render=３d", // chiffre pleine chasse
  ])("%j ⇒ 2d", (search) => {
    expect(parseRenderMode(search)).toBe("2d");
  });

  it("toujours « 2d » ou « 3d », jamais d'exception, même sur des entrées bizarres", () => {
    for (const s of ["?%", "?render=%E0%A4%A", "?&&&=", "?render=3d".repeat(50), "\u0000", "?render=\u{1F600}"]) {
      expect(["2d", "3d"]).toContain(parseRenderMode(s));
    }
  });
});
