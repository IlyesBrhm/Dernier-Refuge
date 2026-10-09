// Interface refaite (docs/design/ui-polish.md §6.2) : écran titre, pause réelle, paramètres persistés,
// HUD compact, clavier seul, console propre et hors ligne, tutoriel, robustesse. Projet Playwright
// « e2e » (build de production). Chaque test a son propre contexte (stockage vide).
//
// Contrat DOM : #app[data-screen|data-panel|data-render-ready], #title [data-action], #controls,
// #dialogs [data-dialog], #hud [data-hud], #tutorial, #notices ; lecture seule `window.__gameInfo`.

import { expect, test, type Page } from "@playwright/test";
import { buildDayNightScenarios } from "./daynight-scenario";
import {
  enterGame,
  expectClean,
  expectHudLabels,
  expectPanel,
  freezeClock,
  gameInfo,
  horizontalOverflow,
  hudLabel,
  hudNumber,
  importState,
  importViaMenu,
  installCanvasTextSpy,
  installPageClock,
  openPause,
  openWithState,
  render3dInfo,
  resume,
  seedPrefs,
  stepTicks,
  storedPrefs,
  unfreezeClock,
  waitFrames,
  waitLoopTime,
  waitNoPanel,
  waitReady,
  waitTitle,
  watch,
  WEBGL_LAUNCH,
  writeSaveFile,
} from "./helpers";
import { buildMidgameScenario } from "./midgame-scenario";
import { buildUiScenarios } from "./ui-scenario";

test.use(WEBGL_LAUNCH);

const SC = buildDayNightScenarios();
const UI = buildUiScenarios();

const title = (page: Page, action: "continue" | "new-game" | "settings" | "credits") => page.locator(`#title [data-action="${action}"]`);
const inDialog = (page: Page, dialog: "pause" | "settings" | "credits" | "confirm", action: string) =>
  page.locator(`#dialogs [data-dialog="${dialog}"] [data-action="${action}"]`);

/** L'élément actif : data-action, id, rôle, dialogue englobant, contour de focus. */
async function focused(page: Page): Promise<{ action: string; id: string; role: string; dialog: string; value: string; outline: number; outlineStyle: string }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const cs = el ? getComputedStyle(el) : null;
    return {
      action: el?.dataset.action ?? "",
      id: el?.id ?? "",
      role: el?.getAttribute("role") ?? el?.tagName.toLowerCase() ?? "",
      dialog: el?.closest<HTMLElement>("[data-dialog]")?.dataset.dialog ?? "",
      value: el?.dataset.value ?? "",
      outline: cs ? Number.parseFloat(cs.outlineWidth) || 0 : 0,
      outlineStyle: cs?.outlineStyle ?? "none",
    };
  });
}

/** Focus visible : contour ≥ 2 px (guide de style : focus jamais invisible). */
async function expectVisibleFocus(page: Page, what: string): Promise<void> {
  const f = await focused(page);
  expect(f.outlineStyle, `${what} : contour de focus`).not.toBe("none");
  expect(f.outline, `${what} : épaisseur du contour`).toBeGreaterThanOrEqual(2);
}

/** Appuie sur Tab (ou Maj+Tab) jusqu'à ce que `pred` soit vrai ; échoue après `max` appuis. */
async function tabUntil(page: Page, pred: (f: Awaited<ReturnType<typeof focused>>) => boolean, back = false, max = 20): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (pred(await focused(page))) return;
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
  }
  if (!pred(await focused(page))) throw new Error(`focus attendu non atteint en ${max} tabulations : ${JSON.stringify(await focused(page))}`);
}

// ================================================================================================

