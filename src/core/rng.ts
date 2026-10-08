// RNG déterministe (mulberry32). L'état du RNG est un entier stocké dans GameState,
// ce qui rend chaque partie rejouable à l'identique et la sauvegarde exacte.

export type RngState = number;

export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

/** Retourne [valeur dans [0, 1[, nouvel état]. Ne mute rien. */
export function nextRandom(rng: RngState): [number, RngState] {
  const next = (rng + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Entier dans [min, max] inclus. */
export function nextInt(rng: RngState, min: number, max: number): [number, RngState] {
  const [r, next] = nextRandom(rng);
  return [min + Math.floor(r * (max - min + 1)), next];
}
