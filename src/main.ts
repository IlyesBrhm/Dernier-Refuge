// Point d'entrée navigateur : câble préférences, rendu, HUD, entrées, sauvegarde, écrans, son et boucle.
// Démarrage asynchrone : verrou multi-onglets + sauvegarde, et en 3D chargement des modèles (chunk séparé,
// repli 2D automatique). La partie est créée EN PAUSE derrière l'écran titre : aucun tick ni commande
// tant que le joueur n'a pas cliqué Continuer / Nouvelle partie (docs/design/ui-polish.md §1).
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/main.css";
import { type GameState } from "./core";
import { createAudio } from "./app/audio";
import { ambienceParams } from "./app/audio-mix";
import { startGame } from "./app/game";
import { createInput } from "./app/input";
import { installGlobalKeys } from "./app/keys";
import { createPrefsController } from "./app/prefs-controller";
import { createRenderHost, type RenderHost } from "./app/render-host";
import { parseRenderMode } from "./app/render-mode";
import { bootSave } from "./app/save-controller";
import { createScreenController } from "./app/screen-controller";
import { watchScreenInsets } from "./app/screen-insets";
import { isTicking, showsHud, type ScreenId } from "./app/screens";
import {
  currentStep,
  guideTarget,
  observeTick,
  restartForNewGame,
  skipIfAdvanced,
  skipTutorial,
  startTutorial,
  stepHint,
  stepNumber,
  TUTORIAL_STEPS,
  type TutorialProgress,
} from "./app/tutorial";
import { detectUiEvents, type UiEvent } from "./app/ui-events";
import { createRenderer, type Quality, type Renderer } from "./render/renderer";
import { isRender3DError, type Render3DFailure } from "./render/render3d-errors";
import { createGameControls } from "./ui/controls";
import { createCreditsPanel } from "./ui/credits";
import { createConfirmDialog } from "./ui/dialog";
import { createHud, type Hud } from "./ui/hud";
import { createJoystick } from "./ui/joystick";
import { createLoadingScreen } from "./ui/loading";
import { createNotify, type Notify } from "./ui/notify";
import { createPauseMenu } from "./ui/pause-menu";
import { createSettingsPanel } from "./ui/settings";
import { createTitleScreen } from "./ui/title";
import { createTutorialCard } from "./ui/tutorial-card";

const RENDER_FALLBACK_TEXT: Record<Render3DFailure | "context", string> = {
  webgl: "La 3D n'est pas disponible sur cet appareil. Le jeu continue en 2D.",
  assets: "Les modèles 3D n'ont pas pu être chargés. Le jeu continue en 2D.",
  timeout: "Les modèles 3D n'ont pas pu être chargés. Le jeu continue en 2D.",
  context: "Affichage 3D interrompu. Le jeu continue en 2D.",
};

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`élément #${id} introuvable`);
  return el as T;
}

/**
 * Charge le renderer 3D (chunk séparé). Ne crée JAMAIS le renderer 2D avant (le premier getContext
 * de #game fixe son mode alpha). En cas d'échec : renderer 2D + bandeau fermable.
 */
async function loadRenderer3D(
  canvas: HTMLCanvasElement,
  app: HTMLElement,
  coarsePointer: boolean,
  notices: Notify,
  onContextLost: () => void,
  quality: Quality | null,
): Promise<Renderer> {
  const loading = createLoadingScreen(app);
  loading.setProgress(0.02);
  try {
    const m = await import("./render/three");
    loading.setProgress(0.1);
    return await m.createRenderer3D(canvas, {
      coarsePointer,
      onProgress: (r) => loading.setProgress(r),
      onContextLost,
      // Qualité des préférences appliquée avant la compilation des shaders (une seule compilation).
      quality,
    });
  } catch (e: unknown) {
    const reason: Render3DFailure = isRender3DError(e) ? e.reason : "assets";
    console.warn(`[render] 3D indisponible (${reason}), repli en 2D :`, e);
    app.dataset.render = "2d";
    notices.setBanner("render", RENDER_FALLBACK_TEXT[reason], { dismissible: true });
    return createRenderer(canvas);
  } finally {
    loading.remove();
  }
}

// --- Plein écran ----------------------------------------------------------------------------------

function fullscreenAvailable(): boolean {
  return document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === "function";
}

function isFullscreen(): boolean {
  return document.fullscreenElement !== null && document.fullscreenElement !== undefined;
}

/** À appeler dans un geste utilisateur (clic). Échec ⇒ ignoré. */
function applyFullscreen(on: boolean): void {
  if (!fullscreenAvailable()) return;
  try {
    if (on && !isFullscreen()) void document.documentElement.requestFullscreen().catch(() => undefined);
    else if (!on && isFullscreen()) void document.exitFullscreen().catch(() => undefined);
  } catch {
    // API présente mais refusée : sans effet.
  }
}

