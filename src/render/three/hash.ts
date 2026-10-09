// Hachage entier déterministe pour les variantes visuelles (modèle, teinte, rotation, jitter).
// Pur, sans three ni horloge ni Math.random : le décor ne « saute » jamais d'un chargement à l'autre.

/** Mélangeur 32 bits (lowbias32, C. Wellons) : bonne avalanche, résultat non signé. */
function mix(x: number): number {
  let h = x | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Hache un ou deux entiers (ids, coordonnées de tuile, éventuellement négatives) en un entier
 * non signé 32 bits. `hash32(id)` et `hash32(tx, ty)` sont stables entre exécutions.
 */
export function hash32(a: number, b?: number): number {
  let h = mix((a | 0) ^ 0x9e3779b9);
  if (b !== undefined) h = mix(h ^ Math.imul((b | 0) ^ 0x85ebca6b, 0xc2b2ae35));
  return h;
}

/** Entier haché ⇒ réel dans [0, 1[. */
export function hashUnit(h: number): number {
  return (h >>> 0) / 4294967296;
}
