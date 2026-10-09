# Design — Interface, HUD et finitions

Statut : **implémenté, document aligné sur le code** (branche `feature/ui-polish`). Guide de style obligatoire :
`docs/design/ui-style.md` (futur skill `ui-style` ; contrat de test au §10, dette au §11). Prolonge `save.md`,
`day-night.md`, `render-3d.md`. Les signatures ci-dessous sont celles du code ; en cas d'écart, le code fait foi et
ce document doit être corrigé.

**Aucune règle de jeu ne change.** `src/core`, `src/data`, `GameState`, `Command` et le **format de sauvegarde (v2)**
sont inchangés : pas de migration, pas de fixture. Tout se passe dans `src/ui`, `src/app`, `src/render`,
`src/styles`, `index.html`, `public/fonts`, plus un petit module de préférences **à part** dans `src/save` (clé
distincte, ne touche pas aux saves).

Hors périmètre : nouvelles règles, murs, loups, travailleurs, service worker / PWA (« hors ligne » = aucune ressource
externe), réglage des touches.

---

## 1. Règles d'interface (comportement attendu)

### 1.1 Écrans (machine d'états pure `src/app/screens.ts`)
```ts
export type ScreenId = "boot" | "title" | "game";
export type PanelId = "pause" | "settings" | "credits" | "confirm";
export interface ScreensState { readonly screen: ScreenId; readonly panels: readonly PanelId[] } // pile, max 3
export type ScreenEvent =
  | { type: "booted" }                                  // boot → title
  | { type: "play" }                                    // title (sans panneau) → game
  | { type: "escape" }                                  // panneau ouvert ⇒ pop ; game sans panneau ⇒ push "pause" ; sinon rien
  | { type: "open"; panel: PanelId }                    // si canOpen
  | { type: "back" }                                    // pop (rien si vide)
  | { type: "resume" }                                  // game avec panneau(x) : vide la pile
  | { type: "toTitle" };                                // game → title, pile vidée
export const MAX_PANELS = 3;
export const INITIAL_SCREENS: ScreensState;            // { screen: "boot", panels: [] }, gelé
export function canOpen(s: ScreensState, panel: PanelId): boolean;
export function reduceScreens(s: ScreensState, e: ScreenEvent): ScreensState; // invalide ⇒ MÊME référence ; états gelés
export const isTicking = (s: ScreensState) => s.screen === "game" && s.panels.length === 0;
export const showsHud = (s: ScreensState) => s.screen === "game";
export const topPanel = (s: ScreensState): PanelId | null => s.panels.at(-1) ?? null;
```
Validations (`canOpen`) : pile < 3 et panneau absent de la pile ; `pause` : `game` sans panneau ; `credits` : `title`
sans panneau ; `settings` : `title` sans panneau, ou `game` avec `pause` au sommet ; `confirm` : tout sauf `boot`.
`play` refusé si `screen !== "title"` ou pile non vide (anti double clic).

Câblage (`src/app/screen-controller.ts`, `createScreenController(deps): ScreenController`) :
```ts
interface ScreenController {
  state(): ScreensState;
  dispatch(e: ScreenEvent): boolean;    // false ⇔ refusé (état inchangé)
  confirm(message: string, confirmLabel: string, opts?: { danger?: boolean; title?: string }): Promise<boolean>;
}
// deps : game{setPaused}, input{setEnabled}, renderer{setPresentation}, audio{setScene},
//        notify{setFrozen, setCovered, hideCard}, app, hudElements, underPanels, title{show, hide},
//        panels{pause, settings, credits}: PanelView{open, close, setCovered}, confirm: ConfirmPanel, onChange?
```
Effets **dérivés uniquement de `ScreensState`** : `game.setPaused(!isTicking)`, `input.setEnabled(isTicking)`,
`renderer.setPresentation(screen ∈ {boot, title} ? "title" : "play")`, `audio.setScene(game ? (ticking ? "play" :
"pause") : "title")`, `notify.setFrozen(!isTicking && game)`, `notify.setCovered(panneau ouvert)`, `notify.hideCard()`
hors jeu, `hudElements` (`#hud`, `#controls`) visibles ssi `showsHud`, `#app[data-screen]` / `#app[data-panel]`,
titre montré / masqué au changement d'écran. Panneaux : ouverture d'abord, puis `underPanels` (canvas, `#hud`,
`#tutorial`, `#controls`, `#title`) `inert` ssi pile non vide, seuls le sommet visible (`setCovered`), fermeture
ensuite. `confirm()` : une seule confirmation à la fois (sinon `false`), résolue une fois (Annuler, Échap ou fermeture
⇒ `false`). La carte du tutoriel est masquée par `hud.update` hors jeu (pas un `hudElement`).

Touches globales (`src/app/keys.ts`, `installGlobalKeys(win, { onEscape, onPauseKey, onToggleMute })`) : **Échap** ⇒
`escape` ; **P** ⇒ `escape` seulement en `game` sans panneau ou avec `pause` au sommet (bascule de la pause ; en
plein écran le navigateur garde Échap) ; **M** ⇒ `muted` inversé. Lecture par `e.key` (AZERTY = QWERTY). Ignorés :
`e.repeat`, Ctrl/Méta/Alt, `defaultPrevented`, focus dans une saisie texte (`isTextEntry`).

### 1.2 Écran titre
- Après `bootSave` et le premier rendu, l'écran de chargement s'efface et l'écran titre apparaît (`booted`).
- Fond : **le camp de la partie chargée** (ou le camp neuf si aucune sauvegarde) **de nuit, feu allumé**, caméra
  orbitale autour du feu (§4.4). La boucle tourne en pause : **aucun tick** tant qu'on n'a pas cliqué.
- Contenu : `<h1>` « Dernier Refuge » (Fredoka, lueur `--glow-ember`), sous-titre « Un feu, un camp, une nuit de
  plus. », boutons :
  1. **Continuer** (primaire) + ligne « Jour N · jour|nuit » — visible ssi `canContinue` (§1.3).
  2. **Nouvelle partie** (primaire si pas de Continuer, sinon secondaire). Avec Continuer : confirmation
     « La partie actuelle sera perdue. Pensez à l'exporter. » puis remplacement (flux `save.newGame()` existant) ;
     sans : démarre directement l'état de démarrage (aucune écriture de plus). Désactivé avec la raison affichée si
     `save.replaceBlockedReason()` ≠ null et `canContinue` (autre onglet, version future, stockage indisponible).
  3. **Paramètres**, 4. **Crédits** (secondaires), bouton icône **Son** en haut à droite.
- Focus initial sur le premier bouton. Bandeaux de sauvegarde (`#notices`) visibles au-dessus du titre.
- `Continuer` / `Nouvelle partie` (clic = geste utilisateur, `startPlaying` de `main.ts`, garde `starting`) :
  `audio.unlock()`, plein écran si la préférence est active, `startTutorial(skipIfAdvanced(...))` (§1.6),
  `save.markPlayed()`, puis `play` (fondu `--dur-screen`, instantané en mouvement réduit).
- `Nouvelle partie` du titre : `continueInfo() === null` ⇒ `startPlaying()` directement ; sinon
  `save.newGame()` (confirmation) ; `true` ⇒ `restartForNewGame` puis `startPlaying()`.
- API (`src/ui/title.ts`) : `createTitleScreen(root, { onContinue, onNewGame, onSettings, onCredits, onToggleMute })`
  → `{ show(), hide(), refresh({ continueInfo, replaceBlockedReason }), setMuted(m) }`. Ligne « Jour N · nuit|jour »
  dans le bouton Continuer ; note `readOnly` et note de blocage en `.btn-note` reliées par `aria-describedby`.

