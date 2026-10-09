// Mixage PUR (testé sous node) : gains du crépitement, du vent et des bus selon l'état affiché, les
// préférences et la scène. Aucune horloge, aucun DOM, aucune Web Audio ; ne mute jamais ses entrées.

import { clockInfo, type GameState, type LightPhase } from "../core";
import { FIRE, WORLD } from "../data/balance";
import {
  AUDIO,
  type AmbienceParams,
  type AudioPrefs,
  type AudioScene,
  type BusGains,
  type LoopGains,
} from "./audio-config";

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Volume du crépitement : 0 si le feu est éteint (`wood` ≤ 0), sinon
 * `distFactor × (0,35 + 0,65 × wood / capacity)` avec distFactor = 1 jusqu'à 1,5 tuile, 0 dès 9 tuiles,
 * `(1 − (d − 1,5) / 7,5)²` entre les deux. Résultat dans [0, 1].
 */
export function fireGain(dTiles: number, wood: number, capacity: number): number {
  if (!(wood > 0) || !(capacity > 0)) return 0;
  const d = Number.isNaN(dTiles) ? Infinity : Math.max(0, dTiles);
  let dist: number;
  if (d <= AUDIO.fireNearTiles) dist = 1;
  else if (d >= AUDIO.fireFarTiles) dist = 0;
  else {
    const k = 1 - (d - AUDIO.fireNearTiles) / (AUDIO.fireFarTiles - AUDIO.fireNearTiles);
    dist = k * k;
  }
  const fill = clamp01(wood / capacity);
  return dist * (AUDIO.fireBase + (1 - AUDIO.fireBase) * fill);
}

/** Vent : 0,5 × nightness (bornée à [0, 1]). */
export function windGain(nightness: number): number {
  return AUDIO.windMax * clamp01(nightness);
}

/** Nuit = 1, jour = 0, crépuscule = avancement, aube = 1 − avancement. */
export function nightnessOf(light: LightPhase, progress: number): number {
  const p = clamp01(progress);
  switch (light) {
    case "night":
      return 1;
    case "day":
      return 0;
    case "dusk":
      return p;
    case "dawn":
      return 1 - p;
  }
}

/**
 * Gains des bus : master = 0 si muet sinon 1 ; sfx = sfxVolume / 100 ; ambiance = ambienceVolume / 100,
 * × 0,35 en pause. Volumes hors bornes / non finis ramenés dans [0, 1].
 */
export function busGains(prefs: AudioPrefs, scene: AudioScene): BusGains {
  return {
    master: prefs.muted ? 0 : 1,
    sfx: clamp01(prefs.sfxVolume / 100),
    ambience: clamp01(prefs.ambienceVolume / 100) * (scene === "pause" ? AUDIO.pauseAmbience : 1),
  };
}

/** Gains des boucles : titre ⇒ feu 0,7 et vent 0,5 fixes ; sinon fireGain / windGain. */
export function loopGains(params: AmbienceParams, scene: AudioScene): LoopGains {
  if (scene === "title") return { fire: AUDIO.titleFire, wind: AUDIO.titleWind };
  return {
    fire: fireGain(params.fireDistanceTiles, params.fireWood, params.fireCapacity),
    wind: windGain(params.nightness),
  };
}

/** Paramètres d'ambiance lus dans l'état (lecture seule) : distance joueur–feu, bois, nuit. */
export function ambienceParams(state: Readonly<GameState>): AmbienceParams {
  const U = WORLD.unitsPerTile;
  const f = state.map.fire;
  const fx = (f.tx + 0.5) * U;
  const fy = (f.ty + 0.5) * U;
  const p = state.player.pos;
  const c = clockInfo(state as GameState);
  return {
    fireDistanceTiles: Math.hypot(p.x - fx, p.y - fy) / U,
    fireWood: state.fire.wood,
    fireCapacity: FIRE.capacity,
    nightness: nightnessOf(c.light, c.lightProgress),
  };
}

/** Hauteur du « pop » n° `n` : ±5 % par un compteur (cycle de 5 valeurs), sans Math.random. */
export function popPitch(n: number): number {
  const k = ((Math.floor(n) % 5) + 5) % 5; // 0..4
  const steps = [0, 2, 4, 1, 3][k] as number; // ordre mélangé, déterministe
  return 1 + AUDIO.pop.spread * ((steps - 2) / 2);
}
