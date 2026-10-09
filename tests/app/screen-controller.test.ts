// Câblage des écrans (src/app/screen-controller.ts, docs/design/ui-polish.md §1.1, §1.4) avec des faux
// (aucun DOM réel) : pause et entrées DÉRIVÉES uniquement de ScreensState (isTicking), panneaux ouverts /
// recouverts / fermés dans le bon ordre, confirmation résolue une seule fois.

import { createScreenController, type ConfirmPanel, type PanelView, type ScreenControllerDeps } from "../../src/app/screen-controller";
import { isTicking } from "../../src/app/screens";

interface Fakes {
  log: string[];
  paused: boolean[];
  enabled: boolean[];
  presentation: string[];
  scenes: string[];
  frozen: boolean[];
  app: { dataset: Record<string, string> };
  hud: { hidden: boolean };
  under: { inert: boolean };
  confirmAnswer: ((ok: boolean) => void) | null;
  deps: ScreenControllerDeps;
}

function view(name: string, log: string[]): PanelView {
  return {
    open: () => log.push(`${name}.open`),
    close: () => log.push(`${name}.close`),
    setCovered: (c) => log.push(`${name}.covered(${c})`),
  };
}

function fakes(): Fakes {
  const f = {
    log: [] as string[],
    paused: [] as boolean[],
    enabled: [] as boolean[],
    presentation: [] as string[],
    scenes: [] as string[],
    frozen: [] as boolean[],
    app: { dataset: {} as Record<string, string> },
    hud: { hidden: true },
    under: { inert: false },
    confirmAnswer: null as ((ok: boolean) => void) | null,
  };
  const confirm: ConfirmPanel = {
    ...view("confirm", f.log),
    set: (m, l) => f.log.push(`confirm.set(${m}|${l})`),
    onAnswer: (fn) => {
      f.confirmAnswer = fn;
    },
  };
  const deps: ScreenControllerDeps = {
    game: { setPaused: (p) => f.paused.push(p) },
    input: { setEnabled: (e) => f.enabled.push(e) },
    renderer: { setPresentation: (p) => f.presentation.push(p) },
    audio: { setScene: (s) => f.scenes.push(s) },
    notify: { setFrozen: (x) => f.frozen.push(x), setCovered: () => undefined, hideCard: () => f.log.push("notify.hideCard") },
    app: f.app as unknown as HTMLElement,
    hudElements: [f.hud as unknown as HTMLElement],
    underPanels: [f.under as unknown as HTMLElement],
    title: { show: () => f.log.push("title.show"), hide: () => f.log.push("title.hide") },
    panels: { pause: view("pause", f.log), settings: view("settings", f.log), credits: view("credits", f.log) },
    confirm,
  };
  // Même objet (pas une copie) : `onAnswer` écrit dans `f.confirmAnswer`.
  return Object.assign(f, { deps });
}

