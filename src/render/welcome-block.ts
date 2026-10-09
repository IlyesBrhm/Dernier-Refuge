// Libellé court affiché sur la zone d'accueil quand le core la dit fermée (`welcomeBlockReason`).
// Partagé par le rendu 2D et le calque 3D. Le texte complet (alerte du HUD) vit dans src/ui/hud.ts.
// PUR : ni three ni DOM.

import type { WelcomeBlockReason } from "../core";

export type WelcomeBlock = WelcomeBlockReason | null;

/** Lignes du libellé sur le tapis (une ou deux, la tuile est étroite) ; [] si l'accueil est ouvert. */
export function welcomeBlockLines(reason: WelcomeBlock): readonly string[] {
  switch (reason) {
    case "fireOut":
      return FIRE_OUT;
    case "coldLeavers":
      return CLOSED_UNTIL_DAWN;
    default:
      return NONE;
  }
}

const NONE: readonly string[] = [];
const FIRE_OUT: readonly string[] = ["Feu éteint"];
const CLOSED_UNTIL_DAWN: readonly string[] = ["Fermé", "jusqu'à l'aube"];
