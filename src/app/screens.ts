// Machine d'états des écrans (docs/design/ui-polish.md §1.1). PURE : aucune dépendance au DOM, à
// l'horloge ou au jeu. Un événement invalide renvoie la MÊME référence (l'appelant peut comparer par ===
// pour savoir si quelque chose a changé ; c'est aussi la garde anti double clic : deux `play` ⇒ un seul).

export type ScreenId = "boot" | "title" | "game";
export type PanelId = "pause" | "settings" | "credits" | "confirm";

export interface ScreensState {
  readonly screen: ScreenId;
  /** Pile de panneaux ouverts (sommet = dernier), au plus MAX_PANELS. */
  readonly panels: readonly PanelId[];
}

export type ScreenEvent =
  | { type: "booted" }
  | { type: "play" }
  | { type: "escape" }
  | { type: "open"; panel: PanelId }
  | { type: "back" }
  | { type: "resume" }
  | { type: "toTitle" };

export const MAX_PANELS = 3;

export const INITIAL_SCREENS: ScreensState = Object.freeze({ screen: "boot", panels: Object.freeze([]) });

const EMPTY: readonly PanelId[] = Object.freeze([]);

function make(screen: ScreenId, panels: readonly PanelId[]): ScreensState {
  return Object.freeze({ screen, panels: panels.length === 0 ? EMPTY : Object.freeze([...panels]) });
}

export const topPanel = (s: ScreensState): PanelId | null => s.panels.at(-1) ?? null;
export const isTicking = (s: ScreensState): boolean => s.screen === "game" && s.panels.length === 0;
export const showsHud = (s: ScreensState): boolean => s.screen === "game";

/** Le panneau peut-il être empilé sur l'état `s` ? */
export function canOpen(s: ScreensState, panel: PanelId): boolean {
  if (s.panels.length >= MAX_PANELS) return false;
  if (s.panels.includes(panel)) return false; // jamais deux fois (donc jamais réempilé au sommet)
  switch (panel) {
    case "pause":
      return s.screen === "game" && s.panels.length === 0;
    case "credits":
      return s.screen === "title" && s.panels.length === 0;
    case "settings":
      return (s.screen === "title" && s.panels.length === 0) || (s.screen === "game" && topPanel(s) === "pause");
    case "confirm":
      return s.screen !== "boot";
  }
}

function pop(s: ScreensState): ScreensState {
  if (s.panels.length === 0) return s;
  return make(s.screen, s.panels.slice(0, -1));
}

export function reduceScreens(s: ScreensState, e: ScreenEvent): ScreensState {
  switch (e.type) {
    case "booted":
      return s.screen === "boot" ? make("title", EMPTY) : s;
    case "play":
      return s.screen === "title" && s.panels.length === 0 ? make("game", EMPTY) : s;
    case "escape":
      if (s.panels.length > 0) return pop(s);
      if (s.screen === "game") return make("game", ["pause"]);
      return s;
    case "open":
      return canOpen(s, e.panel) ? make(s.screen, [...s.panels, e.panel]) : s;
    case "back":
      return pop(s);
    case "resume":
      return s.screen === "game" && s.panels.length > 0 ? make("game", EMPTY) : s;
    case "toTitle":
      return s.screen === "game" ? make("title", EMPTY) : s;
  }
}
