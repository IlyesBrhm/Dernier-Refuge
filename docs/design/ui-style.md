---
name: ui-style
description: Guide de style de l'interface de Dernier Refuge (DOM, src/ui, src/styles, HUD, menus, écran titre, notifications, tutoriel, paramètres) - tokens CSS exacts de src/styles/tokens.css (palette feu / nuit / bois / parchemin, contrastes WCAG AA vérifiés, tailles de composants, durées, amplitudes de mouvement), polices auto-hébergées Fredoka 600 + Nunito 400-800, icônes Lucide (ISC) + 2 maison, composants (boutons, pilule HUD, jauge, panneau, parchemin, toast, dialogue, curseur, interrupteur, choix segmenté, onglets), états, animations et « réduire les animations », accessibilité, mobile (safe areas, 360 px, HUD ≤ 12 %), raccourcis Échap/P/M, contrat de test (data-screen, data-panel, data-hud, data-action, data-dialog, #notices, window.__gameInfo en lecture seule), dette de valeurs en dur, checklist d'ajout d'écran ou de composant, ton des textes. À charger avant toute modification de src/ui, src/styles, index.html ou de textes affichés.
---
<!-- Source : docs/design/ui-style.md. Copié tel quel dans .claude/skills/ui-style/SKILL.md (plan : docs/design/ui-polish.md §9). -->

# Dernier Refuge — guide de style de l'interface

Ambiance : **un feu de camp dans une nuit bleue**. Le chaud (orange du feu, bois, parchemin) porte l'action et
l'information ; le froid (bleu nuit) est le fond. Style « jeu de gestion casual » (My Perfect Hotel) : formes
arrondies, gros chiffres lisibles, boutons épais qui « s'enfoncent ». Toute l'interface est DOM (`src/ui`) stylée par
`src/styles/*.css` ; le canvas ne dessine que le monde et ses étiquettes.

Règle d'or : **n'utiliser que les tokens ci-dessous** (`var(--…)`). Aucune couleur, taille, durée ou ombre en dur dans
un composant. Un nouveau besoin ⇒ un nouveau token dans `tokens.css` **et** ici d'abord. Les exceptions encore
présentes sont listées au §11 (dette) : ne pas en ajouter.

Fichiers (importés dans cet ordre par `src/main.ts`) : `src/styles/tokens.css` (variables seules + surcharges
« mouvement réduit » et HUD étroit), `base.css` (`@font-face`, reset, typographie, focus, `.sr-only`),
`components.css` (composants §5), `main.css` (mise en page des écrans). Icônes : `src/ui/icons.ts`. Fabriques DOM :
`src/ui/dialog.ts` (`makeButton`, `makeIconButton`, `setDisabled`, `guard`, `createDialog`, `createConfirmDialog`),
`src/ui/widgets.ts` (`createSwitch`, `createSlider`, `createSegmented`, `createTabs`).

---

## 0. Décisions validées par l'utilisateur

| Sujet | Décision |
|---|---|
| Polices | **Fredoka 600** (titres) + **Nunito 400–800** (texte), OFL 1.1, **auto-hébergées** (`public/fonts/`), aucune requête externe |
| Icônes | **Lucide** (ISC) + **2 icônes maison** (`wood`, `fire-out`) dans le même style |
| Raccourcis | **Échap** et **P** = pause, **M** = son (§7.1) |
| Lecture e2e | `window.__gameInfo` présent aussi en production, **strictement en lecture seule** (§10) |
| Zoom | **Zoom navigateur permis partout** (WCAG 1.4.4, 200 %) : pas de `user-scalable=no` ; seule la **zone de jeu** (`#game`, canvas WebGL, joystick) est en `touch-action: none` (§7) |

---

## 1. Couleurs (tokens)

```css
:root {
  /* Nuit (fonds) */
  --c-night-900: #0e1626;   /* fond de page, texte sur bouton primaire et badge « ! » */
  --c-night-800: #16223a;   /* panneaux, bandeaux, badge « +N » */
  --c-night-700: #22324f;   /* bouton secondaire, piste du choix segmenté, survol du bouton icône */
  --c-night-600: #2f4368;   /* bordures, pistes (jauge, curseur, interrupteur, onglets) */
  --c-hud-bg: rgba(14, 22, 38, 0.82);    /* pilules HUD, bouton icône : opacité ≥ 0,82 OBLIGATOIRE */
  --c-scrim: rgba(8, 12, 22, 0.62);      /* fond des dialogues, vignette de l'écran titre */
  --c-toast-bg: rgba(22, 34, 58, 0.96);  /* toasts : night-800 à 0,96 */
  /* Feu (action, accent) */
  --c-ember-300: #ffc27a;   /* texte accent sur nuit : titres de panneau, onglet actif, valeur de curseur, liens */
  --c-ember-400: #ffa552;   /* survol du primaire */
  --c-ember-500: #ff8a2a;   /* bouton primaire, jauge, curseur, interrupteur activé, sélection segmentée */
  --c-ember-600: #e06a12;   /* primaire enfoncé */
  --c-ember-700: #a84a00;   /* accent / lien sur parchemin, hachures de la jauge, icône check de l'interrupteur */
  /* Bois (cadres, décor) */
  --c-wood-700: #4a2f1c;    /* ombre des boutons et du titre */
  --c-wood-500: #8b5a34;    /* cadre des panneaux et des bandeaux */
  --c-wood-300: #c99a6b;    /* bord du parchemin, icône Bois du HUD */
  /* Parchemin (tutoriel, bilan de l'aube, crédits) */
  --c-parchment-100: #f6ebd3;
  --c-parchment-200: #eadbb8; /* bas du dégradé */
  --c-ink-900: #2b1d12;     /* texte sur parchemin */
  --c-ink-600: #5c4532;     /* texte secondaire sur parchemin */
  /* Texte sur fond nuit */
  --c-text-100: #f7f1e6;
  --c-text-300: #bfc8da;    /* secondaire, onglet inactif, icônes File / Tentes */
  /* Sémantique (toujours doublée d'une icône ou d'un mot, cf. §8) */
  --c-success-400: #6fcf7a; --c-success-700: #256b30;  /* 400 sur nuit, 700 sur parchemin */
  --c-warn-400: #ffc83d;    /* toast warning, File fermée, badge « ! », icône des bandeaux */
  --c-danger-400: #ff6b5a;  --c-danger-600: #b3261e;   /* 400 = texte / icône sur nuit ; 600 = fond bouton danger */
  --c-frost-300: #9cc9ff;   /* toast info, lune, dormeurs, bandeau « render » */
  --c-spend: #ff9c8a;       /* compteur qui baisse (dépense) */
  --c-focus: #ffd84a;       /* anneau de focus */
}
```

