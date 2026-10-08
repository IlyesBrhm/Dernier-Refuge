// Hash 64 bits synchrone (cyrb53 étendu : les deux mots de 32 bits sont conservés).
// Synchrone car l'autosave de `pagehide` ne peut pas attendre une promesse (crypto.subtle est async).
// N'EST PAS cryptographique : il détecte l'édition naïve et la corruption, pas un tricheur qui lit le code.
// GELÉ POUR LE FORMAT v1 : toute modification invalide toutes les sauvegardes existantes.

function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** 16 caractères hexadécimaux minuscules. */
export function hash64(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return hex32(h2) + hex32(h1);
}