test.describe("écran titre", () => {
  test("titre ⇒ nouvelle partie ⇒ tutoriel (étape 1, flèche) ; recharger ⇒ Continuer « Jour 1 » ; Nouvelle partie ⇒ confirmation", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await page.goto("/");
    await waitReady(page);
    await waitTitle(page);
    await expect(page.locator("#title h1")).toHaveText("Dernier Refuge");
    await expect(title(page, "continue")).toBeHidden(); // aucune partie jouée
    await expect(title(page, "new-game")).toBeVisible();
    await expect(title(page, "new-game")).toBeFocused(); // focus initial sur le premier bouton
    await expect(title(page, "settings")).toBeVisible();
    await expect(title(page, "credits")).toBeVisible();
    await expect(page.locator("#title .title-sound")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#hud")).toBeHidden();
    await expect(page.locator("#controls")).toBeHidden();
    await expect(page.locator("#tutorial")).toBeHidden();

    // Titre : la boucle tourne (rendu) mais AUCUN tick.
    const t0 = await gameInfo(page);
    expect(t0.screen).toBe("title");
    expect(t0.ticking).toBe(false);
    await waitLoopTime(page, 1000, 5);
    expect((await gameInfo(page)).tick).toBe(t0.tick);
    expect(t0.tick).toBe(0);
    expect((await render3dInfo(page)).presentation).toBe("title");

    await title(page, "new-game").click();
    await expect(page.locator("#app")).toHaveAttribute("data-screen", "game");
    await expect(page.locator("#tutorial")).toBeVisible();
    await expect(page.locator("#tutorial")).toHaveAttribute("data-step", "welcome");
    await expect(page.locator("#tutorial .tutorial-card__count")).toHaveText("Objectif 1 sur 6");
    await expect(page.locator('#tutorial [data-action="skip-tutorial"]')).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __render3d?: { info(): { guide: boolean } } }).__render3d?.info().guide === true, undefined, {
      timeout: 30_000,
      polling: 50,
    });
    expect((await render3dInfo(page)).presentation).toBe("play");
    await waitLoopTime(page, 1000, 5);
    expect((await gameInfo(page)).tick).toBeGreaterThan(0);
    await expect.poll(async () => (await storedPrefs(page))?.tutorial.status).toBe("active");

    // Rechargement (autosave à pagehide) : Continuer « Jour 1 · jour », Nouvelle partie secondaire.
    await page.reload();
    await waitReady(page);
    await waitTitle(page);
    await expect(title(page, "continue")).toBeVisible();
    await expect(title(page, "continue")).toBeFocused();
    await expect(page.locator("#title .title-continue-line")).toHaveText("Jour 1 · jour");
    await expect(title(page, "new-game")).toHaveClass(/\bbtn--secondary\b/);
    expect((await gameInfo(page)).ticking).toBe(false);

    // Nouvelle partie avec une partie existante ⇒ confirmation (alertdialog, focus sur Annuler).
    await title(page, "new-game").click();
    await expectPanel(page, "confirm");
    await expect(page.locator('#dialogs [data-dialog="confirm"] [role="alertdialog"]')).toBeVisible();
    await expect(page.locator('#dialogs [data-dialog="confirm"]')).toContainText("La partie actuelle sera perdue. Pensez à l'exporter.");
    await expect(inDialog(page, "confirm", "cancel")).toBeFocused();
    await page.keyboard.press("Escape");
    await waitNoPanel(page);
    await expect(page.locator("#app")).toHaveAttribute("data-screen", "title");
    await expect(title(page, "continue")).toBeVisible();
    expectClean(p);
  });

  test("crédits depuis le titre : contenu de CREDITS.md, liens externes sûrs, Échap ⇒ retour au titre", async ({ page }) => {
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitTitle(page);
    await title(page, "credits").click();
    await expectPanel(page, "credits");
    const credits = page.locator('#dialogs [data-dialog="credits"]');
    await expect(credits.getByRole("dialog")).toBeVisible();
    await expect(credits).toContainText("Kay Lousberg");
    await expect(credits).toContainText("Polices et icônes");
    const links = credits.locator("a");
    expect(await links.count()).toBeGreaterThan(5);
    for (const a of await links.all()) {
      await expect(a).toHaveAttribute("href", /^https?:\/\//);
      await expect(a).toHaveAttribute("target", "_blank");
      await expect(a).toHaveAttribute("rel", /noopener/);
    }
    expect(await credits.locator("script, img, iframe").count()).toBe(0);
    await page.keyboard.press("Escape");
    await waitNoPanel(page);
    await expect(title(page, "credits")).toBeFocused(); // le focus revient au bouton d'origine
    expectClean(p);
  });
});

// ================================================================================================

