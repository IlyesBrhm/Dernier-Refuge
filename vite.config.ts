import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      // three.js dans son propre chunk, chargé seulement par l'import dynamique de ?render=3d
      // (vérifiable en e2e : aucun chunk « three-*.js » demandé en 2D).
      output: { manualChunks: { three: ["three"] } },
    },
    chunkSizeWarningLimit: 800,
  },
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: { include: ["src/core/**", "src/save/**"], thresholds: { lines: 80 } },
  },
});
