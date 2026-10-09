// Zone de notifications DOM (docs/design/save.md §4) : un bandeau persistant (un seul message d'état à
// la fois, le plus prioritaire) + des toasts courts. Annoncés aux lecteurs d'écran : le conteneur
// porte role="status" / aria-live="polite" (index.html). Aucun accès à l'état ni au stockage : l'app
// fournit les textes.

/** Messages d'état persistants, du plus au moins prioritaire. */
export const BANNER_PRIORITY = ["temporary", "quarantine", "notOwner", "unavailable", "corrupt", "render"] as const;
export type BannerKey = (typeof BANNER_PRIORITY)[number];

export interface BannerOptions {
  /** Affiche un bouton « Fermer » (le message disparaît jusqu'au prochain `setBanner`). */
  dismissible?: boolean;
}

export interface Notices {
  /** Pose (texte) ou retire (null) un message d'état. Idempotent : aucun effet si rien ne change. */
  setBanner(key: BannerKey, text: string | null, opts?: BannerOptions): void;
  hasBanner(key: BannerKey): boolean;
  /** Message court, disparaît seul. Un toast identique déjà affiché est prolongé, pas dupliqué. */
  toast(text: string): void;
}

const TOAST_MS = 4000;
const MAX_TOASTS = 3;

interface BannerEntry {
  text: string;
  dismissible: boolean;
}

export function createNotices(root: HTMLElement): Notices {
  root.replaceChildren();
  const banner = document.createElement("div");
  banner.className = "notice-banner";
  banner.hidden = true;
  const bannerText = document.createElement("span");
  bannerText.className = "notice-text";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "notice-close";
  close.setAttribute("aria-label", "Fermer le message");
  close.textContent = "×";
  banner.append(bannerText, close);

  const toasts = document.createElement("div");
  toasts.className = "notice-toasts";
  root.append(banner, toasts);

  const entries = new Map<BannerKey, BannerEntry>();
  let shown: BannerKey | null = null;

  function render(): void {
    const top = BANNER_PRIORITY.find((k) => entries.has(k)) ?? null;
    const entry = top !== null ? entries.get(top) : undefined;
    if (!entry || top === null) {
      shown = null;
      banner.hidden = true;
      bannerText.textContent = "";
      return;
    }
    shown = top;
    if (bannerText.textContent !== entry.text) bannerText.textContent = entry.text;
    close.hidden = !entry.dismissible;
    banner.classList.toggle("is-dismissible", entry.dismissible);
    banner.hidden = false;
  }

  close.addEventListener("click", () => {
    if (shown !== null && entries.get(shown)?.dismissible) {
      entries.delete(shown);
      render();
    }
  });

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
      render();
    },

    hasBanner(key): boolean {
      return entries.has(key);
    },

    toast(text): void {
      for (const el of Array.from(toasts.children)) {
        if (el instanceof HTMLElement && el.textContent === text) {
          restartTimer(el);
          return;
        }
      }
      while (toasts.children.length >= MAX_TOASTS) toasts.firstElementChild?.remove();
      const el = document.createElement("div");
      el.className = "notice-toast";
      el.textContent = text;
      toasts.appendChild(el);
      restartTimer(el);
    },
  };
}

const timers = new WeakMap<HTMLElement, number>();

function restartTimer(el: HTMLElement): void {
  const prev = timers.get(el);
  if (prev !== undefined) window.clearTimeout(prev);
  timers.set(
    el,
    window.setTimeout(() => el.remove(), TOAST_MS),
  );
}