### 1.3 « Continuer (jour atteint) » sans nouveau format
La sauvegarde est déjà **lue et validée** par `bootSave` (`planBoot`) avant l'écran titre ; la partie est créée avec
cet état mais **en pause** : rien n'est rejoué, rien n'est écrit. `SaveController` (`src/app/save-controller.ts`)
expose :
```ts
interface ContinueInfo { day: number; night: boolean; readOnly: boolean }
continueInfo(): ContinueInfo | null;   // null ⇔ pas de « Continuer »
markPlayed(): void;                    // appelé au premier play de la session
bootKind(): "load" | "new" | "temporary"; // = planBoot(...).game.kind
```
`continueInfo() ≠ null` ⇔ `played` (partie lancée dans cette session) **ou** (`loadedFromSave` ∧ `state.tick > 0`),
`loadedFromSave` = démarrage `kind === "load"` ou reprise du verrou (`ownerResume`). `day` = `clockInfo(state).day`,
`night` = `phase === "night"`, `readOnly` = `isPersistent(session) && !isOwner()`. État lu : `ui.game.state` une fois
attaché, sinon l'état de démarrage. Cas :
| Démarrage | Titre |
|---|---|
| sauvegarde valide | Continuer « Jour N · nuit » ; Nouvelle partie avec confirmation |
| sauvegarde au tick 0 / aucune | pas de Continuer ; Nouvelle partie démarre directement |
| onglet non propriétaire | Continuer + note « Ouvert dans un autre onglet : partie non sauvegardée » ; Nouvelle partie désactivée (raison) ; bandeau existant |
| sauvegarde abîmée | pas de Continuer (nouvelle partie déjà créée, ancienne en quarantaine) ; bandeau existant |
| version future / stockage indisponible / `?seed=` | pas de Continuer ; Nouvelle partie démarre la partie temporaire ; bandeau existant |
| verrou obtenu plus tard (`onOwnerChange`) | `onPersistenceChange` ⇒ le titre relit `continueInfo` et `replaceBlockedReason` |

### 1.4 Pause réelle
- Ouverte par Échap, P ou le bouton icône **Pause** (`aria-label="Pause"`, `data-action="pause"`, `#controls`).
  Panneau « Pause » (`src/ui/pause-menu.ts`, dialogue `pause`) : **Reprendre** (primaire, focus initial),
  **Paramètres**, **Exporter la partie**, **Importer une partie** (`<input type=file>` caché), **Nouvelle partie**
  (confirmation), **Exporter la sauvegarde endommagée** (discret, seulement si `hasDamaged()`), **Retour à l'écran
  titre**, interrupteur **Son** (activé = son actif). Import / Nouvelle partie désactivés si
  `replaceBlockedReason() ≠ null` (raison en note) ; tous les boutons désactivés pendant une action (`busy`).
- API : `createPauseMenu(container, { onResume, onSettings, onExport, onImport(file): Promise<boolean>,
  onNewGame(): Promise<boolean>, onExportDamaged, hasDamaged, replaceBlockedReason, onToTitle, onToggleMute })` →
  `{ view, open(), close(), setCovered(c), refresh(), setMuted(m) }` ; `refresh` est appelé par
  `onPersistenceChange`.
- Tant qu'un panneau est ouvert en jeu : `game.setPaused(true)` ⇒ plus de tick ni de commande, **accumulateur
  gelé, pas de rattrapage** à la reprise (comportement existant de `game.ts`) ; entrées coupées et relâchées ;
  minuteurs des toasts gelés ; ambiance atténuée (×0,35). Rien ne change dans le core.
- Autosave : inchangée (l'état ne change pas ⇒ sautée par égalité de référence). **Retour à l'écran titre** appelle
  `save.flush()` (nouveau : autosave immédiate) puis `toTitle`.
- Import / Nouvelle partie réussis ⇒ `resume` (retour au jeu). Échec ou annulation ⇒ la pause reste ouverte.
- Le bilan de l'aube reste affiché sous la pause (inerte) et réapparaît tel quel à la reprise (l'état est figé).

### 1.5 Paramètres (panneau à onglets : Affichage · Son · Accessibilité), appliqués immédiatement
| Réglage | Valeurs | Effet |
|---|---|---|
| Qualité graphique | Bas / Moyen / Haut (défaut : Moyen si pointeur grossier, sinon Haut) | §4.5 |
| Plein écran | interrupteur | API Fullscreen ; indisponible (iPhone…) ⇒ interrupteur désactivé + « Indisponible sur cet appareil » ; suit `fullscreenchange` |
| Couper le son | interrupteur | gain maître 0 |
| Volume des effets | 0–100 %, pas 5 (défaut 80) | pop, clic, construction ; un clic d'essai au relâchement |
| Volume de l'ambiance | 0–100 %, pas 5 (défaut 60) | crépitement, vent |
| Réduire les animations | Système / Activé / Désactivé (défaut Système) | `<html data-motion>` (guide §6) + rendu (§4.4, §4.6) |

Enregistrés à chaque changement (regroupés : écriture au plus toutes les 300 ms). Préférence plein écran restaurée au
premier clic de l'écran titre (une requête Fullscreen exige un geste).
API (`src/ui/settings.ts`, dialogue `settings` avec bouton Retour) : `createSettingsPanel(container, { onBack,
onQuality, onFullscreen, onMuted, onSfxVolume, onSfxTest, onAmbienceVolume, onReducedMotion })` → `{ view, open(),
close(), setCovered(c), set(values: SettingsValues) }` ; `open()` revient au 1er onglet ; focus initial sur l'onglet
actif. `SettingsValues.quality` = qualité **effective** (`prefs.quality()`), `fullscreen` = état réel du document.

### 1.6 Tutoriel (logique pure `src/app/tutorial.ts`)
Six objectifs, dans l'ordre :
| # | `TutorialStepId` | Texte | Accompli quand (détection prev → curr, par tick) | Cible de la flèche |
|---|---|---|---|---|
| 1 | `welcome` | « Accueillez le survivant : arrêtez-vous sur le tapis d'accueil » (+ « ZQSD / flèches » ou « Glissez le doigt ») | un survivant passe `queued → walkingToTent` | tuile W |
| 2 | `pickupWood` | « Ramassez le bois laissé par le survivant » ; tant qu'aucun bois n'est au sol : « Il se repose, puis vous paiera en bois » | `resources.wood` augmente **et** le bois au sol diminue | drop de bois le plus proche, sinon tente `occupied` |
| 3 | `cleanTent` | « Nettoyez la tente : restez dessus » | une tente passe `messy → free` | 1re tente `messy`, sinon tente `occupied` |
| 4 | `harvestTree` | « Récoltez un arbre : arrêtez-vous à côté » | un nœud `tree` passe `ready → depleted` | arbre `ready` le plus proche du joueur |
| 5 | `buildTent` | « Construisez une tente : restez sur l'emplacement » (+ « Il manque N bois » si besoin) | un emplacement passe `builtTentId: null → id` | 1er emplacement non construit |
| 6 | `feedFire` | « Alimentez le feu avant la nuit : arrêtez-vous à côté » (+ « La nuit tombe dans 1 min 20 ») | `fire.wood` augmente ; ou `fire.wood === FIRE.capacity` | tuile F |

