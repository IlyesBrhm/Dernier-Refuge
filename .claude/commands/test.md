---
description: Lance typecheck + tests et explique les échecs
allowed-tools: Bash(npm run typecheck:*), Bash(npm test:*), Bash(npx vitest:*), Read, Grep, Glob
argument-hint: [filtre de test optionnel]
---

Lance `npm run typecheck` puis `npx vitest run $ARGUMENTS`.
Pour chaque échec : fichier:ligne, cause probable, et quel agent doit corriger (core-dev, save-guardian, render-dev…). Ne corrige rien sans mon accord.
