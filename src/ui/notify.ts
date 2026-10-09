// Notifications (docs/design/ui-polish.md §1.7) : trois emplacements empilés en colonne dans #notices,
// jamais de chevauchement, au plus 1 bandeau + 1 carte + 1 toast visibles.
// - Bandeau : états de sauvegarde / rendu (API `setBanner`, mêmes clés et priorités qu'avant), persistant ;
// - Carte : bilan de l'aube (parchemin), une fois par aube tant que la lumière est « dawn » ;
// - Toast : messages courts, file pure `notify-queue.ts`.
// Régions live créées vides dès le démarrage : role="status" aria-live="polite" (bandeau, carte, toasts
// info / succès / alerte) et role="alert" (danger). Chaque type a son icône (jamais la couleur seule).
// Aucun accès au stockage ni à applyCommand : l'app fournit les textes ; la carte lit l'état (lecture seule).

import { clockInfo, nightReport, type GameState, type NightReport } from "../core";
import { icon, type IconName } from "./icons";
import {
  advanceToasts,
  EMPTY_TOASTS,
  pushToast,
  type Toast,
  type ToastKind,
  type ToastQueue,
} from "./notify-queue";

export type { ToastKind };

/** Messages d'état persistants, du plus au moins prioritaire. */
export const BANNER_PRIORITY = ["temporary", "quarantine", "notOwner", "unavailable", "corrupt", "render"] as const;
export type BannerKey = (typeof BANNER_PRIORITY)[number];

export interface BannerOptions {
  /** Affiche un bouton « Fermer » (le message disparaît jusqu'au prochain `setBanner`). */
  dismissible?: boolean;
}

export interface ToastOptions {
  kind?: ToastKind;
  /** Clé de dédoublonnage (défaut : le texte). */
  key?: string;
  icon?: IconName;
}

export interface Notices {
  /** Pose (texte) ou retire (null) un message d'état. Idempotent : aucun effet si rien ne change. */
  setBanner(key: BannerKey, text: string | null, opts?: BannerOptions): void;
  hasBanner(key: BannerKey): boolean;
  /** Message court, disparaît seul. Même clé ⇒ mis à jour et prolongé, pas dupliqué. */
  toast(text: string, opts?: ToastOptions): void;
}

export interface Notify extends Notices {
  /** Pause en jeu : minuteurs des toasts gelés. */
  setFrozen(frozen: boolean): void;
  /** Un panneau est ouvert : la carte reste en place mais devient inerte et masquée. */
  setCovered(covered: boolean): void;
  /** Bilan de l'aube : lit l'état à chaque image (DOM touché seulement si ça change). */
  updateCard(state: Readonly<GameState>): void;
  /** Masque la carte (écran titre) sans oublier quelle nuit a été montrée. */
  hideCard(): void;
  /** État remplacé : la carte oublie la nuit montrée. */
  reset(): void;
}

const KIND_ICON: Record<ToastKind, IconName> = {
  info: "info",
  success: "circle-check",
  warning: "triangle-alert",
  danger: "triangle-alert",
};

const KIND_LABEL: Record<ToastKind, string> = {
  info: "Information",
  success: "Succès",
  warning: "Attention",
  danger: "Danger",
};

const TICK_MS = 100;

function liveRegion(className: string, role: "status" | "alert"): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  el.setAttribute("role", role);
  el.setAttribute("aria-live", role === "alert" ? "assertive" : "polite");
  el.setAttribute("aria-atomic", "true");
  return el;
}

