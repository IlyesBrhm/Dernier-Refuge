// Choix du moteur d'affichage depuis l'URL (pur, testé). Non persisté : ni save, ni localStorage.

export type RenderMode = "2d" | "3d";

/** "3d" ssi le paramètre `render` vaut exactement `3d` (insensible à la casse) ; sinon "2d". */
export function parseRenderMode(search: string): RenderMode {
  const value = new URLSearchParams(search).get("render");
  return value !== null && value.toLowerCase() === "3d" ? "3d" : "2d";
}
