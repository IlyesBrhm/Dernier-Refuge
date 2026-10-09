// Sons procéduraux (Web Audio, aucun fichier) : types partagés et constantes de PRÉSENTATION
// (docs/design/ui-polish.md §4.7). Aucune règle de jeu, aucun nombre de gameplay.

/** Scène sonore, dérivée de l'écran (screen-controller) : titre, jeu, jeu en pause (panneau ouvert). */
export type AudioScene = "title" | "play" | "pause";

/** Effets ponctuels. */
export type SfxId = "pop" | "click" | "build";

/** Sous-ensemble des préférences utilisé par le son (structurellement compatible avec `Prefs`). */
export interface AudioPrefs {
  readonly muted: boolean;
  /** Entier 0..100. */
  readonly sfxVolume: number;
  /** Entier 0..100. */
  readonly ambienceVolume: number;
}

/** Paramètres continus de l'ambiance, mis à jour à chaque image (cf. `ambienceParams`). */
export interface AmbienceParams {
  /** Distance joueur → centre du feu, en tuiles (Infinity si inconnue). */
  readonly fireDistanceTiles: number;
  /** Bois dans le feu et capacité (0 ⇒ feu éteint ⇒ pas de crépitement). */
  readonly fireWood: number;
  readonly fireCapacity: number;
  /** 0 = jour, 1 = nuit ; crépuscule / aube = avancement de la sous-phase. */
  readonly nightness: number;
}

/** Gains instantanés du graphe (0..1). */
export interface BusGains {
  readonly master: number;
  readonly sfx: number;
  readonly ambience: number;
}

export interface LoopGains {
  readonly fire: number;
  readonly wind: number;
}

export const AUDIO = {
  /** Rampe de tout changement de gain (pas de clic audible). */
  rampS: 0.15,
  /** Ambiance atténuée pendant la pause. */
  pauseAmbience: 0.35,
  /** Écran titre : niveaux fixes du feu et du vent. */
  titleFire: 0.7,
  titleWind: 0.5,
  /** Crépitement : plein volume jusqu'à `fireNearTiles`, nul au-delà de `fireFarTiles`. */
  fireNearTiles: 1.5,
  fireFarTiles: 9,
  /** Part du volume du feu indépendante du bois restant. */
  fireBase: 0.35,
  /** Vent : 0,5 × nuit. */
  windMax: 0.5,
  /** Variation (seuil) en dessous de laquelle un gain continu n'est pas re-planifié. */
  epsilon: 0.004,
  /** Voix ponctuelles simultanées au plus (au-delà : ignorées). */
  maxVoices: 8,
  /** Niveaux de sortie (avant bus) des effets et des boucles. */
  level: { pop: 0.35, click: 0.18, build: 0.3, buildNoise: 0.12, fireHiss: 0.07, fireCrackle: 0.5, wind: 0.5 },
  pop: { fromHz: 600, toHz: 900, sweepS: 0.06, attackS: 0.005, decayS: 0.08, spread: 0.05 },
  click: { hz: 1200, durS: 0.025 },
  /** Arpège do5-mi5-sol5, 90 ms chacun, + bruit filtré passe-bas 30 ms. */
  build: { notesHz: [523.25, 659.25, 783.99], noteS: 0.09, noiseS: 0.03, noiseLowpassHz: 1200 },
  fire: { noiseS: 2, bandHz: 1500, bandQ: 0.8, crackleS: 5.3, crackleMinS: 0.03, crackleMaxS: 0.2 },
  wind: { noiseS: 4, lowpassHz: 400, lfoHz: 0.1, lfoDepth: 0.35 },
} as const;
