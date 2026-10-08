---
description: Développe une fonctionnalité de bout en bout via les subagents (design → core → données → save → rendu → tests → revue)
argument-hint: <description de la fonctionnalité>
---

Fonctionnalité demandée : $ARGUMENTS

Orchestre le travail SANS coder toi-même ce que les agents savent faire :
1. Lance `architect` : plan dans `docs/design/`. Montre-moi le résumé et attends mon accord si la feature modifie `GameState`.
2. Lance `core-dev` avec la partie logique du plan.
3. Si des constantes sont nécessaires, lance `balance-designer`.
4. Si `GameState` a changé de forme, lance `save-guardian` (version + migration + fixture).
5. Lance `render-dev` pour l'affichage et les entrées.
6. Lance `test-writer` pour renforcer les tests.
7. Lance `reviewer` et corrige les points 🔴 en relançant l'agent concerné.
8. Coche la tâche dans `docs/ROADMAP.md` et fais un résumé final.

Les agents indépendants (ex. render-dev et save-guardian) peuvent tourner en parallèle.
