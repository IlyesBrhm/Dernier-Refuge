// Rendu 3D par défaut et jour/nuit (docs/design/render-3d.md §6.3, docs/design/day-night.md §0 et
// §6.4), migrés sur la nouvelle interface (docs/design/ui-polish.md §6.2) : le jeu démarre sur l'écran
// titre (`enterGame`), l'import passe par la pause, le HUD suit le contrat `data-hud`, les alertes sont
// des toasts. Projet Playwright « e2e ». Chaque test a son propre contexte (stockage vide) ; les
// préférences sont pré-remplies avec le tutoriel terminé (pas de carte ni de flèche).
//
// États jour/nuit : construits par le core (tests/e2e/daynight-scenario.ts, seed fixe, commandes +
// ticks, invariants vérifiés), exportés avec src/save, importés par la pause dans un contexte neuf.
// L'horloge de la page est gelée AVANT la confirmation : aucun tick n'est joué, la page affiche
// exactement l'état importé (valeurs attendues = sélecteurs du core).

import { expect, test } from "@playwright/test";
import { BUDGET_KEYS, buildDayNightScenarios } from "./daynight-scenario";
import {
  canvasTexts,
  enterGame,
  expectClean,
  expectHud,
  expectWelcomeMat,
  gameInfo,
  hold,
  hudChip,
  importState,
  installPageClock,
  meanCanvasLuma,
  newGame,
  openWithState,
  render3dInfo,
  seedPrefs,
  stepTicks,
  toast,
  unfreezeClock,
  waitFrames,
  waitLoopTime,
  waitReady,
  waitTitle,
  watch,
  WEBGL_LAUNCH,
} from "./helpers";
import { buildUiScenarios } from "./ui-scenario";

test.use(WEBGL_LAUNCH);

const THREE_CHUNK = /\/assets\/three-[^/]*\.js(\?|$)/;
const GLTF = /\.gltf(\?|$)/;
const COLD_LABEL = "Feu éteint";

/** Scénarios jour/nuit et UI (purs, déterministes, ~0,3 s chacun) : construits une fois par worker. */
const SC = buildDayNightScenarios();
const UI = buildUiScenarios();

test.beforeEach(async ({ page }) => {
  await seedPrefs(page);
});

// ================================================================================================

