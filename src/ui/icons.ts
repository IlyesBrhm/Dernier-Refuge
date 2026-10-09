// Icônes de l'interface (docs/design/ui-style.md §4) : Lucide (ISC, src/ui/icons/lucide) + icônes maison
// dans le même style (src/ui/icons/custom). Fichiers SVG intégrés au bundle (`?raw`) : aucun téléchargement.
// Rendu : <svg aria-hidden="true" focusable="false" class="icon"> en `stroke="currentColor"` ; la couleur
// vient du texte. Une icône seule (bouton icône) porte un aria-label sur le BOUTON, jamais sur le SVG.

import axe from "./icons/lucide/axe.svg?raw";
import check from "./icons/lucide/check.svg?raw";
import cherry from "./icons/lucide/cherry.svg?raw";
import chevronLeft from "./icons/lucide/chevron-left.svg?raw";
import circleCheck from "./icons/lucide/circle-check.svg?raw";
import download from "./icons/lucide/download.svg?raw";
import flame from "./icons/lucide/flame.svg?raw";
import hammer from "./icons/lucide/hammer.svg?raw";
import house from "./icons/lucide/house.svg?raw";
import info from "./icons/lucide/info.svg?raw";
import keyboard from "./icons/lucide/keyboard.svg?raw";
import lock from "./icons/lucide/lock.svg?raw";
import maximize from "./icons/lucide/maximize.svg?raw";
import minimize from "./icons/lucide/minimize.svg?raw";
import moon from "./icons/lucide/moon.svg?raw";
import pause from "./icons/lucide/pause.svg?raw";
import play from "./icons/lucide/play.svg?raw";
import scrollText from "./icons/lucide/scroll-text.svg?raw";
import settings from "./icons/lucide/settings.svg?raw";
import skipForward from "./icons/lucide/skip-forward.svg?raw";
import snowflake from "./icons/lucide/snowflake.svg?raw";
import sparkles from "./icons/lucide/sparkles.svg?raw";
import sun from "./icons/lucide/sun.svg?raw";
import tent from "./icons/lucide/tent.svg?raw";
import triangleAlert from "./icons/lucide/triangle-alert.svg?raw";
import upload from "./icons/lucide/upload.svg?raw";
import users from "./icons/lucide/users.svg?raw";
import volume2 from "./icons/lucide/volume-2.svg?raw";
import volumeX from "./icons/lucide/volume-x.svg?raw";
import x from "./icons/lucide/x.svg?raw";
import fireOut from "./icons/custom/fire-out.svg?raw";
import wood from "./icons/custom/wood.svg?raw";

const SOURCES = {
  axe,
  check,
  cherry,
  "chevron-left": chevronLeft,
  "circle-check": circleCheck,
  download,
  flame,
  hammer,
  house,
  info,
  keyboard,
  lock,
  maximize,
  minimize,
  moon,
  pause,
  play,
  "scroll-text": scrollText,
  settings,
  "skip-forward": skipForward,
  snowflake,
  sparkles,
  sun,
  tent,
  "triangle-alert": triangleAlert,
  upload,
  users,
  "volume-2": volume2,
  "volume-x": volumeX,
  x,
  "fire-out": fireOut,
  wood,
} as const;

export type IconName = keyof typeof SOURCES;

/** Tailles autorisées (§4) : 16 HUD très étroit, 18 HUD étroit, 20 HUD, 24 boutons/toasts, 32 titres de carte. */
export type IconSize = 16 | 18 | 20 | 24 | 32;

const SVG_NS = "http://www.w3.org/2000/svg";
const templates = new Map<IconName, SVGSVGElement>();

function template(name: IconName): SVGSVGElement {
  const cached = templates.get(name);
  if (cached) return cached;
  const doc = new DOMParser().parseFromString(SOURCES[name], "image/svg+xml");
  const root = doc.documentElement;
  let svg: SVGSVGElement;
  if (root.namespaceURI === SVG_NS && root.nodeName.toLowerCase() === "svg") {
    svg = document.importNode(root, true) as unknown as SVGSVGElement;
  } else {
    // Fichier illisible (ne devrait pas arriver : fichiers du dépôt) : icône vide, jamais d'exception.
    svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
  }
  // La couleur vient du texte ; aucune couleur du fichier n'est conservée.
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.removeAttribute("class");
  templates.set(name, svg);
  return svg;
}

/** Crée une icône décorative (aria-hidden). */
export function icon(name: IconName, size: IconSize = 24, className?: string): SVGSVGElement {
  const svg = template(name).cloneNode(true) as SVGSVGElement;
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", className ? `icon icon--${name} ${className}` : `icon icon--${name}`);
  svg.dataset.icon = name;
  return svg;
}

/** Remplace l'icône d'un conteneur seulement si elle change (pas de DOM touché à chaque image). */
export function setIcon(host: Element, name: IconName, size: IconSize = 24): void {
  const current = host.querySelector<SVGSVGElement>(":scope > svg.icon");
  if (current && current.dataset.icon === name) return;
  const next = icon(name, size);
  if (current) current.replaceWith(next);
  else host.prepend(next);
}
