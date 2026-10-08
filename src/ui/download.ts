// Téléchargement d'un texte en fichier (Blob + <a download>). Aucune donnée ne quitte la machine.

const REVOKE_DELAY_MS = 10_000;

export function downloadText(fileName: string, text: string, mime = "application/json"): boolean {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Révocation différée : certains navigateurs lisent l'URL après le clic.
    window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    return true;
  } catch {
    return false;
  }
}
