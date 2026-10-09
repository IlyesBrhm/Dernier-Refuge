// Courbes jour/nuit (docs/design/day-night.md §4.1). PUR : aucun import de three, aucune horloge,
// aucun Math.random. Partagé par le rendu 3D (stage.setLighting) et le rendu 2D (voile de nuit).
//
// Entrée : temps de jeu RÉEL `tickF = prev.tick + alpha` (interpolé), ramené au cycle par `cyclePos`.
// Images clés interpolées en smoothstep, couleurs en RVB LINÉAIRE (espace de travail de three).
// Les couleurs sont ajustables (présentation) ; les POIDS NULS AUX BASCULES (p = 2400 et p = 0) ne le
// sont pas : c'est là que l'ombre passe du soleil au feu et inversement, sans que cela se voie.

import { CYCLE_TICKS, cyclePos, lightPhase, type LightPhase } from "../core";
import { TIME } from "../data/balance";

/** Couleur RVB linéaire, composantes dans [0, 1]. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type ShadowOwner = "sun" | "fire";

export interface Lighting {
  /** Position dans le cycle (ticks, réel). */
  p: number;
  /** Sous-phase visuelle (pour le HUD / e2e). */
  phase: LightPhase;
  sunColor: Rgb;
  /** Intensité du soleil (0 la nuit). */
  sunIntensity: number;
  /** Direction normalisée vers le soleil (depuis le sol). */
  sunDir: { x: number; y: number; z: number };
  hemiSky: Rgb;
  hemiGround: Rgb;
  hemiIntensity: number;
  /** Fond et brouillard. */
  background: Rgb;
  /** Opacité du voile de nuit du rendu 2D, dans [0, 1]. */
  overlay2D: number;
  /**
   * Teinte atmosphérique 3D, dans [0, 1] : part de la couleur de fond (brouillard) mêlée à la scène
   * au point visé. 0 le jour ; ~0,3 la nuit (nuit bleutée et lisible, façon My Perfect Hotel),
   * plus faible à l'aube / au crépuscule (voile rosé-orangé).
   */
  fogTint: number;
  /** Intensité soleil / intensité de plein jour, dans [0, 1]. */
  sunWeight: number;
  /** Poids du projecteur du feu (porte l'ombre la nuit), dans [0, 1]. */
  fireSpotWeight: number;
  /** Poids de la lueur du feu (sans ombre), dans [0.35, 1]. */
  fireGlowWeight: number;
  /** Poids de la petite lumière du joueur, dans [0, 1]. */
  playerLightWeight: number;
  /** Pour library.setDaylight : max(sunWeight, 0.25). */
  daylight: number;
  /** Lumière qui porte l'ombre : "fire" sur [2400, 3600), "sun" sinon. */
  shadowOwner: ShadowOwner;
}

/** Intensité du soleil en plein jour (référence de sunWeight). */
export const SUN_FULL_INTENSITY = 2.0;

interface Key {
  p: number;
  sun: number;
  sunI: number;
  sky: number;
  ground: number;
  hemiI: number;
  bg: number;
  veil: number;
  fog: number;
}

const DAY_END = TIME.dayTicks; // 2400 : tombée de la nuit
const DAWN_END = TIME.dawnTicks; // 300
const DUSK_START = TIME.dayTicks - TIME.duskTicks; // 2100

// Images clés (hex sRGB, converties une fois en linéaire). Le cycle boucle : la clé en CYCLE_TICKS
// est identique à la clé 0.
//
// Nuit : l'herbe (verte) ne renvoie presque pas de bleu ; une hémisphère bleu saturé faible la rendait
// vert-noir. On utilise donc une hémisphère bleu clair désaturé NETTEMENT plus forte (silhouettes
// lisibles) + une teinte atmosphérique `fog` (brouillard bleu nuit mêlé à ~30 % au point visé), qui
// apporte la dominante bleutée sans dépendre de l'albédo. Luminance visée feu éteint ≈ 35–50 % du jour.
// Crépuscule : soleil orangé-rosé (pas jaune : orange × herbe verte = olive) + voile rosé.
const KEYS_HEX: readonly Key[] = [
  { p: 0, sun: 0xff9e7a, sunI: 0, sky: 0x7a8cc4, ground: 0x2e3a58, hemiI: 1.2, bg: 0x34466e, veil: 0.55, fog: 0.3 },
  { p: DAWN_END / 2, sun: 0xffb38a, sunI: 0.9, sky: 0xf4c6d6, ground: 0x6a5a5a, hemiI: 0.9, bg: 0xe8b8c0, veil: 0.25, fog: 0.12 },
  { p: DAWN_END, sun: 0xfff1d6, sunI: 2.0, sky: 0xdff2ff, ground: 0x7a9a4a, hemiI: 1.1, bg: 0xa9d4a0, veil: 0, fog: 0 },
  { p: DUSK_START, sun: 0xfff1d6, sunI: 2.0, sky: 0xdff2ff, ground: 0x7a9a4a, hemiI: 1.1, bg: 0xa9d4a0, veil: 0, fog: 0 },
  { p: (DUSK_START + DAY_END) / 2, sun: 0xff8c6a, sunI: 1.2, sky: 0xffb8a8, ground: 0x6a4a50, hemiI: 0.8, bg: 0xe89a88, veil: 0.2, fog: 0.18 },
  { p: DAY_END, sun: 0xff7a5a, sunI: 0, sky: 0x6a7cb8, ground: 0x2a3450, hemiI: 1.1, bg: 0x2c3e6a, veil: 0.55, fog: 0.3 },
  { p: DAY_END + 120, sun: 0xff7a5a, sunI: 0, sky: 0x7d8fc8, ground: 0x2e3a5a, hemiI: 1.25, bg: 0x2f4272, veil: 0.6, fog: 0.32 },
  { p: CYCLE_TICKS - 120, sun: 0xff9e7a, sunI: 0, sky: 0x7d8fc8, ground: 0x2e3a5a, hemiI: 1.25, bg: 0x2f4272, veil: 0.6, fog: 0.32 },
  { p: CYCLE_TICKS, sun: 0xff9e7a, sunI: 0, sky: 0x7a8cc4, ground: 0x2e3a58, hemiI: 1.2, bg: 0x34466e, veil: 0.55, fog: 0.3 },
];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** Hex sRGB ⇒ RVB linéaire. */
export function hexToLinear(hex: number): Rgb {
  return {
    r: srgbToLinear(((hex >> 16) & 0xff) / 255),
    g: srgbToLinear(((hex >> 8) & 0xff) / 255),
    b: srgbToLinear((hex & 0xff) / 255),
  };
}