### Contrastes vérifiés (WCAG 2.1, luminance relative calculée)
| Texte / élément | Fond | Ratio | Usage autorisé |
|---|---|---|---|
| `text-100` | `night-900` / `night-800` / `night-700` | 16,1 / 14,1 / 11,4 | tout texte |
| `text-100` | **pire cas HUD** : `hud-bg` (0,82) sur blanc ≈ `#39404d` | 9,3 | valeurs HUD |
| `text-100` | **pire cas toast** : `toast-bg` (0,96) sur blanc ≈ `#1f2b42` | 12,6 | texte des toasts |
| `danger-400` | pire cas toast | 5,1 | bande + icône du toast danger |
| `text-300` | `night-800` / `night-700` | 9,4 / 7,6 | texte secondaire |
| `ember-300` | `night-800` / pire cas HUD | 10,0 / 6,6 | accent, titres de section |
| `ember-500` | `night-800` / `night-700` | 6,7 / 5,5 | texte accent ≥ 16 px, icônes |
| `night-900` | `ember-500` (bouton primaire) | 7,7 | libellé du primaire, option segmentée choisie |
| `night-900` | `warn-400` (badge « ! ») | 11,7 | badge d'alerte |
| `warn-400` | pire cas HUD | 6,7 | pastille File fermée |
| `text-100` | `danger-600` (bouton danger) | 5,8 | libellé du danger |
| `ink-900` / `ink-600` | `parchment-100` | 13,8 / 7,5 | texte sur parchemin |
| `ember-700` / `danger-600` / `success-700` | `parchment-100` | 4,9 / 5,5 / 5,5 | accent, alerte, succès sur parchemin |
| `success-400` / `warn-400` / `danger-400` / `frost-300` | `night-800` | 8,2 / 10,3 / 5,7 / 9,2 | texte d'état sur nuit |
| `spend` | pire cas HUD | 5,2 | compteur en dépense |
| `focus` (non-texte) | `night-900` | 13,2 | anneau de focus (≥ 3 requis) |
| `wood-500` (non-texte) | `night-900` | 3,1 | cadre de panneau |

**Interdits** (échouent AA) : `text-100` sur `ember-500` (2,1) ; `ember-500` sur parchemin (2,0) ; `success-700`
remplacé par `#2e7d3a` (4,3) ; `focus` seul sur parchemin (1,2 ⇒ toujours avec le halo sombre, §5 États). Toute
nouvelle paire texte/fond est ajoutée à ce tableau avec son ratio (≥ 4,5 texte normal, ≥ 3 texte ≥ 24 px ou ≥ 19 px
gras, ≥ 3 éléments non textuels).

---

## 2. Typographie

| Rôle | Police | Poids | Fichier (`public/fonts/`) |
|---|---|---|---|
| Affichage (`h1`–`h3`, titre du jeu, titres de panneau / parchemin, chargement) | **Fredoka** (OFL 1.1) | 600 (`--fw-display`) | `fredoka-latin.woff2` |
| Texte (tout le reste, chiffres du HUD) | **Nunito** (OFL 1.1) | 400 (`--fw-regular`) et 800 (`--fw-bold`), fichier variable `400 800` | `nunito-latin.woff2` |

- Auto-hébergées, woff2, sous-ensemble « latin » (`unicode-range` de `base.css` : U+0000-00FF, U+0152-0153 « œ »,
  U+2000-206F espaces fines / guillemets / « … », U+2212 « − », etc.). Budget **≤ 120 Ko au total** (tailles dans
  `CREDITS.md`), licences `public/fonts/*-OFL.txt`.
- `@font-face { font-display: swap; }` ; préchargement des deux fichiers dans `index.html`
  (`<link rel="preload" as="font" type="font/woff2" crossorigin>`).
- Chiffres : `font-variant-numeric: tabular-nums` (`.hud-value`, `.field__value`, `.tabular`, liste du bilan).
- Jamais de texte en image ; capitales forcées seulement sur libellés courts (≤ 2 mots) avec
  `letter-spacing: var(--ls-caps)`.

```css
--font-display: "Fredoka", "Trebuchet MS", system-ui, sans-serif;
--font-text: "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif;
--fs-xs: 12px;   /* minimum absolu : badges « +N », « Objectif N sur 6 », code des crédits */
--fs-sm: 14px;   /* HUD étroit, toasts étroits, notes, bandeaux */
--fs-md: 16px;   /* texte courant, boutons, HUD */
--fs-lg: 20px;   /* titres de parchemin, sous-titre de l'écran titre */
--fs-xl: 24px;   /* titres de panneau */
--fs-2xl: 32px;  /* gros chiffres */
--fs-title: clamp(44px, 12vw, 96px); /* « Dernier Refuge » */
--lh-tight: 1.15; --lh-text: 1.4;
--fw-regular: 400;  /* corps de texte (html, body), ligne « Jour N · nuit » de Continuer */
--fw-bold: 800;     /* boutons, pilules, libellés de champ, onglets, toasts, badges */
--fw-display: 600;  /* Fredoka : h1–h3, .parchment__title, .credits__heading, .loading-title */
--ls-caps: 0.04em;  /* libellés courts en petites capitales / compteur d'objectif du tutoriel */
```

