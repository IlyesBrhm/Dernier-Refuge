# Dernier Refuge — instructions pour Claude

Jeu de gestion-survie 2D vue de dessus dans le navigateur (inspiré de My Perfect Hotel).
Cahier des charges : @docs/SPEC.md — Avancement : @docs/ROADMAP.md

## Stack
TypeScript strict · Vite · Canvas 2D · Vitest. Pas de framework de jeu, pas de nouvelle dépendance sans accord.

## Architecture (les dépendances ne vont que vers le bas)
```
src/app      boucle de jeu (pas fixe), câblage, horloge réelle, autosave
src/ui       HUD / menus DOM — envoie des commandes, lit l'état
src/render   Canvas 2D — lit l'état, ne le modifie jamais
src/save     sérialisation, checksum, migrations, double slot, StorageAdapter
src/core     LOGIQUE PURE : GameState, commandes, systèmes, sélecteurs, RNG
src/data     constantes d'équilibrage typées (aucune logique)
tests/       core/, save/ (Vitest)
```

## Règles
- `src/core` : pur, déterministe, aucun DOM/horloge/`Math.random`/timer/import de couche supérieure (un hook bloque sinon).
- Toute mutation = commande validée par `applyCommand` ; une commande refusée ne change rien.
- Ressources en entiers ; nombres de gameplay uniquement dans `src/data`.
- Chaque règle de jeu a ses tests ; si `GameState` change de forme ⇒ nouvelle version de save + migration + fixture.
- Code et commentaires en français ou anglais, mais identifiants en anglais.

## Travail avec les agents
Utiliser `/feature <description>` pour une fonctionnalité complète. Agents disponibles et périmètre d'écriture :
| Agent | Peut écrire dans |
|---|---|
| architect | docs/ |
| core-dev | src/core, tests/core |
| balance-designer | src/data |
| save-guardian | src/save, tests/save |
| render-dev | src/render, src/ui, src/app, src/main.ts, index.html, public |
| test-writer | tests/ |
| reviewer | rien (lecture seule) |

## Commandes
`npm run dev` · `npm test` · `npm run typecheck` · `npm run build` · `npm run coverage`

## Harness (ne pas modifier sans l'humain)
`.claude/settings.json`, `.claude/hooks/`, `.claude/agents/` sont protégés. Les actions refusées sont journalisées dans `.claude/logs/audit.jsonl`.
