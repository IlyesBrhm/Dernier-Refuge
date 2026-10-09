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

## Jalon 1.5 — Prototype de rendu 3D (2D par défaut, 3D via `?render=3d`) — plan : `docs/design/render-3d.md`
- [x] 5 packs 3D convertis (`npm run assets`) : nature, forêt, survie, personnages animés + accessoires, loup — catalogue + chargeur + page d'aperçu
- [x] Liste blanche des modèles livrés (`public/assets/` versionné, 18 modèles, 2,46 Mo) ; conversion complète réservée à l'aperçu
- [x] Renderer three.js chargé par import dynamique derrière l'interface `Renderer` (caméra perspective inclinée, sol, tapis accueil/file/entrée)
- [x] Écran de chargement + repli automatique en 2D (WebGL absent, modèles en échec, contexte perdu) + libération mémoire
- [x] Nœuds de ressources en modèles KayKit (arbres, buissons, rochers) + état épuisé + rebond de repousse
- [x] Forêt de bordure et décor instanciés
- [x] Barres, coûts, textes en calque 2D superposé (projection 3D → écran) + butin 3D
- [x] Joueur et survivants en personnages KayKit animés (marche, idle), variantes de couleur
- [x] Tentes Kenney (libre / occupée / désordre) et emplacements de construction (contour, coût, anneau)
- [x] Tests : `buildScene` pur (Vitest) + e2e Playwright (3D sans erreur, capture, repli 2D)

## Jalon 2 — Sauvegarde
- [x] Format versionné + checksum + double slot
- [x] Autosave + export/import
- [x] Validation des invariants au chargement

## Jalon 3 — Construction & automatisation
- [ ] Zones de construction à remplir progressivement
- [ ] Bâtiments : tente, feu de camp, cantine, entrepôt
- [ ] Travailleurs : bûcheron, cuisinier (salaire, niveaux)

> Note : les zones de construction à remplir progressivement et la tente existent en version minimale (core loop, cf. `docs/design/core-loop.md`) ; non cochées tant que la version complète n'est pas faite.

## Jalon 4 — Temps & danger — plan : `docs/design/day-night.md`
- [x] Cycle jour/nuit (teinte, visibilité)
- [x] Feu de camp à entretenir (sommeil, froid, bilan de l'aube)
- [ ] Saisons (repousse, chauffage, palette)
- [ ] Menaces nocturnes (loup animé) + palissade, torches, gardes

> Notes : 3D par défaut (repli 2D, `?render=2d`). Sauvegarde **v2** (`fire`, `night`, statut `sleeping`, tuile F) avec
> migration v1 → v2 et fixtures v2. Accueil fermé jusqu'à l'aube après un départ au froid (`welcomeBlockReason`,
> bot « mixte » : entretenir le feu reste la meilleure stratégie). Coût du feu à rééquilibrer avec les loups.

## Jalon 5 — Progression & polish
- [ ] Objectifs, étoiles, nouvelles zones
- [ ] Simulation headless `npm run sim` pour l'équilibrage
- [ ] Sons, particules, tutoriel
- [ ] Progression hors-ligne plafonnée
  - Note : détection d'horloge trafiquée à faire avec le cycle jour/nuit.
