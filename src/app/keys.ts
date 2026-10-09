// Raccourcis globaux (docs/design/ui-polish.md §1.1) :
// - Échap ⇒ événement `escape` (ferme le panneau du sommet, ou ouvre la pause en jeu) ;
// - P ⇒ la pause seulement (ouvre / referme la pause ; utile en plein écran où le navigateur garde Échap) ;
// - M ⇒ couper / rétablir le son.
// `e.repeat` ignoré ; modificateurs ignorés ; rien si le focus est dans un champ de saisie texte.
// Lettres lues par `e.key` (caractère produit) : P et M sont au même caractère en AZERTY et QWERTY,
// alors que `e.code === "KeyM"` est la touche « , » en AZERTY.

export interface GlobalKeyHandlers {
  /** Échap. */
  onEscape(): void;
  /** P : bascule de la pause (l'appelant décide si elle s'applique). */
  onPauseKey(): void;
  /** M. */
  onToggleMute(): void;
}

const NON_TEXT_INPUTS = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "file", "color"]);

/** Le focus est-il dans un champ où la frappe produit du texte ? */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return false;
}

export function installGlobalKeys(win: Window, h: GlobalKeyHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (isTextEntry(e.target)) return;
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      h.onEscape();
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : "";
    if (k === "p") {
      e.preventDefault();
      h.onPauseKey();
    } else if (k === "m") {
      e.preventDefault();
      h.onToggleMute();
    }
  };
  win.addEventListener("keydown", onKeyDown);
  return () => win.removeEventListener("keydown", onKeyDown);
}
