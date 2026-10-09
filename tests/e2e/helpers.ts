// Utilitaires Playwright (pas un fichier de test : seuls les *.spec.ts sont ramassés).

import { expect, type Page, type TestInfo } from "@playwright/test";
import { FIRE, LOOP } from "../../src/data/balance";
import type { DayNightCase, DayNightExpect } from "./daynight-scenario";

/** WebGL en headless (docs/design/render-3d.md §6.3) : SwiftShader logiciel. */
export const WEBGL_LAUNCH: { launchOptions: { args: string[] } } = {
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
};

export interface Render3DInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Sous-phase de lumière de la dernière image (null avant la première image). */
  light: "dawn" | "day" | "dusk" | "night" | null;
  /** Lumière qui porte l'ombre. */
  shadow: "sun" | "fire";
  /** Feu affiché allumé à la dernière image. */
  fireLit: boolean;
}

// ------------------------------------------------------------------------------------------------
// Horloge de la page gelable (e2e jour/nuit et captures).
//
// Script d'init : enveloppe performance.now et requestAnimationFrame. Gelée, l'horloge renvoie un
// temps constant : rAF continue de tourner (rendu + HUD à chaque image) mais le delta est nul, donc
// AUCUN tick n'est joué (src/app/loop.ts + stepBudget) et effets, animations, caméra sont figés.
// Geler AVANT de confirmer un import ⇒ la page affiche exactement l'état importé.
// ------------------------------------------------------------------------------------------------

interface PageClock {
  frozen: boolean;
  frozenAt: number;
  offset: number;
  freeze(): void;
  unfreeze(): void;
}

/** Script d'init (contexte de la page). */
export function installPageClock(): void {
  const realNow = performance.now.bind(performance);
  const c: PageClock = {
    frozen: false,
    frozenAt: 0,
    offset: 0,
    freeze() {
      if (c.frozen) return;
      c.frozenAt = realNow() - c.offset;
      c.frozen = true;
    },
    unfreeze() {
      if (!c.frozen) return;
      // Reprise sans saut : le temps vu par la page repart de frozenAt.
      c.offset = realNow() - c.frozenAt;
      c.frozen = false;
    },
  };
  const now = (): number => (c.frozen ? c.frozenAt : realNow() - c.offset);
  (window as unknown as { __clock: PageClock }).__clock = c;
  performance.now = now;
  const realRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => realRaf(() => cb(now()));
}

export async function freezeClock(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __clock: PageClock }).__clock.freeze());
}

export async function unfreezeClock(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __clock: PageClock }).__clock.unfreeze());
}

// ------------------------------------------------------------------------------------------------
// Textes dessinés dans les canvas 2D (calque 3D et rendu 2D) : « Feu éteint » sur l'accueil, etc.
// ------------------------------------------------------------------------------------------------

/** Script d'init : enregistre chaque texte passé à fillText (ensemble, vidable). */
export function installCanvasTextSpy(): void {
  const seen = new Set<string>();
  (window as unknown as { __canvasTexts: Set<string> }).__canvasTexts = seen;
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.fillText;
  proto.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
    seen.add(String(text));
    if (maxWidth === undefined) orig.call(this, text, x, y);
    else orig.call(this, text, x, y, maxWidth);
  };
}

export async function clearCanvasTexts(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __canvasTexts: Set<string> }).__canvasTexts.clear());
}

export async function canvasTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window as unknown as { __canvasTexts: Set<string> }).__canvasTexts]);
}

// ------------------------------------------------------------------------------------------------
// Import d'une sauvegarde par le menu (Menu → Importer → fichier → Confirmer).
// ------------------------------------------------------------------------------------------------

