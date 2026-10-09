// Captures de référence (projet Playwright « captures », `npm run captures`). Sortie dans captures/
// (les captures automatiques d'échec restent dans test-results/).
// La 3D est le rendu par défaut (docs/design/day-night.md §0) : la capture 2D force `?render=2d`.
// Les bandeaux (#notices) sont masqués avant chaque capture : celui de la partie de test (?seed=)
// n'est pas fermable.
// - camp-3d-*.png / camp-2d-desktop.png : seed fixe (`?seed=` = partie temporaire), cadrage par défaut.
// - camp-3d-midgame-*.png : sauvegarde construite par le core, importée par le menu (section plus bas).
// - day-night-*.png : états jour/nuit construits par le core (tests/e2e/daynight-scenario.ts),
//   importés par le menu, horloge gelée avant « Confirmer » (section plus bas).

import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { buildDayNightScenarios, type DayNightKey } from "./daynight-scenario";
import {
  expectHud,
  expectWelcomeMat,
  hideNotices,
  hudValue,
  importViaMenu,
  openWithState,
  render3dInfo,
  waitFirst3DFrame,
  waitFrames,
  waitLoopTime,
  waitReady,
  watch,
  WEBGL_LAUNCH,
  writeSaveFile,
} from "./helpers";
import { buildMidgameScenario } from "./midgame-scenario";

test.use(WEBGL_LAUNCH);

const SEED = 7;
/**
 * Le suivi de caméra est amorti (1 − e^(−6·dt)) : ~1,5 s de temps de boucle suffit à le stabiliser.
 * Mesuré en temps vu par la boucle (images dessinées × delta borné, `waitLoopTime`), pas en temps
 * réel : avec SwiftShader en DPR 3 (~1 s par image), 1,5 s réelle ne laissait passer qu'une ou deux
 * images, soit bien moins de 1,5 s d'amortissement (delta borné à 250 ms).
 */
const SETTLE_MS = 1500;
/** Images minimales avant capture (au moins une image complète après le chargement). */
const SETTLE_FRAMES = 10;

/** Attend que le rendu soit prêt et stabilisé : data-render-ready, 1re image 3D, caméra amortie. */
async function settle(page: Page, mode: "2d" | "3d"): Promise<void> {
  await waitReady(page);
  await expect(page.locator("#app")).toHaveAttribute("data-render", mode);
  if (mode === "3d") await waitFirst3DFrame(page);
  const s = await waitLoopTime(page, SETTLE_MS, SETTLE_FRAMES, 90_000);
  console.log(`[capture] stabilisé : ${s.frames} images, ${s.loopMs.toFixed(0)} ms de boucle`);
}

// ------------------------------------------------------------------------------------------------
// Partie en cours (camp-3d-midgame-*.png).
//
// Approche (déterministe, sans clavier en temps réel) :
// 1. Node : `buildMidgameScenario` (tests/e2e/midgame-scenario.ts) joue la partie avec le core, seed fixe,
//    joueur piloté par commandes : 2 tentes (B0 construit), une occupée, une en désordre, ≥ 2 survivants
//    en file, joueur en (5,9) à côté de l'arbre (4,9) dont la récolte finit dans 8 ticks. Sauvegarde
//    encodée par src/save (exportSave), écrite sous test-results/.
// 2. Page : contexte neuf (stockage vide), `/` (3D par défaut) SANS ?seed=, import par le menu
//    (Menu → Importer → fichier → Confirmer). Aucune touche : la récolte finit seule (le core est
//    déterministe, la page atteint exactement l'état simulé).
// 3. Capture pendant le vol du butin, en TEMPS VIRTUEL (indépendant de la vitesse d'affichage :
//    SwiftShader en DPR 3 peut mettre ~1 s par image). Un script d'init enveloppe requestAnimationFrame
//    et performance.now :
//    - dès que la détection est armée (après l'import), performance.now renvoie l'horodatage rAF de
//      l'image en cours : l'effet de butin (fx.start = performance.now() dans onTick) démarre
//      exactement à l'horodatage de l'image où le core termine la récolte ;
//    - dans cette même image (après le callback), si le Bois du HUD vaut la valeur attendue, l'horloge
//      est GELÉE à t0 + FREEZE_AFTER_MS : l'image suivante voit un saut d'exactement FREEZE_AFTER_MS
//      (< plafond de frame de la boucle, 250 ms), puis toutes les suivantes un delta 0 (plus de tick ;
//      effets, animations et caméra figés). On laisse dessiner quelques images à ce temps figé avant
//      la capture, quelle que soit leur durée réelle.
// ------------------------------------------------------------------------------------------------

