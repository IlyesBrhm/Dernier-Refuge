# Roadmap

## Jalon 0 — Fondations
- [x] Harness Claude Code (agents, hooks, commandes, skills)
- [x] Squelette Vite + TypeScript + Vitest, RNG seedé testé
- [x] `GameState` initial + `tick()` + `applyCommand()` vides mais typés
- [x] Boucle à pas fixe dans `src/app` + canvas qui affiche une grille

## Jalon 1 — Boucle de base
- [x] Déplacement du joueur (clavier + joystick tactile)
- [x] Nœuds de ressources (arbres, buissons) + récolte + repousse
- [x] Arrivée de survivants, file d'attente, accueil, paiement
- [x] HUD ressources

## Jalon 1.5 — Passage au rendu 3D
- [x] 5 packs 3D convertis (`npm run assets`) : nature, forêt, survie, personnages animés + accessoires, loup — catalogue + chargeur + page d'aperçu
- [ ] Renderer three.js derrière l'interface `Renderer` existante (caméra inclinée, sol, joueur, survivants)
- [ ] Nœuds de ressources affichés avec les modèles (arbres, buissons, rochers) + état épuisé
- [ ] Décor instancié (herbe, fleurs, cailloux) + forêt de bordure
- [ ] Effets/HUD 2D superposés (projection 3D → écran)
- [ ] Joueur et survivants en personnages animés (marche, idle, interaction)
- [ ] Bâtiments du camp avec le Survival Kit (tente, feu de camp, emplacements de construction)

## Jalon 2 — Sauvegarde
- [x] Format versionné + checksum + double slot
- [x] Autosave + export/import
- [x] Validation des invariants au chargement

## Jalon 3 — Construction & automatisation
- [ ] Zones de construction à remplir progressivement
- [ ] Bâtiments : tente, feu de camp, cantine, entrepôt
- [ ] Travailleurs : bûcheron, cuisinier (salaire, niveaux)

> Note : les zones de construction à remplir progressivement et la tente existent en version minimale (core loop, cf. `docs/design/core-loop.md`) ; non cochées tant que la version complète n'est pas faite.

## Jalon 4 — Temps & danger
- [ ] Cycle jour/nuit (teinte, visibilité)
- [ ] Saisons (repousse, chauffage, palette)
- [ ] Menaces nocturnes (loup animé) + palissade, torches, gardes

## Jalon 5 — Progression & polish
- [ ] Objectifs, étoiles, nouvelles zones
- [ ] Simulation headless `npm run sim` pour l'équilibrage
- [ ] Sons, particules, tutoriel
- [ ] Progression hors-ligne plafonnée
  - Note : détection d'horloge trafiquée à faire avec le cycle jour/nuit.
