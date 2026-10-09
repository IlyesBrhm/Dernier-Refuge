// Machine d'états des écrans (src/app/screens.ts, docs/design/ui-polish.md §1.1). Pure.

import {
  canOpen,
  INITIAL_SCREENS,
  isTicking,
  MAX_PANELS,
  reduceScreens,
  showsHud,
  topPanel,
  type PanelId,
  type ScreenEvent,
  type ScreenId,
  type ScreensState,
} from "../../src/app/screens";

const PANELS: readonly PanelId[] = ["pause", "settings", "credits", "confirm"];
const EVENTS: readonly ScreenEvent[] = [
  { type: "booted" },
  { type: "play" },
  { type: "escape" },
  { type: "back" },
  { type: "resume" },
  { type: "toTitle" },
  ...PANELS.map((panel) => ({ type: "open" as const, panel })),
];

function st(screen: ScreenId, panels: PanelId[] = []): ScreensState {
  return { screen, panels };
}

/** Rejoue une suite d'événements depuis l'état initial. */
function replay(...events: ScreenEvent[]): ScreensState {
  return events.reduce(reduceScreens, INITIAL_SCREENS);
}

const label = (e: ScreenEvent): string => (e.type === "open" ? `open:${e.panel}` : e.type);
const show = (s: ScreensState): string => `${s.screen}[${s.panels.join(",")}]`;

describe("état initial", () => {
  it("boot sans panneau, gelé ; ne joue pas, pas de HUD", () => {
    expect(INITIAL_SCREENS).toEqual({ screen: "boot", panels: [] });
    expect(Object.isFrozen(INITIAL_SCREENS)).toBe(true);
    expect(Object.isFrozen(INITIAL_SCREENS.panels)).toBe(true);
    expect(isTicking(INITIAL_SCREENS)).toBe(false);
    expect(showsHud(INITIAL_SCREENS)).toBe(false);
    expect(topPanel(INITIAL_SCREENS)).toBeNull();
  });
});