---

## 3. Espacements, rayons, ombres, couches, tailles

```css
--s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px;
--r-xs: 6px; --r-sm: 10px; --r-md: 14px; --r-lg: 20px; --r-pill: 999px;
--shadow-press: 0 3px 0 var(--c-wood-700);        /* épaisseur des boutons au repos */
--shadow-press-down: 0 1px 0 var(--c-wood-700);   /* bouton enfoncé (:active) */
--shadow-1: 0 2px 6px rgba(0, 0, 0, 0.35);        /* pilules HUD, boutons icône, toasts, bandeaux, poignée */
--shadow-2: 0 8px 20px rgba(0, 0, 0, 0.4);        /* cartes parchemin */
--shadow-3: 0 16px 40px rgba(0, 0, 0, 0.55);      /* dialogues */
--glow-ember: 0 0 24px rgba(255, 138, 42, 0.55);  /* titre du jeu, focus du primaire */
--z-hud: 10; --z-tutorial: 12; --z-controls: 20; --z-notices: 25; --z-title: 30; --z-dialog: 50; --z-loading: 60;
```
`#notices` passe au-dessus de l'écran courant : `--z-title + 1` sur le titre (`#app[data-screen="title"]`),
`--z-dialog + 1` si un panneau est ouvert (`#app[data-panel]`), `--z-loading + 1` pendant le chargement
(`#app[aria-busy="true"]`). Grille de 4 px : toute marge/padding = un token `--s-*`.

### Tailles de composants
| Token | Valeur | Usage |
|---|---|---|
| `--tap` | 44px | cible tactile minimale : `min-height`/`min-width` de `.btn`, `.btn--icon` 44 × 44, hauteur de `.slider`, `.switch`, `.tab`, lignes de champ ; place réservée aux boutons en haut à droite |
| `--icon-xs` | 16px | lune des dormeurs, check de l'interrupteur et du choix segmenté |
| `--icon-sm` | 18px | HUD étroit (< 560 px ou paysage bas), bouton « Passer le tutoriel » |
| `--icon-md` | 20px | HUD |
| `--icon-lg` | 24px | boutons, toasts, bandeaux, carte du tutoriel |
| `--icon-xl` | 32px | titres de carte (réservé) |
| `--hud-row-h` | 36px (32 / 28, §9) | hauteur d'une pilule HUD |
| `--gauge-h` | 8px | épaisseur des pistes : jauge, curseur, barre de chargement |
| `--gauge-w` | 56px (40 / 32, §9) | largeur de la jauge du feu |
| `--switch-w` / `--switch-h` | 52px / 32px | piste de l'interrupteur (pastille = `switch-h − 2 × s-1` = 24 px) |
| `--thumb` | 24px | poignée du curseur |
| `--border-1` | 2px | bordure des boutons, parchemin, bandeau, ligne sous les onglets, anneau du joystick |
| `--border-2` | 3px | cadre des panneaux, bord de la poignée, **épaisseur de l'anneau de focus** |
| `--band` | 4px | bande de couleur à gauche des toasts |
| `--tab-underline` | 3px | soulignement de l'onglet actif |
| `--panel-w` | 400px | largeur max des panneaux : `min(var(--panel-w), 100% − 2 × s-4)` |
| `--card-w` | 360px | carte du tutoriel, carte du bilan de l'aube |
| `--toast-w` | 480px | largeur max des toasts |
| `--title-w` | 420px | colonne de l'écran titre |

---

## 4. Iconographie

- Source : **Lucide** (ISC, grille 24 × 24, trait 2 px, extrémités arrondies) dans `src/ui/icons/lucide/` + `LICENSE` ;
  **2 icônes maison** même style (24 × 24, `stroke-width: 2`, `round`, `fill: none`) dans `src/ui/icons/custom/` :
  `wood` (deux bûches), `fire-out` (braises barrées).
- `src/ui/icons.ts` : SVG intégrés au bundle (`?raw`), aucun téléchargement. `icon(name, size = 24, className?)`
  renvoie `<svg class="icon icon--{name}" aria-hidden="true" focusable="false" data-icon>` avec `fill="none"`
  `stroke="currentColor"` (**la couleur vient du texte**, jamais du fichier) ; `setIcon(host, name, size)` ne remplace
  l'icône que si elle change. `IconName` = clés de `SOURCES` ; `IconSize = 16 | 18 | 20 | 24 | 32` (= `--icon-*`).
  En CSS, dimensionner par `--icon-*`, jamais en px.
- Une icône seule (bouton icône) porte l'`aria-label` **sur le bouton** (`makeIconButton`) ; une icône à côté d'un
  texte est décorative. Ajouter une icône = fichier SVG + import + entrée `SOURCES` + ligne ci-dessous.

| Usage | Icône |
|---|---|
| Bois / Nourriture | `wood` (maison) / `cherry` |
| Horloge | arc SVG maison (`clock-arc.ts`, soleil / lune), pas d'icône Lucide |
| Feu allumé / faible / éteint | `flame` / `flame` + badge « ! » + hachures / `fire-out` (maison) |
| File / accueil fermé | `users` / `lock` |
| Tentes / dormeurs | `tent` / `moon` (16) |
| Pause / Continuer, Reprendre | `pause` / `play` |
| Paramètres, son, sans son | `settings`, `volume-2`, `volume-x` |
| Exporter / importer | `download` / `upload` |
| Fermer, valider, retour | `x`, `check`, `chevron-left` |
| Retour au titre, crédits, passer | `house`, `scroll-text`, `skip-forward` |
| Toasts par type : info, succès, warning, danger | `info`, `circle-check`, `triangle-alert`, `triangle-alert` |
| Toasts d'événement (icône imposée) | `hammer` (tente), `flame` (feu faiblit / repart), `fire-out`, `snowflake` (froid), `moon` (nuit proche), `circle-check` (tutoriel terminé) |
| Bandeaux | `triangle-alert` (sauvegarde), `info` (rendu) |
| Tutoriel (par étape) | `users`, `wood`, `sparkles`, `axe`, `hammer`, `flame` ; aide clavier `keyboard` (16) |
| Bouton danger de confirmation | `triangle-alert` |
| Réservés (importés, non utilisés) | `maximize`, `minimize` |

