// Zoom et gestes tactiles (WCAG 1.4.4, docs/design/ui-style.md « Accessibilité ») : la page reste zoomable
// à 200 % (pas de `user-scalable=no`), seule la zone de jeu (#game, canvas WebGL, joystick) bloque les gestes
// du navigateur (`touch-action: none`) pour qu'un double-tap pendant la partie ne zoome pas.
// Projet Playwright « e2e » — exécuté UNIQUEMENT dans la CI (cf. CLAUDE.md). Chaque test a son propre
// contexte (stockage vide) ; préférences pré-remplies avec le tutoriel terminé.

import { expect, test, type Page } from "@playwright/test";
import { enterGame, expectClean, openPause, seedPrefs, waitReady, waitTitle, watch, WEBGL_LAUNCH } from "./helpers";

test.use({ ...WEBGL_LAUNCH, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const touchAction = (page: Page, selector: string): Promise<string | null> =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).touchAction : null;
  }, selector);

/** Valeurs qui laissent le pinch-zoom au navigateur. */
const ZOOMABLE: readonly (string | null)[] = ["auto", "manipulation", "pinch-zoom", "pan-x pan-y pinch-zoom"];

/** Centre (x, part de la hauteur) de #game en coordonnées page. */
async function gamePoint(page: Page, yFraction: number): Promise<{ x: number; y: number }> {
  const box = await page.locator("#game").boundingBox();
  if (!box) throw new Error("#game sans boîte englobante");
  return { x: box.x + box.width / 2, y: box.y + box.height * yFraction };
}

test.describe("zoom et gestes tactiles", () => {
  test("la balise viewport n'interdit pas le zoom", async ({ page }) => {
    await seedPrefs(page);
    await page.goto("/");
    const content = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(content).not.toBeNull();
    expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
    expect(content).not.toMatch(/maximum-scale\s*=\s*1(\.0*)?(\s|,|$)/i);
  });

  test("écran titre, menus et HUD zoomables ; zone de jeu en touch-action: none", async ({ page }) => {
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await waitTitle(page);

    // Écran titre et ses boutons : zoom permis.
    expect(ZOOMABLE).toContain(await touchAction(page, "#title"));
    expect(ZOOMABLE).toContain(await touchAction(page, '#title [data-action="new-game"]'));
    for (const sel of ["html", "body", "#app"]) expect(ZOOMABLE, sel).toContain(await touchAction(page, sel));

    await enterGame(page, "new");

    // Zone de jeu : gestes bloqués (pas de zoom au double-tap pendant la partie).
    expect(await touchAction(page, "#game")).toBe("none");
    if ((await page.locator("#app > canvas.webgl").count()) > 0) expect(await touchAction(page, "#app > canvas.webgl")).toBe("none");

    // HUD : zoom permis.
    expect(ZOOMABLE).toContain(await touchAction(page, "#hud"));

    // Joystick (apparaît au premier contact) : gestes bloqués.
    const pt = await gamePoint(page, 0.7);
    await page.touchscreen.tap(pt.x, pt.y);
    if ((await page.locator(".joystick-base").count()) > 0) expect(await touchAction(page, ".joystick-base")).toBe("none");

    // Panneau pause : zoom permis.
    await openPause(page);
    expect(ZOOMABLE).toContain(await touchAction(page, '#dialogs [data-dialog="pause"]'));
    expect(ZOOMABLE).toContain(await touchAction(page, '#dialogs [data-dialog="pause"] [data-action="resume"]'));
    expectClean(p);
  });

  test("un double-tap sur la zone de jeu ne zoome pas la page", async ({ page }) => {
    const p = watch(page);
    await seedPrefs(page);
    await page.goto("/");
    await waitReady(page);
    await enterGame(page, "new");
    const pt = await gamePoint(page, 0.5);
    await page.touchscreen.tap(pt.x, pt.y);
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(400); // laisse au navigateur le temps d'appliquer un éventuel zoom
    const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    // NB : en headless, Chromium n'applique pas toujours le zoom au double-tap ; ce test garantit au minimum
    // l'absence de zoom, la garantie forte étant `touch-action: none` vérifié ci-dessus.
    expect(scale).toBe(1);
    expectClean(p);
  });
});
