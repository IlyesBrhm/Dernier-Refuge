// Panneau « Crédits » (écran titre). Contenu lu depuis CREDITS.md (`?raw`, intégré au bundle) et
// construit UNIQUEMENT avec textContent (jamais innerHTML) : aucune injection HTML possible.
// Liens externes : target="_blank" rel="noopener".

import credits from "../../CREDITS.md?raw";
import { parseCreditsMd, type CreditsBlock, type CreditsInline } from "./credits-md";
import { createDialog, makeButton, type DialogView } from "./dialog";

function renderInlines(parent: HTMLElement, inlines: readonly CreditsInline[]): void {
  for (const x of inlines) {
    if (x.type === "text") {
      parent.appendChild(document.createTextNode(x.text));
    } else if (x.type === "strong") {
      const b = document.createElement("strong");
      b.textContent = x.text;
      parent.appendChild(b);
    } else if (x.type === "code") {
      const c = document.createElement("code");
      c.textContent = x.text;
      parent.appendChild(c);
    } else {
      const a = document.createElement("a");
      a.href = x.href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = x.text;
      parent.appendChild(a);
    }
  }
}

export function renderCredits(blocks: readonly CreditsBlock[]): HTMLElement {
  const root = document.createElement("div");
  root.className = "credits parchment";
  for (const b of blocks) {
    if (b.type === "heading") {
      // Le titre du panneau est le h2 : le document commence en h3.
      if (b.level === 1) continue;
      const h = document.createElement(b.level === 2 ? "h3" : "h4");
      h.className = "credits__heading";
      renderInlines(h, b.inlines);
      root.appendChild(h);
    } else if (b.type === "paragraph") {
      const p = document.createElement("p");
      p.className = "credits__text";
      renderInlines(p, b.inlines);
      root.appendChild(p);
    } else {
      const ul = document.createElement("ul");
      ul.className = "credits__list";
      for (const item of b.items) {
        const li = document.createElement("li");
        renderInlines(li, item);
        ul.appendChild(li);
      }
      root.appendChild(ul);
    }
  }
  return root;
}

export interface CreditsPanel {
  readonly view: DialogView;
  open(): void;
  close(): void;
  setCovered(c: boolean): void;
}

export function createCreditsPanel(container: HTMLElement, onBack: () => void): CreditsPanel {
  const view = createDialog(container, { id: "credits", title: "Crédits", className: "panel--wide", onBack });
  let built = false;
  const close = makeButton("Fermer", "secondary", "x");
  close.classList.add("btn--block");
  close.addEventListener("click", onBack);
  return {
    view,
    open(): void {
      if (!built) {
        built = true;
        view.body.append(renderCredits(parseCreditsMd(credits)), close);
      }
      view.open();
    },
    close: () => view.close(),
    setCovered: (c) => view.setCovered(c),
  };
}