interface NodeFs {
  mkdirSync(path: string, opts: { recursive: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

/** Écrit un texte de sauvegarde sous test-results/ (fichier à importer) et renvoie son chemin. */
export async function writeSaveFile(testInfo: TestInfo, name: string, text: string): Promise<string> {
  const fsModule = "node:fs";
  const fs = (await import(fsModule)) as NodeFs;
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  const file = testInfo.outputPath(name);
  fs.writeFileSync(file, text);
  return file;
}

/**
 * Importe le fichier `savePath` par le menu. `beforeConfirm` est appelé menu ouvert (jeu en pause),
 * juste avant « Confirmer » (ex. geler l'horloge). Attend la fermeture du menu.
 */
export async function importViaMenu(page: Page, savePath: string, beforeConfirm?: () => Promise<void>): Promise<void> {
  const toggle = page.getByRole("button", { name: "Menu", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".menu-actions").getByRole("button", { name: "Importer une partie", exact: true })).toBeEnabled();
  await page.locator("#menu-panel input[type=file]").setInputFiles(savePath);
  const confirm = page.locator(".menu-confirm .menu-danger");
  await expect(confirm).toBeVisible();
  if (beforeConfirm) await beforeConfirm();
  await confirm.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
}

/**
 * Ouvre `url` avec l'horloge gelable et l'espion des textes canvas, puis importe l'état `c` horloge
 * gelée avant « Confirmer » : la page affiche exactement l'état importé. Laisse quelques images se
 * dessiner ; les textes canvas enregistrés sont ceux des 5 dernières images.
 */
export async function openWithState(page: Page, testInfo: TestInfo, url: string, c: DayNightCase): Promise<void> {
  await page.addInitScript(installPageClock);
  await page.addInitScript(installCanvasTextSpy);
  await page.goto(url);
  await waitReady(page);
  await importState(page, testInfo, c);
}

/** Importe l'état `c` dans une page ouverte par `openWithState` (horloge gelée avant « Confirmer »). */
export async function importState(page: Page, testInfo: TestInfo, c: DayNightCase): Promise<void> {
  const file = await writeSaveFile(testInfo, `daynight-${c.key}.json`, c.saveText);
  await importViaMenu(page, file, async () => {
    await freezeClock(page);
  });
  await waitFrames(page, 3);
  await clearCanvasTexts(page);
  await waitFrames(page, 5);
}

/** Alerte du HUD : accueil fermé jusqu'à l'aube après un départ au froid (welcomeBlockReason = "coldLeavers"). */
export const COLD_LEAVERS_ALERT = "Le froid a fait fuir des survivants : plus personne ne viendra cette nuit";
/** Alerte du HUD : nuit, feu éteint, aucun départ au froid (welcomeBlockReason = "fireOut"). */
export const FIRE_OUT_ALERT = "Le feu est éteint — accueil suspendu";

/**
 * Libellé dessiné sur le tapis d'accueil (canvas) selon welcomeBlockReason : « Feu éteint » ou
 * « Fermé » + « jusqu'à l'aube » (deux lignes) ; [] si l'accueil est ouvert.
 */
export function welcomeMatLines(reason: DayNightExpect["blockReason"]): string[] {
  if (reason === "fireOut") return ["Feu éteint"];
  if (reason === "coldLeavers") return ["Fermé", "jusqu'à l'aube"];
  return [];
}
/** Tous les libellés possibles du tapis (pour vérifier l'absence des autres). */
export const ALL_WELCOME_MAT_LINES: readonly string[] = ["Feu éteint", "Fermé", "jusqu'à l'aube"];

/** Vérifie les textes canvas du tapis d'accueil : exactement ceux de la raison attendue. */
export async function expectWelcomeMat(page: Page, reason: DayNightExpect["blockReason"], key: string): Promise<void> {
  const texts = await canvasTexts(page);
  const want = welcomeMatLines(reason);
  for (const l of want) expect(texts, `${key} : « ${l} » attendu`).toContain(l);
  for (const l of ALL_WELCOME_MAT_LINES) if (!want.includes(l)) expect(texts, `${key} : « ${l} » inattendu`).not.toContain(l);
}

/** HUD jour/nuit attendu : jour, icône, jauge du feu, dormeurs, alerte, bilan de l'aube. */
export async function expectHud(page: Page, e: DayNightExpect, key: string): Promise<void> {
  const hud = page.locator("#hud");
  await expect(hud.locator(".hud-day .hud-value"), key).toHaveText(e.dayLabel);
  await expect(hud.locator(".hud-sky"), key).toHaveAttribute("aria-label", e.sky);

  const meter = hud.getByRole("meter");
  await expect(meter).toHaveCount(1);
  await expect(meter, key).toHaveAttribute("aria-valuenow", String(e.fireWood));
  await expect(meter).toHaveAttribute("aria-valuemin", "0");
  await expect(meter).toHaveAttribute("aria-valuemax", String(FIRE.capacity));
  await expect(hud.locator(".hud-fire > .hud-value"), key).toHaveText(`${e.fireWood}/${FIRE.capacity}`);
  const fire = hud.locator(".hud-fire");
  if (e.fireLow) await expect(fire, key).toHaveClass(/\bis-low\b/);
  else await expect(fire, key).not.toHaveClass(/\bis-low\b/);
  if (e.fireWood === 0) await expect(fire, key).toHaveClass(/\bis-out\b/);
  else await expect(fire, key).not.toHaveClass(/\bis-out\b/);

  const sleepers = hud.locator(".hud-sleepers");
  if (e.isNight) {
    await expect(sleepers, key).toBeVisible();
    await expect(sleepers.locator(".hud-value"), key).toHaveText(String(e.sleepers));
  } else {
    await expect(sleepers, key).toBeHidden();
  }

  const alert = hud.locator(".hud-alert");
  await expect(alert).toHaveAttribute("role", "status");
  await expect(alert).toHaveAttribute("aria-live", "polite");
  if (e.fireLow) {
    await expect(alert, key).toHaveText(
      e.sleepers > 0
        ? `Le feu faiblit — ${e.sleepers} ${e.sleepers > 1 ? "dormeurs risquent" : "dormeur risque"} de partir`
        : "Le feu faiblit",
    );
  } else if (e.blockReason === "coldLeavers") {
    // Départ au froid cette nuit : accueil fermé jusqu'à l'aube (prioritaire sur le feu éteint).
    await expect(alert, key).toHaveText(COLD_LEAVERS_ALERT);
  } else if (e.blockReason === "fireOut") {
    await expect(alert, key).toHaveText(FIRE_OUT_ALERT);
  } else {
    await expect(alert, key).toHaveText("");
  }

  const report = page.locator("#dawn-report");
  if (e.report) {
    await expect(report, key).toBeVisible();
    // Le panneau est une région nommée par son titre ; seule la zone titre + liste est « live ».
    await expect(report).toHaveAttribute("role", "region");
    await expect(report).toHaveAttribute("aria-labelledby", "dawn-report-title");
    await expect(page.getByRole("region", { name: `Nuit ${e.report.night} terminée` })).toBeVisible();
    const live = report.locator(".dawn-live");
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(report.locator(".dawn-title"), key).toHaveText(`Nuit ${e.report.night} terminée`);
    await expect(report.locator(".dawn-list li"), key).toHaveText([
      `Payés à l'aube : ${e.report.sleepersPaid}`,
      `Partis à cause du froid : ${e.report.coldLeavers}`,
      `Bois gagné : +${e.report.woodEarned}`,
      `Bois brûlé : ${e.report.woodBurned}`,
    ]);
  } else {
    await expect(report, key).toBeHidden();
  }
}

/**
 * Valeur d'une statistique du HUD, désignée par son libellé COMPLET (texte accessible : « Bois »,
 * « Nourriture », « Tentes libres »…). Sous 480 px, seule l'abréviation est visible (« Nourr. »,
 * « Tentes ») mais le libellé complet reste dans le DOM (.hud-label-full) : on le cible exactement.
 */
export async function hudValue(page: Page, label: string): Promise<string> {
  const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const stat = page
    .locator("#hud .hud-stat")
    .filter({ has: page.locator(".hud-label-full, .hud-label:not(:has(.hud-label-full))", { hasText: exact }) });
  return ((await stat.locator(".hud-value").first().textContent()) ?? "").trim();
}

/**
 * Luminance moyenne (0..255) du canvas #game en rendu 2D, échantillonnée dans la page (getImageData,
 * sans décodage PNG côté Node).
 */
export async function meanCanvasLuma(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("#game");
    const ctx = c?.getContext("2d");
    if (!c || !ctx) throw new Error("#game sans contexte 2D");
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * 7) {
      sum += 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
      n++;
    }
    return n > 0 ? sum / n : 0;
  });
}