test.describe("3D par défaut", () => {
  test("/ ⇒ écran titre en 3D (orbite de nuit), puis jeu : budget de draw calls, déplacement clavier, sans erreur", async ({ page }) => {
    const p = watch(page);
    await page.goto("/");
    await waitReady(page);
    await waitTitle(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");
    await expect(page.locator("canvas.webgl")).toHaveCount(1);
    await expect(page.getByRole("progressbar")).toHaveCount(0); // écran de chargement retiré
    await waitFrames(page, 10);

    const title = await render3dInfo(page);
    console.log(`[mesure] 3D écran titre : ${JSON.stringify(title)}`);
    expect(title.presentation).toBe("title");
    expect(title.guide).toBe(false);
    expect(title.calls).toBeGreaterThan(0);
    expect(title.calls).toBeLessThan(120);
    // Le titre force l'éclairage de nuit et le feu allumé (présentation seulement).
    expect(title.shadow).toBe("fire");
    expect(title.fireLit).toBe(true);

    await enterGame(page, "new");
    await waitFrames(page, 10);
    const info = await render3dInfo(page);
    console.log(`[mesure] 3D au démarrage : ${JSON.stringify(info)}`);
    expect(info.presentation).toBe("play");
    expect(info.calls).toBeGreaterThan(0);
    expect(info.calls).toBeLessThan(120);
    expect(info.triangles).toBeLessThan(200_000);
    // Nouvelle partie = lever du jour (aube, ombre du soleil, feu allumé).
    expect(info.light).toBe("dawn");
    expect(info.shadow).toBe("sun");
    expect(info.fireLit).toBe(true);
    await expect(hudChip(page, "clock")).toHaveAttribute("aria-label", /^Jour 1, jour, /);
    await expect(hudChip(page, "clock").locator(".hud-day--long")).toHaveText("Jour 1");

    // Déplacement : ZQSD (codes KeyW/KeyA/KeyS/KeyD) et flèches, ~1 s au total.
    for (const key of ["KeyD", "ArrowDown", "KeyA", "ArrowUp"]) await hold(page, key, 250);
    await waitFrames(page, 5);
    const after = await render3dInfo(page);
    console.log(`[mesure] 3D après déplacement : ${JSON.stringify(after)}`);
    expect(after.calls).toBeLessThan(120);

    // Le chunk three et des modèles ont bien été chargés (dont le feu de camp).
    expect(p.requests.some((u) => THREE_CHUNK.test(u))).toBe(true);
    expect(p.requests.some((u) => GLTF.test(u))).toBe(true);
    expect(p.requests.some((u) => /campfire-pit\.gltf/.test(u))).toBe(true);
    expect(p.requests.some((u) => /bedroll\.gltf/.test(u))).toBe(true);
    expect(p.requests.some((u) => /tent-canvas-half/.test(u))).toBe(false);

    expectClean(p);
    await expect(page.locator(".notice-banner")).toBeHidden();
  });

  test("?render=3d, ?render=3, ?render=webgl ⇒ 3D (toute valeur autre que 2d)", async ({ page }) => {
    for (const q of ["/?render=3d", "/?render=3", "/?render=webgl"]) {
      await page.goto(q);
      await waitReady(page);
      await expect(page.locator("#app"), q).toHaveAttribute("data-render", "3d");
      await waitTitle(page);
    }
  });

  test("mémoire : géométries et textures identiques après 1 et après 5 « Nouvelle partie » (par la pause)", async ({ page }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await page.goto("/");
    await waitReady(page);
    await enterGame(page, "new");
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
    expect((await gameInfo(page)).screen).toBe("game");
    expect(p.pageErrors).toEqual([]);
    expect(p.consoleErrors).toEqual([]);
  });
});

test.describe("2D forcée (?render=2d)", () => {
  test("?render=2d ⇒ data-render=2d, aucun chunk three ni modèle .gltf demandé, pas de __render3d", async ({ page }) => {
    const p = watch(page);
    await page.goto("/?render=2d");
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await enterGame(page, "new");
    await hold(page, "ArrowRight", 400);
    await waitFrames(page, 5);
    await expect(page.locator("canvas.webgl")).toHaveCount(0);
    expect(p.requests.filter((u) => THREE_CHUNK.test(u))).toEqual([]);
    expect(p.requests.filter((u) => GLTF.test(u))).toEqual([]);
    expect(await page.evaluate(() => "__render3d" in window)).toBe(false);
    expectClean(p);
  });

  test("?render=2D (casse ignorée) et ?seed=7&render=2d ⇒ 2D, sans three", async ({ page }) => {
    const p = watch(page);
    for (const q of ["/?render=2D", "/?seed=7&render=2d"]) {
      await page.goto(q);
      await waitReady(page);
      await expect(page.locator("#app"), q).toHaveAttribute("data-render", "2d");
      await waitTitle(page);
    }
    expect(p.requests.filter((u) => THREE_CHUNK.test(u) || GLTF.test(u))).toEqual([]);
  });

  test("de nuit : écran nettement assombri (luminance moyenne) ; tapis « Fermé / jusqu'à l'aube » ou « Feu éteint » selon la raison ; toujours sans three", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await openWithState(page, testInfo, "/?render=2d", SC.day);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await expectHud(page, SC.day.expect, "2d day");
    const day = await meanCanvasLuma(page);
    await expectWelcomeMat(page, null, "2d day");

    await importState(page, testInfo, SC.nightLit);
    await expectHud(page, SC.nightLit.expect, "2d nightLit");
    const nightLit = await meanCanvasLuma(page);
    await expectWelcomeMat(page, null, "2d nightLit");

    // Feu éteint après un départ au froid ⇒ « Fermé / jusqu'à l'aube » (raison coldLeavers).
    await importState(page, testInfo, SC.nightOut);
    expect(SC.nightOut.expect.blockReason).toBe("coldLeavers");
    await expectHud(page, SC.nightOut.expect, "2d nightOut");
    const nightOut = await meanCanvasLuma(page);
    await expectWelcomeMat(page, "coldLeavers", "2d nightOut");

    // Feu éteint sans départ au froid (personne ne dormait) ⇒ « Feu éteint » (raison fireOut).
    await importState(page, testInfo, SC.nightFireOut);
    expect(SC.nightFireOut.expect.blockReason).toBe("fireOut");
    await expectHud(page, SC.nightFireOut.expect, "2d nightFireOut");
    await expectWelcomeMat(page, "fireOut", "2d nightFireOut");
    expect(await canvasTexts(page)).toContain(COLD_LABEL);

    console.log(`[mesure] 2D luminance moyenne : jour ${day.toFixed(1)}, nuit feu allumé ${nightLit.toFixed(1)}, nuit feu éteint ${nightOut.toFixed(1)}`);
    expect(day).toBeGreaterThan(40); // garde-fou : la mesure lit bien le canvas
    expect(nightLit).toBeLessThan(day * 0.75);
    expect(nightOut).toBeLessThan(day * 0.6);
    // Le halo du feu éclaire : feu allumé plus clair que feu éteint.
    expect(nightOut).toBeLessThan(nightLit);

    expect(p.requests.filter((u) => THREE_CHUNK.test(u) || GLTF.test(u))).toEqual([]);
    expect(p.pageErrors).toEqual([]);
    expect(p.consoleErrors).toEqual([]);
  });
});