/** Délai entre la fin de récolte et le gel : le vol dure 500 ms (src/render/fx.ts), ~40 % = haut de l'arc. */
const FREEZE_AFTER_MS = 180;
/** Au-delà, le butin a atterri (phase « texte ») : capture refusée. */
const LOOT_FLIGHT_MS = 500;
/** Images dessinées au temps figé avant la capture (la 1re applique le saut de FREEZE_AFTER_MS). */
const FROZEN_FRAMES = 3;

interface CaptureClock {
  expectWood: number | null;
  freezeAfterMs: number;
  /** Horodatage rAF de l'image en cours (temps virtuel vu par performance.now une fois armé). */
  frameT: number | null;
  /** Horodatage rAF (virtuel) de l'image où le Bois du HUD a atteint `expectWood`. */
  t0: number | null;
  frozen: boolean;
  frozenAt: number;
  /** Images dessinées depuis le gel (callback appelé avec `frozenAt`). */
  frozenFrames: number;
  /** Horloge réelle au gel et à la dernière image figée (diagnostic uniquement). */
  realT0: number;
  realLast: number;
}

/** Script d'init (contexte de la page) : horloge gelable, voir l'en-tête de cette section. */
function installCaptureClock(freezeAfterMs: number): void {
  const cap: CaptureClock = {
    expectWood: null,
    freezeAfterMs,
    frameT: null,
    t0: null,
    frozen: false,
    frozenAt: 0,
    frozenFrames: 0,
    realT0: 0,
    realLast: 0,
  };
  (window as unknown as { __capture: CaptureClock }).__capture = cap;
  const realNow = performance.now.bind(performance);
  performance.now = () => {
    if (cap.frozen) return cap.frozenAt;
    if (cap.expectWood !== null && cap.frameT !== null) return cap.frameT;
    return realNow();
  };
  const realRaf = window.requestAnimationFrame.bind(window);
  const hudWood = (): number | null => {
    for (const stat of Array.from(document.querySelectorAll("#hud .hud-stat"))) {
      // Libellé complet (accessible) : .hud-label-full s'il y a une abréviation, sinon .hud-label.
      const label = stat.querySelector(".hud-label-full") ?? stat.querySelector(".hud-label");
      if (label?.textContent !== "Bois") continue;
      const n = Number.parseInt(stat.querySelector(".hud-value")?.textContent ?? "", 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    realRaf((t) => {
      if (cap.frozen) {
        cb(cap.frozenAt);
        cap.frozenFrames++;
        cap.realLast = realNow();
        return;
      }
      cap.frameT = t;
      cb(t);
      if (cap.expectWood !== null && hudWood() === cap.expectWood) {
        // Fin de récolte dans CETTE image (effet démarré à t) : gel immédiat à t + freezeAfterMs.
        cap.t0 = t;
        cap.frozen = true;
        cap.frozenAt = t + cap.freezeAfterMs;
        cap.realT0 = realNow();
      }
    });
}

async function captureMidgame(page: Page, testInfo: TestInfo, out: string): Promise<void> {
  // Une partie de jeu + chargement 3D + import : plus long que le délai par défaut.
  test.setTimeout(120_000);
  const sc = buildMidgameScenario();
  const savePath = await writeSaveFile(testInfo, "midgame-save.json", sc.saveText);
  console.log(
    `[capture] seed ${sc.seed}, tick ${sc.state.tick}, file ${sc.state.queue.length}, ` +
      `bois ${sc.woodBefore} → ${sc.woodAfter} dans ${sc.finishInTicks} ticks`,
  );

  const p = watch(page);
  await page.addInitScript(installCaptureClock, FREEZE_AFTER_MS);
  await page.goto("/"); // 3D par défaut, sans ?seed= : partie persistante, stockage vide (contexte neuf)
  await waitReady(page);
  await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");
  await hideNotices(page);
  // La partie de départ (seed aléatoire) ne doit pas déjà afficher le bois attendu.
  expect(Number.parseInt(await hudValue(page, "Bois"), 10)).not.toBe(sc.woodAfter);

  // Import par le menu ; menu ouvert = jeu en pause : on arme la détection avant de reprendre.
  await importViaMenu(page, savePath, async () => {
    await page.evaluate((wood) => {
      (window as unknown as { __capture: CaptureClock }).__capture.expectWood = wood;
    }, sc.woodAfter);
  });

  // Fin de récolte (≈ finishInTicks × 100 ms) puis gel pendant le vol du butin, et quelques images
  // dessinées au temps figé (la première applique le saut de FREEZE_AFTER_MS).
  await page.waitForFunction(
    (n) => {
      const c = (window as unknown as { __capture: CaptureClock }).__capture;
      return c.frozen && c.frozenFrames >= n;
    },
    FROZEN_FRAMES,
    { timeout: 30_000, polling: 50 },
  );
  const cap = await page.evaluate(() => (window as unknown as { __capture: CaptureClock }).__capture);
  // Temps VIRTUEL (celui vu par la boucle et les effets) entre le départ de l'effet et l'image figée.
  const flightMs = cap.frozenAt - (cap.t0 ?? Number.NaN);
  console.log(
    `[capture] image gelée ${flightMs.toFixed(0)} ms (virtuels) après la fin de récolte ; ` +
      `${cap.frozenFrames} images figées en ${(cap.realLast - cap.realT0).toFixed(0)} ms réels`,
  );
  expect(flightMs, "image gelée hors de la phase de vol du butin (temps virtuel)").toBeGreaterThan(0);
  expect(flightMs, "image gelée hors de la phase de vol du butin (temps virtuel)").toBeLessThan(LOOT_FLIGHT_MS - 50);

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

// ------------------------------------------------------------------------------------------------
// Jour/nuit (day-night-*.png).
//
// 1. Node : `buildDayNightScenarios` (tests/e2e/daynight-scenario.ts) joue deux parties avec le core
//    (seed 7, bots attentif / ignorant, commandes + ticks, invariants vérifiés) : jour (tick 1200),
//    crépuscule (2250), nuit feu allumé avec dormeurs (≥ 2900), nuit feu éteint (≥ 3200, joueur à côté
//    de l'accueil). Sauvegardes encodées par src/save, écrites sous test-results/.
// 2. Page : contexte neuf, `/` (3D par défaut) sans ?seed=, horloge gelable (installPageClock), import
//    par le menu ; l'horloge est GELÉE juste avant « Confirmer » : aucun tick n'est joué, la page
//    affiche exactement l'état importé (caméra recalée d'un coup après l'import, flammes figées).
// 3. Vérifications avant capture : HUD (jour, jauge du feu, dormeurs, alerte), __render3d.info()
//    (sous-phase de lumière, ombre soleil/feu, feu allumé), libellé du tapis d'accueil selon
//    welcomeBlockReason (« Fermé / jusqu'à l'aube » après un départ au froid, « Feu éteint » sinon) la nuit
//    feu à 0. Puis #notices masqué et capture.
// ------------------------------------------------------------------------------------------------

const DAYNIGHT_SHOTS: readonly [DayNightKey, string][] = [
  ["day", "day-night-day"],
  ["dusk", "day-night-dusk"],
  ["nightLit", "day-night-night-fire"],
  ["nightOut", "day-night-night-cold"],
];

async function captureDayNight(page: Page, testInfo: TestInfo, key: DayNightKey, out: string): Promise<void> {
  test.setTimeout(120_000);
  const c = buildDayNightScenarios()[key];
  console.log(
    `[capture] ${key} : tick ${c.state.tick}, feu ${c.state.fire.wood}, dormeurs ${c.expect.sleepers}, ` +
      `file ${c.state.queue.length}, lumière ${c.expect.light}, ombre ${c.expect.shadow}`,
  );
  const p = watch(page);
  await openWithState(page, testInfo, "/", c);
  await expect(page.locator("#app")).toHaveAttribute("data-render", "3d");

  const info = await render3dInfo(page);
  console.log(`[mesure] ${key} : ${JSON.stringify(info)}`);
  expect(info.light).toBe(c.expect.light);
  expect(info.shadow).toBe(c.expect.shadow);
  expect(info.fireLit).toBe(c.expect.fireLit);
  expect(info.calls).toBeLessThan(120);
  await expectHud(page, c.expect, key);
  // Tapis d'accueil selon welcomeBlockReason : nightOut (départ au froid) ⇒ « Fermé / jusqu'à l'aube ».
  await expectWelcomeMat(page, c.expect.blockReason, key);

  await hideNotices(page);
  await waitFrames(page, 2); // images identiques (horloge gelée)
  await page.screenshot({ path: out });
  expect(p.pageErrors).toEqual([]);
  expect(p.consoleErrors).toEqual([]);
}

// ------------------------------------------------------------------------------------------------

test.describe("desktop 1280×720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("camp-3d-desktop.png", async ({ page }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await page.goto(`/?seed=${SEED}`);
    await settle(page, "3d");
    await hideNotices(page);
    await waitFrames(page, 3);
    await page.screenshot({ path: "captures/camp-3d-desktop.png" });
    expect(p.pageErrors).toEqual([]);
  });

  test("camp-2d-desktop.png (comparaison, ?render=2d)", async ({ page }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await page.goto(`/?render=2d&seed=${SEED}`);
    await settle(page, "2d");
    await hideNotices(page);
    await waitFrames(page, 3);
    await page.screenshot({ path: "captures/camp-2d-desktop.png" });
    expect(p.pageErrors).toEqual([]);
  });

  test("camp-3d-midgame-desktop.png (partie en cours, butin en vol)", async ({ page }, testInfo) => {
    await captureMidgame(page, testInfo, "captures/camp-3d-midgame-desktop.png");
  });

  for (const [key, name] of DAYNIGHT_SHOTS) {
    test(`${name}.png`, async ({ page }, testInfo) => {
      await captureDayNight(page, testInfo, key, `captures/${name}.png`);
    });
  }
});

test.describe("mobile 390×844 portrait, tactile", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test("camp-3d-mobile.png", async ({ page }) => {
    test.setTimeout(120_000);
    const p = watch(page);
    await page.goto(`/?seed=${SEED}`);
    await waitReady(page);
    expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);
    await settle(page, "3d");
    await hideNotices(page);
    await waitFrames(page, 3);
    await page.screenshot({ path: "captures/camp-3d-mobile.png" });
    expect(p.pageErrors).toEqual([]);
  });

  test("camp-3d-midgame-mobile.png (partie en cours, butin en vol)", async ({ page }, testInfo) => {
    await captureMidgame(page, testInfo, "captures/camp-3d-midgame-mobile.png");
  });

  for (const [key, name] of DAYNIGHT_SHOTS) {
    test(`${name}-mobile.png`, async ({ page }, testInfo) => {
      await captureDayNight(page, testInfo, key, `captures/${name}-mobile.png`);
    });
  }
});