test.describe("pause réelle", () => {
  test("Échap ⇒ pause : tick figé ≥ 3 s (aussi sous Paramètres), flèches sans effet ; Reprendre ⇒ le temps repart", async ({ page }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await enterGame(page, "new");
    await waitLoopTime(page, 500, 5);

    await page.keyboard.press("Escape");
    await expectPanel(page, "pause");
    await expect(inDialog(page, "pause", "resume")).toBeFocused();
    const a = await gameInfo(page);
    expect(a.ticking).toBe(false);
    const clock0 = await hudLabel(page, "clock");
    const played = await waitLoopTime(page, 3000, 10);
    expect(played.loopMs).toBeGreaterThanOrEqual(3000);
    for (const key of ["ArrowRight", "ArrowDown", "KeyD"]) {
      await page.keyboard.down(key);
      await waitLoopTime(page, 300, 3);
      await page.keyboard.up(key);
    }
    expect((await gameInfo(page)).tick).toBe(a.tick);
    expect(await hudLabel(page, "clock")).toBe(clock0);

    // Paramètres ouverts depuis la pause : toujours figé.
    await inDialog(page, "pause", "settings").click();
    await expectPanel(page, "settings");
    await expect(page.locator('#dialogs [data-dialog="pause"]')).toHaveClass(/\bis-covered\b/);
    await waitLoopTime(page, 1000, 5);
    expect((await gameInfo(page)).tick).toBe(a.tick);
    await page.keyboard.press("Escape");
    await expectPanel(page, "pause");
    await expect(inDialog(page, "pause", "settings")).toBeFocused(); // retour au bouton d'origine

    await resume(page);
    expect((await gameInfo(page)).ticking).toBe(true);
    await waitLoopTime(page, 1000, 5);
    const b = await gameInfo(page);
    expect(b.tick).toBeGreaterThan(a.tick);

    // P ouvre et referme la pause ; le bouton « Pause » de #controls aussi.
    await page.keyboard.press("p");
    await expectPanel(page, "pause");
    await page.keyboard.press("p");
    await waitNoPanel(page);
    await openPause(page);
    await resume(page);
    await expect(page.locator('#controls [data-action="pause"]')).toHaveAttribute("aria-label", "Pause");
    expectClean(p);
  });

  test("pause pendant le bilan de l'aube : la carte reste (inerte, recouverte), rien ne se perd, réapparaît à la reprise", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await openWithState(page, testInfo, "/", SC.dawn);
    const report = page.locator("#dawn-report");
    await expect(report).toBeVisible();
    await expect(page.locator("#dawn-report-title")).toHaveText("Nuit 1 terminée");
    await unfreezeClock(page);

    await page.keyboard.press("Escape");
    await expectPanel(page, "pause");
    const a = await gameInfo(page);
    await expect(page.locator("#notices .notice-slot--card")).toHaveClass(/\bis-covered\b/);
    await expect(report).not.toHaveAttribute("hidden", /.*/);
    expect(await report.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    await waitLoopTime(page, 2000, 10);
    expect((await gameInfo(page)).tick).toBe(a.tick);

    await resume(page);
    await expect(report).toBeVisible();
    await expect(page.locator("#notices .notice-slot--card")).not.toHaveClass(/\bis-covered\b/);
    await expect(page.locator("#dawn-report-title")).toHaveText("Nuit 1 terminée");
    await expect(report.locator(".notice-card__list li")).toHaveCount(4);
    await waitLoopTime(page, 1000, 5);
    expect((await gameInfo(page)).tick).toBeGreaterThan(a.tick);
    expectClean(p);
  });
});

// ================================================================================================