test.describe("jour/nuit en 3D (états construits par le core, importés par la pause)", () => {
  // Les 5 états du budget + la nuit feu éteint SANS départ au froid (« Feu éteint » sur le tapis).
  for (const key of [...BUDGET_KEYS, "nightFireOut"] as const) {
    test(`${key} (tick ${SC[key].state.tick}) : < 120 draw calls, ombre ${SC[key].expect.shadow}, lumière ${SC[key].expect.light}, HUD`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      const c = SC[key];
      const p = watch(page);
      await openWithState(page, testInfo, "/", c);
      await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");

      const info = await render3dInfo(page);
      console.log(`[mesure] 3D ${key} (tick ${c.state.tick}) : ${JSON.stringify(info)}`);
      expect(info.presentation).toBe("play");
      expect(info.calls).toBeGreaterThan(0);
      expect(info.calls).toBeLessThan(120);
      expect(info.triangles).toBeLessThan(200_000);
      expect(info.shadow).toBe(c.expect.shadow);
      expect(info.light).toBe(c.expect.light);
      expect(info.fireLit).toBe(c.expect.fireLit);

      await expectHud(page, c.expect, key);

      // Libellé du tapis d'accueil selon welcomeBlockReason (joueur à côté de W) : « Feu éteint »
      // (fireOut), « Fermé / jusqu'à l'aube » (coldLeavers, prioritaire), rien si l'accueil est ouvert.
      await expectWelcomeMat(page, c.expect.blockReason, key);

      expectClean(p);
    });
  }

  test("nuit, feu qui faiblit : jauge « faible » (data-state=low, « ! »), pastille File ouverte", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const c = SC.nightLow;
    const p = watch(page);
    await openWithState(page, testInfo, "/", c);
    expect(c.expect.fireLow).toBe(true);
    await expectHud(page, c.expect, "nightLow");
    await expect(hudChip(page, "fire")).toHaveAttribute("data-state", "low");
    await expect(hudChip(page, "fire")).toHaveAttribute("aria-valuetext", /, faible$/);
    const info = await render3dInfo(page);
    expect(info.calls).toBeLessThan(120);
    expect(info.shadow).toBe("fire");
    expect(info.fireLit).toBe(true);
    expect(p.pageErrors).toEqual([]);
  });

  test("toast « Le feu faiblit » (warning, role=status) au tick où le feu devient faible, pas à l'import", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const p = watch(page);
    // Import seul : AUCUN toast d'événement (onTick n'est jamais appelé sur un remplacement d'état).
    await openWithState(page, testInfo, "/", UI.preLow);
    await expect(toast(page, "fireLow")).toHaveCount(0);
    await stepTicks(page, UI.preLow.ticksToEvent - 1);
    await expect(toast(page, "fireLow")).toHaveCount(0);
    await stepTicks(page, 1);
    // Le toast info « Sauvegarde importée » doit rester affiché MIN_SHOWN_MS = 1000 ms de temps PAGE
    // (src/ui/notify-queue.ts) avant que « Le feu faiblit » passe ; l'horloge de la page est gelée et
    // ticksToEvent = 5 ne fait avancer que 500 ms : 10 ticks de plus (1 s). Le feu ne brûle que tous les
    // 100 ticks la nuit : il reste faible (vérifié sous Vitest, tests/e2e/ui-scenario.test.ts).
    await stepTicks(page, 10);
    const low = toast(page, "fireLow");
    await expect(low).toBeVisible();
    await expect(low).toHaveAttribute("data-kind", "warning");
    await expect(low).toContainText("Le feu faiblit");
    await expect(page.locator("#notices .notice-slot--toast")).toHaveAttribute("role", "status");
    await expect(page.locator("#notices .notice-slot--toast .toast")).toHaveCount(1);
    await expect(hudChip(page, "fire")).toHaveAttribute("data-state", "low");
    expectClean(p);
  });

  test("toast « Le feu est éteint » (danger, role=alert) ; un seul toast visible", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await openWithState(page, testInfo, "/", UI.preOut);
    await stepTicks(page, UI.preOut.ticksToEvent);
    // Comme pour « Le feu faiblit » : le toast info de l'import doit avoir été vu MIN_SHOWN_MS = 1000 ms
    // de temps page (horloge gelée, ticksToEvent = 5 ⇒ 500 ms seulement) : 10 ticks de plus. Le feu reste
    // éteint (nuit, aucun bois versé ; vérifié sous Vitest, tests/e2e/ui-scenario.test.ts).
    await stepTicks(page, 10);
    const out = toast(page, "fireOut");
    await expect(out).toBeVisible();
    await expect(out).toHaveAttribute("data-kind", "danger");
    await expect(out).toContainText("Le feu est éteint — accueil suspendu");
    await expect(page.locator("#notices .notice-slot--alert")).toHaveAttribute("role", "alert");
    await expect(page.locator("#notices .notice-slot--alert .toast[data-key='fireOut']")).toHaveCount(1);
    await expect(hudChip(page, "fire")).toHaveAttribute("data-state", "out");
    // Un seul toast visible à la fois (jamais de chevauchement).
    await expect(page.locator("#notices .toast:not(.is-leaving)")).toHaveCount(1);
    expectClean(p);
  });

  test("aube : bilan affiché UNE fois (role=status, bonnes valeurs) ; fermé, il ne revient pas pendant l'aube", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const c = SC.dawn;
    const p = watch(page);
    await openWithState(page, testInfo, "/", c);
    const report = page.locator("#dawn-report");
    await expectHud(page, c.expect, "dawn");
    await expect(page.getByRole("status").filter({ hasText: "Nuit 1 terminée" })).toHaveCount(1);

    await report.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(report).toBeHidden();

    // Le jeu reprend (≈ 2 s de temps de boucle ⇒ ~20 ticks, toujours l'aube, bilan inchangé) : le
    // panneau reste fermé. Attente sur le temps vu par la boucle (images dessinées × delta borné),
    // pas sur l'horloge réelle : sous charge, le même nombre de ticks est joué.
    await unfreezeClock(page);
    const played = await waitLoopTime(page, 2_000, 10);
    expect(played.loopMs).toBeGreaterThanOrEqual(2_000);
    await waitFrames(page, 5);
    expect((await render3dInfo(page)).light).toBe("dawn");
    await expect(report).toBeHidden();
    expect(p.pageErrors).toEqual([]);
    expect(p.consoleErrors).toEqual([]);
  });

  test("mémoire stable : géométries et textures identiques après deux tours des 5 états (imports successifs)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const p = watch(page);
    await openWithState(page, testInfo, "/", SC.day);
    const rounds: { geometries: number; textures: number; maxCalls: number }[] = [];
    for (let round = 0; round < 2; round++) {
      let maxCalls = 0;
      for (const key of BUDGET_KEYS) {
        await importState(page, testInfo, SC[key]);
        const info = await render3dInfo(page);
        maxCalls = Math.max(maxCalls, info.calls);
        expect(info.shadow, `${key} tour ${round + 1}`).toBe(SC[key].expect.shadow);
      }
      const info = await render3dInfo(page);
      rounds.push({ geometries: info.geometries, textures: info.textures, maxCalls });
    }
    console.log(`[mesure] mémoire jour/nuit : ${JSON.stringify(rounds)}`);
    expect(rounds[1]?.geometries).toBe(rounds[0]?.geometries);
    expect(rounds[1]?.textures).toBe(rounds[0]?.textures);
    for (const r of rounds) expect(r.maxCalls).toBeLessThan(120);
    expect(p.pageErrors).toEqual([]);
    expect(p.consoleErrors).toEqual([]);
  });
});

