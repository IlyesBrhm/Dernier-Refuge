# Dernier Refuge — Cahier des charges

## Pitch
Jeu de gestion-survie vue de dessus (gameplay sur grille ; rendu 3D low-poly stylisé par défaut, repli automatique en Canvas 2D, forçable avec `?render=2d`), jouable dans le navigateur, inspiré de **My Perfect Hotel** :
le joueur gère un **camp de survivants en forêt**. Il accueille des survivants, récolte des ressources,
agrandit le camp et recrute des travailleurs pour automatiser, au rythme d'un **cycle jour/nuit**,
de **saisons** et de **menaces nocturnes**.

## Boucle de jeu
1. **Le jour** : des survivants arrivent à l'entrée du camp et font la queue.
2. Le joueur (personnage déplacé au clavier / joystick tactile) les **accueille**, les **installe** (tente/cabane),
   les **nourrit** (feu de camp, cantine) → ils paient en **ressources/pièces** et en **réputation**.
3. Le joueur **récolte** (bois, baies, pierre, eau) en se plaçant sur les nœuds de ressources.
4. Avec ses gains, il **débloque des zones** et **construit/améliore** (style My Perfect Hotel : se tenir sur
   une zone de construction pour y « verser » les ressources progressivement).
5. Il **recrute des travailleurs** (bûcheron, cuisinier, garde, réparateur) qui automatisent une tâche.
6. **La nuit** (implémenté, cf. `docs/design/day-night.md`) : plus aucune arrivée ; les survivants installés
   **dorment jusqu'à l'aube et paient au matin** (récompense majorée). Le **feu de camp doit être entretenu**
   (s'arrêter à côté pour y verser du bois) : s'il s'éteint, les dormeurs **partent à cause du froid** avec une
   récompense réduite. **Feu éteint, l'accueil est suspendu** ; et dès qu'un survivant est parti à cause du froid,
   **l'accueil reste fermé jusqu'à l'aube**, même si le feu est rallumé. Entretenir le feu doit toujours rapporter
   plus que le laisser mourir dès 2 tentes. À venir : visibilité réduite, des menaces (loups, puis bandits, puis créatures en hiver) attaquent
   le périmètre ; palissades, torches et gardes défendent. Dégâts = bâtiments abîmés, survivants qui fuient.
7. Le matin : paiement des dormeurs, bilan de la nuit (payés, partis au froid, bois gagné, bois brûlé),
   tentes à nettoyer, réparations, nouveau cycle.

## Systèmes
| Système | Règles clés |
|---|---|
| Temps | 1 tick = 100 ms de jeu. Journée complète ≈ 6 min réelles (4 min jour, 2 min nuit). La partie commence à l'aube ; l'heure se déduit du tick. |
| Feu de camp | Présent dès le départ, réserve de bois qui brûle selon un calendrier fixe (plus vite la nuit). Alimenté en s'arrêtant 0,5 s à côté. Nuit + feu éteint ⇒ départ au froid des dormeurs, accueil suspendu ; après un départ au froid, accueil fermé jusqu'à l'aube. |
| Saisons | Printemps / Été / Automne / Hiver, 5 jours chacune. Modifient repousse, besoins (bois de chauffage en hiver), menaces, palette visuelle. |
| Ressources | Bois, Nourriture, Pierre, Eau, Pièces. Entiers. Capacité de stockage améliorable. |
| Survivants | Arrivent selon réputation + capacité d'accueil. Besoins : abri, nourriture, chaleur. Satisfaction ⇒ paiement et pourboires. |
| Travailleurs | Recrutés avec des pièces, salaire journalier. Niveaux (vitesse, capacité de transport). |
| Construction | Zones verrouillées → débloquées par paliers (coût ×~1,6). Bâtiments améliorables (niv. 1→3). |
| Menaces | Spawn nocturne en bordure de carte, intensité = f(jour, saison, taille du camp). Défenses : palissade (PV), torches (rayon), gardes. |
| Progression | Objectifs (« accueillir 10 survivants », « survivre à l'hiver »), étoiles de camp, nouvelles zones de forêt. |

## Exigences techniques (non négociables)
- **Logique séparée de l'affichage** : `src/core` pur, déterministe, sans DOM ; `src/render`/`src/ui` en lecture seule.
- **Testée** : Vitest, chaque règle a ses tests, déterminisme vérifié (même seed + mêmes commandes ⇒ même état).
- **Anti-triche** : toutes les actions passent par des commandes validées, invariants vérifiés, sauvegarde signée (checksum salé), progression hors-ligne plafonnée, détection d'horloge trafiquée.
- **Sauvegarde fiable** : versionnée + migrations, double slot A/B avec vérification, autosave, export/import.
- **Navigateur** : TypeScript + Vite, rendu three.js **par défaut** (chargé à la demande, caméra perspective inclinée ~57°, assets KayKit + Kenney, CC0, cf. `docs/design/render-3d.md` et `docs/design/day-night.md`), repli Canvas 2D automatique (WebGL absent, modèles en échec, délai dépassé, contexte perdu) ou forcé avec `?render=2d`. 60 FPS sur mobile milieu de gamme, contrôles clavier + tactile.

## Hors périmètre (v1)
Multijoueur, serveur, achats intégrés, classement en ligne (mais l'architecture le permettra).