---

## 5. Composants

Tous : `font-family: var(--font-text)`, zone cliquable **≥ `--tap`**, `touch-action: manipulation`, transitions
limitées à `transform`, `opacity`, `background-color`, `box-shadow`. Créer les boutons avec `makeButton(label,
variant, icon?)` / `makeIconButton(label, icon)` ; une action asynchrone passe par `guard(btn, action)` (anti double
clic, `aria-busy`).

| Composant | Spécification (code) |
|---|---|
| **Bouton** `.btn` | `inline-flex`, gap `s-2`, padding `s-3 s-5`, bordure `border-1` transparente, `r-md`, `fs-md` `fw-bold` `lh-tight`, `shadow-press`. `:active` : `translateY(var(--move-press-y))` + `shadow-press-down`. Modificateurs : `.btn--block` (100 %), `.btn--start` (aligné à gauche). |
| **Primaire** `.btn--primary` | fond `ember-500`, texte `night-900` ; survol `ember-400` ; appui `ember-600` ; focus : halo `night-900` 6 px + `glow-ember`. Un seul primaire par écran. |
| **Secondaire** `.btn--secondary` | fond `night-700`, texte `text-100`, bordure `night-600` ; survol : bordure `ember-300`. |
| **Danger** `.btn--danger` | fond `danger-600`, texte `text-100`, icône `triangle-alert` ; survol : bordure `danger-400`. Uniquement dans une confirmation (`opts.danger`). |
| **Discret** `.btn--ghost` | transparent, texte `text-300` (`ink-600` sur parchemin), sans ombre, souligné au survol. |
| **Bouton icône** `.btn--icon` | `--tap` × `--tap`, padding 0, `r-sm`, fond `hud-bg`, `shadow-1`, icône 24 ; survol `night-700` ; `aria-label` + `title` ; bascule = `aria-pressed` (Son). |
| **Note de bouton** `.btn-note` | `fs-sm` `text-300`, raison d'un bouton désactivé, reliée par `aria-describedby` (`setDisabled(btn, true, note)`). |
| **Pilule HUD** `.hud-chip` | hauteur `--hud-row-h`, padding `0 s-3` (étroit `0 s-2`), gap `s-1`, `r-pill`, fond `hud-bg`, `shadow-1`, `fs-md` `fw-bold` (étroit `fs-sm`), icône `--icon-md` (étroit `--icon-sm`) ; valeur `.hud-value` tabulaire avec `…` ; libellé complet en `aria-label` de la pilule (`role="img"` ou `meter`), textes visibles `aria-hidden`. Variante `.hud-chip--closed` : icône `warn-400`. |
| **Jauge** `.gauge` | piste `--gauge-w` × `--gauge-h` `night-600` `r-pill` ; `.gauge__fill` `ember-500` par `transform: scaleX(r)` (origine gauche, `dur-3`) ; `.is-low` : hachures `ember-500` / `ember-700` à −45° + badge `.badge-alert` « ! » (`warn-400`, texte `night-900`, `fs-xs`) + pulsation ; `.is-out` : piste vide + icône `fire-out` (`text-300`). La pilule porte `role="meter"`, `aria-valuenow/min/max/valuetext`. |
| **Compteur** `.counter` | `.counter__value` + badge `.counter__badge` (fond `night-800`, `success-400`, ou `.is-spend` `spend`, `fs-xs`, `r-xs`) sous la pilule, qui monte de `--move-badge-y` ; `.is-spending` colore la valeur en `spend`. |
| **Panneau** `.panel` | fond `night-800`, bordure `border-2` `wood-500`, `r-lg`, `shadow-3`, padding `s-5`, largeur `min(var(--panel-w), 100% − 2 × s-4)`, défile (`overflow:auto`, `overscroll-behavior: contain`) ; `.panel__header` (bouton Retour `.dialog-back` + `.panel__title` Fredoka `fs-xl` `ember-300`), `.panel__body` colonne gap `s-3`, `.panel__text`, `.panel__note`. `.panel--wide` (crédits) : voir §11. |
| **Dialogue** `.dialog-layer` > `.panel.dialog` | `createDialog(container, { id, title, role?, className?, onBack?, initialFocus? })` : calque plein écran fond `scrim`, padding `s-4` + safe areas ; `role="dialog"` (`alertdialog` pour une confirmation), `aria-modal`, `aria-labelledby` ; focus initial, Tab piégé, focus rendu à l'ouvreur ; Échap géré par l'app (§7.1). `.dialog-actions` : à droite, gap `s-2` ; < 480 px en colonne inversée (confirmer en bas), boutons pleine largeur. `.dialog-stack` : colonne de boutons `.btn--block`. Panneau recouvert : `.is-covered` (masqué + `inert`). |
| **Confirmation** | `createConfirmDialog(container)` : `set(message, confirmLabel, { danger?, title? })`, focus sur **Annuler** (`data-action="cancel"`), bouton d'action `data-action="confirm"` qui répète l'action ; réponse unique par ouverture. |
| **Parchemin** `.parchment` | dégradé `parchment-100` → `parchment-200`, texte `ink-900`, bordure `border-1` `wood-300`, `r-md`, `shadow-2`, padding `s-3 s-4` ; `.parchment__title` Fredoka `fs-lg`, `.parchment__meta` `fs-sm` `ink-600`, `.parchment__accent` et liens `ember-700`. |
| **Toast** `.toast.toast--{kind}` | fond `toast-bg`, `r-md`, `shadow-1`, padding `s-2 s-3` (+ `--band` à gauche), bande `::before` de largeur `--band` en `currentColor` (couleur du type : info `frost-300`, success `success-400`, warning `warn-400`, danger `danger-400`) **+ icône 24 du type** + `.sr-only` « Information / Succès / Attention / Danger : » + `.toast__text` `text-100` `fw-bold` `fs-sm` (≥ 560 px `fs-md`), 2 lignes max (`line-clamp`), largeur ≤ `--toast-w`. |
| **Bandeau** `.notice-banner` | fond `night-800`, bordure `border-1` `wood-500`, `r-md`, `shadow-1`, `fs-sm` ; icône `warn-400` (`frost-300` si `data-banner="render"`), bouton Fermer icône si fermable. |
| **Curseur** `createSlider` → `.field` > `.field__row` + `input.slider` | `<input type="range">` 0–100 pas 5 ; piste `--gauge-h` dégradé `ember-500` jusqu'à `--fill` puis `night-600` ; poignée `--thumb` `text-100` bordure `border-2` `ember-500` `shadow-1` ; zone `--tap` ; valeur « 60 % » en `.field__value` (`ember-300`, tabulaire, `aria-hidden`) et `aria-valuetext`. `onInput` à chaque pas, `onCommit` au relâchement. |
| **Interrupteur** `createSwitch` → `.switch-row` + `button.switch[role=switch][aria-checked]` | piste `--switch-w` × `--switch-h` `r-pill` ; pastille `text-100` ; *activé* = piste `ember-500` + pastille à droite **avec icône `check`** (`ember-700`) ; *désactivé* = `night-600`, pastille à gauche, sans icône. Libellé cliquable à gauche (`aria-labelledby`). Indisponible : `setEnabled(false, raison)` ⇒ `aria-disabled` + `.field__note`. |
| **Choix segmenté** `createSegmented` → `.segmented[role=radiogroup]` | options `button[role=radio]` dans une piste `night-700` `r-pill` (padding `s-1`) ; sélection = fond `ember-500`, texte `night-900` **+ icône `check`** ; flèches / Début / Fin changent la valeur ; `tabindex` itinérant. |
| **Onglets** `createTabs` → `.tabs[role=tablist]` | `button.tab[role=tab]` `aria-selected` `aria-controls`, `text-300` ; actif = `ember-300` + soulignement `--tab-underline` (`scaleX`) ; ←/→/Début/Fin ; `tabindex` itinérant ; ligne de base `border-1` `night-600`. |

