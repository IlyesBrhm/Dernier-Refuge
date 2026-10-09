// Utilitaires Playwright (pas un fichier de test : seuls les *.spec.ts sont ramassés).
//
// Interface refaite (docs/design/ui-polish.md §6.2) : le jeu démarre sur l'écran TITRE (aucun tick tant
// qu'on n'a pas cliqué Continuer / Nouvelle partie), l'import et la nouvelle partie passent par la PAUSE
// (bouton « Pause » de #controls), le HUD suit le contrat `data-hud`, les alertes passent par des toasts.

import { expect, type Page, type TestInfo } from "@playwright/test";
import { FIRE, LOOP } from "../../src/data/balance";
import { DEFAULT_PREFS, PREFS_KEY, type Prefs } from "../../src/save/prefs";
import type { DayNightCase, DayNightExpect } from "./daynight-scenario";
import type { HudExpect } from "./hud-expect";

/**
 * WebGL en headless (docs/design/render-3d.md §6.3) : SwiftShader logiciel.
 *
 * `--disable-gpu-watchdog` + `--disable-domain-blocking-for-3d-apis` : sous forte charge, le chien de garde
 * tue le processus GPU (SwiftShader), puis Chromium bloque WebGL pour localhost dans tout le navigateur du
 * worker ⇒ canvas blancs, « 3D indisponible » en cascade. Les pertes de contexte voulues
 * (`WEBGL_lose_context`) ne sont pas concernées.
 */
export const WEBGL_LAUNCH: { launchOptions: { args: string[] } } = {
  launchOptions: {
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--disable-gpu-watchdog",
      "--disable-domain-blocking-for-3d-apis",
    ],
  },
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
  /** Présentation courante (écran titre ou jeu). */
  presentation: "play" | "title";
  /** Flèche du tutoriel affichée à la dernière image. */
  guide: boolean;
  /** Qualité appliquée. */
  quality: "low" | "medium" | "high";
  /** Programmes de shaders vivants. */
  programs: number;
}

/** Lecture e2e exposée par le jeu (production comprise) : nombres / chaînes uniquement. */
export interface GameInfo {
  tick: number;
  screen: "boot" | "title" | "game";
  ticking: boolean;
}

// ------------------------------------------------------------------------------------------------
// Préférences (clé séparée `dernier-refuge.prefs`, src/save/prefs.ts).
// ------------------------------------------------------------------------------------------------

export { PREFS_KEY };
export type PrefsPatch = Partial<Omit<Prefs, "version">>;

/** Tutoriel terminé : les tests qui ne portent pas sur le tutoriel ne voient ni carte ni flèche. */
export const TUTORIAL_DONE: Prefs["tutorial"] = { status: "done", done: 63 };

export interface SeedPrefsOptions {
  /** Réécrit la clé à CHAQUE navigation (sinon : seulement si elle est absente, ce qui préserve les rechargements). */
  overwrite?: boolean;
  /** Texte brut à écrire tel quel (préférences abîmées). */
  raw?: string;
}

/**
 * Pré-remplit les préférences AVANT le chargement (script d'init). Par défaut : défauts + tutoriel
 * terminé + `patch`, écrits seulement si la clé est absente (un rechargement garde ce que le jeu a écrit).
 */
export async function seedPrefs(page: Page, patch: PrefsPatch = {}, opts: SeedPrefsOptions = {}): Promise<void> {
  const prefs: Prefs = { ...DEFAULT_PREFS, tutorial: TUTORIAL_DONE, ...patch, version: 1 };
  const text = opts.raw ?? JSON.stringify(prefs);
  await page.addInitScript(
    ({ key, text, overwrite }) => {
      try {
        if (overwrite || window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text);
      } catch {
        // stockage indisponible : le test le verra
      }
    },
    { key: PREFS_KEY, text, overwrite: opts.overwrite ?? false },
  );
}

/** Préférences stockées (null si absentes ou illisibles). */
export async function storedPrefs(page: Page): Promise<Prefs | null> {
  return page.evaluate((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Prefs) : null;
    } catch {
      return null;
    }
  }, PREFS_KEY);
}

// ------------------------------------------------------------------------------------------------
// Horloge de la page gelable (e2e jour/nuit, interface et captures).
//
// Script d'init : enveloppe performance.now et requestAnimationFrame. Gelée, l'horloge renvoie un
// temps constant : rAF continue de tourner (rendu + HUD à chaque image) mais le delta est nul, donc
// AUCUN tick n'est joué (src/app/loop.ts + stepBudget) et effets, animations, caméra sont figés.
// Geler AVANT de confirmer un import ⇒ la page affiche exactement l'état importé.
// `advance(ms)` (horloge gelée) avance le temps vu par la page d'un bloc : la boucle joue ms / 100 ticks
// à l'image suivante (≤ 250 ms par image, plafond LOOP.maxFrameDeltaMs).
// ------------------------------------------------------------------------------------------------

