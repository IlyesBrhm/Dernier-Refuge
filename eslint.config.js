// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", "public/", "assets-src/", "assets-all/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "tools/**/*.ts"],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    // three.js n'est chargé qu'à la demande (?render=3d, import dynamique) : interdit hors de la couche 3D.
    // (src/core a sa propre règle plus stricte ci-dessous.)
    files: ["src/**/*.ts"],
    ignores: ["src/render/three/**", "src/render/assets/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["three", "three/**"], message: "three uniquement dans src/render/three et src/render/assets (import dynamique)." }] },
      ],
    },
  },
  {
    // Le cœur logique doit rester pur et déterministe.
    files: ["src/core/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Utiliser le RNG seedé de src/core/rng.ts." },
        { object: "Date", property: "now", message: "Pas d'horloge dans src/core." },
        { object: "performance", property: "now", message: "Pas d'horloge dans src/core." },
      ],
      "no-restricted-globals": [
        "error",
        "window", "document", "navigator", "performance", "crypto", "localStorage", "sessionStorage",
        "setTimeout", "setInterval", "requestAnimationFrame", "fetch",
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "Pas d'horloge dans src/core." },
      ],
      "no-restricted-imports": [
        "error",
        { patterns: ["three", "three/**", "**/app", "**/app/**", "**/ui", "**/ui/**", "**/render", "**/render/**", "**/save", "**/save/**"] },
      ],
    },
  },
  {
    // Scripts Node (hooks du harness, config).
    files: ["**/*.{js,mjs,cjs}", "vite.config.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
);
