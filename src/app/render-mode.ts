// Choix du moteur d'affichage depuis l'URL (pur, testé). Non persisté : ni save, ni localStorage.
// La 3D est le rendu par défaut (docs/design/day-night.md §0) ; `?render=2d` force le Canvas 2D.

export type RenderMode = "2d" | "3d";

/** "2d" ssi le paramètre `render` vaut exactement `2d` (insensible à la casse) ; sinon "3d". */
export function parseRenderMode(search: string): RenderMode {
  const value = new URLSearchParams(search).get("render");
  return value !== null && value.toLowerCase() === "2d" ? "2d" : "3d";
}