interface PageClock {
  frozen: boolean;
  frozenAt: number;
  offset: number;
  freeze(): void;
  unfreeze(): void;
  advance(ms: number): void;
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
    advance(ms: number) {
      if (c.frozen) c.frozenAt += ms;
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

/**
 * Horloge gelée : joue exactement `ticks` ticks (temps virtuel avancé par pas de ≤ 200 ms, une image
 * dessinée entre deux pas). Indépendant de la vitesse d'affichage réelle.
 */
export async function stepTicks(page: Page, ticks: number): Promise<void> {
  const tickMs = LOOP.tickMs;
  const perStep = 2;
  for (let done = 0; done < ticks; done += perStep) {
    const n = Math.min(perStep, ticks - done);
    await page.evaluate((ms) => (window as unknown as { __clock: PageClock }).__clock.advance(ms), n * tickMs);
    await waitFrames(page, 1);
  }
  await waitFrames(page, 1);
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
  await page.evaluate(() => {
    const seen = (window as unknown as { __canvasTexts?: Set<string> }).__canvasTexts;
    if (!seen) throw new Error("window.__canvasTexts absent : ajouter page.addInitScript(installCanvasTextSpy) avant page.goto");
    seen.clear();
  });
}

export async function canvasTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window as unknown as { __canvasTexts: Set<string> }).__canvasTexts]);
}

// ------------------------------------------------------------------------------------------------
// Écrans : titre → jeu, pause, panneaux.
// ------------------------------------------------------------------------------------------------

/** Lecture de `window.__gameInfo` (lecture seule). */
export async function gameInfo(page: Page): Promise<GameInfo> {
  return page.evaluate(() => {
    const w = window as unknown as { __gameInfo?: { tick(): number; screen(): GameInfo["screen"]; ticking(): boolean } };
    if (!w.__gameInfo) throw new Error("window.__gameInfo absent");
    return { tick: w.__gameInfo.tick(), screen: w.__gameInfo.screen(), ticking: w.__gameInfo.ticking() };
  });
}

export async function gameTick(page: Page): Promise<number> {
  return (await gameInfo(page)).tick;
}

/** Attend l'écran titre (après le premier rendu). */
export async function waitTitle(page: Page, timeout = 45_000): Promise<void> {
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "title", { timeout });
  await expect(page.locator("#title")).toBeVisible();
}

/** Aucun panneau ouvert (#app sans data-panel). */
export async function waitNoPanel(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForFunction(() => !document.getElementById("app")?.dataset.panel, undefined, { timeout, polling: 50 });
}

/** Panneau du sommet de la pile. */
export async function expectPanel(page: Page, panel: "pause" | "settings" | "credits" | "confirm"): Promise<void> {
  await expect(page.locator("#app")).toHaveAttribute("data-panel", panel);
  await expect(page.locator(`#dialogs [data-dialog="${panel}"]`)).toBeVisible();
}

/**
 * Écran titre ⇒ jeu. `new` : « Nouvelle partie » (confirmée si une partie existe déjà) ; `continue` :
 * « Continuer ». Attend `data-screen="game"` et une boucle qui joue (`__gameInfo.ticking()`).
 */
export async function enterGame(page: Page, how: "new" | "continue" = "new"): Promise<void> {
  await waitTitle(page);
  const btn = page.locator(`#title [data-action="${how === "new" ? "new-game" : "continue"}"]`);
  await expect(btn).toBeVisible();
  await btn.click();
  if (how === "new") {
    // Avec « Continuer » présent, Nouvelle partie demande confirmation (alertdialog).
    const confirm = page.locator('#dialogs [data-dialog="confirm"] [data-action="confirm"]');
    await expect
      .poll(async () => (await page.locator("#app").getAttribute("data-screen")) === "game" || (await confirm.isVisible()), { timeout: 15_000 })
      .toBe(true);
    if ((await page.locator("#app").getAttribute("data-screen")) !== "game") await confirm.click();
  }
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "game");
  await expect.poll(async () => (await gameInfo(page)).ticking, { timeout: 15_000 }).toBe(true);
  await expect(page.locator("#hud")).toBeVisible();
}

/** Ouvre la pause par le bouton « Pause » de #controls (jeu en cours, sans panneau). */
export async function openPause(page: Page): Promise<void> {
  const btn = page.locator('#controls [data-action="pause"]');
  await expect(btn).toBeVisible();
  await btn.click();
  await expectPanel(page, "pause");
}