describe("table de transitions", () => {
  // [état de départ, événement, état attendu | "same"]
  const T: readonly [ScreensState, ScreenEvent, ScreensState | "same"][] = [
    // boot : seul `booted` passe.
    [st("boot"), { type: "booted" }, st("title")],
    [st("boot"), { type: "play" }, "same"],
    [st("boot"), { type: "escape" }, "same"],
    [st("boot"), { type: "back" }, "same"],
    [st("boot"), { type: "resume" }, "same"],
    [st("boot"), { type: "toTitle" }, "same"],
    ...PANELS.map((panel): [ScreensState, ScreenEvent, "same"] => [st("boot"), { type: "open", panel }, "same"]),
    // title
    [st("title"), { type: "booted" }, "same"],
    [st("title"), { type: "play" }, st("game")],
    [st("title"), { type: "escape" }, "same"],
    [st("title"), { type: "back" }, "same"],
    [st("title"), { type: "resume" }, "same"],
    [st("title"), { type: "toTitle" }, "same"],
    [st("title"), { type: "open", panel: "pause" }, "same"],
    [st("title"), { type: "open", panel: "settings" }, st("title", ["settings"])],
    [st("title"), { type: "open", panel: "credits" }, st("title", ["credits"])],
    [st("title"), { type: "open", panel: "confirm" }, st("title", ["confirm"])],
    // title + panneau
    [st("title", ["settings"]), { type: "play" }, "same"], // anti double clic : pile non vide
    [st("title", ["confirm"]), { type: "play" }, "same"],
    [st("title", ["settings"]), { type: "escape" }, st("title")],
    [st("title", ["settings"]), { type: "back" }, st("title")],
    [st("title", ["settings"]), { type: "resume" }, "same"],
    [st("title", ["settings"]), { type: "open", panel: "credits" }, "same"],
    [st("title", ["credits"]), { type: "open", panel: "settings" }, "same"],
    [st("title", ["settings"]), { type: "open", panel: "confirm" }, st("title", ["settings", "confirm"])],
    [st("title", ["settings"]), { type: "toTitle" }, "same"],
    // game
    [st("game"), { type: "booted" }, "same"],
    [st("game"), { type: "play" }, "same"],
    [st("game"), { type: "escape" }, st("game", ["pause"])],
    [st("game"), { type: "open", panel: "pause" }, st("game", ["pause"])],
    [st("game"), { type: "open", panel: "settings" }, "same"], // settings seulement depuis la pause
    [st("game"), { type: "open", panel: "credits" }, "same"],
    [st("game"), { type: "open", panel: "confirm" }, st("game", ["confirm"])], // ex. « Passer le tutoriel »
    [st("game"), { type: "back" }, "same"],
    [st("game"), { type: "resume" }, "same"],
    [st("game"), { type: "toTitle" }, st("title")],
    // game + pause
    [st("game", ["pause"]), { type: "escape" }, st("game")],
    [st("game", ["pause"]), { type: "back" }, st("game")],
    [st("game", ["pause"]), { type: "resume" }, st("game")],
    [st("game", ["pause"]), { type: "toTitle" }, st("title")],
    [st("game", ["pause"]), { type: "open", panel: "pause" }, "same"],
    [st("game", ["pause"]), { type: "open", panel: "settings" }, st("game", ["pause", "settings"])],
    [st("game", ["pause"]), { type: "open", panel: "credits" }, "same"],
    [st("game", ["pause"]), { type: "open", panel: "confirm" }, st("game", ["pause", "confirm"])],
    [st("game", ["pause"]), { type: "play" }, "same"],
    // game + pause + settings (+ confirm)
    [st("game", ["pause", "settings"]), { type: "escape" }, st("game", ["pause"])],
    [st("game", ["pause", "settings"]), { type: "resume" }, st("game")],
    [st("game", ["pause", "settings"]), { type: "toTitle" }, st("title")],
    [st("game", ["pause", "settings"]), { type: "open", panel: "confirm" }, st("game", ["pause", "settings", "confirm"])],
    [st("game", ["pause", "confirm"]), { type: "open", panel: "settings" }, "same"], // sommet ≠ pause
    [st("game", ["pause", "settings", "confirm"]), { type: "open", panel: "confirm" }, "same"], // jamais deux fois
    [st("game", ["pause", "settings", "confirm"]), { type: "escape" }, st("game", ["pause", "settings"])],
    [st("game", ["pause", "settings", "confirm"]), { type: "toTitle" }, st("title")],
    [st("game", ["confirm"]), { type: "open", panel: "confirm" }, "same"],
    [st("game", ["confirm"]), { type: "open", panel: "pause" }, "same"], // pause seulement sans panneau
  ];

  for (const [from, e, want] of T) {
    it(`${show(from)} --${label(e)}--> ${want === "same" ? "(refusé)" : show(want)}`, () => {
      const next = reduceScreens(from, e);
      if (want === "same") expect(next).toBe(from);
      else {
        expect(next).not.toBe(from);
        expect(next).toEqual(want);
      }
    });
  }
});