### États (tous les contrôles)
| État | Rendu |
|---|---|
| survol (`@media (hover: hover)` seulement) | fond éclairci d'un cran ou bordure accent (voir composant) |
| **focus visible** (`:focus-visible`, `base.css`) | `outline: var(--border-2) solid var(--c-focus); outline-offset: 2px; box-shadow: 0 0 0 6px var(--c-night-900);` (halo sombre : contraste sur parchemin et scène). Onglets : `outline-offset: -3px`. `:focus:not(:focus-visible)` sans contour. |
| actif (appui) | `translateY(var(--move-press-y))`, `shadow-press-down` |
| désactivé | `aria-disabled="true"` (le bouton reste focalisable), `opacity: .5`, `cursor: not-allowed` ; **raison affichée** (`.btn-note` / `.field__note` + `aria-describedby`) |
| occupé (action async) | `aria-busy="true"` (bouton via `guard`, panneau via `setBusy`), `cursor: progress`, clics ignorés |
| sélectionné | fond `ember-500` + icône `check` (jamais la couleur seule) |

---

## 6. Animations

```css
--dur-1: 120ms;      /* survol, appui, interrupteur, onglet */
--dur-2: 200ms;      /* entrée de panneau, toast, carte, barre de chargement */
--dur-3: 350ms;      /* remplissage de la jauge (défilement du compteur : constante JS, §11) */
--dur-4: 700ms;      /* badge « +N », montée du titre */
--dur-exit: 150ms;   /* sortie d'un dialogue ou d'un toast (fondu) */
--dur-screen: 300ms; /* fondu d'écran : apparition du HUD, entrée / sortie de l'écran titre */
--dur-pulse: 1.2s;   /* demi-période de la pulsation du feu faible (alternate) */
--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1);
/* Amplitudes de mouvement (neutralisées en « réduire les animations ») */
--move-enter-scale: 0.96;  /* dialogue : scale(.96 → 1) */
--move-toast-y: 12px;      /* toast, carte du tutoriel, carte du bilan : translateY(12px → 0) */
--move-title-y: 12px;      /* titre du jeu : montée */
--move-badge-y: -16px;     /* badge « +N / −N » : montée */
--move-press-y: 2px;       /* bouton enfoncé */
```
Keyframes (`components.css` / `main.css`) : `dialog-in`, `fade-in`, `fade-out`, `toast-in`, `badge-rise`, `pulse`
(opacité 1 ↔ .7), `title-rise`.

| Élément | Animation |
|---|---|
| Panneau / dialogue | calque `fade-in` `dur-2` ; panneau `dialog-in` `dur-2 ease-out` ; sortie `.is-leaving` `fade-out` `dur-exit ease-in` |
| Toast | `toast-in` `dur-2` ; sortie `.is-leaving` `fade-out` `dur-exit` |
| Carte du tutoriel / du bilan | `toast-in` `dur-2` |
| Compteur HUD | défilement 350 ms ease-out (JS) ; gain : badge « +N » (`badge-rise` `dur-4 ease-pop`, gains cumulés 500 ms) ; dépense : valeur en `spend` 600 ms + badge « −N » (U+2212) |
| Jauge | `transform` `dur-3` ; feu faible : `pulse` `dur-pulse` infinie alternée |
| HUD | `fade-in` `dur-screen` à l'apparition |
| Écran titre | conteneur `fade-in` / `fade-out` `dur-screen` ; titre `title-rise` `dur-4` ; caméra 3D : un tour en 120 s (rendu) |
| Flèche du tutoriel | rebond vertical ±0,25 m à 1 Hz, anneau au sol pulsé (rendu) |

