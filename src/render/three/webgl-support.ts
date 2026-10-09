// Détection WebGL sur un canvas JETABLE (le canvas du jeu n'est jamais touché par le test).
// three.js r170 exige WebGL 2 : WebGL 1 seul est signalé mais refusé par createRenderer3D.

export type WebGLSupport = "webgl2" | "webgl1" | null;

export function detectWebGL(): WebGLSupport {
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    if (gl2) {
      gl2.getExtension("WEBGL_lose_context")?.loseContext();
      return "webgl2";
    }
    const probe = document.createElement("canvas");
    const gl1 = (probe.getContext("webgl") ?? probe.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl1) {
      gl1.getExtension("WEBGL_lose_context")?.loseContext();
      return "webgl1";
    }
    return null;
  } catch {
    return null;
  }
}