// --- Toasts des événements de jeu -------------------------------------------------------------

function toastFor(e: UiEvent, notify: Notify): void {
  switch (e.type) {
    case "tentBuilt":
      notify.toast("Tente construite !", { kind: "success", key: "tentBuilt", icon: "hammer" });
      break;
    case "fireLow":
      notify.toast(
        e.sleepers > 0
          ? `Le feu faiblit — ${e.sleepers} ${e.sleepers > 1 ? "dormeurs risquent" : "dormeur risque"} de partir`
          : "Le feu faiblit",
        { kind: "warning", key: "fireLow", icon: "flame" },
      );
      break;
    case "fireOut":
      notify.toast("Le feu est éteint — accueil suspendu", { kind: "danger", key: "fireOut", icon: "fire-out" });
      break;
    case "coldLeavers":
      notify.toast("Le froid a fait fuir des survivants : plus personne ne viendra cette nuit", {
        kind: "danger",
        key: "coldLeavers",
        icon: "snowflake",
      });
      break;
    case "nightSoon":
      notify.toast(`La nuit tombe dans ${e.seconds} s : remplissez le feu`, { kind: "info", key: "nightSoon", icon: "moon" });
      break;
    case "fireRelit":
      notify.toast("Le feu repart", { kind: "success", key: "fireRelit", icon: "flame" });
      break;
    case "pickup":
      break;
  }
}

