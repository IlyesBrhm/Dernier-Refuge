// Point d'entrée navigateur : câble rendu, HUD, entrées et boucle de jeu.
import "./styles/main.css";
import { startGame } from "./app/game";
import { createInput } from "./app/input";
import { readSeed } from "./app/seed";
import { createRenderer } from "./render/renderer";
import { createHud } from "./ui/hud";
import { createJoystick } from "./ui/joystick";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`élément #${id} introuvable`);
  return el as T;
}

const canvas = byId<HTMLCanvasElement>("game");
const app = byId<HTMLDivElement>("app");
const hudRoot = byId<HTMLDivElement>("hud");

const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
const joystick = createJoystick(canvas, app);
const input = createInput(window, joystick);
const renderer = createRenderer(canvas);
const hud = createHud(hudRoot, coarsePointer);

const seed = readSeed(window.location.search);
const game = startGame({ seed, renderer, hud, input });

if (import.meta.env.DEV) {
  // Accès console en lecture seule pour le débogage.
  (window as unknown as { __game: typeof game }).__game = game;
}
