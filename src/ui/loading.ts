// Écran de chargement du rendu 3D (DOM). Aucun accès à l'état : l'app fournit l'avancement.

export interface LoadingScreen {
  /** Avancement dans [0, 1]. */
  setProgress(ratio: number): void;
  remove(): void;
}

export function createLoadingScreen(root: HTMLElement): LoadingScreen {
  const el = document.createElement("div");
  el.className = "loading";
  const panel = document.createElement("div");
  panel.className = "loading-panel";
  const title = document.createElement("p");
  title.className = "loading-title";
  title.id = "loading-title";
  title.textContent = "Chargement du camp…";
  const bar = document.createElement("div");
  bar.className = "loading-bar";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-labelledby", title.id);
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", "0");
  bar.setAttribute("aria-valuetext", "0 %");
  const fill = document.createElement("div");
  fill.className = "loading-fill";
  bar.appendChild(fill);
  panel.append(title, bar);
  el.appendChild(panel);
  root.appendChild(el);
  // Zone de jeu « occupée » pour les lecteurs d'écran tant que la 3D se charge.
  root.setAttribute("aria-busy", "true");

  let shown = -1;
  return {
    setProgress(ratio: number): void {
      const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0)) * 100);
      if (pct === shown) return;
      shown = pct;
      // transform seulement (ui-style.md §6) : aucune mise en page recalculée.
      fill.style.transform = `scaleX(${pct / 100})`;
      bar.setAttribute("aria-valuenow", String(pct));
      bar.setAttribute("aria-valuetext", `${pct} %`);
    },
    remove(): void {
      el.remove();
      root.removeAttribute("aria-busy");
    },
  };
}