Règles : animer seulement `transform` et `opacity` ; au plus **2 animations infinies** visibles ; aucune animation ne
transporte une information absente du texte.

### Réduire les animations
Actif si la préférence vaut « Activé », ou « Système » et `prefers-reduced-motion: reduce`.
`src/app/prefs-controller.ts` pose `<html data-motion="reduce">` (sinon `data-motion="full"`) et l'actualise en
direct. Le CSS s'appuie **uniquement** sur cet attribut, plus un secours `@media (prefers-reduced-motion: reduce)
{ :root:not([data-motion]) … }` avant le démarrage du JS. Surcharges de `tokens.css` :
`--dur-2 → dur-1`, `--dur-3 → 0ms`, `--dur-4 → dur-1`, `--dur-exit → dur-1`, `--dur-screen → 0ms`,
`--move-enter-scale → 1`, `--move-*-y → 0px`. En plus :
- pulsation du feu : `animation: none` (badge « ! » et hachures restent) ;
- badge du compteur : `animation: none; opacity: 1`, affiché 1,2 s sur place puis effacé (JS) ; valeur mise à jour
  d'un coup ;
- JS (`dialog.ts`, `notify.ts`, `title.ts`) : lisent `document.documentElement.dataset.motion === "reduce"` et
  masquent / retirent immédiatement au lieu d'attendre le fondu ;
- rendu (`setReducedMotion`) : caméra du titre immobile, flèche et anneau fixes.

---

## 7. Accessibilité (obligatoire)

- **Cibles ≥ `--tap`** (44 px), espacées d'au moins `s-2`.
- **Clavier complet** : Tab / Maj+Tab dans un ordre logique ; Entrée/Espace activent ; flèches dans onglets et choix
  segmentés, curseurs natifs. À l'ouverture d'un dialogue, focus sur le premier élément utile (Reprendre, onglet
  actif, Annuler pour une confirmation), rendu à l'ouvreur à la fermeture ; Tab piégé ; le reste de l'app est
  `inert` (canvas, HUD, tutoriel, boutons, titre, carte du bilan) tant qu'un panneau est ouvert.
- **Focus toujours visible** (§5), jamais `outline: none` sans remplacement (seule exception : `.dialog:focus`, le
  panneau lui-même en repli).
- **Contraste** : uniquement les paires du §1.
- **Jamais la couleur seule** : icône, forme (hachures, badge « ! »), signe (+ / −) ou mot. Ex. feu faible = hachures
  + « ! » + `aria-valuetext` « … , faible » ; File fermée = `lock` + « fermé » ; sélection = `check`.
- **Lecteurs d'écran** : régions live **créées vides au démarrage** dans `#notices` (`role="status"
  aria-live="polite" aria-atomic="true"` pour toasts info/success/warning, bandeau et carte ; `role="alert"
  aria-live="assertive"` pour les toasts danger) ; tutoriel : région polie qui ne contient que « Objectif N sur 6 » +
  le texte (l'aide variable est hors région) ; une valeur qui change à chaque image n'est **jamais** dans une région
  live (HUD : `aria-label` mis à jour, pas annoncé) ; `lang="fr"`.
- **Zoom (WCAG 1.4.4)** : la balise viewport n'interdit pas le zoom (`width=device-width, initial-scale=1,
  viewport-fit=cover`, **jamais** `user-scalable=no` ni `maximum-scale=1`). Les gestes du navigateur ne sont bloqués que
  sur la **zone de jeu** : `touch-action: none` sur `#game` (surface du joystick), `#app > canvas.webgl` et
  `.joystick-base`, pour qu'un double-tap ou un glissé pendant la partie ne zoome ni ne fasse défiler. Écran titre,
  dialogues, HUD et notifications gardent le pinch-zoom (`touch-action: auto`, ou `manipulation` sur les boutons pour
  supprimer le délai du double-tap). Ne jamais mettre `touch-action: none` sur `html`, `body`, `#app` ni sur un
  panneau. Vérifié par `tests/e2e/zoom.spec.ts` (CI).
- Pas de texte < 12 px. `.sr-only` = `position:absolute; width:1px; height:1px; margin:-1px; padding:0; border:0;
  overflow:hidden; clip-path: inset(50%); white-space:nowrap;`.

### 7.1 Raccourcis globaux (`src/app/keys.ts`, `installGlobalKeys`)
| Touche | Effet |
|---|---|
| **Échap** | événement `escape` : ferme le panneau du sommet, sinon ouvre la pause en jeu |
| **P** | pause seulement : en jeu, ouvre la pause (sans panneau) ou la referme (pause au sommet) ; utile en plein écran où le navigateur garde Échap |
| **M** | couper / rétablir le son (préférence `muted`) |
Lecture par `e.key` (P et M identiques en AZERTY et QWERTY). Ignorés : `e.repeat`, Ctrl/Méta/Alt, `defaultPrevented`,
focus dans une saisie texte (`isTextEntry` : `input` texte, `textarea`, `select`, `contenteditable` ; pas les
curseurs, cases, boutons). Déplacement : ZQSD / flèches (`src/app/input.ts`). Aucun autre raccourci sans mise à jour
de cette table.

---

## 8. Ton des textes

- Français, **vouvoiement**, phrases courtes (toast ≤ 12 mots), impératif pour les objectifs (« Accueillez le
  survivant »), présent pour les constats (« Le feu faiblit »).