test.describe("paramètres", () => {
  test("Bas, ambiance 30 %, son coupé, mouvement réduit Activé ⇒ appliqués tout de suite et conservés après rechargement", async ({ page }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await waitTitle(page);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "full");

    await title(page, "settings").click();
    await expectPanel(page, "settings");
    const dlg = page.locator('#dialogs [data-dialog="settings"]');
    await expect(page.locator("#settings-tab-0")).toHaveAttribute("aria-selected", "true");
    await dlg.locator('[role="radio"][data-value="low"]').click();
    await expect(dlg.locator('[role="radio"][data-value="low"]')).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await render3dInfo(page)).quality).toBe("low");

    await page.locator("#settings-tab-1").click();
    await expect(page.locator("#settings-tab-1")).toHaveAttribute("aria-selected", "true");
    const panel1 = page.locator("#settings-panel-1");
    await panel1.locator('[role="switch"]').first().click();
    await expect(panel1.locator('[role="switch"]').first()).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#title .title-sound")).toHaveAttribute("aria-pressed", "true");
    const ambience = panel1.locator("input.slider[type=range]").nth(1);
    await ambience.fill("30");
    await expect(ambience).toHaveValue("30");
    await expect(ambience).toHaveAttribute("aria-valuetext", "30 %");

    await page.locator("#settings-tab-2").click();
    const motionOn = page.locator('#settings-panel-2 [role="radio"][data-value="on"]');
    await motionOn.click();
    await expect(motionOn).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");

    await expect
      .poll(async () => storedPrefs(page))
      .toMatchObject({ quality: "low", muted: true, ambienceVolume: 30, reducedMotion: "on", sfxVolume: 80 });

    await page.reload();
    await waitReady(page);
    await waitTitle(page);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    await expect.poll(async () => (await render3dInfo(page)).quality).toBe("low");
    await expect(page.locator("#title .title-sound")).toHaveAttribute("aria-pressed", "true");
    await title(page, "settings").click();
    await expectPanel(page, "settings");
    await expect(dlg.locator('[role="radio"][data-value="low"]')).toHaveAttribute("aria-checked", "true");
    await page.locator("#settings-tab-1").click();
    await expect(panel1.locator('[role="switch"]').first()).toHaveAttribute("aria-checked", "true");
    await expect(panel1.locator("input.slider[type=range]").nth(1)).toHaveValue("30");
    await expect(panel1.locator("input.slider[type=range]").nth(0)).toHaveValue("80");
    await page.locator("#settings-tab-2").click();
    await expect(motionOn).toHaveAttribute("aria-checked", "true");
    expectClean(p);
  });

  for (const [name, raw] of [
    ["JSON illisible « {oops »", "{oops"],
    ["volume 999", JSON.stringify({ version: 1, quality: null, fullscreen: false, muted: false, sfxVolume: 999, ambienceVolume: 60, reducedMotion: "system", tutorial: { status: "done", done: 63 } })],
    ["version future", JSON.stringify({ version: 2, quality: "low" })],
    ["clé géante", "x".repeat(10_000)],
  ] as const) {
    test(`préférences abîmées (${name}) ⇒ démarrage normal avec les défauts, aucune erreur console`, async ({ page }) => {
      const p = watch(page);
      await seedPrefs(page, {}, { raw, overwrite: true });
      await page.goto("/");
      await waitReady(page);
      await waitTitle(page);
      await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
      await title(page, "settings").click();
      await expectPanel(page, "settings");
      await page.locator("#settings-tab-1").click();
      await expect(page.locator("#settings-panel-1 input.slider[type=range]").nth(0)).toHaveValue("80");
      await expect(page.locator("#settings-panel-1 input.slider[type=range]").nth(1)).toHaveValue("60");
      await page.keyboard.press("Escape");
      await waitNoPanel(page);
      await enterGame(page, "new");
      expectClean(p);
    });
  }
});

// ================================================================================================

test.describe("HUD compact (≤ 12 % de la hauteur) et pas de débordement horizontal", () => {
  for (const [w, h] of [
    [360, 640],
    [390, 844],
    [412, 915],
    [844, 390],
  ] as const) {
    test(`${w}×${h} : jour, nuit, 9 999 bois`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const p = watch(page);
      await page.setViewportSize({ width: w, height: h });
      // HUD = DOM : mesuré en 2D (plus rapide sous SwiftShader), même mise en page qu'en 3D.
      await openWithState(page, testInfo, "/?render=2d", SC.day);
      for (const [key, c] of [
        ["jour", SC.day],
        ["nuit", SC.nightLit],
        ["9 999 bois", UI.bigStock],
      ] as const) {
        if (key !== "jour") await importState(page, testInfo, c);
        await expectHudLabels(page, "expect" in c ? c.expect.hud : c.hud, `${w}×${h} ${key}`);
        await waitFrames(page, 2);
        const box = await page.locator("#hud").boundingBox();
        const vh = await page.evaluate(() => window.innerHeight);
        expect(box, key).not.toBeNull();
        console.log(`[mesure] HUD ${w}×${h} ${key} : hauteur ${box?.height.toFixed(1)} px / ${vh} (${(((box?.height ?? 0) / vh) * 100).toFixed(1)} %)`);
        expect(box?.height ?? Infinity, `${w}×${h} ${key} : hauteur du HUD`).toBeLessThanOrEqual(0.12 * vh);
        expect((box?.x ?? 0) + (box?.width ?? 0), `${w}×${h} ${key} : HUD dans la largeur`).toBeLessThanOrEqual(w + 0.5);
        const o = await horizontalOverflow(page);
        expect(o.html, `${w}×${h} ${key} : débordement html`).toBeLessThanOrEqual(0);
        expect(o.body, `${w}×${h} ${key} : débordement body`).toBeLessThanOrEqual(0);
      }
      expectClean(p);
    });
  }
});

// ================================================================================================