describe("dérivé de ScreensState", () => {
  it("au démarrage (boot) : jeu en pause, entrées coupées, présentation titre, HUD masqué", () => {
    const f = fakes();
    createScreenController(f.deps);
    expect(f.paused.at(-1)).toBe(true);
    expect(f.enabled.at(-1)).toBe(false);
    expect(f.presentation.at(-1)).toBe("title");
    expect(f.hud.hidden).toBe(true);
    expect(f.app.dataset.screen).toBe("boot");
  });

  it("booted ⇒ titre (toujours en pause) ; play ⇒ le jeu tourne, entrées actives, HUD visible", () => {
    const f = fakes();
    const c = createScreenController(f.deps);
    expect(c.dispatch({ type: "booted" })).toBe(true);
    expect(f.log).toContain("title.show");
    expect(f.paused.at(-1)).toBe(true);
    expect(f.scenes.at(-1)).toBe("title");
    expect(c.dispatch({ type: "play" })).toBe(true);
    expect(f.paused.at(-1)).toBe(false);
    expect(f.enabled.at(-1)).toBe(true);
    expect(f.presentation.at(-1)).toBe("play");
    expect(f.scenes.at(-1)).toBe("play");
    expect(f.hud.hidden).toBe(false);
    expect(f.log).toContain("title.hide");
    expect(f.app.dataset.screen).toBe("game");
  });

  it("pause ⇒ plus de tick ni d'entrée, toasts gelés, fond inerte, data-panel ; reprise ⇒ tout repart", () => {
    const f = fakes();
    const c = createScreenController(f.deps);
    c.dispatch({ type: "booted" });
    c.dispatch({ type: "play" });
    c.dispatch({ type: "escape" });
    expect(isTicking(c.state())).toBe(false);
    expect(f.paused.at(-1)).toBe(true);
    expect(f.enabled.at(-1)).toBe(false);
    expect(f.frozen.at(-1)).toBe(true);
    expect(f.scenes.at(-1)).toBe("pause");
    expect(f.under.inert).toBe(true);
    expect(f.hud.hidden).toBe(false); // le HUD reste (inerte) sous la pause
    expect(f.app.dataset.panel).toBe("pause");
    expect(f.log).toContain("pause.open");

    c.dispatch({ type: "open", panel: "settings" });
    expect(f.paused.at(-1)).toBe(true);
    expect(f.app.dataset.panel).toBe("settings");
    expect(f.log.slice(-3)).toEqual(["settings.open", "pause.covered(true)", "settings.covered(false)"]);

    c.dispatch({ type: "resume" });
    expect(f.paused.at(-1)).toBe(false);
    expect(f.enabled.at(-1)).toBe(true);
    expect(f.frozen.at(-1)).toBe(false);
    expect(f.under.inert).toBe(false);
    expect(f.app.dataset.panel).toBeUndefined();
    // Fermeture du sommet d'abord (ordre inverse de la pile).
    expect(f.log.slice(-2)).toEqual(["settings.close", "pause.close"]);
  });

  it("événement refusé ⇒ false et AUCUN effet (rien n'est réappliqué)", () => {
    const f = fakes();
    const c = createScreenController(f.deps);
    c.dispatch({ type: "booted" });
    const before = { paused: f.paused.length, log: f.log.length, presentation: f.presentation.length };
    expect(c.dispatch({ type: "open", panel: "pause" })).toBe(false); // pause interdite au titre
    expect(c.dispatch({ type: "back" })).toBe(false);
    expect(f.paused.length).toBe(before.paused);
    expect(f.log.length).toBe(before.log);
    expect(f.presentation.length).toBe(before.presentation);
  });

  it("toTitle depuis la pause : titre, pile vidée, présentation titre, carte masquée", () => {
    const f = fakes();
    const c = createScreenController(f.deps);
    c.dispatch({ type: "booted" });
    c.dispatch({ type: "play" });
    c.dispatch({ type: "escape" });
    c.dispatch({ type: "toTitle" });
    expect(c.state()).toEqual({ screen: "title", panels: [] });
    expect(f.paused.at(-1)).toBe(true);
    expect(f.presentation.at(-1)).toBe("title");
    expect(f.hud.hidden).toBe(true);
    expect(f.log).toContain("notify.hideCard");
    expect(f.log).toContain("pause.close");
  });
});

describe("confirmation", () => {
  it("résolue une fois : true sur réponse positive, panneau refermé AVANT la résolution", async () => {
    const f = fakes();
    const c = createScreenController(f.deps);
    c.dispatch({ type: "booted" });
    const p = c.confirm("Sûr ?", "Oui");
    expect(c.state().panels).toEqual(["confirm"]);
    expect(f.log).toContain("confirm.set(Sûr ?|Oui)");
    f.confirmAnswer?.(true);
    expect(c.state().panels).toEqual([]);
    f.confirmAnswer?.(false); // seconde réponse ignorée
    await expect(p).resolves.toBe(true);
  });

  it("Échap (pop) ⇒ résolue à false", async () => {
    const f = fakes();
    const c = createScreenController(f.deps);
    c.dispatch({ type: "booted" });
    c.dispatch({ type: "play" });
    const p = c.confirm("Passer le tutoriel ?", "Passer");
    expect(f.paused.at(-1)).toBe(true); // la confirmation en jeu met en pause
    c.dispatch({ type: "escape" });
    await expect(p).resolves.toBe(false);
    expect(f.paused.at(-1)).toBe(false);
  });

  it("une seule confirmation à la fois : la seconde est refusée tout de suite", async () => {
    const f = fakes();
    const c = createScreenController(f.deps);
    c.dispatch({ type: "booted" });
    const a = c.confirm("A", "a");
    await expect(c.confirm("B", "b")).resolves.toBe(false);
    f.confirmAnswer?.(true);
    await expect(a).resolves.toBe(true);
  });

  it("impossible au boot ⇒ false sans ouvrir de panneau", async () => {
    const f = fakes();
    const c = createScreenController(f.deps);
    await expect(c.confirm("A", "a")).resolves.toBe(false);
    expect(c.state().panels).toEqual([]);
    expect(f.log).not.toContain("confirm.open");
  });

  it("toTitle pendant une confirmation (pause + confirm) ⇒ confirmation résolue à false", async () => {
    const f = fakes();
    const c = createScreenController(f.deps);
    c.dispatch({ type: "booted" });
    c.dispatch({ type: "play" });
    c.dispatch({ type: "escape" });
    const p = c.confirm("Nouvelle partie ?", "Oui");
    c.dispatch({ type: "toTitle" });
    await expect(p).resolves.toBe(false);
  });
});
