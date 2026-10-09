// Perte du contexte 2D d'un canvas (#game : rendu 2D ou calque du rendu 3D). Chromium peut perdre le
// contexte 2D accéléré quand le processus GPU est tué (ex. WebGL logiciel sous forte charge CPU) ; tant
// qu'il n'est pas restauré, il peint le canvas en BLANC avec une icône « canvas cassé » en haut à gauche,
// par-dessus toute la scène. On ne l'empêche pas (le navigateur restaure seul : l'événement n'est pas
// annulé), mais on :
// - masque le canvas pendant la perte (`data-context-lost`, cf. main.css : opacité 0, les gestes
//   restent captés) : fond sombre de la page, ou scène 3D visible si seul le calque est perdu ;
// - journalise un avertissement « [render] » (diagnostic e2e : perte du navigateur ≠ bug de rendu).
// Le dessin reprend tel quel après `contextrestored` (chaque image repart d'un canvas effacé).

export function watchCanvasContextLoss(canvas: HTMLCanvasElement, label: string): () => void {
  const onLost = (): void => {
    if (canvas.dataset.contextLost === "1") return;
    canvas.dataset.contextLost = "1";
    console.warn(`[render] contexte 2D perdu (${label}) : restauration laissée au navigateur`);
  };
  const onRestored = (): void => {
    if (canvas.dataset.contextLost !== "1") return;
    delete canvas.dataset.contextLost;
    console.warn(`[render] contexte 2D restauré (${label})`);
  };
  canvas.addEventListener("contextlost", onLost);
  canvas.addEventListener("contextrestored", onRestored);
  // L'attribut n'est PAS retiré ici : le canvas #game est partagé (calque 3D puis rendu 2D après un
  // repli) ; seul `contextrestored` dit que le contexte est revenu.
  return () => {
    canvas.removeEventListener("contextlost", onLost);
    canvas.removeEventListener("contextrestored", onRestored);
  };
}
