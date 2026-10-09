// Bilan de l'aube (docs/design/day-night.md §4.8) : panneau accessible affiché UNE fois par aube,
// tant que la sous-phase de lumière est « dawn » et que le core fournit un bilan (`nightReport`).
// Lecture seule : le numéro de la dernière nuit montrée / fermée est retenu côté UI (pas dans l'état).
//
// Accessibilité : le panneau est une région nommée par son titre (aria-labelledby) ; seule la zone
// titre + liste est « live » (le bouton Fermer n'est pas annoncé). Le focus n'est jamais déplacé.
// La zone live est vidée à l'apparition du panneau puis remplie à l'image suivante : un lecteur
// d'écran n'annonce pas toujours le contenu d'une région live qui apparaît déjà remplie.
//
// Remise à zéro : `reset()` (appelé à chaque remplacement d'état : nouvelle partie, import,
// chargement) et, par sécurité, dès que `state.tick` recule.

import { clockInfo, nightReport, type GameState, type NightReport } from "../core";

export interface DawnReport {
  update(state: Readonly<GameState>): void;
  /** Masque le panneau et oublie la nuit montrée (nouvelle partie, import). */
  reset(): void;
}

export function createDawnReport(root: HTMLElement): DawnReport {
  root.replaceChildren();
  root.className = "dawn-report";
  root.removeAttribute("aria-live");
  root.setAttribute("role", "region");
  root.hidden = true;

  const live = document.createElement("div");
  live.className = "dawn-live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  const title = document.createElement("h2");
  title.className = "dawn-title";
  title.id = "dawn-report-title";
  root.setAttribute("aria-labelledby", title.id);
  const list = document.createElement("ul");
  list.className = "dawn-list";
  const rows = {
    paid: document.createElement("li"),
    cold: document.createElement("li"),
    earned: document.createElement("li"),
    burned: document.createElement("li"),
  };
  list.append(rows.paid, rows.cold, rows.earned, rows.burned);
  live.append(title, list);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "dawn-close";
  close.textContent = "Fermer";
  root.append(live, close);

  /** Nuit actuellement affichée (null = rien), et dernière nuit fermée ou dont l'aube est passée. */
  let shown: number | null = null;
  let done: number | null = null;
  /** Bilan à écrire dans la zone live à l'image suivante (panneau déjà visible, zone vide). */
  let pending: NightReport | null = null;
  let lastTick: number | null = null;

  function clearTexts(): void {
    title.textContent = "";
    for (const li of Object.values(rows)) li.textContent = "";
  }

  function render(r: NightReport): void {
    title.textContent = `Nuit ${r.night} terminée`;
    rows.paid.textContent = `Payés à l'aube : ${r.sleepersPaid}`;
    rows.cold.textContent = `Partis à cause du froid : ${r.coldLeavers}`;
    rows.earned.textContent = `Bois gagné : +${r.woodEarned}`;
    rows.burned.textContent = `Bois brûlé : ${r.woodBurned}`;
  }

  function hide(): void {
    if (shown !== null) done = shown;
    shown = null;
    pending = null;
    if (!root.hidden) root.hidden = true;
  }

  function reset(): void {
    shown = null;
    done = null;
    pending = null;
    lastTick = null;
    root.hidden = true;
    clearTexts();
  }

  close.addEventListener("click", hide);

  return {
    update(state): void {
      // Retour en arrière du temps (nouvelle partie, import d'une save plus ancienne) : on oublie tout.
      if (lastTick !== null && state.tick < lastTick) reset();
      lastTick = state.tick;

      if (pending) {
        render(pending);
        pending = null;
      }
      const s = state as GameState;
      const report = nightReport(s);
      const dawn = clockInfo(s).light === "dawn";
      if (!report || !dawn) {
        if (shown !== null) hide();
        return;
      }
      if (report.night === shown || report.night === done) return;
      shown = report.night;
      clearTexts();
      pending = report;
      root.hidden = false;
    },
    reset,
  };
}