```ts
export const TUTORIAL_STEPS: readonly TutorialStepId[];  // ordre ci-dessus, gelé
export type TutorialStatus = "pending" | "active" | "done" | "skipped";
export interface TutorialProgress { readonly status: TutorialStatus; readonly done: number } // masque 6 bits
export const ALL_DONE: number;                            // 63
export function stepBit(step): number; isStepDone(p, step): boolean; stepNumber(step): number; // 1..6
export function completedBy(prev, curr): number;          // masque des objectifs accomplis par la transition
export function observeTick(p, prev, curr): TutorialProgress; // seul `active` progresse ; même réf. si rien ne change
export function currentStep(p, s): TutorialStepId | null; // null si status ≠ active
export function guideTarget(step, s): Vec | null;         // unités du core
export interface TutorialHint { waitingForPay: boolean; missingWood: number; secondsToNight: number | null }
export function stepHint(step, s): TutorialHint;
export function isAdvancedSave(s): boolean;
export function skipIfAdvanced(p, s): TutorialProgress;   // pending|active ∧ avancée ⇒ skipped
export function startTutorial(p): TutorialProgress;      // pending ⇒ active
export function restartForNewGame(p): TutorialProgress;  // active ∧ done ≠ 0 ⇒ { active, 0 }
export function skipTutorial(p): TutorialProgress;       // sauf done/skipped ⇒ skipped
```
Branchement (`main.ts`) : `startPlaying` ⇒ `startTutorial(skipIfAdvanced(p, state))` ; `onReplaced("newGame")` ⇒
`restartForNewGame` ; `onReplaced("import" | "ownerResume")` ⇒ `skipIfAdvanced` ; `onTick` ⇒ `observeTick` (passage à
`done` ⇒ toast « Tutoriel terminé ! ») ; progression écrite dans `prefs.tutorial` seulement si elle change.
Carte (`src/ui/tutorial-card.ts`) : `createTutorialCard(root, touch, onSkip)` → `{ update(step | null, n, total,
hint | null) }` ; `#tutorial[data-step]` ; aide welcome « ZQSD / flèches pour vous déplacer » (icône `keyboard`) ou
« Glissez le doigt pour vous déplacer » ; compte à rebours via `formatDelay(s)` (« 1 min 20 », « 45 s »).
- **Les objectifs accomplis en avance comptent** (masque) : l'étape affichée est la première non faite.
- **Priorité à la nuit** : si `feedFire` n'est pas fait et `clockInfo(s).light` vaut `dusk` ou `night`, l'étape
  affichée devient `feedFire` (les autres restent à faire).
- Tous faits ⇒ `status: "done"`, toast « Tutoriel terminé ! ».
- **Passer** : bouton « Passer le tutoriel » sur la carte ⇒ confirmation « Passer le tutoriel ? Il ne reviendra
  pas. » ⇒ `skipped`.
- `done` / `skipped` : **jamais réaffiché** (persisté dans les préférences, §2.2).
- **Saut automatique** (`isAdvancedSave`) : `s.tick >= CYCLE_TICKS` (première nuit passée) **ou** un emplacement
  construit. Vérifié quand le tutoriel est `pending`/`active` : à Continuer, après un import réussi, et à la reprise
  du verrou. Vrai ⇒ `skipped`, sans toast.
- Nouvelle partie alors que `active` ⇒ `done = 0` (le camp repart de zéro). `pending` devient `active` au premier
  `play`.
- La logique ne lit **que l'état via le core** (`clockInfo`, `isNight`, `tileCenter`, champs de `GameState`) ;
  pure, sans DOM ni horloge ; entrées jamais mutées.

### 1.7 Notifications (file unique `src/ui/notify.ts`, logique pure `src/ui/notify-queue.ts`)
Trois emplacements empilés en colonne dans `#notices` (bas de l'écran) : **jamais de chevauchement**, au plus
**1 bandeau + 1 carte + 1 toast** visibles.
| Emplacement | Contenu | Règles |
|---|---|---|
| Bandeau | états de sauvegarde / rendu (API `setBanner` existante, mêmes clés et priorités) | persistant, le plus prioritaire seul, fermable selon le cas |
| Carte | **bilan de l'aube** (logique actuelle de `dawn-report.ts` : une fois par aube, tant que `light === "dawn"`, bouton « Fermer ») | parchemin |
| Toast | messages courts | un à la fois, file ≤ 4 |

Toasts : `{ key, kind: "info" | "success" | "warning" | "danger", text }`. Priorité danger > warning > success >
info ; un toast plus prioritaire écourte le courant après 1 s minimum. Durée = 3 s (info, success), 5 s (warning),
6 s (danger), + 50 ms par caractère au-delà de 40, max 8 s ; gelée pendant la pause et onglet caché, prolongée au
survol/focus. Même `key` déjà en file ou affichée ⇒ texte mis à jour et durée relancée (pas de doublon). `fireOut`
remplace un `fireLow` en attente. File pleine ⇒ le plus ancien de priorité la plus basse est retiré.
Accessibilité : régions live présentes dès le chargement — `role="status" aria-live="polite" aria-atomic="true"`
(info, success, warning, bandeau, carte) et `role="alert" aria-live="assertive"` (danger) ; chaque type a son icône
(jamais la couleur seule) + préfixe `.sr-only` (« Information : », « Succès : », « Attention : », « Danger : »).

File pure (`src/ui/notify-queue.ts`, temps injecté) :
```ts
export type ToastKind = "info" | "success" | "warning" | "danger";
export interface ToastInput { key: string; kind: ToastKind; text: string; icon?: string }
export interface Toast extends ToastInput { id: number; duration: number; remaining: number; shown: number }
export interface ToastQueue { readonly current: Toast | null; readonly waiting: readonly Toast[]; readonly nextId: number }
export const MAX_WAITING = 4, MIN_SHOWN_MS = 1000, MAX_TOAST_MS = 8000;
export const EMPTY_TOASTS: ToastQueue;
export function toastPriority(kind): number; toastDuration(kind, text): number;
export function pushToast(q, input): ToastQueue;
export function advanceToasts(q, dtMs, opts?: { frozen?: boolean; hold?: boolean }): ToastQueue;
export function dismissCurrent(q): ToastQueue;
```
Vue (`src/ui/notify.ts`, `createNotify(root)`), `Notices` (utilisée par la sauvegarde) étendue en `Notify` :
```ts
export const BANNER_PRIORITY = ["temporary", "quarantine", "notOwner", "unavailable", "corrupt", "render"] as const;
interface Notices {
  setBanner(key: BannerKey, text: string | null, opts?: { dismissible?: boolean }): void;
  hasBanner(key: BannerKey): boolean;
  toast(text: string, opts?: { kind?: ToastKind; key?: string; icon?: IconName }): void; // key défaut = texte, kind défaut = info
}
interface Notify extends Notices {
  setFrozen(frozen: boolean): void;   // pause en jeu
  setCovered(covered: boolean): void; // panneau ouvert : carte masquée + inert
  updateCard(state): void;            // bilan de l'aube, par image
  hideCard(): void;                   // hors jeu, sans oublier la nuit montrée
  reset(): void;                      // état remplacé
}
```
Minuterie `setInterval` 100 ms seulement tant qu'un toast est affiché ; gelée si `frozen` ou `document.hidden` ;
`hold` au survol / focus. Icône par type : `info`, `circle-check`, `triangle-alert` (warning et danger), sauf icône
imposée. `src/ui/notices.ts` ne fait plus que réexporter les types de `notify.ts` ; `dawn-report.ts` et `menu.ts`
sont supprimés.

Événements (détectés **par tick** dans `src/app/ui-events.ts`, pur : `detectUiEvents(prev, curr): UiEvent[]`, vide si
`prev === curr`) :
```ts
type UiEvent = { type: "tentBuilt"; slotId } | { type: "fireLow"; sleepers } | { type: "fireOut" }
  | { type: "coldLeavers"; count } | { type: "nightSoon"; seconds } | { type: "fireRelit" }
  | { type: "pickup"; resource: DropResource };
export const DUSK_START = TIME.dayTicks - TIME.duskTicks;
```
Toasts émis par `toastFor` (`main.ts`), clé = type d'événement :
| Événement | Condition prev → curr | Toast | Son |
|---|---|---|---|
| `tentBuilt` | emplacement `builtTentId` null → id | success « Tente construite ! » (`hammer`) | `build` |
| `fireLow` | `isFireLow` faux → vrai | warning (`flame`) « Le feu faiblit — N dormeurs risquent de partir » (« 1 dormeur risque », ou « Le feu faiblit » sans dormeur) | — |
| `fireOut` | `isFireOutAtNight` faux → vrai | danger (`fire-out`) « Le feu est éteint — accueil suspendu » | — |
| `coldLeavers` | `night.coldLeavers` augmente | danger (`snowflake`) « Le froid a fait fuir des survivants : plus personne ne viendra cette nuit » | — |
| `nightSoon` | `cyclePos` franchit `DUSK_START` (même cycle) | info (`moon`) « La nuit tombe dans N s : remplissez le feu » (N = `round((dayTicks − cyclePos) / ticksPerSecond)`) | — |
| `fireRelit` | nuit, `fire.wood` 0 → > 0 | success (`flame`) « Le feu repart » | — |
| `pickup` | stock bois/nourriture augmente **et** cette ressource diminue au sol | — | `pop` |
Les alertes permanentes quittent le HUD : l'état reste lisible en continu par la jauge du feu (icône + hachures +
« ! ») et la pastille File (`lock` + « fermé »), plus le tapis W (inchangé). Les toasts de la sauvegarde
(`blocked`, `import`, `export`) passent par la même file (warning).