export interface PageProblems {
  consoleErrors: string[];
  pageErrors: string[];
  httpErrors: string[];
  requests: string[];
  warnings: string[];
}

/** Enregistre erreurs console, exceptions, réponses HTTP ≥ 400 et toutes les URL demandées. */
export function watch(page: Page): PageProblems {
  const p: PageProblems = { consoleErrors: [], pageErrors: [], httpErrors: [], requests: [], warnings: [] };
  page.on("console", (m) => {
    if (m.type() === "error") p.consoleErrors.push(m.text());
    if (m.type() === "warning") p.warnings.push(m.text());
  });
  page.on("pageerror", (e) => p.pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() < 400) return;
    // Le navigateur demande /favicon.ico de lui-même (le jeu n'en déclare pas) : noté à part.
    if (new URL(r.url()).pathname === "/favicon.ico") p.warnings.push(`favicon ${r.status()}`);
    else p.httpErrors.push(`${r.status()} ${r.url()}`);
  });
  page.on("request", (r) => p.requests.push(r.url()));
  return p;
}

/** Attend `data-render-ready="1"` sur #app. */
export async function waitReady(page: Page, timeout = 45_000): Promise<void> {
  await expect(page.locator("#app")).toHaveAttribute("data-render-ready", "1", { timeout });
}

