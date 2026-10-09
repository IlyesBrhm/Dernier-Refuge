// Formatage des nombres affichés (docs/design/ui-polish.md §1.8). Pur, ne lève jamais.
// - formatCount : forme courte du HUD, TRONQUÉE (jamais plus que ce qu'on a), virgule décimale, espace
//   insécable U+00A0 avant l'unité (k, M, Md), moins typographique U+2212.
// - formatExact : nombre exact groupé par milliers (espace fine insécable U+202F), pour les aria-label.

const NBSP = " ";
const NNBSP = " ";
const MINUS = "−";
const DASH = "—";

/** Unités, de la plus grande à la plus petite. Md (milliards) n'a pas de plafond. */
const UNITS: readonly { base: number; suffix: string }[] = [
  { base: 1e9, suffix: "Md" },
  { base: 1e6, suffix: "M" },
  { base: 1e3, suffix: "k" },
];

/** Entier positif en chiffres, sans notation exponentielle (même au-delà de 1e21). */
function digits(n: number): string {
  if (n < 1e21) return Math.floor(n).toFixed(0);
  try {
    return BigInt(Math.floor(n)).toString();
  } catch {
    return Math.floor(n).toFixed(0);
  }
}

/** Valeur entière tronquée vers 0 et son signe ; null si non fini. */
function truncated(n: number): { neg: boolean; abs: number } | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  // −0 et les décimaux négatifs > −1 deviennent 0 (sans signe).
  return { neg: t < 0, abs: Math.abs(t) };
}

export function formatCount(n: number): string {
  const v = truncated(n);
  if (!v) return DASH;
  const sign = v.neg ? MINUS : "";
  const a = v.abs;
  if (a < 1000) return sign + digits(a);
  for (const u of UNITS) {
    if (a < u.base) continue;
    const whole = Math.floor(a / u.base);
    if (whole < 10) {
      // 1 décimale tronquée ; « ,0 » omis.
      const tenths = Math.floor(a / (u.base / 10)) % 10;
      const body = tenths === 0 ? `${whole}` : `${whole},${tenths}`;
      return `${sign}${body}${NBSP}${u.suffix}`;
    }
    return `${sign}${digits(whole)}${NBSP}${u.suffix}`;
  }
  return sign + digits(a);
}

export function formatExact(n: number): string {
  const v = truncated(n);
  if (!v) return DASH;
  const s = digits(v.abs);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += NNBSP;
    out += s[i];
  }
  return (v.neg ? MINUS : "") + out;
}