/** Pause → « Reprendre ». */
export async function resume(page: Page): Promise<void> {
  await page.locator('#dialogs [data-dialog="pause"] [data-action="resume"]').click();
  await waitNoPanel(page);
}

// ------------------------------------------------------------------------------------------------
// Import / nouvelle partie par la pause.
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
 * Importe `savePath` par la pause (Pause → fichier → confirmation « Remplacer »). `beforeConfirm` est
 * appelé confirmation ouverte (jeu en pause), juste avant de confirmer (ex. geler l'horloge). Attend le
 * retour au jeu (succès ⇒ `resume`).
 */
export async function importViaMenu(page: Page, savePath: string, beforeConfirm?: () => Promise<void>): Promise<void> {
  await openPause(page);
  await expect(page.locator('#dialogs [data-dialog="pause"] [data-action="import"]')).not.toHaveAttribute("aria-disabled", "true");
  await page.locator('#dialogs [data-dialog="pause"] input[type=file]').setInputFiles(savePath);
  await expectPanel(page, "confirm");
  const confirm = page.locator('#dialogs [data-dialog="confirm"] [data-action="confirm"]');
  if (beforeConfirm) await beforeConfirm();
  await confirm.click();
  await waitNoPanel(page);
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "game");
}

/** Pause → Nouvelle partie → confirmer ; attend le retour au jeu. */
export async function newGame(page: Page): Promise<void> {
  await openPause(page);
  await page.locator('#dialogs [data-dialog="pause"] [data-action="new-game"]').click();
  await expectPanel(page, "confirm");
  await page.locator('#dialogs [data-dialog="confirm"] [data-action="confirm"]').click();
  await waitNoPanel(page);
}

/**
 * Ouvre `url` (tutoriel terminé, horloge gelable, espion des textes canvas), entre en jeu, puis importe
 * l'état `c` horloge gelée avant la confirmation : la page affiche exactement l'état importé. Laisse
 * quelques images se dessiner ; les textes canvas enregistrés sont ceux des 5 dernières images.
 */
export async function openWithState(page: Page, testInfo: TestInfo, url: string, c: DayNightCase | { key: string; saveText: string }): Promise<void> {
  await seedPrefs(page);
  await page.addInitScript(installPageClock);
  await page.addInitScript(installCanvasTextSpy);
  await page.goto(url);
  await waitReady(page);
  await enterGame(page, "new");
  await importState(page, testInfo, c);
}

/** Importe l'état `c` (jeu en cours, page ouverte par `openWithState`), horloge gelée avant la confirmation. */
export async function importState(page: Page, testInfo: TestInfo, c: { key: string; saveText: string }): Promise<void> {
  const file = await writeSaveFile(testInfo, `state-${c.key}.json`, c.saveText);
  await importViaMenu(page, file, async () => {
    await freezeClock(page);
  });
  await waitFrames(page, 3);
  await clearCanvasTexts(page);
  await waitFrames(page, 5);
}

// ------------------------------------------------------------------------------------------------
// Tapis d'accueil (canvas) et HUD (contrat data-hud).
// ------------------------------------------------------------------------------------------------

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

/** Pilule du HUD (`#hud [data-hud=…]`). */
export function hudChip(page: Page, key: "clock" | "fire" | "wood" | "food" | "queue" | "tents") {
  return page.locator(`#hud [data-hud="${key}"]`);
}

/** HUD (contrat data-hud, ui-polish §1.8) conforme aux textes attendus `h`. */
export async function expectHudLabels(page: Page, h: HudExpect, key: string): Promise<void> {
  const clock = hudChip(page, "clock");
  await expect(clock).toHaveAttribute("role", "img");
  await expect(clock, key).toHaveAttribute("aria-label", h.clockLabel);
  await expect(clock.locator(".hud-day--long"), key).toHaveText(h.dayLabel);

  const fire = hudChip(page, "fire");
  await expect(page.locator("#hud").getByRole("meter")).toHaveCount(1);
  await expect(fire).toHaveAttribute("role", "meter");
  await expect(fire, key).toHaveAttribute("aria-valuenow", String(h.fireWood));
  await expect(fire).toHaveAttribute("aria-valuemin", "0");
  await expect(fire).toHaveAttribute("aria-valuemax", String(FIRE.capacity));
  await expect(fire, key).toHaveAttribute("aria-valuetext", h.fireValueText);
  await expect(fire, key).toHaveAttribute("data-state", h.fireState);
  await expect(fire.locator(".hud-fire-value"), key).toHaveText(h.fireText);
  // Faible : « ! » visible (jamais la couleur seule).
  if (h.fireState === "low") await expect(fire.locator(".badge-alert"), key).toBeVisible();
  else await expect(fire.locator(".badge-alert"), key).toBeHidden();

  await expect(hudChip(page, "wood"), key).toHaveAttribute("aria-label", h.woodLabel);
  await expect(hudChip(page, "food"), key).toHaveAttribute("aria-label", h.foodLabel);
  await expect(hudChip(page, "queue"), key).toHaveAttribute("data-state", h.queueState);
  await expect(hudChip(page, "queue"), key).toHaveAttribute("aria-label", h.queueLabel);
  await expect(hudChip(page, "tents"), key).toHaveAttribute("aria-label", h.tentsLabel);
}

