---
name: game-core
description: Patrons d'architecture du cœur logique du jeu (GameState, commandes, systèmes par tick, RNG seedé, données d'équilibrage). À charger avant d'écrire ou de relire du code dans src/core.
---

# Cœur logique — patrons obligatoires

## Flux
```
Entrée (UI) ──► Command ──► applyCommand(state, cmd) ──► { ok, state, error? }
Boucle (app) ──► tick(state, n) ──► systèmes dans un ordre FIXE ──► nouvel état
Rendu ◄── lit l'état (Readonly) + sélecteurs
```

## État
- Un seul objet `GameState` sérialisable en JSON (pas de classes, pas de fonctions, pas de `Map/Set`, pas de `Date`).
- Ressources en **entiers** (bois, nourriture, pierre, pièces…). Jamais de float qui s'accumule.
- Entités dans des tableaux triés par `id` ; IDs générés par un compteur `state.nextId`.
- Temps : `state.tick` (entier). Jour, heure, saison sont **dérivés** du tick par des sélecteurs.
- RNG : `state.rng` (ex. mulberry32/xorshift, entier 32 bits). `nextRandom(state)` retourne `[valeur, nouvelEtatRng]`.

## Commandes
```ts
type Command =
  | { type: "harvest"; nodeId: number }
  | { type: "build"; buildingId: string; x: number; y: number }
  | { type: "hireWorker"; role: WorkerRole }
  | { type: "welcomeSurvivor"; survivorId: number };

function applyCommand(s: GameState, c: Command): CommandResult {
  const err = validate(s, c);          // 1. tout valider
  if (err) return { ok: false, state: s, error: err }; // état inchangé
  return { ok: true, state: execute(s, c) };           // 2. puis appliquer
}
```
Erreurs = union de chaînes (`"NOT_ENOUGH_WOOD" | "TILE_OCCUPIED" | ...`), traduites par l'UI.

## Systèmes (ordre fixe à chaque tick)
1. `timeSystem` (avance horloge, passage jour/nuit, changement de saison)
2. `survivorSystem` (arrivées, files d'attente, satisfaction, paiement)
3. `workerSystem` (tâches automatiques : récolte, service, réparation)
4. `resourceSystem` (repousse des arbres/baies selon la saison)
5. `threatSystem` (spawn nocturne, attaques, défenses, dégâts)
6. `progressionSystem` (débloquages, objectifs)

Chaque système : `(state, ctx) => state`, pur, testé isolément.

## Données
Toutes les constantes dans `src/data/*.ts` (`as const`, typées). Le core les importe, ne les recopie jamais.

## Tests attendus pour chaque règle
- cas nominal, cas d'échec (état inchangé), cas limite, déterminisme (2 runs même seed = même état).