test.describe("clavier seul", () => {
  test("titre → Nouvelle partie → jeu → Échap → pause → Paramètres (onglets, radios, interrupteur, curseur) → Échap → Échap ⇒ jeu ; focus visible et piégé", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await waitTitle(page);

    // Titre : focus initial, Tab / Maj+Tab entre les boutons, contour visible.
    await expect(title(page, "new-game")).toBeFocused();
    await page.keyboard.press("Tab");
    expect((await focused(page)).action).toBe("settings");
    await expectVisibleFocus(page, "titre : Paramètres");
    await page.keyboard.press("Tab");
    expect((await focused(page)).action).toBe("credits");
    await expectVisibleFocus(page, "titre : Crédits");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    expect((await focused(page)).action).toBe("new-game");
    await expectVisibleFocus(page, "titre : Nouvelle partie");
    await page.keyboard.press("Enter");
    await expect(page.locator("#app")).toHaveAttribute("data-screen", "game");
    await expect.poll(async () => (await gameInfo(page)).ticking).toBe(true);

    // Jeu : Échap ⇒ pause, focus sur Reprendre.
    await page.keyboard.press("Escape");
    await expectPanel(page, "pause");
    await expect(inDialog(page, "pause", "resume")).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expectVisibleFocus(page, "pause : Reprendre");

    // Piège : 15 Tab puis 15 Maj+Tab, le focus ne quitte jamais le dialogue « pause ».
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press(key);
        const f = await focused(page);
        expect(f.dialog, `${key} n°${i + 1} : focus hors de la pause (${JSON.stringify(f)})`).toBe("pause");
        await expectVisibleFocus(page, `pause ${key} n°${i + 1}`);
      }
    }

    // Paramètres au clavier (Espace sur le bouton).
    await tabUntil(page, (f) => f.action === "settings" && f.dialog === "pause");
    await page.keyboard.press("Space");
    await expectPanel(page, "settings");
    expect((await focused(page)).id).toBe("settings-tab-0");
    await expectVisibleFocus(page, "onglet Affichage");
    for (const [key, want] of [
      ["ArrowRight", 1],
      ["ArrowRight", 2],
      ["ArrowRight", 0],
      ["ArrowLeft", 2],
      ["Home", 0],
      ["End", 2],
    ] as const) {
      await page.keyboard.press(key);
      expect((await focused(page)).id, key).toBe(`settings-tab-${want}`);
      await expect(page.locator(`#settings-tab-${want}`)).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(`#settings-panel-${want}`)).toBeVisible();
    }

    // Accessibilité : Tab ⇒ radio cochée (Système) ; flèches ⇒ choix appliqué.
    await page.keyboard.press("Tab");
    let f = await focused(page);
    expect(f.role).toBe("radio");
    expect(f.value).toBe("system");
    await page.keyboard.press("ArrowRight");
    expect((await focused(page)).value).toBe("on");
    await expect(page.locator('#settings-panel-2 [role="radio"][data-value="on"]')).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('#settings-panel-2 [role="radio"][data-value="system"]')).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "full");

    // Son : retour aux onglets (Maj+Tab), ← ; interrupteur à l'Espace ; curseur aux flèches.
    await page.keyboard.press("Shift+Tab");
    expect((await focused(page)).id).toBe("settings-tab-2");
    await page.keyboard.press("ArrowLeft");
    expect((await focused(page)).id).toBe("settings-tab-1");
    await page.keyboard.press("Tab");
    f = await focused(page);
    expect(f.role).toBe("switch");
    await expectVisibleFocus(page, "interrupteur Couper le son");
    const mute = page.locator('#settings-panel-1 [role="switch"]').first();
    await page.keyboard.press("Space");
    await expect(mute).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Enter");
    await expect(mute).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Tab");
    const sfx = page.locator("#settings-panel-1 input.slider[type=range]").nth(0);
    await expect(sfx).toBeFocused();
    await expectVisibleFocus(page, "curseur des effets");
    await page.keyboard.press("ArrowLeft");
    await expect(sfx).toHaveValue("75");
    await page.keyboard.press("ArrowRight");
    await expect(sfx).toHaveValue("80");

    // Piège dans les paramètres aussi.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect((await focused(page)).dialog, `paramètres Tab n°${i + 1}`).toBe("settings");
    }

    // Échap (même focus dans le curseur) ⇒ pause, focus rendu au bouton Paramètres ; Échap ⇒ jeu.
    await tabUntil(page, (x) => x.role === "input" || x.role === "slider" || x.id.startsWith("slider"));
    await page.keyboard.press("Escape");
    await expectPanel(page, "pause");
    await expect(inDialog(page, "pause", "settings")).toBeFocused();
    await page.keyboard.press("Escape");
    await waitNoPanel(page);
    expect((await gameInfo(page)).ticking).toBe(true);

    // Bouton Pause atteint au clavier ; confirmation (alertdialog) : focus sur Annuler, piège, Échap.
    await tabUntil(page, (x) => x.action === "pause");
    await expectVisibleFocus(page, "bouton Pause");
    await page.keyboard.press("Enter");
    await expectPanel(page, "pause");
    await tabUntil(page, (x) => x.action === "new-game" && x.dialog === "pause");
    await page.keyboard.press("Enter");
    await expectPanel(page, "confirm");
    await expect(inDialog(page, "confirm", "cancel")).toBeFocused();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      expect((await focused(page)).dialog).toBe("confirm");
    }
    await page.keyboard.press("Escape");
    await expectPanel(page, "pause");
    await expect(inDialog(page, "pause", "new-game")).toBeFocused();
    await page.keyboard.press("Escape");
    await waitNoPanel(page);
    await expect(page.locator('#controls [data-action="pause"]')).toBeFocused(); // retour au bouton d'origine
    expect((await gameInfo(page)).ticking).toBe(true);
    expectClean(p);
  });
});

