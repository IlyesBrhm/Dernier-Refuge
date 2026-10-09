import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      // three.js dans son propre chunk, chargé seulement par l'import dynamique (3D par défaut)
      // (vérifiable en e2e : aucun chunk « three-*.js » demandé avec ?render=2d).
      output: { manualChunks: { three: ["three"] } },
    },
    chunkSizeWarningLimit: 800,
  },
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    // Moitié des cœurs au maximum : la machine de développement doit rester utilisable (règle du projet).
    maxWorkers: "50%",
    minWorkers: 1,
    coverage: { include: ["src/core/**", "src/save/**"], thresholds: { lines: 80 } },
  },
});
