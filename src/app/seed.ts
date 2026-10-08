// Seed d'une partie (src/app uniquement : le core ne tire jamais de hasard réel).
// - Nouvelle partie : seed aléatoire (crypto.getRandomValues) ⇒ chaque partie est différente.
// - `?seed=<entier>` : partie de test rejouable à l'identique. Elle est TEMPORAIRE : elle ne charge pas
//   et n'écrase jamais la sauvegarde (cf. save-controller.ts). Retirer le paramètre pour retrouver sa partie.

/** Seed lu dans `?seed=` (entier sûr ramené à [0, 2^32-1]), ou null si absent / invalide. */
export function readSeedParam(search: string): number | null {
  const raw = new URLSearchParams(search).get("seed");
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n >>> 0 : null;
}

/** Seed aléatoire uniforme dans [0, 2^32-1]. */
export function randomSeed(c: Pick<Crypto, "getRandomValues"> | undefined = globalThis.crypto): number {
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return (buf[0] ?? 0) >>> 0;
  }
  // Secours (navigateur très ancien) : qualité moindre, sans incidence sur l'anti-triche.
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}