/** RVB linéaire ⇒ composantes sRGB 0..255 (pour le Canvas 2D). */
export function linearToCss(c: Rgb): { r: number; g: number; b: number } {
  return {
    r: Math.round(linearToSrgb(c.r) * 255),
    g: Math.round(linearToSrgb(c.g) * 255),
    b: Math.round(linearToSrgb(c.b) * 255),
  };
}

interface LinKey {
  p: number;
  sun: Rgb;
  sunI: number;
  sky: Rgb;
  ground: Rgb;
  hemiI: number;
  bg: Rgb;
  veil: number;
  fog: number;
}

const KEYS: readonly LinKey[] = KEYS_HEX.map((k) => ({
  fog: k.fog,
  p: k.p,
  sun: hexToLinear(k.sun),
  sunI: k.sunI,
  sky: hexToLinear(k.sky),
  ground: hexToLinear(k.ground),
  hemiI: k.hemiI,
  bg: hexToLinear(k.bg),
  veil: k.veil,
}));

export function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: mix(a.r, b.r, t), g: mix(a.g, b.g, t), b: mix(a.b, b.b, t) };
}

/** Poids du projecteur du feu : 0 le jour, montée sur [2400, 2460], 1, descente sur [3540, 3600). */
export function fireSpotWeightAt(p: number): number {
  if (p < DAY_END) return 0;
  if (p <= DAY_END + 60) return smoothstep01((p - DAY_END) / 60);
  if (p <= CYCLE_TICKS - 60) return 1;
  return 1 - smoothstep01((p - (CYCLE_TICKS - 60)) / 60);
}

export function shadowOwnerAt(p: number): ShadowOwner {
  return p >= DAY_END && p < CYCLE_TICKS ? "fire" : "sun";
}

/** Course du soleil le jour (est → ouest), figée au coucher pendant la nuit (intensité nulle). */
function sunDirAt(p: number): { x: number; y: number; z: number } {
  const k = Math.min(1, Math.max(0, p / DAY_END));
  const x = mix(0.9, -0.9, k);
  const y = 0.15 + Math.sin(Math.PI * k);
  const z = 0.35;
  const n = Math.hypot(x, y, z) || 1;
  return { x: x / n, y: y / n, z: z / n };
}

/** Éclairage au temps de jeu réel `tickF` (périodique de période CYCLE_TICKS). */
export function lightingAt(tickF: number): Lighting {
  const p = cyclePos(tickF);
  let i = 0;
  while (i < KEYS.length - 2 && p >= (KEYS[i + 1] as LinKey).p) i++;
  const a = KEYS[i] as LinKey;
  const b = KEYS[i + 1] as LinKey;
  const span = b.p - a.p;
  const t = span > 0 ? smoothstep01((p - a.p) / span) : 0;
  const sunIntensity = Math.max(0, mix(a.sunI, b.sunI, t));
  const sunWeight = Math.min(1, sunIntensity / SUN_FULL_INTENSITY);
  const fireSpotWeight = fireSpotWeightAt(p);
  return {
    p,
    phase: lightPhase(p).phase,
    sunColor: mixRgb(a.sun, b.sun, t),
    sunIntensity,
    sunDir: sunDirAt(p),
    hemiSky: mixRgb(a.sky, b.sky, t),
    hemiGround: mixRgb(a.ground, b.ground, t),
    hemiIntensity: mix(a.hemiI, b.hemiI, t),
    background: mixRgb(a.bg, b.bg, t),
    overlay2D: Math.min(1, Math.max(0, mix(a.veil, b.veil, t))),
    fogTint: Math.min(1, Math.max(0, mix(a.fog, b.fog, t))),
    sunWeight,
    fireSpotWeight,
    fireGlowWeight: 0.35 + 0.65 * (1 - sunWeight),
    playerLightWeight: 1 - sunWeight,
    daylight: Math.max(sunWeight, 0.25),
    shadowOwner: shadowOwnerAt(p),
  };
}

/**
 * Vacillement du feu (multiplicateur ≈ 1 ± 12 %) : somme de 3 sinus de fréquences incommensurables
 * du temps d'AFFICHAGE (ms). Jamais Math.random, jamais l'état du jeu.
 */
export function fireFlicker(nowMs: number): number {
  const t = nowMs / 1000;
  return 1 + 0.06 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.1 + 1.7) + 0.02 * Math.sin(t * 23.9 + 0.4);
}

/**
 * Mémoire de vue « feu allumé » : 0 → 1 en `durationS` au rallumage, 1 → 0 à l'extinction.
 * Avance une valeur existante de `dt` secondes vers la cible.
 */
export function stepLitFade(current: number, lit: boolean, dt: number, durationS = 0.5): number {
  const step = durationS > 0 ? Math.max(0, dt) / durationS : 1;
  return lit ? Math.min(1, current + step) : Math.max(0, current - step);
}