test.describe("repli en 2D (depuis /, 3D par défaut)", () => {
  test("WebGL indisponible ⇒ 2D + bandeau « La 3D n'est pas disponible… » (dès le titre), jeu jouable", async ({ page }) => {
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
    await page.goto("/");
    await waitReady(page);
    await waitTitle(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await expect(page.locator(".notice-banner .notice-banner__text")).toHaveText(
      "La 3D n'est pas disponible sur cet appareil. Le jeu continue en 2D.",
    );
    await expect(page.locator(".notice-banner .notice-banner__close")).toBeVisible(); // fermable
    await expect(page.locator("canvas.webgl")).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);

    // Jouable : le canvas change quand le joueur se déplace, aucune exception.
    await enterGame(page, "new");
    await waitFrames(page, 5);
    const before = await page.locator("#game").screenshot();
    await hold(page, "ArrowRight", 600);
    await waitFrames(page, 5);
    const after = await page.locator("#game").screenshot();
    expect(after.equals(before)).toBe(false);
    expect(p.pageErrors).toEqual([]);
    expect(p.warnings.some((w) => w.includes("[render]"))).toBe(true);

    // Le bandeau se ferme.
    await page.locator(".notice-banner .notice-banner__close").click();
    await expect(page.locator(".notice-banner")).toBeHidden();
  });

  test("modèles .gltf en échec ⇒ 2D + bandeau « Les modèles 3D n'ont pas pu être chargés… »", async ({ page }) => {
    await page.route("**/*.gltf", (r) => r.abort());
    const p = watch(page);
    await page.goto("/");
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await expect(page.locator(".notice-banner .notice-banner__text")).toHaveText(
      "Les modèles 3D n'ont pas pu être chargés. Le jeu continue en 2D.",
    );
    await expect(page.locator("canvas.webgl")).toHaveCount(0); // canvas WebGL libéré
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    expect(await page.evaluate(() => "__render3d" in window)).toBe(false);
    await enterGame(page, "new");
    await hold(page, "ArrowLeft", 400);
    expect(p.pageErrors).toEqual([]);
  });

  test("contexte WebGL perdu en jeu (non restauré > 3 s) ⇒ 2D à chaud + bandeau « Affichage 3D interrompu… »", async ({
    page,
  }) => {
    const p = watch(page);
    await page.goto("/");
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");
    await enterGame(page, "new");
    await waitFrames(page, 5);

    // Diagnostic lisible : pas de canvas WebGL, pas d'extension, ou contexte effectivement perdu.
    const lost = await page.evaluate((): "no-canvas" | "no-ext" | "ok" => {
      const c = document.querySelector<HTMLCanvasElement>("canvas.webgl");
      if (!c) return "no-canvas";
      const gl = c.getContext("webgl2") ?? c.getContext("webgl") ?? null;
      const ext = gl?.getExtension("WEBGL_lose_context") ?? null;
      if (!ext) return "no-ext";
      ext.loseContext();
      return "ok";
    });
    expect(lost).toBe("ok");

    // Délai de restauration LOADING.contextRestoreMs = 3 s : on attend au-delà.
    await page.waitForTimeout(3_500);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await expect(page.locator(".notice-banner .notice-banner__text")).toHaveText(
      "Affichage 3D interrompu. Le jeu continue en 2D.",
    );
    await expect(page.locator("canvas.webgl")).toHaveCount(0);
    expect(await page.evaluate(() => "__render3d" in window)).toBe(false);

    // Jouable en 2D : le canvas #game change quand le joueur se déplace ; la partie continue.
    await waitFrames(page, 5);
    expect((await gameInfo(page)).ticking).toBe(true);
    const before = await page.locator("#game").screenshot();
    await hold(page, "ArrowRight", 600);
    await waitFrames(page, 5);
    const after = await page.locator("#game").screenshot();
    expect(after.equals(before)).toBe(false);

    expect(p.pageErrors).toEqual([]);
    expect(p.warnings.some((w) => w.includes("[render]"))).toBe(true);
  });

  test("repli 2D : les réglages de présentation suivent (écran titre ⇒ jeu sans erreur après le swap)", async ({ page }) => {
    // Perte du contexte SUR l'écran titre, puis entrée en jeu : la présentation « play » doit être
    // appliquée au renderer 2D (render-host la réapplique après le swap).
    await page.addInitScript(installPageClock);
    const p = watch(page);
    await page.goto("/");
    await waitReady(page);
    await waitTitle(page);
    await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>("canvas.webgl");
      const gl = c?.getContext("webgl2") ?? c?.getContext("webgl") ?? null;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await page.waitForTimeout(3_500);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await enterGame(page, "new");
    await waitLoopTime(page, 500, 5);
    expect((await gameInfo(page)).tick).toBeGreaterThan(0);
    expect(p.pageErrors).toEqual([]);
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
    await page.goto("/");
    await waitReady(page, 60_000);
    const elapsed = Date.now() - t0;
    console.log(`[mesure] repli sur délai après ${elapsed} ms`);
    expect(elapsed).toBeGreaterThanOrEqual(19_000); // le repli vient bien du délai, pas d'un échec immédiat

    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await expect(page.locator(".notice-banner .notice-banner__text")).toHaveText(
      "Les modèles 3D n'ont pas pu être chargés. Le jeu continue en 2D.",
    );
    await expect(page.locator(".notice-banner .notice-banner__close")).toBeVisible();
    await expect(page.locator("canvas.webgl")).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    expect(await page.evaluate(() => "__render3d" in window)).toBe(false);

    await enterGame(page, "new");
    await waitFrames(page, 5);
    const before = await page.locator("#game").screenshot();
    await hold(page, "ArrowLeft", 600);
    await waitFrames(page, 5);
    const after = await page.locator("#game").screenshot();
    expect(after.equals(before)).toBe(false);
    expect(p.pageErrors).toEqual([]);
  });
});