### 1.8 HUD (`src/ui/hud.ts` refait)
Une barre compacte de pilules (guide §5, §8) ; contrat DOM pour les tests :
| `data-hud` | Visuel | Accessible |
|---|---|---|
| `clock` | arc SVG 44 × 24 : soleil (jour, `cyclePos` 0→2400) ou lune (nuit, 2400→3600) qui avance sur l'arc + « Jour N » (étroit : « J N ») | `role="img"`, `aria-label` « Jour N, nuit, 1 min avant l'aube » (mis à jour à la minute) |
| `fire` | icône + jauge + « w/16 » ; faible : hachures + « ! » + pulsation ; éteint : `fire-out`, piste vide | `role="meter"` inchangé (`aria-valuenow/min/max/valuetext`) |
| `wood`, `food` | icône + compteur animé `formatCount` | `aria-label` « Bois : 1 234 » (exact) |
| `queue` | `users` + « 3/5 » ; accueil fermé : `lock` + « fermé » | « File : 3 sur 5, accueil fermé jusqu'à l'aube » |
| `tents` | `tent` + « libres/total » ; la nuit + « · ☾ n » (dormeurs) | « Tentes libres : 1 sur 3, 2 dormeurs » |
Compteurs (`src/ui/counter.ts`) : défilement `dur-3` vers la cible (cible changée en cours ⇒ repart de la valeur
affichée) ; gains cumulés sur 500 ms dans un badge « +N » qui saute ; dépense : valeur en `--c-spend` 600 ms + badge
« −N » ; mouvement réduit ⇒ mise à jour immédiate, badge fixe 1,2 s. La ligne d'aide « ZQSD » quitte le HUD (étape 1
du tutoriel). DOM touché seulement si le texte change (règle existante).

