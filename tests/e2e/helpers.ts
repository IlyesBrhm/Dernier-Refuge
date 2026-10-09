// Utilitaires Playwright (pas un fichier de test : seuls les *.spec.ts sont ramassés).

import { expect, type Page } from "@playwright/test";

/** WebGL en headless (docs/design/render-3d.md §6.3) : SwiftShader logiciel. */
export const WEBGL_LAUNCH: { launchOptions: { args: string[] } } = {
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
};

export interface Render3DInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
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