describe("propriétés", () => {
  it("événement invalide ⇒ MÊME référence (pas une copie égale)", () => {
    const title = replay({ type: "booted" });
    expect(reduceScreens(title, { type: "back" })).toBe(title);
    expect(reduceScreens(title, { type: "open", panel: "pause" })).toBe(title);
    const boot = INITIAL_SCREENS;
    expect(reduceScreens(boot, { type: "play" })).toBe(boot);
  });

  it("états produits gelés ; entrée jamais mutée (entrées gelées)", () => {
    const from = Object.freeze({ screen: "game" as const, panels: Object.freeze(["pause"] as PanelId[]) });
    const next = reduceScreens(from, { type: "open", panel: "settings" });
    expect(from.panels).toEqual(["pause"]);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.panels)).toBe(true);
    expect(() => (next.panels as PanelId[]).push("credits")).toThrow();
  });

  it("isTicking vrai SEULEMENT en game sans panneau ; showsHud ⇔ game", () => {
    for (const screen of ["boot", "title", "game"] as const) {
      for (const panels of [[], ["pause"], ["confirm"], ["pause", "settings"]] as PanelId[][]) {
        const s = st(screen, panels);
        expect(isTicking(s), show(s)).toBe(screen === "game" && panels.length === 0);
        expect(showsHud(s), show(s)).toBe(screen === "game");
      }
    }
  });

  it("topPanel = sommet de la pile", () => {
    expect(topPanel(st("game", ["pause", "settings"]))).toBe("settings");
    expect(topPanel(st("game", ["pause"]))).toBe("pause");
    expect(topPanel(st("game"))).toBeNull();
  });

  it("Échap : pop si un panneau est ouvert, pause en jeu, rien au titre / au boot", () => {
    expect(reduceScreens(st("game"), { type: "escape" })).toEqual(st("game", ["pause"]));
    expect(reduceScreens(st("game", ["pause", "settings"]), { type: "escape" })).toEqual(st("game", ["pause"]));
    const title = st("title");
    expect(reduceScreens(title, { type: "escape" })).toBe(title);
    expect(reduceScreens(st("title", ["credits"]), { type: "escape" })).toEqual(st("title"));
    // Échap, Échap depuis paramètres ⇒ retour au jeu (qui tourne).
    const s = replay({ type: "booted" }, { type: "play" }, { type: "escape" }, { type: "open", panel: "settings" }, { type: "escape" }, { type: "escape" });
    expect(s).toEqual(st("game"));
    expect(isTicking(s)).toBe(true);
  });

  it("crédits seulement depuis le titre, sans panneau", () => {
    for (const s of [st("boot"), st("game"), st("game", ["pause"]), st("title", ["settings"])]) {
      expect(canOpen(s, "credits"), show(s)).toBe(false);
    }
    expect(canOpen(st("title"), "credits")).toBe(true);
  });

  it("toTitle vide la pile (game seulement)", () => {
    const s = replay({ type: "booted" }, { type: "play" }, { type: "escape" }, { type: "open", panel: "settings" }, { type: "toTitle" });
    expect(s).toEqual(st("title"));
    expect(isTicking(s)).toBe(false);
  });

  it("double `play` ⇒ un seul passage (le second est refusé : même référence)", () => {
    const title = replay({ type: "booted" });
    const once = reduceScreens(title, { type: "play" });
    expect(once.screen).toBe("game");
    expect(reduceScreens(once, { type: "play" })).toBe(once);
    // Titre avec confirmation ouverte (Nouvelle partie avec Continuer) : play refusé.
    const confirming = reduceScreens(title, { type: "open", panel: "confirm" });
    expect(reduceScreens(confirming, { type: "play" })).toBe(confirming);
  });

  it("pile ≤ 3 (MAX_PANELS) : aucun 4e panneau, même en essayant tous les ordres", () => {
    expect(MAX_PANELS).toBe(3);
    const full = st("game", ["pause", "settings", "confirm"]);
    for (const p of PANELS) expect(reduceScreens(full, { type: "open", panel: p })).toBe(full);
  });

  it("marche aléatoire déterministe (5 000 événements) : invariants toujours vrais", () => {
    let seed = 7;
    const rand = (n: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    let s = INITIAL_SCREENS;
    const seen = new Set<string>();
    for (let i = 0; i < 5_000; i++) {
      const e = EVENTS[rand(EVENTS.length)] as ScreenEvent;
      const next = reduceScreens(s, e);
      const ctx = `${show(s)} --${label(e)}--> ${show(next)}`;
      expect(next.panels.length, ctx).toBeLessThanOrEqual(MAX_PANELS);
      expect(new Set(next.panels).size, ctx).toBe(next.panels.length); // jamais deux fois le même
      if (next.screen === "boot") expect(next.panels, ctx).toEqual([]);
      if (next.panels.includes("credits")) expect(next.screen, ctx).toBe("title");
      if (next.panels.includes("pause")) {
        expect(next.screen, ctx).toBe("game");
        expect(next.panels[0], ctx).toBe("pause");
      }
      if (next.panels.includes("settings") && next.screen === "game") expect(next.panels[0], ctx).toBe("pause");
      // On ne revient jamais au boot.
      if (s.screen !== "boot") expect(next.screen, ctx).not.toBe("boot");
      // Un changement d'écran vide toujours la pile.
      if (next.screen !== s.screen) expect(next.panels, ctx).toEqual([]);
      seen.add(show(next));
      s = next;
    }
    // La marche a bien exploré la pile pleine.
    expect([...seen].some((x) => x.split(",").length === 3)).toBe(true);
  });
});
