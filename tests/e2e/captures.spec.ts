// Captures de référence du prototype 3D (projet Playwright « captures », `npm run captures`).
// Seed fixe (`?seed=` = partie temporaire, voulu ici) ; sortie dans captures/ (les captures
// automatiques d'échec restent dans test-results/).
// Les bandeaux (#notices) sont masqués avant chaque capture : celui de la partie de test (?seed=)
// n'est pas fermable. Cadrage par défaut de la caméra (aucun déplacement du joueur).
// Exception : camp-3d-midgame-*.png part d'une sauvegarde construite par le core et importée par le
// menu, SANS ?seed= (voir la section « Partie en cours » plus bas).

import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { hideNotices, waitFrames, waitReady, watch, WEBGL_LAUNCH } from "./helpers";
import { buildMidgameScenario, type MidgameScenario } from "./midgame-scenario";

test.use(WEBGL_LAUNCH);

const SEED = 7;
/** Le suivi de caméra est amorti (1 − e^(−6·dt)) : ~1,5 s suffit à le stabiliser. */
const SETTLE_MS = 1500;

// ------------------------------------------------------------------------------------------------
// Partie en cours (camp-3d-midgame-*.png).
//
// Approche (déterministe, sans clavier en temps réel) :
// 1. Node : `buildMidgameScenario` (tests/e2e/midgame-scenario.ts) joue la partie avec le core, seed fixe,
//    joueur piloté par commandes : 2 tentes (B0 construit), une occupée, une en désordre, ≥ 2 survivants
//    en file, joueur en (5,9) à côté de l'arbre (4,9) dont la récolte finit dans 8 ticks. Sauvegarde
//    encodée par src/save (exportSave), écrite sous test-results/.
// 2. Page : contexte neuf (stockage vide), `/?render=3d` SANS ?seed=, import par le menu
//    (Menu → Importer → fichier → Confirmer). Aucune touche : la récolte finit seule (le core est
//    déterministe, la page atteint exactement l'état simulé).
// 3. Capture pendant le vol du butin : un script d'init enveloppe requestAnimationFrame et
//    performance.now. Quand le Bois du HUD atteint la valeur attendue (fin de récolte, même image que
//    le départ de l'effet), on attend FREEZE_AFTER_MS puis on GÈLE l'horloge vue par la page :
//    rAF continue de tourner mais avec un temps constant (delta 0 ⇒ plus de tick ; effets, animations
//    et caméra figés). L'image capturée est donc exactement celle dessinée à cet instant, quelle que
//    soit la lenteur de la capture d'écran (SwiftShader, DPR 3 en mobile).
// ------------------------------------------------------------------------------------------------

/** Délai entre la fin de récolte et le gel : le vol dure 500 ms (src/render/fx.ts), ~40 % = haut de l'arc. */
const FREEZE_AFTER_MS = 180;
/** Au-delà, le butin a atterri (phase « texte ») : capture refusée. */
const LOOT_FLIGHT_MS = 500;

interface CaptureClock {
  expectWood: number | null;
  freezeAfterMs: number;
  /** Horodatage rAF de l'image où le Bois du HUD a atteint `expectWood`. */
  t0: number | null;
  frozen: boolean;
  frozenAt: number;
}