// ================================================================================================

test.describe("console propre et hors ligne", () => {
  test("titre, crédits, paramètres, jeu, pause, paramètres, retour au titre : 0 erreur, 0 exception, 0 HTTP ≥ 400, tout en local, polices chargées", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await waitTitle(page);

    await title(page, "credits").click();
    await expectPanel(page, "credits");
    await inDialog(page, "credits", "back").or(page.locator('#dialogs [data-dialog="credits"] .dialog-back')).first().click();
    await waitNoPanel(page);
    await title(page, "settings").click();
    await expectPanel(page, "settings");
    await page.locator('#dialogs [data-dialog="settings"] .dialog-back').click();
    await waitNoPanel(page);

    await enterGame(page, "new");
    await waitLoopTime(page, 1000, 5);
    await openPause(page);
    await inDialog(page, "pause", "settings").click();
    await expectPanel(page, "settings");
    await page.locator("#settings-tab-1").click();
    await page.locator("#settings-tab-2").click();
    await page.keyboard.press("Escape");
    await expectPanel(page, "pause");
    await inDialog(page, "pause", "to-title").click();
    await waitTitle(page);
    await expect(page.locator("#app")).not.toHaveAttribute("data-panel", /.+/);
    // Retour au titre après avoir joué : Continuer disponible.
    await expect(title(page, "continue")).toBeVisible();
    await expect(page.locator("#title .title-continue-line")).toHaveText(/^Jour 1 · (jour|nuit)$/);
    expect((await gameInfo(page)).ticking).toBe(false);

    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return { nunito: document.fonts.check("16px Nunito"), fredoka: document.fonts.check("600 16px Fredoka") };
    });
    expect(fonts).toEqual({ nunito: true, fredoka: true });

    const origin = new URL(baseURL ?? "http://localhost:4173/").origin;
    const foreign = p.requests.filter((u) => !u.startsWith("data:") && !u.startsWith("blob:") && new URL(u).origin !== origin);
    expect(foreign, "requêtes hors de l'origine locale").toEqual([]);
    expectClean(p);
  });

  test("window.__gameInfo : lecture seule (écraser, redéfinir, supprimer ⇒ sans effet), nombres / chaînes uniquement", async ({ page }) => {
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await enterGame(page, "new");
    await waitLoopTime(page, 500, 5);
    const r = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown> & { __gameInfo: { tick(): unknown; screen(): unknown; ticking(): unknown } };
      const original = w.__gameInfo;
      const attempts: string[] = [];
      const tryIt = (name: string, fn: () => void): void => {
        try {
          fn();
          attempts.push(`${name}: ok`);
        } catch {
          attempts.push(`${name}: refusé`);
        }
      };
      tryIt("assign", () => {
        w.__gameInfo = { tick: () => 999_999, screen: () => "hack", ticking: () => false };
      });
      tryIt("method", () => {
        (original as unknown as Record<string, unknown>).tick = () => 999_999;
      });
      tryIt("define", () => Object.defineProperty(window, "__gameInfo", { value: {} }));
      tryIt("delete", () => {
        Reflect.deleteProperty(window, "__gameInfo");
      });
      tryIt("proto", () => {
        Object.setPrototypeOf(original, { tick: () => 1 });
      });
      const info = w.__gameInfo;
      return {
        same: info === original,
        frozen: Object.isFrozen(info),
        tick: info.tick(),
        screen: info.screen(),
        ticking: info.ticking(),
        keys: Object.keys(info).sort(),
        hasGame: "__game" in window,
        attempts,
      };
    });
    expect(r.same).toBe(true);
    expect(r.frozen).toBe(true);
    expect(typeof r.tick).toBe("number");
    expect(r.tick).not.toBe(999_999);
    expect(r.tick as number).toBeGreaterThan(0);
    expect(r.screen).toBe("game");
    expect(r.ticking).toBe(true);
    expect(r.keys).toEqual(["screen", "tick", "ticking"]);
    expect(r.hasGame).toBe(false); // aucun accès à l'état en production
    // Le jeu continue normalement après les tentatives.
    const before = (await gameInfo(page)).tick;
    await waitLoopTime(page, 500, 5);
    expect((await gameInfo(page)).tick).toBeGreaterThan(before);
    expectClean(p);
  });
});

