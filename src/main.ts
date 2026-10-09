// Point d'entrée navigateur : câble rendu, HUD, entrées, sauvegarde, menu et boucle de jeu.
// Démarrage asynchrone : le verrou multi-onglets (Web Locks) répond de façon asynchrone avant le
// chargement de la sauvegarde (cf. src/app/save-controller.ts).
// Rendu : 2D par défaut ; `?render=3d` charge À LA DEMANDE (import dynamique) le prototype three.js,
// avec repli automatique en 2D (WebGL absent, modèles en échec, délai dépassé, contexte perdu).
import "./styles/main.css";
import { startGame } from "./app/game";
import { createInput } from "./app/input";
import { createRenderHost, type RenderHost } from "./app/render-host";
import { parseRenderMode } from "./app/render-mode";
import { bootSave } from "./app/save-controller";
import { watchScreenInsets } from "./app/screen-insets";
import { createRenderer, type Renderer } from "./render/renderer";
import { isRender3DError, type Render3DFailure } from "./render/render3d-errors";
import { createHud } from "./ui/hud";
import { createJoystick } from "./ui/joystick";
import { createLoadingScreen } from "./ui/loading";
import { createMenu } from "./ui/menu";
import { createNotices, type Notices } from "./ui/notices";

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
  notices: Notices,
  onContextLost: () => void,
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

async function main(): Promise<void> {
  const canvas = byId<HTMLCanvasElement>("game");
  const app = byId<HTMLDivElement>("app");
  const hudRoot = byId<HTMLDivElement>("hud");
  const mode = parseRenderMode(window.location.search);
  app.dataset.render = mode;

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const joystick = createJoystick(canvas, app);
  const input = createInput(window, joystick);
  const hud = createHud(hudRoot, coarsePointer);
  const notices = createNotices(byId<HTMLDivElement>("notices"));

  // Hôte de rendu : permet le repli 2D à chaud si le contexte WebGL est perdu en jeu.
  let host: RenderHost | null = null;
  // Contexte perdu pendant que la sauvegarde se charge encore (hôte pas encore créé) : mémorisé,
  // le repli est fait juste après createRenderHost.
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
    notices.setBanner("render", RENDER_FALLBACK_TEXT.context, { dismissible: true });
  };

  // En 3D, chargement des modèles et de la sauvegarde en parallèle ; aucun tick avant que tout soit prêt.
  const [renderer, save] = await Promise.all([
    mode === "3d"
      ? loadRenderer3D(canvas, app, coarsePointer, notices, onContextLost)
      : Promise.resolve(createRenderer(canvas)),
    bootSave(window, notices),
  ]);
  host = createRenderHost(renderer, {
    onFirstDraw: () => {
      app.dataset.renderReady = "1";
    },
  });
  if (pendingContextLost) {
    pendingContextLost = false;
    onContextLost();
  }

  const game = startGame({ initialState: save.initialState, renderer: host, hud, input });

  const menuRoot = byId<HTMLDivElement>("menu");
  const menu = createMenu(
    menuRoot,
    {
      onOpen: () => {
        // Menu ouvert : jeu en pause, aucune touche ni geste transmis au jeu.
        input.setEnabled(false);
        game.setPaused(true);
      },
      onClose: () => {
        input.setEnabled(true);
        game.setPaused(false);
      },
      onExport: () => save.exportCurrent(),
      onImport: (file) => save.importFile(file),
      onNewGame: () => save.newGame(),
      onExportDamaged: () => save.exportDamaged(),
      hasDamaged: () => save.hasDamaged(),
      replaceBlockedReason: () => save.replaceBlockedReason(),
    },
    // Jeu et HUD inertes pendant le dialogue (les notifications restent annoncées).
    [canvas, hudRoot],
  );

  // Zones couvertes par le HUD et le bouton Menu : le calque 3D n'y dessine pas de libellés.
  const renderHost = host;
  watchScreenInsets(canvas, hudRoot, menuRoot, (insets) => renderHost.setScreenInsets(insets));

  save.attach({
    game,
    confirm: (message, label) => menu.confirm(message, label),
    onPersistenceChange: () => menu.refresh(),
  });

  if (import.meta.env.DEV) {
    // Accès console en lecture seule pour le débogage.
    (window as unknown as { __game: typeof game }).__game = game;
  }
}

main().catch((e: unknown) => {
  console.error("[main] démarrage impossible", e);
});