/** HUD jour/nuit attendu (pilules + bilan de l'aube) pour un état importé. */
export async function expectHud(page: Page, e: DayNightExpect, key: string): Promise<void> {
  await expectHudLabels(page, e.hud, key);
  const report = page.locator("#dawn-report");
  if (e.report) {
    await expect(report, key).toBeVisible();
    // Région nommée par son titre ; seule la zone titre + liste est « live ».
    await expect(report).toHaveAttribute("aria-labelledby", "dawn-report-title");
    await expect(page.getByRole("region", { name: `Nuit ${e.report.night} terminée` })).toBeVisible();
    const live = report.locator(".notice-card__live");
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(report.locator("#dawn-report-title"), key).toHaveText(`Nuit ${e.report.night} terminée`);
    await expect(report.locator(".notice-card__list li"), key).toHaveText([
      `Payés à l'aube : ${e.report.sleepersPaid}`,
      `Partis à cause du froid : ${e.report.coldLeavers}`,
      `Bois gagné : +${e.report.woodEarned}`,
      `Bois brûlé : ${e.report.woodBurned}`,
    ]);
  } else {
    await expect(report, key).toBeHidden();
  }
}

/** aria-label d'une pilule du HUD. */
export async function hudLabel(page: Page, key: "clock" | "fire" | "wood" | "food" | "queue" | "tents"): Promise<string> {
  return (await hudChip(page, key).getAttribute("aria-label")) ?? "";
}

/** Valeur exacte d'un compteur (bois, nourriture) lue dans son aria-label (« Bois : 1 234 »). */
export async function hudNumber(page: Page, key: "wood" | "food"): Promise<number> {
  return parseHudNumber(await hudLabel(page, key));
}

/** « Bois : 1 234 » ⇒ 1234 (séparateurs U+202F, moins U+2212). NaN si illisible. */
export function parseHudNumber(label: string): number {
  // Classes construites depuis des chaînes (espaces U+202F / U+00A0 interdits littéralement dans une regex).
  const spaces = String.fromCharCode(0x202f, 0xa0, 0x20);
  const minus = String.fromCharCode(0x2212);
  const m = label.match(new RegExp(`:\\s*(${minus}?)([\\d${spaces}]+)$`));
  if (!m) return Number.NaN;
  const n = Number((m[2] ?? "").replace(new RegExp(`[${spaces}]`, "g"), ""));
  return m[1] ? -n : n;
}

/** Toast affiché de clé `key` (dans #notices). */
export function toast(page: Page, key: string) {
  return page.locator(`#notices .toast[data-key="${key}"]`);
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

/** Aucune erreur console, exception ni réponse HTTP ≥ 400. */
export function expectClean(p: PageProblems): void {
  expect(p.pageErrors, "exceptions").toEqual([]);
  expect(p.consoleErrors, "erreurs console").toEqual([]);
  expect(p.httpErrors, "réponses HTTP ≥ 400").toEqual([]);
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

/** Maintient une touche `ms` millisecondes. */
export async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/**
 * Masque toutes les notifications (#notices) pour les captures : le bandeau « Partie de test
 * (?seed=) » n'est pas fermable.
 */
export async function hideNotices(page: Page): Promise<void> {
  await page.addStyleTag({ content: "#notices{display:none!important}" });
  await expect(page.locator("#notices")).toBeHidden();
}

/** Ferme le bandeau s'il est fermable (captures plus lisibles). */
export async function closeBannerIfAny(page: Page): Promise<void> {
  const close = page.locator(".notice-banner:not([hidden]) .notice-banner__close:not([hidden])");
  if (await close.count()) await close.first().click();
}

/** Pas de défilement horizontal (scrollWidth ≤ clientWidth sur html et body). */
export async function horizontalOverflow(page: Page): Promise<{ html: number; body: number }> {
  return page.evaluate(() => ({
    html: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
}
