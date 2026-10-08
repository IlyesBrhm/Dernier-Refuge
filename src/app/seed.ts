// Seed de la partie : `?seed=<entier>` dans l'URL, sinon constante par défaut.

export const DEFAULT_SEED = 20261008;

export function readSeed(search: string): number {
  const raw = new URLSearchParams(search).get("seed");
  if (raw === null || raw.trim() === "") return DEFAULT_SEED;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n >>> 0 : DEFAULT_SEED;
}