/** Attend `n` images (requestAnimationFrame). */
export async function waitFrames(page: Page, n: number): Promise<void> {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }, n);
}

/**
 * Attend que la page ait dessiné au moins `minFrames` images ET que la somme des deltas d'image
 * (horodatages rAF, chacun borné à LOOP.maxFrameDeltaMs comme le fait la boucle de jeu) atteigne
 * `ms`. C'est le temps effectivement « vu » par la boucle (ticks joués, caméra amortie, effets),
 * indépendant de la vitesse réelle d'affichage : sous charge (SwiftShader lent, machine occupée),
 * une attente fixe en temps réel peut ne laisser passer que quelques images ; celle-ci s'allonge
 * d'elle-même. Délai maximal : `timeout` (ms réelles).
 */
export async function waitLoopTime(page: Page, ms: number, minFrames = 10, timeout = 60_000): Promise<{ frames: number; loopMs: number }> {
  return page.evaluate(
    ({ ms, minFrames, cap, timeout }) =>
      new Promise<{ frames: number; loopMs: number }>((resolve, reject) => {
        let frames = 0;
        let loopMs = 0;
        let last: number | null = null;
        const timer = setTimeout(() => reject(new Error(`waitLoopTime : ${frames} images, ${loopMs.toFixed(0)} ms de boucle en ${timeout} ms`)), timeout);
        const step = (t: number): void => {
          if (last !== null) loopMs += Math.min(Math.max(0, t - last), cap);
          last = t;
          frames++;
          if (frames >= minFrames && loopMs >= ms) {
            clearTimeout(timer);
            resolve({ frames, loopMs });
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
    { ms, minFrames, cap: LOOP.maxFrameDeltaMs, timeout },
  );
}

/** 3D : attend la première image dessinée par le renderer (`__render3d.info().light` non nul). */
export async function waitFirst3DFrame(page: Page, timeout = 45_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __render3d?: { info(): Render3DInfo } };
      return !!w.__render3d && w.__render3d.info().light !== null;
    },
    undefined,
    { timeout, polling: 50 },
  );
}

export async function render3dInfo(page: Page): Promise<Render3DInfo> {
  return page.evaluate(() => {
    const w = window as unknown as { __render3d?: { info(): Render3DInfo } };
    if (!w.__render3d) throw new Error("window.__render3d absent");
    return w.__render3d.info();
  });
}

/** Menu → Nouvelle partie → Confirmer ; attend la fermeture du menu. */
export async function newGame(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Menu", exact: true });
  await toggle.click();
  await page.locator(".menu-actions").getByRole("button", { name: "Nouvelle partie", exact: true }).click();
  const confirm = page.locator(".menu-confirm .menu-danger");
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
}

/** Maintient une touche `ms` millisecondes. */
export async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/**
 * Masque tous les bandeaux (#notices) pour les captures : le bandeau « Partie de test (?seed=) »
 * n'est pas fermable.
 */
export async function hideNotices(page: Page): Promise<void> {
  await page.addStyleTag({ content: "#notices{display:none!important}" });
  await expect(page.locator("#notices")).toBeHidden();
}

/** Ferme le bandeau s'il est fermable (captures plus lisibles). */
export async function closeBannerIfAny(page: Page): Promise<void> {
  const close = page.locator(".notice-banner:not([hidden]) .notice-close:not([hidden])");
  if (await close.count()) await close.first().click();
}