`formatCount(n: number): string` (`src/ui/format.ts`, pur) — troncature (jamais plus que ce qu'on a), virgule
décimale, espace insécable U+00A0 avant l'unité :
| n | sortie |
|---|---|
| < 1 000 | entier (`999`) |
| 1 000 – 9 999 | 1 décimale tronquée, « ,0 » omis : `1000 → "1 k"`, `1234 → "1,2 k"`, `9999 → "9,9 k"` |
| 10 000 – 999 999 | `12 345 → "12 k"`, `999 999 → "999 k"` |
| millions | `3 456 789 → "3,4 M"`, `340 000 000 → "340 M"` |
| ≥ 10⁹ | `"1,2 Md"` … (Md sans plafond) |
| négatif | préfixe « − » U+2212 |
| décimal | tronqué vers 0 |
| NaN / ±Infinity | `"—"` |
`formatExact(n)` : `1234 → "1 234"` (U+202F), pour les `aria-label`.

---

## 2. Changements d'état

### 2.1 Jeu
**`GameState` : aucun changement. Format de sauvegarde : aucun changement (`CURRENT_VERSION = 2`), aucune
migration, aucune fixture.** Aucune commande nouvelle.

### 2.2 Préférences — `src/save/prefs.ts` (save-guardian), clé **`dernier-refuge.prefs`**
```ts
export const PREFS_KEY = "dernier-refuge.prefs";   // hors SAVE_KEYS : jamais lue par loadGame / quarantaine
export const PREFS_VERSION = 1;
export const PREFS_MAX_CHARS = 4096;
export type Quality = "low" | "medium" | "high";
export interface Prefs {
  version: 1;
  quality: Quality | null;          // null = défaut de l'appareil + dégradation adaptative autorisée
  fullscreen: boolean;              // false
  muted: boolean;                   // false
  sfxVolume: number;                // entier 0..100, défaut 80
  ambienceVolume: number;           // entier 0..100, défaut 60
  reducedMotion: "system" | "on" | "off";            // "system"
  tutorial: { status: "pending" | "active" | "done" | "skipped"; done: number }; // done entier 0..63 ; { "pending", 0 }
}
export const DEFAULT_PREFS: Readonly<Prefs>;
export type PrefsStatus = "ok" | "missing" | "invalid" | "repaired";
export function parsePrefs(raw: unknown): { prefs: Prefs; status: PrefsStatus }; // pur, ne lève jamais
export function serializePrefs(p: Prefs): string;                                // JSON canonique
export function loadPrefs(storage: StorageAdapter): { prefs: Prefs; status: PrefsStatus }; // lecture qui lève ⇒ défauts
export function savePrefs(storage: StorageAdapter, p: Prefs): boolean;            // quota / exception ⇒ false
```
Validation (stricte, **jamais d'exception**) : non-chaîne, vide ⇒ `missing` ; > 4096 caractères, JSON invalide,
non-objet, `version` ≠ 1 (y compris future) ⇒ **tous les défauts** (`invalid`) ; champ absent ou invalide (type,
entier hors bornes, décimal, enum inconnu, `__proto__`) ⇒ **défaut de ce champ seulement** (`repaired`) ; clés
inconnues ignorées puis supprimées à la prochaine écriture. Pas de checksum : les préférences ne donnent aucun
avantage (le tutoriel n'a aucun effet de jeu). Écriture refusée ⇒ ignorée (avertissement console en dev seulement).
Multi-onglets : `storage` event sur la clé ⇒ relecture et application (dernier écrit gagne).
Exports réels en plus : `ReducedMotionPref`, `TutorialStatus`, `TutorialPrefs`, `QUALITIES`,
`REDUCED_MOTION_PREFS`, `TUTORIAL_STATUSES`, `VOLUME_MIN/MAX`, `TUTORIAL_DONE_MAX = 63`, `defaultPrefs()`,
`PrefsParseResult`, `PrefsLoadResult`, `effectiveReducedMotion(pref, systemReduce)`, `defaultQuality(coarse)`
(`medium` si pointeur grossier, sinon `high`), `resolveQuality(q, coarse)`. `PREFS_KEY` =
`` `${SAVE_CONFIG.keyPrefix}prefs` ``.

Contrôleur `src/app/prefs-controller.ts` (`createPrefsController(win, coarsePointer)`, créé **avant** le rendu) :
```ts
type PrefsPatch = Partial<Omit<Prefs, "version">>;
interface PrefsController {
  get(): Readonly<Prefs>;
  update(patch: PrefsPatch): void;          // revalidé par parsePrefs ; rien si inchangé ; écriture regroupée 300 ms
  subscribe(fn): () => void;                // local, autre onglet (`storage`), changement système du mouvement réduit
  reducedMotion(): boolean;                 // on ∨ (system ∧ prefers-reduced-motion)
  quality(): Quality;                       // choix explicite, sinon defaultQuality
  flush(): void;                            // écriture en attente immédiate (aussi à pagehide / onglet caché)
}
```
Pose `<html data-motion="reduce|full">` à chaque émission. `main.ts` s'abonne (`applyPrefs`) : audio, rendu
(`setReducedMotion`, `setQuality` seulement si `quality !== null`), boutons Son, panneau Paramètres.

### 2.3 Interfaces modifiées (src/app, src/render — pas de core)
```ts
// src/render/renderer.ts — méthodes OPTIONNELLES (le 2D et le 3D les implémentent ; render-host les relaie et les
// réapplique après swap, comme setScreenInsets)
export type Presentation = "play" | "title";
export interface GuideTarget { x: number; y: number }         // unités du core
setPresentation?(p: Presentation): void;
setGuide?(g: GuideTarget | null): void;
setQuality?(q: Quality): void;
setReducedMotion?(on: boolean): void;
// src/app/render-host.ts — l'hôte rend ces méthodes OBLIGATOIRES, les mémorise et les réapplique après swap
interface RenderHost extends Renderer {
  swap(next: Renderer): void;            // dispose l'ancien, reset + réglages réappliqués sur le nouveau
  setScreenInsets(insets: ScreenInsets): void;
  setPresentation(p: Presentation): void;
  setGuide(g: GuideTarget | null): void; // copie de la cible ; appelable à chaque image
  setQuality(q: Quality): void;          // jamais appelée pour « défaut » (adaptation automatique conservée)
  setReducedMotion(on: boolean): void;
  info(): RenderHostInfo;                // { presentation, guide: boolean, quality: Quality | null, reducedMotion }, gelé
}
createRenderHost(initial: Renderer, opts?: { onFirstDraw?: () => void }): RenderHost; // onFirstDraw ⇒ `booted`
// src/app/game.ts
GameDeps.onTick?: (prev, curr) => void;  // chaque tick JOUÉ ; jamais par replaceState ni en pause
Game.setPaused(paused: boolean): void;   // plus de tick ni de commande ; le rendu continue
// src/app/save-controller.ts (SaveController)
attach(ui: SaveControllerUi): void;      // ui = { game, confirm, onPersistenceChange, onReplaced?(origin) }
importFile(file: File): Promise<boolean>; newGame(): Promise<boolean>; // true ⇔ partie remplacée
flush(): void;                           // autosave immédiate (retour au titre) ; sautée si inchangé / non propriétaire
markPlayed(): void; continueInfo(): ContinueInfo | null; bootKind(): "load" | "new" | "temporary";
type ReplaceOrigin = "import" | "newGame" | "ownerResume";
```
Lecture e2e (production comprise, **lecture seule, nombres / chaînes / booléens uniquement**, aucun accès à l'état) :
`window.__gameInfo = Object.freeze({ tick(): number, screen(): ScreenId, ticking(): boolean })`, défini par
`Object.defineProperty` non modifiable, non reconfigurable, non énumérable. `window.__render3d.info()` gagne
`presentation`, `guide: boolean`, `quality`, `programs: number`. `window.__game` : dev seulement.

---

## 3. Commandes et systèmes
- **Aucune commande, aucun système, aucun tick nouveau.** La seule commande envoyée par l'app reste
  `setMoveInput` (`game.ts`), coupée pendant la pause et sur le titre.
- Observateurs par tick (`GameDeps.onTick`, branchés dans `main.ts`) : `detectUiEvents` ⇒ notifications + sons ;
  `observeTick` du tutoriel ⇒ préférences. Jamais appelés par `replaceState` (chargement, import).
- Par image (`hud.update`) : HUD, carte de bilan, carte du tutoriel (`currentStep`, `stepHint`),
  `renderer.setGuide(guideTarget(...))`, paramètres audio continus (§4.7).

---

## 4. Rendu / UI (lecture seule de l'état)

### 4.1 DOM (`index.html`)
```html
<div id="app">
  <canvas id="game" aria-label="Camp de survivants"></canvas>
  <div id="hud" hidden></div>              <!-- pilules -->
  <div id="tutorial" hidden></div>         <!-- carte parchemin, role="region" aria-label="Tutoriel" -->
  <div id="controls" hidden></div>         <!-- boutons Pause et Son -->
  <div id="notices"></div>                 <!-- bandeau, carte, toast + régions live -->
  <div id="title" hidden></div>            <!-- écran titre -->
  <div id="dialogs"></div>                 <!-- pause, paramètres, crédits, confirmation -->
</div>
```
`#menu` et `#dawn-report` disparaissent. `theme-color` = `#0e1626`. Préchargement des polices.
`watchScreenInsets` exclut aussi `#controls`, `#tutorial` et `#notices` (boîtes réelles).

### 4.2 Modules UI (`src/ui`, aucun accès au stockage ni à `applyCommand`)
`format.ts` (pur : `formatCount`, `formatExact`), `icons.ts` (`icon`, `setIcon`), `counter.ts`, `hud.ts`
(`createHud(root): Hud`), `clock-arc.ts` (`arcProgress` pur + `createClockArc`), `notify-queue.ts` (pur),
`notify.ts`, `controls.ts` (`createGameControls(root, { onPause, onToggleMute })` → `{ setMuted }`), `widgets.ts`
(`createSwitch`, `createSlider`, `createSegmented`, `createTabs`), `dialog.ts` (`createDialog(container, spec):
DialogView { layer, panel, body, titleEl, open, close, isOpen, setCovered, setBusy, isBusy }` : focus piégé, focus
rendu à l'ouvreur, sortie en fondu ; `createConfirmDialog` → `{ view, set(message, label, { danger?, title? }),
onAnswer(fn) }` ; `makeButton`, `makeIconButton`, `setDisabled`, `isDisabled`, `guard`, `focusablesIn`), `title.ts`, `pause-menu.ts` (remplace `menu.ts`, garde l'import par `<input type=file>` et la
note de blocage), `settings.ts` (onglets, curseurs, interrupteurs, choix segmentés), `credits.ts` +
`credits-md.ts` (pur : `parseCreditsMd(md): CreditsBlock[]` — titres, paragraphes, liens, gras, code, tableaux
rendus en listes ; DOM construit avec `textContent`, jamais `innerHTML`), `tutorial-card.ts`, `loading.ts`
(restylé). Contenu des crédits : `import credits from "../../CREDITS.md?raw"` (fonction native de Vite, aucune
dépendance) ; liens `target="_blank" rel="noopener"`.

### 4.3 Accessibilité et robustesse (critères)
- Clavier seul : titre → Nouvelle partie → jeu → Échap → parcours de la pause → Paramètres (onglets aux flèches,
  curseurs, interrupteurs) → Échap → Échap ⇒ jeu, sans souris ; focus toujours visible.
- **Clics très rapides** : `dialog` et boutons d'action en `aria-busy` pendant l'action ; machine d'écrans qui
  ignore les événements invalides (deux `play` ⇒ un seul) ; confirmation résolue une fois ; garde `busy` de
  `save-controller` conservée.
- **Redimensionnement en pleine animation** : animations en `transform/opacity` seulement ; compteurs indépendants
  de la mise en page ; caméra orbitale et flèche recalculées par image ; insets remesurés par `ResizeObserver`.
- **Menu ouvert pendant le bilan de l'aube** : la carte reste (inerte), rien ne se perd, réapparaît à la reprise.
- **360 px**, safe areas, HUD ≤ 12 % : guide §8. Pas de défilement horizontal (`scrollWidth ≤ clientWidth`).
- Jamais la couleur seule, contrastes du guide §1, `data-motion` respecté partout (CSS, compteurs, caméra, flèche).

### 4.4 Écran titre dans le rendu (`setPresentation("title")`)
- **3D** : état dessiné tel quel (pause), mais : éclairage `lightingAt(TITLE.lightTick)` (2900, nuit bleutée) au lieu
  du tick ; `FireItem` forcé allumé (`lit: true`, `ratio = max(ratio, 0.7)`) — **présentation seulement, l'état
  n'est pas modifié** ; caméra orbitale : centre = feu, rayon 11 m, hauteur 7 m, visée 0,5 m au-dessus du feu,
  `yaw = yaw0 + 2π · t / 120 s` (`performance.now()`), angle fixe `yaw0` en mouvement réduit ; anneau du joueur et
  étiquettes du calque 2D masqués. Constantes `TITLE` dans `src/render/three/config.ts` (présentation).
  Retour à `"play"` : caméra recalée sans lissage (`snap`), sans `reset()` des vues.
- **2D (repli ou `?render=2d`)** : même éclairage forcé (voile de nuit + halo du feu), carte centrée, pas
  d'orbite ; un dégradé CSS (`#title::before`, vignette `night-900`) assure la lisibilité.
- Budget inchangé (< 120 draw calls) ; aucune lumière ajoutée.

### 4.5 Qualité graphique (`setQuality`, à chaud, sans fuite)
| Niveau | Ombres | pixelRatio | Cartes d'ombre | Flammes |
|---|---|---|---|---|
| Bas | **désactivées** (`renderer.shadowMap.enabled = false`, `material.needsUpdate` une fois) | `0.75 × min(dpr, 1)` | libérées | 12 particules |
| Moyen | oui | `min(dpr, 1.5)` | 1024 / spot 512 | 24 |
| Haut | oui | `min(dpr, 2)` | 2048 / spot 1024 (pointeur grossier : 1024 / 512) | 24 |
- Changer de qualité est **le seul moment** où les programmes peuvent être recompilés (exception à ajouter au skill
  `three-render`) ; lumières, `castShadow` et nombre d'objets inchangés.
- La dégradation adaptative existante ne joue que si `prefs.quality === null`.
- 2D : seul le pixelRatio change.

### 4.6 Flèche du tutoriel (`setGuide`)
- **3D** (`views/guide-view.ts`) : chevron procédural orange `ember-500` émissif au-dessus de la cible (1,6 m),
  rebond ±0,25 m à 1 Hz, anneau au sol pulsé ; ≤ 2 draw calls ; créé une fois, compilé au warm-up, `visible`
  basculé (pas de lumière). Mouvement réduit : immobile.
- **Hors écran** (3D et 2D) : flèche 2D sur le bord de l'écran (calque `#game`), orientée vers la cible, hors des
  zones exclues (HUD, contrôles, notifications, tutoriel).
- **2D** : chevron dessiné au-dessus de la tuile cible + même flèche de bord.
- Accessible : la carte du tutoriel donne l'objectif en texte (« Objectif 2 sur 6 : … ») dans une région live polie
  annoncée à chaque changement d'étape ; bouton « Passer le tutoriel » (≥ 44 px).

### 4.7 Sons Web Audio (`src/app/audio.ts` + `src/app/audio-mix.ts` pur + `src/app/audio-config.ts`)
- Aucun fichier : synthèse dans le navigateur. `AudioContext` créé **au premier `pointerdown`/`keydown`** (ou au
  clic Continuer / Nouvelle partie), `resume()` si suspendu ; onglet caché ⇒ `suspend()`. Sans `AudioContext` (ou
  création qui lève) ⇒ moteur silencieux (mêmes méthodes, aucun effet, aucune erreur).
- Graphe : `sfxBus` et `ambienceBus` → `master` → destination.
  | Son | Synthèse |
  |---|---|
  | pop (ramassage) | sinus 600 → 900 Hz en 60 ms, enveloppe 5 / 80 ms, hauteur variée de ±5 % par un compteur (pas de `Math.random` nécessaire) |
  | clic (boutons) | triangle 1 200 Hz, 25 ms |
  | construction terminée | arpège triangle do5-mi5-sol5 (90 ms chacun) + bruit filtré passe-bas 30 ms |
  | crépitement du feu (boucle) | bruit blanc 2 s généré une fois → passe-bande 1,5 kHz + impulsions de craquement planifiées (30–200 ms) |
  | vent la nuit (boucle) | bruit brun → passe-bas 400 Hz modulé par un LFO 0,1 Hz |
- `audio-config.ts` : `AudioScene = "title" | "play" | "pause"`, `SfxId = "pop" | "click" | "build"`,
  `AudioPrefs { muted, sfxVolume, ambienceVolume }`, `AmbienceParams { fireDistanceTiles, fireWood, fireCapacity,
  nightness }`, `BusGains`, `LoopGains`, constantes de présentation `AUDIO` (rampe 0,15 s, pause ×0,35, titre feu 0,7
  / vent 0,5, `maxVoices` 8, niveaux et synthèse de chaque son).
- `audio-mix.ts` (pur, testé) :
  `fireGain(dTiles, wood, capacity)` = 0 si `wood ≤ 0`, sinon `distFactor × (0.35 + 0.65 × wood/capacity)` avec
  `distFactor = 1` si d ≤ 1,5 tuile, 0 si d ≥ 9, `(1 − (d − 1,5)/7,5)²` entre ; `windGain(nightness)` =
  `0.5 × nightness` ; `nightnessOf(light, progress)` (nuit 1, jour 0, crépuscule = avancement, aube = 1 −
  avancement) ; `busGains(prefs, scene)` : `master = muted ? 0 : 1`, `sfx = sfxVolume/100`, `ambience =
  ambienceVolume/100 × (pause ? 0.35 : 1)` ; `loopGains(params, scene)` (titre : 0,7 / 0,5 fixes) ;
  `ambienceParams(state)` (lecture seule) ; `popPitch(n)` (±5 % par compteur, cycle de 5).
- `audio.ts` : `createAudio({ win?, autoUnlock?, prefs?, scene? }): AudioEngine` :
  ```ts
  interface AudioEngine {
    readonly supported: boolean;      // false ⇒ moteur silencieux
    unlock(): void; isStarted(): boolean;
    setPrefs(p: AudioPrefs): void; setScene(s: AudioScene): void; setAmbience(p: AmbienceParams): void;
    play(id: SfxId): void;            // ignoré avant le 1er geste, si muet ou au-delà de maxVoices
    bindClicks(root: HTMLElement): () => void; // son `click` délégué (button, [role=switch|tab|radio], a[href], hors désactivés)
    dispose(): void;
  }
  ```
  Branchement : `bindClicks(#app)` ; `play("pop")` sur `pickup`, `play("build")` sur `tentBuilt` ; `play("click")`
  au relâchement du curseur des effets ; `setAmbience(ambienceParams(state))` à chaque image ; `setScene` par le
  contrôleur d'écrans. Bruit généré par xorshift seedé (aucun `Math.random`).
- Bouton **Son** (`volume-2` / `volume-x`, `aria-pressed` = muet) : écran titre, `#controls` (largeur ≥ 560 px),
  interrupteur dans la pause ; touche M.

### 4.8 Polices et icônes (sans paquet npm)
- Fichiers commités : `public/fonts/fredoka-latin.woff2`, `public/fonts/nunito-latin.woff2`,
  `public/fonts/*-OFL.txt` ; `src/ui/icons/lucide/*.svg` + `LICENSE` ; `src/ui/icons/custom/{wood,fire-out}.svg`
  (dessinées par render-dev, style Lucide).
- Récupération par **l'humain** (les hooks interdisent `Invoke-WebRequest`/`curl` à tous les agents), depuis les
  sources officielles : Google Fonts (CSS2, sous-ensemble latin) + `github.com/google/fonts` (OFL), et
  `github.com/lucide-icons/lucide` (ISC). Commande PowerShell à lancer à la racine du projet :
```powershell
$ErrorActionPreference = 'Stop'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
New-Item -ItemType Directory -Force public\fonts, src\ui\icons\lucide | Out-Null
$fonts = @{ fredoka = 'Fredoka:wght@600'; nunito = 'Nunito:wght@400..800' }
foreach ($name in $fonts.Keys) {
  $css = (Invoke-WebRequest -UseBasicParsing -UserAgent $ua "https://fonts.googleapis.com/css2?family=$($fonts[$name])&display=swap").Content
  $block = ($css -split '/\* ') | Where-Object { $_ -match '^latin \*/' } | Select-Object -First 1
  $url = [regex]::Match($block, 'url\((https://[^)]+\.woff2)\)').Groups[1].Value
  Invoke-WebRequest -UseBasicParsing $url -OutFile "public\fonts\$name-latin.woff2"
  Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/google/fonts/main/ofl/$name/OFL.txt" -OutFile "public\fonts\$name-OFL.txt"
}
$icons = 'sun','moon','flame','tent','users','lock','cherry','pause','play','settings','volume-2','volume-x',
         'maximize','minimize','download','upload','x','check','chevron-left','house','scroll-text','skip-forward',
         'info','circle-check','triangle-alert','snowflake','hammer','sparkles','axe','keyboard'
foreach ($i in $icons) {
  Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/$i.svg" -OutFile "src\ui\icons\lucide\$i.svg"
}
Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE' -OutFile 'src\ui\icons\lucide\LICENSE'
Get-ChildItem public\fonts, src\ui\icons\lucide | Select-Object Name, Length
```
  Un nom d'icône introuvable (renommage Lucide) ⇒ l'humain ou render-dev choisit l'équivalent dans le dépôt et met à
  jour la liste du guide §4. Tailles réelles reportées dans `CREDITS.md` (budget polices ≤ 120 Ko).
- `CREDITS.md` (agent principal) : nouvelle section « Polices et icônes » — Fredoka (Milena Brandão & Hafontia,
  OFL 1.1), Nunito (Vernon Adams, Cyreal, Jacques Le Bailly, OFL 1.1), Lucide (contributeurs Lucide, ISC ; dérivé en
  partie de Feather, MIT — cf. `LICENSE`), icônes maison ; liens, fichiers, tailles. Le titre « Modèles 3D du rendu
  prototype (`?render=3d`) » est corrigé (la 3D est le rendu par défaut). Les crédits affichés en jeu étant lus
  depuis ce fichier, il doit rester en Markdown simple (titres, paragraphes, tableaux, liens).

---

## 5. Anti-triche — invariants
- Rien de nouveau dans le core : `checkInvariants`, schéma v2 et checksum inchangés ; aucune commande ajoutée.
- **La pause ne crée ni ne détruit de temps** : accumulateur gelé, pas de rattrapage (pas de progression hors ligne ;
  l'horloge réelle n'est jamais lue pour le jeu).
- **Écran titre et panneaux : 0 tick, 0 commande** (`isTicking` est la seule source de `setPaused`/`setEnabled`).
- Préférences : clé séparée, non signée, validée à chaque lecture ; aucune n'influence le gameplay (qualité, sons,
  animations, tutoriel = présentation). Une clé de préférences forgée ne peut au pire que masquer le tutoriel.
- `window.__gameInfo` et `__render3d.info()` : fonctions gelées qui renvoient des nombres/chaînes ; aucune référence
  à l'état ni au contrôleur de sauvegarde.
- `src/ui` n'importe ni `src/save` ni `applyCommand` (règle de revue ; ESLint `no-restricted-imports` si
  render-dev l'ajoute à `eslint.config` — fichier racine, agent principal).
- Crédits : rendu par `textContent` uniquement (pas d'injection HTML depuis `CREDITS.md`).

---

## 6. Tests

### 6.1 Vitest (fonctions pures, environnement node)
| Fichier | Cas |
|---|---|
| `tests/ui/format.test.ts` | table §1.8 (0, 7, 999, 1 000, 1 099, 1 234, 9 999, 10 000, 999 999, 10⁶, 3 456 789, 10⁹, −1 234, 12,7, NaN, ±Infinity, −0) ; U+00A0 avant l'unité ; `formatExact` (U+202F) ; ne lève jamais |
| `tests/save/prefs.test.ts` | null / `""` ⇒ `missing` ; `"{oops"`, `"[]"`, `"42"`, `version: 2`, > 4096 caractères ⇒ défauts `invalid` ; par champ (volume 150, −1, 33,5, `"80"`, qualité `"ultra"`, `reducedMotion: true`, `tutorial.done` 64 / −1 / 1,5, `status` inconnu, `__proto__`) ⇒ défaut du champ seul, `repaired` ; clés inconnues ignorées ; aller-retour `serializePrefs`/`parsePrefs` ; `loadPrefs` avec `getItem` qui lève ⇒ défauts ; `savePrefs` quota ⇒ `false` sans exception ; `loadGame`, `listQuarantine`, rotation de quarantaine ignorent `PREFS_KEY` |
| `tests/app/tutorial.test.ts` | chaque détection sur des états construits avec le core (`createInitialState` + ticks scriptés / `cloneState` modifié) ; rien sans transition ; ordre ; objectif fait en avance compté ; priorité `feedFire` au crépuscule et la nuit ; `feedFire` accompli feu plein ; cibles par étape (W, drop le plus proche, tente `messy` puis `occupied`, arbre prêt le plus proche, 1er emplacement libre, F) et `null` quand rien ; `isAdvancedSave` (tick 3599 faux, 3600 vrai, emplacement construit vrai) ; `done`/`skipped` stables ; entrées gelées non mutées ; même référence si inchangé |
| `tests/app/screens.test.ts` | table de transitions ; invalides ⇒ même référence ; `isTicking` vrai seulement en `game` sans panneau ; Échap (pop, pause, rien) ; crédits seulement depuis le titre ; `toTitle` vide la pile ; double `play` ; pile ≤ 3 |
| `tests/ui/notify-queue.test.ts` (temps injecté) | un toast visible au plus ; priorité et écourtement après 1 s ; dédoublonnage par `key` ; `fireOut` remplace `fireLow` ; file ≤ 4 ; durées (type, longueur, plafond 8 s) ; gel pendant la pause ; bandeau / carte / toast indépendants |
| `tests/app/ui-events.test.ts` | chaque événement §1.7 sur une transition, aucun sur états identiques ; `pickup` distingue récolte et dépense |
| `tests/app/audio-mix.test.ts` | `fireGain` (0 éteint, bornes 1,5 et 9 tuiles, monotone), `windGain`, `busGains` (muet, pause, titre) |
| `tests/ui/credits-md.test.ts` | parse le vrai `CREDITS.md` (titres, tableau, liens) ; `<script>` reste du texte |
| `tests/app/render-host.test.ts` (existant) | relais de `setPresentation/setGuide/setQuality/setReducedMotion` et réapplication après `swap` |

### 6.2 Playwright (`tests/e2e/`, build de production)
Mise à jour des aides (`helpers.ts`) : `enterGame(page, "continue" | "new")` (titre → jeu), `seedPrefs(page, patch)`
(`addInitScript` qui écrit `dernier-refuge.prefs`, tutoriel `done` par défaut pour les anciens tests), `openPause`,
`newGame`/`importViaMenu` via la pause (bouton « Pause »), `gameTick(page)` (`__gameInfo.tick()`), `expectHud` et
`hudValue` réécrits sur le contrat `data-hud` (§1.8) ; alertes vérifiées via toasts et pastille File. Les specs
existantes (`render-3d`, `captures`, jour/nuit) passent par `enterGame`.

Nouveaux `tests/e2e/ui.spec.ts` :
1. **Titre → nouvelle partie → tutoriel** : `/` sans préférences : `h1` « Dernier Refuge », pas de Continuer,
   `__gameInfo.ticking()` faux et tick constant sur 1 s ; « Nouvelle partie » ⇒ carte « Objectif 1 sur 6 »,
   `__render3d.info().guide === true` ; recharger ⇒ Continuer « Jour 1 » visible (tick > 0) ; Nouvelle partie ⇒
   confirmation.
2. **La pause bloque vraiment le temps** : en jeu, Échap ; `t0 = tick` ; `waitLoopTime(3000)` ⇒ tick = `t0`,
   aria de l'horloge inchangé, flèches sans effet ; Paramètres ouvert depuis la pause ⇒ toujours `t0` ; Reprendre ⇒
   tick > `t0` après 1 s de boucle ; idem pendant le bilan de l'aube (save importée en aube).
3. **Paramètres conservés** : Bas, ambiance 30 %, mouvement réduit Activé, son coupé ⇒ recharger ⇒ mêmes valeurs,
   `html[data-motion="reduce"]`, `__render3d.info().quality === "low"` ; préférences abîmées (`"{oops"`, volume 999)
   ⇒ démarrage normal avec défauts, aucune erreur console.
4. **HUD ≤ 12 %** en 360×640, 390×844, 412×915 et 844×390 (jour, nuit, 9 999 bois importés) : hauteur de `#hud` ≤
   0,12 × `innerHeight`, aucun débordement horizontal.
5. **Clavier seul** (souris jamais utilisée) : parcours §4.3, chaque élément focalisé a un `outline` ≥ 2 px ; Tab
   piégé dans les dialogues ; le focus revient au bouton d'origine.
6. **Console propre et hors ligne** : parcours complet (titre, crédits, jeu, pause, paramètres, retour au titre) ⇒
   0 erreur console, 0 exception, 0 réponse ≥ 400, **toutes les requêtes sur l'origine locale**, polices chargées
   (`document.fonts.check('16px Nunito')`).
7. **Tutoriel** : Passer ⇒ confirmation ⇒ disparu, recharger ⇒ absent ; import d'une save avancée (fixture jour 2)
   sur préférences vierges ⇒ tutoriel jamais affiché ; objectif « Accueillez » accompli par un vrai déplacement vers
   W ⇒ « Objectif 2 sur 6 ».
8. **Robustesse** : double clic sur Continuer ⇒ un seul passage (pas d'erreur) ; redimensionnement 1280 → 360 en
   pleine animation de compteur ⇒ pas de débordement ; qualité Bas → Haut → Bas ×5 ⇒ `geometries`/`textures`
   identiques, `programs` borné.

### 6.3 Captures (`npm run captures`, `captures/`, horloge gelée, polices prêtes)
`ui-title-desktop.png` (1280×720) · `ui-title-mobile.png` (390×844) · `ui-hud-day-desktop.png` ·
`ui-hud-night-desktop.png` · `ui-tutorial-arrow-desktop.png` · `ui-tutorial-arrow-mobile.png` ·
`ui-pause-desktop.png` · `ui-settings-desktop.png` · `ui-mobile-portrait.png` (390×844, jeu de jour + tutoriel) ·
`ui-mobile-360.png` (360×640).

---

## 7. Découpage en tâches

| # | Agent | Tâche | Fichiers |
|---|---|---|---|
| 0 | **humain** | Lancer la commande PowerShell §4.8 (polices + icônes + licences) | `public/fonts/`, `src/ui/icons/lucide/` |
| 1 | save-guardian | `prefs.ts` (§2.2) exporté par `src/save/index.ts` ; vérifier que `PREFS_KEY` n'est jamais touché par slots / quarantaine / verrou ; `tests/save/prefs.test.ts` | `src/save/`, `tests/save/` |
| 2 | render-dev | Fondations : `tokens.css`, `base.css` (`@font-face`), `components.css` (guide §5), `icons.ts` + icônes maison, `format.ts`, `index.html` (§4.1) | `src/styles/`, `src/ui/`, `index.html` |
| 3 | render-dev | App : `screens.ts`, `screen-controller.ts`, `keys.ts`, `prefs-controller.ts`, `game.ts` (`onTick`), `save-controller.ts` (`newGame/importFile` → booléen, `flush`, `continueInfo`, `bootKind`), `ui-events.ts`, `tutorial.ts`, `main.ts` (câblage, `__gameInfo`), plein écran, `data-motion` | `src/app/`, `src/main.ts` |
| 4 | render-dev | UI : `title.ts`, `dialog.ts`, `pause-menu.ts` (remplace `menu.ts`), `settings.ts`, `credits*.ts`, `hud.ts` + `counter.ts` + `clock-arc.ts`, `notify*.ts` (absorbe `notices.ts`, `dawn-report.ts`), `tutorial-card.ts`, `loading.ts` | `src/ui/`, `src/styles/` |
| 5 | render-dev | Rendu : `Presentation` titre (3D orbite, éclairage et feu forcés ; 2D), `guide-view.ts` + flèche de bord (3D et 2D), `setQuality`, `setReducedMotion`, `render-host` (relais), `info()` | `src/render/` , `src/app/render-host.ts` |
| 6 | render-dev | Audio : `audio.ts`, `audio-mix.ts`, `audio-config.ts`, branchement | `src/app/` |
| 7 | test-writer | Vitest §6.1 (sauf prefs), aides e2e + specs §6.2, migration des specs existantes, captures §6.3 | `tests/` |
| 8 | agent principal | `CREDITS.md` (§4.8) ; skill `ui-style` (§9) ; ajout au skill `three-render` (exception « qualité » §4.5, `setPresentation`/`setGuide`) ; `CLAUDE.md` : mentionner la clé `dernier-refuge.prefs` et le skill `ui-style` ; règle ESLint éventuelle (§5) | racine, `.claude/skills/` |
| 9 | reviewer | Revue (guide de style, accessibilité, pause, aucune modification du core / format) | — |
| 10 | architecte | `ROADMAP.md` (Jalon 5 « tutoriel », « sons » partiels), ce document aligné sur le code | `docs/` |

core-dev et balance-designer : **rien**. Ordre : 0 → 1 et 2 (parallèles) → 3 → 4, 5, 6 (parallèles) → 7 → 8 → 9 → 10.
Les sous-tâches 3 et 4 doivent garder `npm run e2e` vert à chaque étape (les aides e2e passent par `enterGame` dès
l'arrivée de l'écran titre : tâche 7 démarre ses aides en même temps que la 3).

---

## 8. Choix de l'utilisateur
**Validés** (consignés dans `ui-style.md` §0) : polices Fredoka 600 + Nunito 400–800 auto-hébergées ; icônes Lucide
(ISC) + 2 maison ; raccourcis Échap / P (pause), M (son) ; `window.__gameInfo` strictement en lecture seule.
Les autres points ci-dessous sont implémentés tels quels.
1. **Polices** : Fredoka 600 (titres) + Nunito 400–800 (texte), OFL, woff2 latin, ≈ 100 Ko.
2. **Icônes** : Lucide (ISC) + 2 icônes maison (bûches, feu éteint).
3. **Derrière l'écran titre** : le camp **de la sauvegarde** (ou le camp neuf), de nuit, feu forcé allumé à
   l'image seulement. Alternative : une scène de démonstration fixe (même camp pour tout le monde).
4. **Saut automatique du tutoriel** : première nuit passée (`tick ≥ 3600`) ou une tente construite.
5. **Alertes du feu** : retirées de la ligne d'alerte du HUD, remplacées par des toasts + état permanent dans la
   jauge et la pastille File (pour tenir les 12 %).
6. **Préférences** : clé `dernier-refuge.prefs`, non signée, abîmée ⇒ défauts (champ par champ si possible).
7. **Raccourcis** : Échap / P (pause), M (son) ; bouton Son hors pause masqué sous 560 px de large.
8. **Lecture e2e** `window.__gameInfo` (tick, écran) présente aussi en production, en lecture seule.
9. **Aucune nouvelle dépendance npm** ; fichiers récupérés par l'humain (les hooks bloquent le téléchargement).

---

## 9. Skill « ui-style »
- `docs/design/ui-style.md` commence déjà par l'en-tête de skill (`name`, `description`).
- `.claude/skills/**` **n'est pas protégé** par `.claude/hooks/policy.json` (liste `protected` : hooks, settings,
  agents, assets…) et la session principale a `write: ["**"]` : l'agent principal peut créer
  `.claude/skills/ui-style/SKILL.md` (copie exacte, puis retirer la ligne de commentaire « Source : … » si souhaité).
  Aucun fichier de `.claude/hooks/` ne mentionne `skills` (recherche faite ; `guard.mjs` n'a pas été lu ligne à
  ligne). Si l'écriture est malgré tout refusée, l'humain lance :
```powershell
New-Item -ItemType Directory -Force .claude\skills\ui-style | Out-Null
Copy-Item docs\design\ui-style.md .claude\skills\ui-style\SKILL.md -Force
```