async function main(): Promise<void> {
  const canvas = byId<HTMLCanvasElement>("game");
  const app = byId<HTMLDivElement>("app");
  const hudRoot = byId<HTMLDivElement>("hud");
  const tutorialRoot = byId<HTMLDivElement>("tutorial");
  const controlsRoot = byId<HTMLDivElement>("controls");
  const noticesRoot = byId<HTMLDivElement>("notices");
  const titleRoot = byId<HTMLDivElement>("title");
  const dialogsRoot = byId<HTMLDivElement>("dialogs");
  const mode = parseRenderMode(window.location.search);
  app.dataset.render = mode;
  app.dataset.screen = "boot";

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  // Préférences AVANT le rendu (qualité) ; pose aussi <html data-motion>.
  const prefs = createPrefsController(window, coarsePointer);
  const notify = createNotify(noticesRoot);

  const joystick = createJoystick(canvas, app);
  const input = createInput(window, joystick);
  input.setEnabled(false); // écran titre : aucune entrée transmise au jeu

  const audio = createAudio({ prefs: prefs.get(), scene: "title" });

  // Hôte de rendu : permet le repli 2D à chaud si le contexte WebGL est perdu en jeu.
  let host: RenderHost | null = null;
  let pendingContextLost = false;
  const onContextLost = (): void => {
    if (app.dataset.render !== "3d") return;
    if (!host) {
      pendingContextLost = true;
      return;
    }
    console.warn("[render] contexte WebGL perdu et non restauré : repli en 2D");
    app.dataset.render = "2d";
    host.swap(createRenderer(canvas));
    notify.setBanner("render", RENDER_FALLBACK_TEXT.context, { dismissible: true });
  };

  const [renderer, save] = await Promise.all([
    mode === "3d"
      ? loadRenderer3D(canvas, app, coarsePointer, notify, onContextLost, prefs.get().quality)
      : Promise.resolve(createRenderer(canvas)),
    bootSave(window, notify),
  ]);

  let booted = false;
  let onBooted: () => void = () => undefined;
  host = createRenderHost(renderer, {
    onFirstDraw: () => {
      app.dataset.renderReady = "1";
      if (!booted) {
        booted = true;
        onBooted();
      }
    },
  });
  const renderHost = host;
  if (pendingContextLost) {
    pendingContextLost = false;
    onContextLost();
  }
  // Réglages de présentation appliqués avant la première image.
  renderHost.setPresentation("title");
  renderHost.setReducedMotion(prefs.reducedMotion());
  const chosenQuality = prefs.get().quality;
  if (chosenQuality !== null) renderHost.setQuality(chosenQuality);

  // --- Tutoriel (progression dans les préférences) ---
  const tutorial = (): TutorialProgress => prefs.get().tutorial;
  function setTutorial(next: TutorialProgress): void {
    const cur = prefs.get().tutorial;
    if (next.status === cur.status && next.done === cur.done) return;
    prefs.update({ tutorial: { status: next.status, done: next.done } });
  }

  // --- HUD + carte de l'aube + tutoriel + flèche + ambiance : à chaque image ---
  const baseHud = createHud(hudRoot);
  const tutorialCard = createTutorialCard(tutorialRoot, coarsePointer, () => onSkipTutorial());
  let screens: () => { screen: ScreenId; ticking: boolean; hud: boolean } = () => ({
    screen: "boot",
    ticking: false,
    hud: false,
  });
  const hud: Hud = {
    update(state) {
      const sc = screens();
      if (sc.hud) {
        baseHud.update(state);
        notify.updateCard(state);
        const step = currentStep(tutorial(), state);
        tutorialCard.update(step, step ? stepNumber(step) : 0, TUTORIAL_STEPS.length, step ? stepHint(step, state) : null);
        renderHost.setGuide(step ? guideTarget(step, state) : null);
      } else {
        tutorialCard.update(null, 0, 0, null);
        renderHost.setGuide(null);
      }
      audio.setAmbience(ambienceParams(state));
    },
    reset() {
      baseHud.reset?.();
      notify.reset();
    },
  };

  const onTick = (prev: Readonly<GameState>, curr: Readonly<GameState>): void => {
    for (const e of detectUiEvents(prev, curr)) {
      toastFor(e, notify);
      if (e.type === "pickup") audio.play("pop");
      else if (e.type === "tentBuilt") audio.play("build");
    }
    const t0 = tutorial();
    const t1 = observeTick(t0, prev, curr);
    if (t1 !== t0) {
      setTutorial(t1);
      if (t1.status === "done") notify.toast("Tutoriel terminé !", { kind: "success", key: "tutorialDone", icon: "circle-check" });
    }
  };

  const game = startGame({ initialState: save.initialState, renderer: renderHost, hud, input, onTick });
  game.setPaused(true);

  // --- Interface : titre, boutons, dialogues ---
  function toggleMute(): void {
    prefs.update({ muted: !prefs.get().muted });
  }

  const controls = createGameControls(controlsRoot, {
    onPause: () => controller.dispatch({ type: "open", panel: "pause" }),
    onToggleMute: toggleMute,
  });

  const title = createTitleScreen(titleRoot, {
    onContinue: () => startPlaying(),
    onNewGame: () => titleNewGame(),
    onSettings: () => controller.dispatch({ type: "open", panel: "settings" }),
    onCredits: () => controller.dispatch({ type: "open", panel: "credits" }),
    onToggleMute: toggleMute,
  });

  const pause = createPauseMenu(dialogsRoot, {
    onResume: () => controller.dispatch({ type: "resume" }),
    onSettings: () => controller.dispatch({ type: "open", panel: "settings" }),
    onExport: () => save.exportCurrent(),
    onImport: async (file) => {
      const ok = await save.importFile(file);
      if (ok) controller.dispatch({ type: "resume" });
      return ok;
    },
    onNewGame: async () => {
      const ok = await save.newGame();
      if (ok) controller.dispatch({ type: "resume" });
      return ok;
    },
    onExportDamaged: () => save.exportDamaged(),
    hasDamaged: () => save.hasDamaged(),
    replaceBlockedReason: () => save.replaceBlockedReason(),
    onToTitle: () => {
      save.flush();
      controller.dispatch({ type: "toTitle" });
    },
    onToggleMute: toggleMute,
  });

  const settings = createSettingsPanel(dialogsRoot, {
    onBack: () => controller.dispatch({ type: "back" }),
    onQuality: (q) => prefs.update({ quality: q }),
    onFullscreen: (on) => {
      prefs.update({ fullscreen: on });
      applyFullscreen(on);
    },
    onMuted: (m) => prefs.update({ muted: m }),
    onSfxVolume: (v) => prefs.update({ sfxVolume: v }),
    onSfxTest: () => audio.play("click"),
    onAmbienceVolume: (v) => prefs.update({ ambienceVolume: v }),
    onReducedMotion: (m) => prefs.update({ reducedMotion: m }),
  });

  const credits = createCreditsPanel(dialogsRoot, () => controller.dispatch({ type: "back" }));
  const confirm = createConfirmDialog(dialogsRoot);

  const controller = createScreenController({
    game,
    input,
    renderer: renderHost,
    audio,
    notify,
    app,
    hudElements: [hudRoot, controlsRoot],
    underPanels: [canvas, hudRoot, tutorialRoot, controlsRoot, titleRoot],
    title: {
      show: () => {
        refreshTitle();
        title.show();
      },
      hide: () => title.hide(),
    },
    panels: { pause, settings, credits },
    confirm: {
      open: () => confirm.view.open(),
      close: () => confirm.view.close(),
      setCovered: (c) => confirm.view.setCovered(c),
      set: (m, l, o) => confirm.set(m, l, o),
      onAnswer: (fn) => confirm.onAnswer(fn),
    },
  });
  screens = () => {
    const s = controller.state();
    return { screen: s.screen, ticking: isTicking(s), hud: showsHud(s) };
  };

  function refreshTitle(): void {
    title.refresh({ continueInfo: save.continueInfo(), replaceBlockedReason: save.replaceBlockedReason() });
  }

  function refreshSettings(): void {
    const p = prefs.get();
    settings.set({
      quality: prefs.quality(),
      fullscreen: isFullscreen(),
      fullscreenAvailable: fullscreenAvailable(),
      muted: p.muted,
      sfxVolume: p.sfxVolume,
      ambienceVolume: p.ambienceVolume,
      reducedMotion: p.reducedMotion,
    });
  }

  function applyPrefs(): void {
    const p = prefs.get();
    audio.setPrefs({ muted: p.muted, sfxVolume: p.sfxVolume, ambienceVolume: p.ambienceVolume });
    renderHost.setReducedMotion(prefs.reducedMotion());
    if (p.quality !== null) renderHost.setQuality(p.quality);
    title.setMuted(p.muted);
    controls.setMuted(p.muted);
    pause.setMuted(p.muted);
    refreshSettings();
  }
  prefs.subscribe(applyPrefs);
  applyPrefs();
  document.addEventListener("fullscreenchange", () => {
    const on = isFullscreen();
    if (prefs.get().fullscreen !== on) prefs.update({ fullscreen: on });
    refreshSettings();
  });

  // --- Lancement de la partie (clic = geste utilisateur) ---
  let starting = false;
  function startPlaying(): void {
    const s = controller.state();
    if (starting || s.screen !== "title" || s.panels.length > 0) return;
    starting = true;
    try {
      audio.unlock();
      if (prefs.get().fullscreen) applyFullscreen(true);
      setTutorial(startTutorial(skipIfAdvanced(tutorial(), game.state)));
      save.markPlayed();
      controller.dispatch({ type: "play" });
    } finally {
      starting = false;
    }
  }

  async function titleNewGame(): Promise<void> {
    if (save.continueInfo() === null) {
      // Aucune partie à perdre : on démarre l'état de démarrage, sans écriture de plus.
      startPlaying();
      return;
    }
    if (!(await save.newGame())) return;
    setTutorial(restartForNewGame(tutorial()));
    startPlaying();
  }

  async function onSkipTutorial(): Promise<void> {
    const ok = await controller.confirm("Passer le tutoriel ? Il ne reviendra pas.", "Passer le tutoriel", {
      title: "Tutoriel",
    });
    if (ok) setTutorial(skipTutorial(tutorial()));
  }

  // --- Sauvegarde ---
  save.attach({
    game,
    confirm: (message, label) => controller.confirm(message, label, { danger: true }),
    onPersistenceChange: () => {
      pause.refresh();
      if (controller.state().screen === "title") refreshTitle();
    },
    onReplaced: (origin) => {
      if (origin === "newGame") setTutorial(restartForNewGame(tutorial()));
      else setTutorial(skipIfAdvanced(tutorial(), game.state));
      if (controller.state().screen === "title") refreshTitle();
    },
  });

  // --- Touches globales ---
  installGlobalKeys(window, {
    onEscape: () => controller.dispatch({ type: "escape" }),
    onPauseKey: () => {
      const s = controller.state();
      // P : seulement la pause (ouvrir en jeu, refermer quand elle est au sommet).
      if (s.screen === "game" && (s.panels.length === 0 || s.panels.at(-1) === "pause")) {
        controller.dispatch({ type: "escape" });
      }
    },
    onToggleMute: toggleMute,
  });
  audio.bindClicks(app);

  // Zones couvertes par le DOM : le calque du rendu n'y dessine ni libellés ni flèche.
  watchScreenInsets(canvas, hudRoot, (insets) => renderHost.setScreenInsets(insets), [
    controlsRoot,
    tutorialRoot,
    noticesRoot,
  ]);

  // Lecture e2e (production comprise) : fonctions gelées qui renvoient des nombres / chaînes.
  const info = Object.freeze({
    tick: (): number => game.state.tick,
    screen: (): ScreenId => controller.state().screen,
    ticking: (): boolean => isTicking(controller.state()),
  });
  Object.defineProperty(window, "__gameInfo", { value: info, writable: false, configurable: false, enumerable: false });

  if (import.meta.env.DEV) {
    // Accès console en lecture seule pour le débogage.
    (window as unknown as { __game: typeof game }).__game = game;
  }

  // Écran titre après la première image (ou tout de suite si elle a déjà eu lieu).
  onBooted = () => controller.dispatch({ type: "booted" });
  // (Onglet caché au démarrage : aucune image tant qu'il l'est ; le titre attend la première.)
  if (booted) onBooted();
}

main().catch((e: unknown) => {
  console.error("[main] démarrage impossible", e);
});