export function createNotify(root: HTMLElement): Notify {
  root.replaceChildren();

  // --- Emplacements (ordre visuel : carte, toast, bandeau en bas) ---
  const cardSlot = document.createElement("div");
  cardSlot.className = "notice-slot notice-slot--card";
  const toastPolite = liveRegion("notice-slot notice-slot--toast", "status");
  const toastAlert = liveRegion("notice-slot notice-slot--alert", "alert");
  const bannerSlot = liveRegion("notice-slot notice-slot--banner", "status");
  root.append(cardSlot, toastPolite, toastAlert, bannerSlot);

  // --- Bandeau ---
  const banner = document.createElement("div");
  banner.className = "notice-banner";
  banner.hidden = true;
  const bannerIcon = document.createElement("span");
  bannerIcon.className = "notice-banner__icon";
  const bannerText = document.createElement("span");
  bannerText.className = "notice-banner__text";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn btn--icon notice-banner__close";
  close.setAttribute("aria-label", "Fermer le message");
  close.title = "Fermer le message";
  close.appendChild(icon("x", 20));
  banner.append(bannerIcon, bannerText, close);
  bannerSlot.appendChild(banner);

  const entries = new Map<BannerKey, { text: string; dismissible: boolean }>();
  let shownBanner: BannerKey | null = null;
  let bannerIconName: IconName | null = null;

  function renderBanner(): void {
    const top = BANNER_PRIORITY.find((k) => entries.has(k)) ?? null;
    const entry = top !== null ? entries.get(top) : undefined;
    if (!entry || top === null) {
      shownBanner = null;
      banner.hidden = true;
      bannerText.textContent = "";
      return;
    }
    shownBanner = top;
    const name: IconName = top === "render" ? "info" : "triangle-alert";
    if (name !== bannerIconName) {
      bannerIconName = name;
      bannerIcon.replaceChildren(icon(name, 24));
    }
    banner.dataset.banner = top;
    if (bannerText.textContent !== entry.text) bannerText.textContent = entry.text;
    close.hidden = !entry.dismissible;
    banner.hidden = false;
  }

  close.addEventListener("click", () => {
    if (shownBanner !== null && entries.get(shownBanner)?.dismissible) {
      entries.delete(shownBanner);
      renderBanner();
    }
  });

  // --- Toasts ---
  let queue: ToastQueue = EMPTY_TOASTS;
  let frozen = false;
  let timer: number | null = null;
  let last = 0;
  let shownToast: { id: number; el: HTMLElement; text: string; kind: ToastKind; icon: string } | null = null;

  function toastIcon(t: Toast): IconName {
    return (t.icon as IconName | undefined) ?? KIND_ICON[t.kind];
  }

  function buildToast(t: Toast): HTMLElement {
    const el = document.createElement("div");
    el.className = `toast toast--${t.kind}`;
    el.dataset.kind = t.kind;
    el.dataset.key = t.key;
    el.appendChild(icon(toastIcon(t), 24));
    const kindLabel = document.createElement("span");
    kindLabel.className = "sr-only";
    kindLabel.textContent = `${KIND_LABEL[t.kind]} : `;
    const text = document.createElement("span");
    text.className = "toast__text";
    text.textContent = t.text;
    el.append(kindLabel, text);
    return el;
  }

  function leave(el: HTMLElement): void {
    if (document.documentElement.dataset.motion === "reduce") {
      el.remove();
      return;
    }
    el.classList.add("is-leaving");
    el.setAttribute("aria-hidden", "true");
    window.setTimeout(() => el.remove(), 160);
  }

  function renderToast(): void {
    const t = queue.current;
    if (!t) {
      if (shownToast) leave(shownToast.el);
      shownToast = null;
      return;
    }
    const ic = toastIcon(t);
    if (shownToast && shownToast.id === t.id) {
      if (shownToast.text !== t.text || shownToast.kind !== t.kind || shownToast.icon !== ic) {
        // Même clé mise à jour : on remplace l'élément (annonce du nouveau texte).
        const el = buildToast(t);
        shownToast.el.replaceWith(el);
        (t.kind === "danger" ? toastAlert : toastPolite).appendChild(el);
        shownToast = { id: t.id, el, text: t.text, kind: t.kind, icon: ic };
      }
      return;
    }
    if (shownToast) shownToast.el.remove();
    const el = buildToast(t);
    (t.kind === "danger" ? toastAlert : toastPolite).appendChild(el);
    shownToast = { id: t.id, el, text: t.text, kind: t.kind, icon: ic };
  }

  function step(): void {
    const now = performance.now();
    const dt = now - last;
    last = now;
    const hold = shownToast !== null && (shownToast.el.matches(":hover") || shownToast.el.contains(document.activeElement));
    queue = advanceToasts(queue, dt, { frozen: frozen || document.hidden, hold });
    renderToast();
    if (!queue.current && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function ensureTimer(): void {
    if (timer !== null || !queue.current) return;
    last = performance.now();
    timer = window.setInterval(step, TICK_MS);
  }

  // --- Carte : bilan de l'aube ---
  const card = document.createElement("section");
  card.className = "notice-card parchment";
  card.id = "dawn-report";
  card.hidden = true;
  const live = liveRegion("notice-card__live", "status");
  const cardTitle = document.createElement("h2");
  cardTitle.className = "parchment__title";
  cardTitle.id = "dawn-report-title";
  card.setAttribute("aria-labelledby", cardTitle.id);
  const list = document.createElement("ul");
  list.className = "notice-card__list";
  const rows = {
    paid: document.createElement("li"),
    cold: document.createElement("li"),
    earned: document.createElement("li"),
    burned: document.createElement("li"),
  };
  list.append(rows.paid, rows.cold, rows.earned, rows.burned);
  live.append(cardTitle, list);
  const cardClose = document.createElement("button");
  cardClose.type = "button";
  cardClose.className = "btn btn--secondary btn--block";
  cardClose.textContent = "Fermer";
  card.append(live, cardClose);
  cardSlot.appendChild(card);
  root.dataset.ready = "1";

  let shownNight: number | null = null;
  let doneNight: number | null = null;
  let pendingReport: NightReport | null = null;
  let lastTick: number | null = null;

  function clearCardTexts(): void {
    cardTitle.textContent = "";
    for (const li of Object.values(rows)) li.textContent = "";
  }

  function renderCard(r: NightReport): void {
    cardTitle.textContent = `Nuit ${r.night} terminée`;
    rows.paid.textContent = `Payés à l'aube : ${r.sleepersPaid}`;
    rows.cold.textContent = `Partis à cause du froid : ${r.coldLeavers}`;
    rows.earned.textContent = `Bois gagné : +${r.woodEarned}`;
    rows.burned.textContent = `Bois brûlé : ${r.woodBurned}`;
  }

  function hideCardFor(): void {
    if (shownNight !== null) doneNight = shownNight;
    shownNight = null;
    pendingReport = null;
    if (!card.hidden) card.hidden = true;
  }

  function resetCard(): void {
    shownNight = null;
    doneNight = null;
    pendingReport = null;
    lastTick = null;
    card.hidden = true;
    clearCardTexts();
  }

  cardClose.addEventListener("click", hideCardFor);

  return {
    setBanner(key, text, opts = {}): void {
      const prev = entries.get(key);
      if (text === null) {
        if (!prev) return;
        entries.delete(key);
      } else {
        const dismissible = opts.dismissible ?? false;
        if (prev && prev.text === text && prev.dismissible === dismissible) return;
        entries.set(key, { text, dismissible });
      }
      renderBanner();
    },

    hasBanner: (key) => entries.has(key),

    toast(text, opts = {}): void {
      const input = { key: opts.key ?? text, kind: opts.kind ?? "info", text, ...(opts.icon ? { icon: opts.icon } : {}) };
      queue = pushToast(queue, input);
      renderToast();
      ensureTimer();
    },

    setFrozen(f): void {
      frozen = f;
      // Pas de temps compté pendant le gel.
      last = performance.now();
    },

    setCovered(covered): void {
      card.inert = covered;
      cardSlot.classList.toggle("is-covered", covered);
    },

    updateCard(state): void {
      if (lastTick !== null && state.tick < lastTick) resetCard();
      lastTick = state.tick;
      if (pendingReport) {
        renderCard(pendingReport);
        pendingReport = null;
      }
      const s = state as GameState;
      const report = nightReport(s);
      const dawn = clockInfo(s).light === "dawn";
      if (!report || !dawn) {
        if (shownNight !== null) hideCardFor();
        return;
      }
      if (card.hidden && shownNight === report.night) card.hidden = false; // retour du titre
      if (report.night === shownNight || report.night === doneNight) return;
      shownNight = report.night;
      clearCardTexts();
      // Région live vidée puis remplie à l'image suivante (annonce fiable).
      pendingReport = report;
      card.hidden = false;
    },

    hideCard(): void {
      if (!card.hidden) card.hidden = true;
    },

    reset(): void {
      resetCard();
    },
  };
}
