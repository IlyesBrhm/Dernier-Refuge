// Point d'entrée navigateur : câble rendu, HUD, entrées, sauvegarde, menu et boucle de jeu.
// Démarrage asynchrone : le verrou multi-onglets (Web Locks) répond de façon asynchrone avant le
// chargement de la sauvegarde (cf. src/app/save-controller.ts).
import "./styles/main.css";
import { startGame } from "./app/game";
import { createInput } from "./app/input";
import { bootSave } from "./app/save-controller";
import { createRenderer } from "./render/renderer";
import { createHud } from "./ui/hud";
import { createJoystick } from "./ui/joystick";
import { createMenu } from "./ui/menu";
import { createNotices } from "./ui/notices";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`élément #${id} introuvable`);
  return el as T;
}

async function main(): Promise<void> {
  const canvas = byId<HTMLCanvasElement>("game");
  const app = byId<HTMLDivElement>("app");
  const hudRoot = byId<HTMLDivElement>("hud");

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const joystick = createJoystick(canvas, app);
  const input = createInput(window, joystick);
  const renderer = createRenderer(canvas);
  const hud = createHud(hudRoot, coarsePointer);
  const notices = createNotices(byId<HTMLDivElement>("notices"));

  const save = await bootSave(window, notices);
  const game = startGame({ initialState: save.initialState, renderer, hud, input });

  const menu = createMenu(
    byId<HTMLDivElement>("menu"),
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
