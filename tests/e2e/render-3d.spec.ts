// Prototype de rendu 3D (docs/design/render-3d.md §4.8, §4.9, §6.3). Projet Playwright « e2e ».
// Chaque test a son propre contexte (stockage vide) : pas de bannière de sauvegarde héritée.

import { expect, test } from "@playwright/test";
import { hold, newGame, render3dInfo, waitFrames, waitReady, watch, WEBGL_LAUNCH } from "./helpers";

test.use(WEBGL_LAUNCH);

const THREE_CHUNK = /\/assets\/three-[^/]*\.js(\?|$)/;
const GLTF = /\.gltf(\?|$)/;

test.describe("mode 3D (?render=3d)", () => {
  test("démarre en 3D sans erreur, budget de draw calls, déplacement clavier", async ({ page }) => {
    const p = watch(page);
    await page.goto("/?render=3d");
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");
    await expect(page.locator("canvas.webgl")).toHaveCount(1);
    await expect(page.getByRole("progressbar")).toHaveCount(0); // écran de chargement retiré
    await waitFrames(page, 10);

    const info = await render3dInfo(page);
    console.log(`[mesure] 3D au démarrage : ${JSON.stringify(info)}`);
    expect(info.calls).toBeGreaterThan(0);
    expect(info.calls).toBeLessThan(120);
    expect(info.triangles).toBeLessThan(200_000);

    // Déplacement : ZQSD (codes KeyW/KeyA/KeyS/KeyD) et flèches, ~1 s au total.
    for (const key of ["KeyD", "ArrowDown", "KeyA", "ArrowUp"]) await hold(page, key, 250);
    await waitFrames(page, 5);
    const after = await render3dInfo(page);
    console.log(`[mesure] 3D après déplacement : ${JSON.stringify(after)}`);
    expect(after.calls).toBeLessThan(120);

    // Le chunk three et des modèles ont bien été chargés.
    expect(p.requests.some((u) => THREE_CHUNK.test(u))).toBe(true);
    expect(p.requests.some((u) => GLTF.test(u))).toBe(true);

    expect(p.pageErrors).toEqual([]);
    expect(p.consoleErrors).toEqual([]);
    expect(p.httpErrors).toEqual([]);
    await expect(page.locator(".notice-banner")).toBeHidden();
  });

  test("mémoire : géométries et textures identiques après 1 et après 5 « Nouvelle partie »", async ({ page }) => {
    const p = watch(page);
    await page.goto("/?render=3d");
    await waitReady(page);
    await waitFrames(page, 10);
    const initial = await render3dInfo(page);

    await newGame(page);
    await waitFrames(page, 20);
    const after1 = await render3dInfo(page);
    for (let i = 0; i < 4; i++) {
      await newGame(page);
      await waitFrames(page, 20);
    }
    const after5 = await render3dInfo(page);
    console.log(`[mesure] mémoire initial=${JSON.stringify(initial)} après1=${JSON.stringify(after1)} après5=${JSON.stringify(after5)}`);

    expect(after5.geometries).toBe(after1.geometries);
    expect(after5.textures).toBe(after1.textures);
    expect(after5.calls).toBeLessThan(120);
    expect(p.pageErrors).toEqual([]);
    expect(p.consoleErrors).toEqual([]);
  });
});

test.describe("mode 2D par défaut", () => {
  test("/ ⇒ data-render=2d, aucun chunk three ni modèle .gltf demandé", async ({ page }) => {
    const p = watch(page);
    await page.goto("/");
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await hold(page, "ArrowRight", 400);
    await waitFrames(page, 5);
    await expect(page.locator("canvas.webgl")).toHaveCount(0);
    expect(p.requests.filter((u) => THREE_CHUNK.test(u))).toEqual([]);
    expect(p.requests.filter((u) => GLTF.test(u))).toEqual([]);
    expect(await page.evaluate(() => "__render3d" in window)).toBe(false);
    expect(p.pageErrors).toEqual([]);
    expect(p.consoleErrors).toEqual([]);
    expect(p.httpErrors).toEqual([]);
  });

  test("?render=2d et valeurs inconnues ⇒ 2D", async ({ page }) => {
    for (const q of ["/?render=2d", "/?render=3", "/?render=webgl"]) {
      await page.goto(q);
      await waitReady(page);
      await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    }
  });
});