// ================================================================================================

test.describe("tutoriel", () => {
  test("« Accueillez » accompli par un vrai déplacement sur W ⇒ « Objectif 2 sur 6 »", async ({ page }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await page.addInitScript(installPageClock);
    // Carte du tutoriel = DOM : 2D (plus rapide sous SwiftShader), seed fixe (partie temporaire).
    await page.goto("/?seed=7&render=2d");
    await waitReady(page);
    await enterGame(page, "new");
    await expect(page.locator("#tutorial .tutorial-card__count")).toHaveText("Objectif 1 sur 6");
    await freezeClock(page);
    await waitFrames(page, 2);
    // P (7,8) → W (7,9) : 2 ticks vers le bas (0,4 tuile/tick) puis arrêt sur le tapis.
    await page.keyboard.down("ArrowDown");
    await waitFrames(page, 2);
    await stepTicks(page, 2);
    await page.keyboard.up("ArrowDown");
    await waitFrames(page, 2);
    // Le premier survivant arrive, fait la queue et est accueilli (≤ 60 s de jeu).
    for (let i = 0; i < 60; i++) {
      if ((await page.locator("#tutorial .tutorial-card__count").textContent()) === "Objectif 2 sur 6") break;
      await stepTicks(page, 10);
    }
    await expect(page.locator("#tutorial .tutorial-card__count")).toHaveText("Objectif 2 sur 6");
    await expect(page.locator("#tutorial")).toHaveAttribute("data-step", "pickupWood");
    await expect.poll(async () => (await storedPrefs(page))?.tutorial).toEqual({ status: "active", done: 1 });
    expectClean(p);
  });

  test("Passer ⇒ confirmation ⇒ disparu ; recharger ⇒ toujours absent", async ({ page }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await page.goto("/");
    await waitReady(page);
    await enterGame(page, "new");
    await expect(page.locator("#tutorial")).toBeVisible();
    await page.locator('#tutorial [data-action="skip-tutorial"]').click();
    await expectPanel(page, "confirm");
    await expect(page.locator('#dialogs [data-dialog="confirm"]')).toContainText("Passer le tutoriel ? Il ne reviendra pas.");
    expect((await gameInfo(page)).ticking).toBe(false); // la confirmation met en pause
    await inDialog(page, "confirm", "confirm").click();
    await waitNoPanel(page);
    await expect(page.locator("#tutorial")).toBeHidden();
    await waitFrames(page, 5);
    expect((await render3dInfo(page)).guide).toBe(false);
    await expect.poll(async () => (await storedPrefs(page))?.tutorial.status).toBe("skipped");

    await page.reload();
    await waitReady(page);
    await enterGame(page, "continue");
    await waitFrames(page, 10);
    await expect(page.locator("#tutorial")).toBeHidden();
    expect((await render3dInfo(page)).guide).toBe(false);
    expectClean(p);
  });

  test("import d'une sauvegarde avancée (jour 2) sur préférences vierges ⇒ tutoriel sauté, jamais réaffiché", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await page.addInitScript(installPageClock);
    // importState vide les textes canvas enregistrés : l'espion doit être installé avant goto.
    await page.addInitScript(installCanvasTextSpy);
    await page.goto("/");
    await waitReady(page);
    await enterGame(page, "new");
    await expect(page.locator("#tutorial")).toBeVisible();
    await importState(page, testInfo, SC.dawn);
    await expect(page.locator("#tutorial")).toBeHidden();
    await expect.poll(async () => (await storedPrefs(page))?.tutorial.status).toBe("skipped");
    await expect(page.locator('#notices .toast[data-key="tutorialDone"]')).toHaveCount(0); // sauté, pas « terminé »
    await unfreezeClock(page);
    await page.reload();
    await waitReady(page);
    await enterGame(page, "continue");
    await waitFrames(page, 10);
    await expect(page.locator("#tutorial")).toBeHidden();
    expectClean(p);
  });
});

// ================================================================================================

