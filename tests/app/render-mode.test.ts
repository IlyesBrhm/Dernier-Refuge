// Choix du moteur d'affichage depuis l'URL (docs/design/day-night.md §0) : la 3D est le défaut,
// seul `render=2d` (casse ignorée sur la valeur) force le Canvas 2D.

import { parseRenderMode } from "../../src/app/render-mode";

describe("parseRenderMode", () => {
  it.each([
    "?render=2d",
    "?render=2D",
    "render=2d", // sans « ? » (URLSearchParams l'accepte)
    "?x=1&render=2d",
    "?render=2d&x=1",
    "?seed=7&render=2d&lang=fr",
    "?render=%32d", // encodé : « 2d »
    "?render=%32D",
    "?render=2d&render=3d", // premier paramètre retenu
  ])("%j ⇒ 2d", (search) => {
    expect(parseRenderMode(search)).toBe("2d");
  });

  it.each([
    "",
    "?",
    "?render",
    "?render=",
    "?render=3d",
    "?render=3D",
    "?render=3",
    "?render=2",
    "?render=d",
    "?render=webgl",
    "?render=true",
    "?render=2d2",
    "?render=22d",
    "?render= 2d",
    "?render=2d+", // « 2d » suivi d'un espace
    "?render=2d%00",
    "?render=canvas",
    "?RENDER=2d", // le nom du paramètre est sensible à la casse
    "?renderer=2d",
    "?x=2d",
    "?render=3d&render=2d", // premier paramètre retenu
    "#render=2d",
    "?render=２d", // chiffre pleine chasse
    "?seed=7",
  ])("%j ⇒ 3d (défaut)", (search) => {
    expect(parseRenderMode(search)).toBe("3d");
  });

  it("toujours « 2d » ou « 3d », jamais d'exception, même sur des entrées bizarres", () => {
    for (const s of ["?%", "?render=%E0%A4%A", "?&&&=", "?render=2d".repeat(50), "\u0000", "?render=\u{1F600}"]) {
      expect(["2d", "3d"]).toContain(parseRenderMode(s));
    }
  });
});