- Majuscule seulement en début de phrase ; pas de point final dans les boutons et toasts ; « ! » réservé aux succès
  (« Tente construite ! », « Tutoriel terminé ! »).
- Chiffres en chiffres ; grands nombres via `formatCount` (« 1,2 k », « 3,4 M », espace insécable U+00A0 avant
  l'unité), nombre exact via `formatExact` (U+202F) dans l'`aria-label` ; « − » (U+2212) pour les dépenses.
- Guillemets « » avec espaces insécables ; « … » (un caractère) ; apostrophe droite `'`.
- Boutons = verbe d'action (« Reprendre », « Exporter la partie », « Passer le tutoriel ») ; jamais « OK ».
  Confirmation : le bouton répète l'action, l'autre dit « Annuler ».
- Erreurs : ce qui s'est passé + quoi faire, sans jargon.

---

## 9. Mise en page mobile

- `index.html` : `viewport-fit=cover`, `theme-color` `#0e1626`, `color-scheme: dark`. Bords d'écran en
  `env(safe-area-inset-*)` : HUD, `#controls`, bouton Son du titre à `calc(var(--s-1) + env(…))` ; tutoriel à
  `s-2` ; notifications à `s-2` latéral, `calc(var(--s-3) + env(safe-area-inset-bottom))` en bas ; dialogues et titre
  paddés + insets. `#app` en `100dvh`.
- Largeur minimale **360 px** : aucun débordement horizontal, texte tronqué seulement avec `…` + texte complet
  accessible.
- **HUD ≤ 12 % de la hauteur** (`#hud`) ; deux groupes `.hud-group` (Horloge·Feu·Bois / Nourriture·File·Tentes) :
  | Fenêtre | Disposition | `--hud-row-h` | `--gauge-w` | Hauteur max |
  |---|---|---|---|---|
  | largeur ≥ 560 px | 1 rangée (retour à la ligne permis) | 36 px | 56 px | 40 px |
  | largeur ≥ 560 px et hauteur ≤ 480 px (paysage bas, `main.css`) | 1 rangée sans retour, `fs-sm`, icônes 18 | 32 px | 40 px | 36 px |
  | largeur < 560 px | 2 rangées, « J N », icônes 18, arc 36 × 20 | 32 px | 40 px | 72 px (≤ 12 % dès 600 px) |
  | largeur < 560 px et hauteur < 620 px | 2 rangées | 28 px | 32 px | 64 px (≤ 12 % dès 534 px) |
- Place réservée à droite du HUD : `2 × --tap + 2 × s-2` (Son + Pause) ; < 560 px : `--tap + s-2` (Son masqué,
  `.controls-sound`).
- Carte du tutoriel sous le HUD (`top` = 2 rangées + `s-3`, 1 rangée ≥ 560 px), largeur `--card-w`.
- Dialogues dans `100dvh − insets`, défilement interne ; actions en colonne sous 480 px.

---

## 10. Contrat de test (DOM et lecture e2e)

Les tests (Playwright `tests/e2e/`, captures) ne s'appuient **que** sur ces points d'accroche ; les renommer est un
changement de contrat (mettre à jour ce tableau et les aides e2e dans la même tâche).

| Accroche | Valeurs | Posée par |
|---|---|---|
| `#app[data-screen]` | `boot` · `title` · `game` | `main.ts` (boot), `screen-controller.ts` |
| `#app[data-panel]` | panneau au sommet : `pause` · `settings` · `credits` · `confirm` ; **absent** sans panneau | `screen-controller.ts` |
| `#app[data-render]`, `#app[data-render-ready="1"]` | `3d` · `2d` ; première image dessinée | `main.ts` |
| `[data-hud]` | `clock` · `fire` · `wood` · `food` · `queue` · `tents` (une pilule chacune) ; `[data-hud=fire][data-state]` = `ok`/`low`/`out` ; `[data-hud=queue][data-state]` = `open`/`closed` | `hud.ts` |
| `[data-action]` | titre : `continue`, `new-game`, `settings`, `credits` · pause : `resume`, `settings`, `export`, `import`, `new-game`, `export-damaged`, `to-title` · `#controls` : `pause` · confirmation : `cancel`, `confirm` · tutoriel : `skip-tutorial` | `title.ts`, `pause-menu.ts`, `controls.ts`, `dialog.ts`, `tutorial-card.ts` |
| `.dialog-layer[data-dialog]` | `pause` · `settings` · `credits` · `confirm` (visible ⇔ non `hidden`) | `dialog.ts` |
| `#notices` | `data-ready="1"` ; toasts `.toast[data-kind][data-key]` ; bandeau `.notice-banner[data-banner]` (`temporary`, `quarantine`, `notOwner`, `unavailable`, `corrupt`, `render`) ; bilan `#dawn-report` | `notify.ts` |
| `#tutorial[data-step]` | `welcome` · `pickupWood` · `cleanTent` · `harvestTree` · `buildTent` · `feedFire` | `tutorial-card.ts` |
| `html[data-motion]` | `reduce` · `full` | `prefs-controller.ts` |
| `window.__gameInfo` | `tick(): number`, `screen(): ScreenId`, `ticking(): boolean` | `main.ts` |
| `window.__render3d.info()` | `presentation`, `guide`, `quality`, `programs`, … (3D seulement) | `render/three/index.ts` |

**`window.__gameInfo` est strictement en lecture seule** : objet `Object.freeze`, propriété définie
`writable: false, configurable: false, enumerable: false`, fonctions qui renvoient des nombres / chaînes / booléens ;
**jamais** de référence à l'état, au jeu, au contrôleur de sauvegarde ni de méthode qui modifie quoi que ce soit.
Ajouter une lecture = ajouter une fonction de même nature ici et dans `main.ts`. `window.__game` n'existe qu'en dev.

---

## 11. Dette à résorber (valeurs encore en dur)

Relevé render-dev + vérification du code. À corriger en créant le token proposé (dans `tokens.css` puis ici), sans
changer le rendu.

| Où | Valeur en dur | Token cible proposé |
|---|---|---|
| `main.css` `.joystick-base` | `rgba(247, 241, 230, 0.15)` (fond), `rgba(247, 241, 230, 0.5)` (anneau) | `--c-joy-base`, `--c-joy-ring` (teintes de `text-100`) |
| `main.css` `.joystick-knob` | `rgba(247, 241, 230, 0.75)` | `--c-joy-knob` |
| `main.css` `.joystick-base` | `96px`, marge `-48px` | `--joy-size: 96px` (marge `calc(var(--joy-size) / -2)`) |
| `components.css` `.is-low .gauge__fill` | hachures `0 3px` / `3px 6px` | `--hatch: 3px` (`0 var(--hatch)`, `var(--hatch) calc(2 * var(--hatch))`) |
| `components.css` `.badge-alert` | `min-width` / `height: 16px` | `--badge: 16px` |
| `base.css` `:focus-visible` | `outline-offset: 2px` ; halo `0 0 0 6px` (aussi `.btn--primary:focus-visible`) | `--focus-offset: 2px`, `--focus-halo: 6px` |
| `components.css` `.tab:focus-visible` | `outline-offset: -3px` | `calc(-1 * var(--border-2))` |
| `main.css` `.title-actions`, `.loading-panel` | `min(320px, 100%)` | `--actions-w: 320px` |
| `main.css` `.panel--wide`, `.notice-banner` | `min(560px, 100%)` | `--panel-wide-w: 560px` (le point de rupture 560 px des `@media` reste une constante documentée §9 : pas de variable en media query) |
| `dialog.ts` (`close`), `notify.ts` (`leave`) | `setTimeout(…, 160)` (fin du fondu de sortie) | lire `--dur-exit` (`getComputedStyle`) ou écouter `animationend` (+ garde-fou) |
| `title.ts` (`hide`) | `setTimeout(…, 300)` | `--dur-screen` ou `animationend` |
| `counter.ts` | `ROLL_MS 350`, `BADGE_MS 700`, `SPEND_MS 600`, `BADGE_REDUCED_MS 1200`, `GAIN_WINDOW_MS 500` | 350/700 = `--dur-3`/`--dur-4` (lire les tokens) ; les autres dans un module `src/ui/motion.ts` unique |
| `main.css` `.hud-extra`, `[data-action=continue]` | `gap: 2px` ; `.tutorial-card__icon` `padding-top: 2px` | `--s-half: 2px` |
| `main.css` `.clock-arc` (< 560 px) | `36px` × `20px` ; `clock-arc.ts` 44 × 24 | `--clock-w` / `--clock-h` (44/24, 36/20) |
| `main.css` `.title-heading` | `text-shadow: 0 4px 0 var(--c-wood-700)` | `--shadow-title` |
| `components.css` | `opacity: 0.5` (désactivé), `0.7` (pulsation) | `--o-disabled`, `--o-pulse` |

---

## 12. Ajouter un écran / un composant (checklist)

1. **Tokens uniquement** (§1–§3, §6) ; nouveau besoin ⇒ token dans `tokens.css` + ce guide ; nouvelle paire de
   couleurs ⇒ ratio au §1. Rien de nouveau au §11.
2. Réutiliser les fabriques (`makeButton`, `makeIconButton`, `guard`, `setDisabled`, `createDialog`,
   `createConfirmDialog`, `createSwitch/Slider/Segmented/Tabs`) ; nouveau composant ⇒ ligne au §5 avec ses états.
3. **Écran / panneau** : nouvel identifiant dans `ScreenId` / `PanelId` + règles de `canOpen` / `reduceScreens`
   (`src/app/screens.ts`, testées) ; tout effet (pause, entrées, `inert`, son, présentation) **dérivé** de
   `ScreensState` dans `screen-controller.ts`, jamais posé à la main. Le jeu ne tique que si `isTicking`.
4. **Focus** : focus initial explicite (`initialFocus`), rendu à l'ouvreur, piégé dans les dialogues ; anneau visible.
5. **Clavier** : tout atteignable au Tab ; Entrée/Espace ; Échap = retour (via la machine d'écrans, pas d'écouteur
   local) ; flèches dans les groupes ; nouveau raccourci ⇒ §7.1.
6. **`aria-live`** : régions créées vides au démarrage, `polite` par défaut, `alert` pour les dangers ; jamais une
   valeur qui change à chaque image.
7. **Réduire les animations** : durées et amplitudes via `--dur-*` / `--move-*` ; animation infinie ⇒ règle
   `:root[data-motion="reduce"] … { animation: none }` ; attente JS d'un fondu ⇒ sautée si `data-motion="reduce"`.
8. **360 px** sans débordement, **safe areas** (`env(safe-area-inset-*)`), HUD ≤ 12 % (§9).
9. **Jamais la couleur seule** (icône, forme, signe ou mot).
10. **Sons** : uniquement via `audio.play(id)` (`SfxId` : `pop`, `click`, `build`) ; les clics de boutons sont
    sonorisés par `audio.bindClicks(app)` (délégation : `button`, `[role=switch|tab|radio]`, `a[href]`, hors
    désactivés) — ne pas jouer `click` à la main. L'UI ne crée jamais d'`AudioContext`.
11. **Contrat de test** : `data-action` / `data-dialog` / `data-hud` stables (§10) ; aides e2e et captures mises à
    jour dans la même tâche.
12. `src/ui` n'importe ni `src/save` ni `applyCommand` : l'app fournit les données et reçoit des callbacks. Textes au
    ton du §8 ; DOM construit par `textContent` (jamais `innerHTML`).