test.describe("robustesse", () => {
  test("clics très rapides sur Nouvelle partie (sans partie) : un seul passage en jeu, aucune confirmation, aucune erreur", async ({ page }) => {
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await waitTitle(page);
    await page.evaluate(() => {
      const b = document.querySelector<HTMLButtonElement>('#title [data-action="new-game"]');
      for (let i = 0; i < 5; i++) b?.click();
    });
    await expect(page.locator("#app")).toHaveAttribute("data-screen", "game");
    await waitFrames(page, 5);
    await expect(page.locator("#app")).not.toHaveAttribute("data-panel", /.+/);
    expect((await gameInfo(page)).ticking).toBe(true);
    expectClean(p);
  });

  test("double clic sur Continuer ⇒ un seul passage ; double clic sur Nouvelle partie (avec partie) ⇒ une seule confirmation", async ({ page }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await enterGame(page, "new");
    await waitLoopTime(page, 1000, 5);
    await page.reload();
    await waitReady(page);
    await waitTitle(page);
    await expect(title(page, "continue")).toBeVisible();

    // Nouvelle partie (avec Continuer) : double clic ⇒ UNE confirmation ; Annuler ⇒ titre.
    await title(page, "new-game").dblclick();
    await expectPanel(page, "confirm");
    await expect(page.locator('#dialogs [data-dialog="confirm"]:not([hidden])')).toHaveCount(1);
    await inDialog(page, "confirm", "cancel").click();
    await waitNoPanel(page);
    await expect(page.locator("#app")).toHaveAttribute("data-screen", "title");

    // Continuer : double clic (et rafale synchrone) ⇒ en jeu, une seule fois, sans panneau.
    const before = await gameInfo(page);
    await title(page, "continue").dblclick();
    await page.evaluate(() => {
      const b = document.querySelector<HTMLButtonElement>('#title [data-action="continue"]');
      for (let i = 0; i < 5; i++) b?.click();
    });
    await expect(page.locator("#app")).toHaveAttribute("data-screen", "game");
    await waitFrames(page, 5);
    await expect(page.locator("#app")).not.toHaveAttribute("data-panel", /.+/);
    const after = await gameInfo(page);
    expect(after.ticking).toBe(true);
    expect(after.tick).toBeGreaterThanOrEqual(before.tick); // la partie continue (pas remplacée)
    expectClean(p);
  });

  test("redimensionnement 1280 → 360 pendant l'animation d'un compteur ⇒ aucun débordement horizontal", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const p = watch(page);
    const sc = buildMidgameScenario();
    await seedPrefs(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/?render=2d");
    await waitReady(page);
    await enterGame(page, "new");
    const file = await writeSaveFile(testInfo, "midgame-resize.json", sc.saveText);
    await importViaMenu(page, file);
    // La récolte se termine seule : le compteur de bois défile vers la nouvelle valeur.
    await expect.poll(async () => hudNumber(page, "wood"), { timeout: 20_000 }).toBe(sc.woodAfter);
    await page.setViewportSize({ width: 360, height: 640 });
    for (let i = 0; i < 20; i++) {
      await waitFrames(page, 1);
      const o = await horizontalOverflow(page);
      expect(o.html, `image ${i}`).toBeLessThanOrEqual(0);
      expect(o.body, `image ${i}`).toBeLessThanOrEqual(0);
    }
    const box = await page.locator("#hud").boundingBox();
    expect(box?.height ?? Infinity).toBeLessThanOrEqual(0.12 * 640);
    expectClean(p);
  });

  test("qualité Bas → Haut → Bas × 5 : géométries et textures identiques, programmes bornés, < 120 draw calls", async ({ page }) => {
    test.setTimeout(180_000);
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await enterGame(page, "new");
    await waitFrames(page, 10);
    await openPause(page);
    await inDialog(page, "pause", "settings").click();
    await expectPanel(page, "settings");
    const radio = (q: "low" | "high") => page.locator(`#dialogs [data-dialog="settings"] [role="radio"][data-value="${q}"]`);
    const cycle = async (): Promise<void> => {
      for (const q of ["low", "high", "low"] as const) {
        await radio(q).click();
        await expect.poll(async () => (await render3dInfo(page)).quality).toBe(q);
        await waitFrames(page, 5);
      }
    };
    await cycle();
    const after1 = await render3dInfo(page);
    for (let i = 0; i < 4; i++) await cycle();
    const after5 = await render3dInfo(page);
    console.log(`[mesure] qualité : après 1 cycle ${JSON.stringify(after1)} ; après 5 ${JSON.stringify(after5)}`);
    expect(after5.geometries).toBe(after1.geometries);
    expect(after5.textures).toBe(after1.textures);
    expect(after5.programs).toBeLessThanOrEqual(after1.programs);
    expect(after5.calls).toBeLessThan(120);
    expect(after5.quality).toBe("low");
    await expect.poll(async () => (await storedPrefs(page))?.quality).toBe("low");
    expectClean(p);
  });
});
