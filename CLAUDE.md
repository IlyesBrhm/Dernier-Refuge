# Dernier Refuge — instructions pour Claude

Jeu de gestion-survie vue de dessus (gameplay sur grille 2D ; rendu 3D three.js par défaut, repli automatique en Canvas 2D, forçable avec `?render=2d`) dans le navigateur (inspiré de My Perfect Hotel).
Cahier des charges : @docs/SPEC.md — Avancement : @docs/ROADMAP.md

## Stack
TypeScript strict · Vite · three.js (rendu uniquement) · Vitest. Pas de framework de jeu, pas de nouvelle dépendance sans accord.

## Architecture (les dépendances ne vont que vers le bas)
```
src/app      boucle de jeu (pas fixe), câblage, horloge réelle, autosave
src/ui       HUD / menus DOM — envoie des commandes, lit l'état
src/render   three.js — lit l'état, ne le modifie jamais (skill `three-render`)
src/save     sérialisation, checksum, migrations, double slot, StorageAdapter
src/core     LOGIQUE PURE : GameState, commandes, systèmes, sélecteurs, RNG
src/data     constantes d'équilibrage typées (aucune logique)
tests/       core/, save/ (Vitest)

 assets-src/  sources 3D brutes des 5 packs (CC0) — protégées
 public/assets/ (modèles LIVRÉS, versionné, ≤ 4 Mo) + assets-all/ (conversion complète, local) + src/render/assets/asset-catalog.ts — GÉNÉRÉS par `npm run assets` (tools/build-assets.mjs)
```

## Règles
- `src/core` : pur, déterministe, aucun DOM/horloge/`Math.random`/timer/import de couche supérieure (un hook bloque sinon).
- Toute mutation = commande validée par `applyCommand` ; une commande refusée ne change rien.
- Ressources en entiers ; nombres de gameplay uniquement dans `src/data`.
- `three` uniquement dans `src/render/three` et `src/render/assets` (chargés par import dynamique) et `tools/` ; le core raisonne en tuiles/unités, jamais en objets 3D.
- Chaque règle de jeu a ses tests ; si `GameState` change de forme ⇒ nouvelle version de save + migration + fixture.
- Code et commentaires en français ou anglais, mais identifiants en anglais.

## Travail avec les agents
Utiliser `/feature <description>` pour une fonctionnalité complète. Agents disponibles et périmètre d'écriture :
| Agent | Peut écrire dans |
|---|---|
| architect | docs/ |
| core-dev | src/core, src/data, tests/, docs/design |
| balance-designer | src/data, tests/, docs/ |
| save-guardian | src/save, tests/, docs/design |
| render-dev | src/render, src/ui, src/app, src/main.ts, index.html, public (hors public/assets), tests/, tools/asset-preview, docs/design |
| test-writer | tests/ |
| reviewer | rien (lecture seule) |

Barrière de tests (typecheck + tests) uniquement à la fin de la session principale ; le lint passe par `npm run check` et la revue.

## Commandes
`npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run coverage` · `npm run assets` (reconvertit les modèles 3D ; livrés = `tools/shipped-assets.json`) · `npm run assets:size` · `npm run e2e` (Playwright) · `npm run captures` (régénère `captures/`)

Aperçu de tous les modèles 3D (`assets-all/`, local) : `npm run dev` puis `/tools/asset-preview/`. Plans : `docs/design/render-3d.md` (rendu 3D), `docs/design/day-night.md` (jour/nuit, feu de camp).

## Harness (ne pas modifier sans l'humain)
`.claude/settings.json`, `.claude/hooks/`, `.claude/agents/` sont protégés. Les actions refusées sont journalisées dans `.claude/logs/audit.jsonl`.
