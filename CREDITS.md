# Crédits

## Modèles 3D

Modèles 3D du jeu (rendu 3D par défaut). Tous les packs utilisés sont sous licence **CC0 1.0**
(domaine public, <https://creativecommons.org/publicdomain/zero/1.0/>) : l'attribution n'est pas obligatoire, mais elle est appréciée.

- Sources brutes : `assets-src/` (non versionné).
- Modèles **livrés dans le jeu** : `public/assets/<pack>/` (liste blanche `tools/shipped-assets.json`, générés par `npm run assets`, licence du pack copiée dans chaque dossier).
- Conversion complète pour la page d'aperçu : `assets-all/` (non versionné).

| Pack | Auteur | Licence | Lien | Livré dans le jeu |
|---|---|---|---|---|
| KayKit Adventurers 2.0 | Kay Lousberg | CC0 1.0 | <https://kaylousberg.itch.io/kaykit-adventurers> | Oui : joueur et survivants, animations Idle_A, Walking_A, Use_Item, Interact |
| KayKit Forest Nature Pack 1.0 | Kay Lousberg | CC0 1.0 | <https://kaylousberg.itch.io/kaykit-forest> | Oui : arbres, rochers, buissons, herbe |
| Survival Kit 2.0 | Kenney | CC0 1.0 | <https://kenney.nl/assets/survival-kit> | Oui : tente, feu de camp, sac de couchage |
| Castle Kit 2.0 | Kenney | CC0 1.0 | <https://kenney.nl/assets/castle-kit> | Oui : remparts, porte, tour carrée, drapeau, baliste (10 modèles) |
| Fantasy Town Kit 2.0 | Kenney | CC0 1.0 | <https://kenney.nl/assets/fantasy-town-kit> | Oui : murs bois, toits, clôture, lanterne, étal, charrette, moulin, fontaine, route, plancher (16 modèles) |
| Stylized Nature MegaKit (Standard) | Quaternius | CC0 1.0 | <https://quaternius.com> | Non (aperçu seulement) |
| Wolf (animé) | Quaternius | CC0 1.0 attendue, **à vérifier** sur la page de téléchargement | <https://quaternius.com> | Non (aperçu seulement) |

Tout ajout de modèle livré passe par `tools/shipped-assets.json` et doit être reporté dans ce tableau.

## Polices et icônes

Hébergées dans le projet (le jeu fonctionne hors ligne). Aucune n'est chargée depuis Internet.

| Élément | Auteur | Licence | Lien | Fichiers |
|---|---|---|---|---|
| Fredoka (titres, graisse 600) | The Fredoka Project Authors (Milena Brandão, Hafontia) | SIL Open Font License 1.1 | <https://github.com/hafontia/Fredoka-One> | `public/fonts/fredoka-latin.woff2` (16 Ko, sous-ensemble latin), licence `public/fonts/fredoka-OFL.txt` |
| Nunito (texte, graisses 400 à 800) | The Nunito Project Authors (Vernon Adams, Cyreal, Jacques Le Bailly) | SIL Open Font License 1.1 | <https://github.com/googlefonts/nunito> | `public/fonts/nunito-latin.woff2` (39 Ko, sous-ensemble latin), licence `public/fonts/nunito-OFL.txt` |
| Lucide (icônes) | Lucide Icons and Contributors | ISC (certaines icônes dérivées de Feather : MIT) | <https://lucide.dev> | `src/ui/icons/lucide/*.svg` (30 icônes), licence `src/ui/icons/lucide/LICENSE` |
| Icônes maison (bûches, feu éteint) | Projet Dernier Refuge | Comme le projet | — | `src/ui/icons/custom/` |

Sources des fichiers : Google Fonts (sous-ensemble latin) et <https://github.com/google/fonts> pour les licences OFL ;
<https://github.com/lucide-icons/lucide> pour les icônes et leur licence.
