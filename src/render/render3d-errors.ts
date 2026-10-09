// Erreurs du renderer 3D. Hors de src/render/three et sans import de three : `src/main.ts` peut
// l'importer statiquement sans tirer three.js dans le bundle d'entrée.

export type Render3DFailure = "webgl" | "assets" | "timeout";

export class Render3DError extends Error {
  readonly reason: Render3DFailure;

  constructor(reason: Render3DFailure, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "Render3DError";
    this.reason = reason;
  }
}

export function isRender3DError(e: unknown): e is Render3DError {
  return e instanceof Error && e.name === "Render3DError" && "reason" in e;
}
