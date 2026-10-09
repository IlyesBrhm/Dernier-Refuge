// Mixage pur des sons (src/app/audio-mix.ts, docs/design/ui-polish.md §4.7).

import {
  ambienceParams,
  busGains,
  fireGain,
  loopGains,
  nightnessOf,
  popPitch,
  windGain,
} from "../../src/app/audio-mix";
import { AUDIO, type AmbienceParams, type AudioPrefs } from "../../src/app/audio-config";
import { FIRE } from "../../src/data/balance";
import { deepFreeze, edit, fresh, place } from "../core/helpers";

const CAP = 16;

describe("fireGain (crépitement)", () => {
  it("feu éteint (bois ≤ 0) ⇒ 0 à toute distance", () => {
    for (const d of [0, 1, 5, 20]) {
      expect(fireGain(d, 0, CAP)).toBe(0);
      expect(fireGain(d, -3, CAP)).toBe(0);
    }
    expect(fireGain(0, 8, 0)).toBe(0); // capacité nulle : pas de division par 0
    expect(fireGain(0, Number.NaN, CAP)).toBe(0);
  });

  it("jusqu'à 1,5 tuile : plein facteur de distance ; volume = 0,35 + 0,65 × remplissage", () => {
    expect(fireGain(0, CAP, CAP)).toBe(1);
    expect(fireGain(1.5, CAP, CAP)).toBe(1);
    expect(fireGain(1.0, 8, CAP)).toBeCloseTo(0.35 + 0.65 * 0.5, 12);
    expect(fireGain(0.5, 1, CAP)).toBeCloseTo(0.35 + 0.65 / 16, 12);
  });

  it("à partir de 9 tuiles : 0", () => {
    expect(fireGain(9, CAP, CAP)).toBe(0);
    expect(fireGain(9.01, CAP, CAP)).toBe(0);
    expect(fireGain(1000, CAP, CAP)).toBe(0);
    expect(fireGain(Number.POSITIVE_INFINITY, CAP, CAP)).toBe(0);
    expect(fireGain(Number.NaN, CAP, CAP)).toBe(0); // distance inconnue ⇒ silence
  });

  it("entre 1,5 et 9 tuiles : (1 − (d − 1,5)/7,5)²", () => {
    expect(fireGain(5.25, CAP, CAP)).toBeCloseTo(0.25, 12);
    expect(fireGain(3, CAP, CAP)).toBeCloseTo(0.8 ** 2, 12);
    expect(fireGain(7.5, 8, CAP)).toBeCloseTo(0.2 ** 2 * (0.35 + 0.65 * 0.5), 12);
  });

  it("continu aux bornes 1,5 et 9", () => {
    expect(fireGain(1.5 + 1e-9, CAP, CAP)).toBeCloseTo(1, 6);
    expect(fireGain(9 - 1e-9, CAP, CAP)).toBeCloseTo(0, 6);
  });

  it("monotone : décroissant avec la distance, croissant avec le bois ; toujours dans [0, 1]", () => {
    for (const wood of [1, 4, 8, 16]) {
      let prev = Number.POSITIVE_INFINITY;
      for (let d = 0; d <= 12; d += 0.05) {
        const g = fireGain(d, wood, CAP);
        expect(g).toBeLessThanOrEqual(prev + 1e-12);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
        prev = g;
      }
    }
    for (const d of [0, 2, 5, 8]) {
      let prev = -1;
      for (let wood = 0; wood <= CAP; wood++) {
        const g = fireGain(d, wood, CAP);
        expect(g).toBeGreaterThanOrEqual(prev);
        prev = g;
      }
    }
  });

  it("bois au-delà de la capacité ou distance négative : bornés (jamais > 1)", () => {
    expect(fireGain(0, 100, CAP)).toBe(1);
    expect(fireGain(-5, CAP, CAP)).toBe(1);
  });
});

describe("windGain / nightnessOf (vent la nuit)", () => {
  it("0,5 × nuit, borné", () => {
    expect(windGain(0)).toBe(0);
    expect(windGain(1)).toBe(0.5);
    expect(windGain(0.5)).toBe(0.25);
    expect(windGain(3)).toBe(0.5);
    expect(windGain(-1)).toBe(0);
    expect(windGain(Number.NaN)).toBe(0);
    expect(AUDIO.windMax).toBe(0.5);
  });

  it("nuit = 1, jour = 0, crépuscule = avancement, aube = 1 − avancement", () => {
    expect(nightnessOf("night", 0.3)).toBe(1);
    expect(nightnessOf("day", 0.7)).toBe(0);
    expect(nightnessOf("dusk", 0.25)).toBe(0.25);
    expect(nightnessOf("dawn", 0.25)).toBe(0.75);
    expect(nightnessOf("dusk", 2)).toBe(1);
    expect(nightnessOf("dawn", -1)).toBe(1);
  });
});

