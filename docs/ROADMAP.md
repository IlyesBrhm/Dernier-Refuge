# Roadmap

## Jalon 0 — Fondations
- [x] Harness Claude Code (agents, hooks, commandes, skills)
- [x] Squelette Vite + TypeScript + Vitest, RNG seedé testé
- [x] `GameState` initial + `tick()` + `applyCommand()` vides mais typés
- [x] Boucle à pas fixe dans `src/app` + canvas qui affiche une grille

## Jalon 1 — Boucle de base
- [x] Déplacement du joueur (clavier + joystick tactile)
- [ ] Nœuds de ressources (arbres, buissons) + récolte + repousse
- [x] Arrivée de survivants, file d'attente, accueil, paiement
- [x] HUD ressources

## Jalon 2 — Sauvegarde
- [ ] Format versionné + checksum + double slot
- [ ] Autosave + export/import
- [ ] Validation des invariants au chargement

## Jalon 3 — Construction & automatisation
- [ ] Zones de construction à remplir progressivement
- [ ] Bâtiments : tente, feu de camp, cantine, entrepôt
- [ ] Travailleurs : bûcheron, cuisinier (salaire, niveaux)

> Note : les zones de construction à remplir progressivement et la tente existent en version minimale (core loop, cf. `docs/design/core-loop.md`) ; non cochées tant que la version complète n'est pas faite.

## Jalon 4 — Temps & danger
- [ ] Cycle jour/nuit (teinte, visibilité)
- [ ] Saisons (repousse, chauffage, palette)
- [ ] Menaces nocturnes + palissade, torches, gardes

## Jalon 5 — Progression & polish
- [ ] Objectifs, étoiles, nouvelles zones
- [ ] Simulation headless `npm run sim` pour l'équilibrage
- [ ] Sons, particules, tutoriel
- [ ] Progression hors-ligne plafonnée
