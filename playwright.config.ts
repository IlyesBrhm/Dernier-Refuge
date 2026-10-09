import { defineConfig, devices } from "@playwright/test";

// Tests de bout en bout (docs/design/render-3d.md §6.3). Vitest ne ramasse que tests/**/*.test.ts ;
// Playwright ne ramasse que tests/e2e/*.spec.ts.
// - `npm run e2e`      : tests e2e (sorties automatiques dans test-results/, ignoré par git).
// - `npm run captures` : régénère les captures choisies dans captures/ (versionné), projet « captures ».
// Le jeu est servi par `vite preview` sur le build de production : on teste ce qui est livré
// (chunk three séparé, public/assets/ sous-ensemble).
const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // WebGL logiciel (SwiftShader) : fonctionne en headless et en CI sans GPU. Sous forte charge, le chien de garde
    // tue le processus GPU puis Chromium bloque WebGL pour l'origine : les deux dernières options l'empêchent.
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--disable-gpu-watchdog",
        "--disable-domain-blocking-for-3d-apis",
      ],
    },
  },
  projects: [
    {
      name: "e2e",
      testIgnore: "**/captures.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "captures",
      testMatch: "**/captures.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