describe("busGains", () => {
  const prefs = (p: Partial<AudioPrefs> = {}): AudioPrefs => ({ muted: false, sfxVolume: 80, ambienceVolume: 60, ...p });

  it("jeu : master 1, sfx = volume/100, ambiance = volume/100", () => {
    const g = busGains(prefs(), "play");
    expect(g.master).toBe(1);
    expect(g.sfx).toBeCloseTo(0.8, 12);
    expect(g.ambience).toBeCloseTo(0.6, 12);
  });

  it("muet ⇒ master 0 (les volumes sont conservés pour le retour du son)", () => {
    const g = busGains(prefs({ muted: true }), "play");
    expect(g.master).toBe(0);
    expect(g.sfx).toBeCloseTo(0.8, 12);
  });

  it("pause ⇒ ambiance × 0,35, effets inchangés ; titre ⇒ pas d'atténuation", () => {
    expect(busGains(prefs(), "pause").ambience).toBeCloseTo(0.6 * 0.35, 12);
    expect(busGains(prefs(), "pause").sfx).toBeCloseTo(0.8, 12);
    expect(busGains(prefs(), "title").ambience).toBeCloseTo(0.6, 12);
  });

  it("volumes hors bornes ou non finis ramenés dans [0, 1]", () => {
    expect(busGains(prefs({ sfxVolume: 150, ambienceVolume: -5 }), "play")).toEqual({ master: 1, sfx: 1, ambience: 0 });
    expect(busGains(prefs({ sfxVolume: Number.NaN, ambienceVolume: Number.POSITIVE_INFINITY }), "play")).toEqual({
      master: 1,
      sfx: 0,
      ambience: 0,
    });
  });
});

describe("loopGains", () => {
  const params: AmbienceParams = { fireDistanceTiles: 3, fireWood: 8, fireCapacity: CAP, nightness: 1 };

  it("titre : feu 0,7 et vent 0,5 fixes, quel que soit l'état", () => {
    expect(loopGains(params, "title")).toEqual({ fire: 0.7, wind: 0.5 });
    expect(loopGains({ ...params, fireWood: 0, nightness: 0, fireDistanceTiles: 50 }, "title")).toEqual({ fire: 0.7, wind: 0.5 });
  });

  it("jeu / pause : fireGain et windGain (l'atténuation de pause est sur le bus)", () => {
    for (const scene of ["play", "pause"] as const) {
      const g = loopGains(params, scene);
      expect(g.fire).toBeCloseTo(fireGain(3, 8, CAP), 12);
      expect(g.wind).toBe(0.5);
    }
  });
});

describe("ambienceParams (lecture de l'état)", () => {
  it("joueur au départ P (7,8), feu F (9,5) : distance √13 tuiles ; bois et capacité du feu", () => {
    const s = deepFreeze(fresh());
    const p = ambienceParams(s);
    expect(p.fireDistanceTiles).toBeCloseTo(Math.sqrt(13), 9);
    expect(p.fireWood).toBe(FIRE.initialWood);
    expect(p.fireCapacity).toBe(FIRE.capacity);
  });

  it("joueur sur la tuile voisine du feu : distance 1 ⇒ crépitement plein facteur", () => {
    const s = place(fresh(), { tx: 9, ty: 6 });
    const p = ambienceParams(s);
    expect(p.fireDistanceTiles).toBeCloseTo(1, 9);
    expect(fireGain(p.fireDistanceTiles, p.fireWood, p.fireCapacity)).toBeCloseTo(0.35 + 0.65 * (FIRE.initialWood / FIRE.capacity), 12);
  });

  it("nuit ⇒ nightness 1 ; plein jour ⇒ 0 ; aube au tick 0 ⇒ 1 (sortie de nuit)", () => {
    expect(ambienceParams(edit(fresh(), (d) => (d.tick = 3000))).nightness).toBe(1);
    expect(ambienceParams(edit(fresh(), (d) => (d.tick = 1200))).nightness).toBe(0);
    expect(ambienceParams(fresh()).nightness).toBe(1);
  });
});

describe("popPitch", () => {
  it("±5 % au plus, cycle de 5 valeurs distinctes, déterministe, entrées négatives acceptées", () => {
    const vals = [0, 1, 2, 3, 4].map(popPitch);
    expect(new Set(vals).size).toBe(5);
    for (let n = -20; n < 40; n++) {
      const p = popPitch(n);
      expect(p).toBeGreaterThanOrEqual(0.95 - 1e-12);
      expect(p).toBeLessThanOrEqual(1.05 + 1e-12);
      expect(p).toBe(popPitch(n + 5));
    }
  });
});