/** Script d'init (contexte de la page) : horloge gelable, voir l'en-tête de cette section. */
function installCaptureClock(freezeAfterMs: number): void {
  const cap: CaptureClock = { expectWood: null, freezeAfterMs, t0: null, frozen: false, frozenAt: 0 };
  (window as unknown as { __capture: CaptureClock }).__capture = cap;
  const realNow = performance.now.bind(performance);
  performance.now = () => (cap.frozen ? cap.frozenAt : realNow());
  const realRaf = window.requestAnimationFrame.bind(window);
  const hudWood = (): number | null => {
    for (const stat of Array.from(document.querySelectorAll("#hud .hud-stat"))) {
      if (stat.querySelector(".hud-label")?.textContent !== "Bois") continue;
      const n = Number.parseInt(stat.querySelector(".hud-value")?.textContent ?? "", 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    realRaf((t) => {
      if (cap.frozen) {
        cb(cap.frozenAt);
        return;
      }
      if (cap.t0 !== null && t - cap.t0 >= cap.freezeAfterMs) {
        // Cette image est la dernière « vivante » : elle est dessinée au temps t, puis tout reste à t.
        cap.frozen = true;
        cap.frozenAt = t;
        cb(t);
        return;
      }
      cb(t);
      if (cap.t0 === null && cap.expectWood !== null && hudWood() === cap.expectWood) cap.t0 = t;
    });
}

async function hudValue(page: Page, label: string): Promise<string> {
  const stat = page.locator("#hud .hud-stat").filter({ has: page.locator(".hud-label", { hasText: label }) });
  return ((await stat.locator(".hud-value").textContent()) ?? "").trim();
}

interface NodeFs {
  mkdirSync(path: string, opts: { recursive: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

/** Écrit la sauvegarde du scénario sous test-results/ (fichier à importer). */
async function writeSave(sc: MidgameScenario, testInfo: TestInfo): Promise<string> {
  const fsModule = "node:fs";
  const fs = (await import(fsModule)) as NodeFs;
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  const file = testInfo.outputPath("midgame-save.json");
  fs.writeFileSync(file, sc.saveText);
  return file;
}

async function captureMidgame(page: Page, testInfo: TestInfo, out: string): Promise<void> {
  // Une partie de jeu + chargement 3D + import : plus long que le délai par défaut.
  test.setTimeout(120_000);
  const sc = buildMidgameScenario();
  const savePath = await writeSave(sc, testInfo);
  console.log(
    `[capture] seed ${sc.seed}, tick ${sc.state.tick}, file ${sc.state.queue.length}, ` +
      `bois ${sc.woodBefore} → ${sc.woodAfter} dans ${sc.finishInTicks} ticks`,
  );

  const p = watch(page);
  await page.addInitScript(installCaptureClock, FREEZE_AFTER_MS);
  await page.goto("/?render=3d"); // sans ?seed= : partie persistante, stockage vide (contexte neuf)
  await waitReady(page);
  await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");
  await hideNotices(page);
  // La partie de départ (seed aléatoire) ne doit pas déjà afficher le bois attendu.
  expect(Number.parseInt(await hudValue(page, "Bois"), 10)).not.toBe(sc.woodAfter);

  // Import par le menu.
  const toggle = page.getByRole("button", { name: "Menu", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".menu-actions").getByRole("button", { name: "Importer une partie", exact: true })).toBeEnabled();
  await page.locator("#menu-panel input[type=file]").setInputFiles(savePath);
  const confirm = page.locator(".menu-confirm .menu-danger");
  await expect(confirm).toBeVisible();
  // Menu ouvert = jeu en pause : on arme la détection avant de reprendre.
  await page.evaluate((wood) => {
    (window as unknown as { __capture: CaptureClock }).__capture.expectWood = wood;
  }, sc.woodAfter);
  await confirm.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Fin de récolte (≈ finishInTicks × 100 ms) puis gel pendant le vol du butin.
  await page.waitForFunction(() => (window as unknown as { __capture: CaptureClock }).__capture.frozen, undefined, {
    timeout: 20_000,
    polling: 50,
  });
  const cap = await page.evaluate(() => (window as unknown as { __capture: CaptureClock }).__capture);
  const flightMs = cap.frozenAt - (cap.t0 ?? cap.frozenAt);
  console.log(`[capture] image gelée ${flightMs.toFixed(0)} ms après la fin de récolte`);
  expect(flightMs, "image gelée hors de la phase de vol du butin (images trop lentes ?)").toBeLessThan(LOOT_FLIGHT_MS - 50);

  // Vérifications (HUD) avant la capture : la page est bien dans l'état du scénario.
  expect(Number.parseInt(await hudValue(page, "Bois"), 10)).toBe(sc.woodAfter);
  const queue = Number.parseInt(await hudValue(page, "File"), 10);
  if (!(queue >= 2)) throw new Error(`file d'attente vide ou trop courte au moment de la capture (File = ${queue}) : capture refusée`);
  expect(await hudValue(page, "Tentes libres")).toBe(`0 / ${sc.atFinish.tents.length}`);

  await hideNotices(page); // un toast d'import a pu apparaître
  await waitFrames(page, 2); // images identiques (horloge gelée)
  await page.screenshot({ path: out });
  expect(p.pageErrors).toEqual([]);
}

test.describe("desktop 1280×720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("camp-3d-desktop.png", async ({ page }) => {
    const p = watch(page);
    await page.goto(`/?render=3d&seed=${SEED}`);
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");
    await page.waitForTimeout(SETTLE_MS);
    await hideNotices(page);
    await waitFrames(page, 3);
    await page.screenshot({ path: "captures/camp-3d-desktop.png" });
    expect(p.pageErrors).toEqual([]);
  });

  test("camp-2d-desktop.png (comparaison)", async ({ page }) => {
    const p = watch(page);
    await page.goto(`/?seed=${SEED}`);
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "2d");
    await page.waitForTimeout(SETTLE_MS);
    await hideNotices(page);
    await waitFrames(page, 3);
    await page.screenshot({ path: "captures/camp-2d-desktop.png" });
    expect(p.pageErrors).toEqual([]);
  });

  test("camp-3d-midgame-desktop.png (partie en cours, butin en vol)", async ({ page }, testInfo) => {
    await captureMidgame(page, testInfo, "captures/camp-3d-midgame-desktop.png");
  });
});

test.describe("mobile 390×844 portrait, tactile", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test("camp-3d-mobile.png", async ({ page }) => {
    const p = watch(page);
    await page.goto(`/?render=3d&seed=${SEED}`);
    await waitReady(page);
    await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");
    expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);
    await page.waitForTimeout(SETTLE_MS);
    await hideNotices(page);
    await waitFrames(page, 3);
    await page.screenshot({ path: "captures/camp-3d-mobile.png" });
    expect(p.pageErrors).toEqual([]);
  });

  test("camp-3d-midgame-mobile.png (partie en cours, butin en vol)", async ({ page }, testInfo) => {
    await captureMidgame(page, testInfo, "captures/camp-3d-midgame-mobile.png");
  });
});
