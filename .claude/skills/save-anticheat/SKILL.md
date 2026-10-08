---
name: save-anticheat
description: Conception de la sauvegarde fiable (versionnage, migrations, double slot, checksum) et des protections anti-triche côté client. À charger pour tout travail dans src/save ou dès que la forme de GameState change.
---

# Sauvegarde fiable & anti-triche

## Format
```ts
interface SaveFile {
  version: number;     // CURRENT_VERSION
  savedAt: number;     // ms epoch, fourni par src/app (jamais lu dans core)
  checksum: string;    // hash(canonicalJSON(state) + version + savedAt + SALT)
  state: GameState;
}
```
- `canonicalJSON` : clés triées récursivement → même état = même chaîne.
- Hash : SHA-256 via `crypto.subtle` (async) ou FNV-1a 64 bits si synchrone requis.

## Écriture fiable (stockage = localStorage ou IndexedDB, derrière une interface `StorageAdapter` injectable → testable avec un faux stockage en mémoire)
1. Choisir le slot le plus ancien (A ou B).
2. Écrire, relire, recalculer le checksum.
3. Si OK, mettre à jour `meta.current = slot`. Sinon ne rien changer et remonter l'erreur.
4. Autosave : toutes les 30 s, à chaque changement de jour, sur `visibilitychange`/`pagehide`.

## Chargement
1. Lire A et B, ignorer ceux dont checksum/JSON sont invalides.
2. Migrer (`migrations[v]` jusqu'à `CURRENT_VERSION`).
3. `validateState` ; si échec ⇒ essayer l'autre slot ; sinon proposer nouvelle partie + export de la save cassée.
4. Progression hors-ligne : `elapsed = clamp(now - savedAt, 0, MAX_OFFLINE)` ; si `savedAt > now + 5 min` ⇒ elapsed = 0 et flag `clockTamper`.

## Anti-triche (jeu 100 % client)
Impossible d'être inviolable ; objectif : rendre la triche pénible et détectable.
- Toutes les mutations passent par des commandes validées (pas d'état exposé en écriture : `Object.freeze` en dev, pas de `window.game` en prod).
- Invariants stricts au chargement et en debug après chaque tick.
- Checksum salé ⇒ éditer la save à la main la rend invalide.
- Sel et code minifiés en prod (dissuasion, pas sécurité).
- Statistiques de cohérence : ressources gagnées ≤ max théorique depuis `tick` ⇒ sinon flag.
- Si un jour il y a un classement en ligne : rejouer le journal des commandes côté serveur (le core déterministe le permet).

## Tests obligatoires
aller-retour, corruption d'un octet, checksum faux, slot A cassé ⇒ B chargé, chaque fixture de version migrée, horloge dans le futur, NaN injecté.