test.describe("repli en 2D", () => {
  test("WebGL indisponible ⇒ 2D + bandeau « La 3D n'est pas disponible… », jeu jouable", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === "webgl2" || type === "webgl" || type === "experimental-webgl") return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (orig as any).call(this, type, ...rest);
      };
    });
    const p = watch(page);
    await page.goto("/?render=3d");
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await expect(page.locator(".notice-banner .notice-text")).toHaveText(
      "La 3D n'est pas disponible sur cet appareil. Le jeu continue en 2D.",
    );
    await expect(page.locator(".notice-banner .notice-close")).toBeVisible(); // fermable
    await expect(page.locator("canvas.webgl")).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);

    // Jouable : le canvas change quand le joueur se déplace, aucune exception.
    const before = await page.locator("#game").screenshot();
    await hold(page, "ArrowRight", 600);
    await waitFrames(page, 5);
    const after = await page.locator("#game").screenshot();
    expect(after.equals(before)).toBe(false);
    expect(p.pageErrors).toEqual([]);
    expect(p.warnings.some((w) => w.includes("[render]"))).toBe(true);

    // Le bandeau se ferme.
    await page.locator(".notice-banner .notice-close").click();
    await expect(page.locator(".notice-banner")).toBeHidden();
  });

  test("modèles .gltf en échec ⇒ 2D + bandeau « Les modèles 3D n'ont pas pu être chargés… »", async ({ page }) => {
    await page.route("**/*.gltf", (r) => r.abort());
    const p = watch(page);
    await page.goto("/?render=3d");
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await expect(page.locator(".notice-banner .notice-text")).toHaveText(
      "Les modèles 3D n'ont pas pu être chargés. Le jeu continue en 2D.",
    );
    await expect(page.locator("canvas.webgl")).toHaveCount(0); // canvas WebGL libéré
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    expect(await page.evaluate(() => "__render3d" in window)).toBe(false);
    await hold(page, "ArrowLeft", 400);
    expect(p.pageErrors).toEqual([]);
  });

  test("contexte WebGL perdu en jeu (non restauré > 3 s) ⇒ 2D à chaud + bandeau « Affichage 3D interrompu… »", async ({
    page,
  }) => {
    const p = watch(page);
    await page.goto("/?render=3d");
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");
    await waitFrames(page, 5);

    const lost = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>("canvas.webgl");
      const gl = c?.getContext("webgl2") ?? c?.getContext("webgl") ?? null;
      const ext = gl?.getExtension("WEBGL_lose_context") ?? null;
      if (!ext) return false;
      ext.loseContext();
      return true;
    });
    expect(lost).toBe(true);

    // Délai de restauration LOADING.contextRestoreMs = 3 s : on attend au-delà.
    await page.waitForTimeout(3_500);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await expect(page.locator(".notice-banner .notice-text")).toHaveText(
      "Affichage 3D interrompu. Le jeu continue en 2D.",
    );
    await expect(page.locator("canvas.webgl")).toHaveCount(0);
    expect(await page.evaluate(() => "__render3d" in window)).toBe(false);

    // Jouable en 2D : le canvas #game change quand le joueur se déplace.
    await waitFrames(page, 5);
    const before = await page.locator("#game").screenshot();
    await hold(page, "ArrowRight", 600);
    await waitFrames(page, 5);
    const after = await page.locator("#game").screenshot();
    expect(after.equals(before)).toBe(false);

    expect(p.pageErrors).toEqual([]);
    expect(p.warnings.some((w) => w.includes("[render]"))).toBe(true);
  });

  test("modèles .gltf trop lents (> LOADING.timeoutMs = 20 s) ⇒ 2D + bandeau « Les modèles 3D n'ont pas pu être chargés… »", async ({
    page,
  }) => {
    // Lent par nature (~20 s de délai avant le repli, plus la mise en route) : délai de test dédié.
    test.setTimeout(90_000);
    // Chaque .gltf est retenu 25 s (au-delà du délai). Les réponses tardives arrivent après le repli
    // (ou après la fermeture de la page) : erreurs de route ignorées.
    await page.route("**/*.gltf", (r) => {
      setTimeout(() => {
        r.continue().catch(() => undefined);
      }, 25_000);
    });
    const p = watch(page);
    const t0 = Date.now();
    await page.goto("/?render=3d");
    await waitReady(page, 60_000);
    const elapsed = Date.now() - t0;
    console.log(`[mesure] repli sur délai après ${elapsed} ms`);
    expect(elapsed).toBeGreaterThanOrEqual(19_000); // le repli vient bien du délai, pas d'un échec immédiat

    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await expect(page.locator(".notice-banner .notice-text")).toHaveText(
      "Les modèles 3D n'ont pas pu être chargés. Le jeu continue en 2D.",
    );
    await expect(page.locator(".notice-banner .notice-close")).toBeVisible();
    await expect(page.locator("canvas.webgl")).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    expect(await page.evaluate(() => "__render3d" in window)).toBe(false);

    const before = await page.locator("#game").screenshot();
    await hold(page, "ArrowLeft", 600);
    await waitFrames(page, 5);
    const after = await page.locator("#game").screenshot();
    expect(after.equals(before)).toBe(false);
    expect(p.pageErrors).toEqual([]);
  });
});
