// Courbes jour/nuit du rendu (docs/design/day-night.md §4.1 et §6.4) : src/render/daylight.ts, pur.
// Les couleurs exactes sont ajustables par render-dev (présentation) ; les POIDS NULS AUX BASCULES
// (p = 2400 et p = 0) et la bascule exacte des ombres ne le sont pas.

import { TIME } from "../../src/data/balance";
import { CYCLE_TICKS, lightPhase } from "../../src/core/time";
import {
  fireFlicker,
  fireSpotWeightAt,
  hexToLinear,
  lightingAt,
  linearToCss,
  shadowOwnerAt,
  smoothstep01,
  stepLitFade,
  SUN_FULL_INTENSITY,
  type Lighting,
  type Rgb,
} from "../../src/render/daylight";

vi.mock("three", () => {
  throw new Error("three ne doit pas être chargé par daylight.ts");
});

const DUSK = TIME.dayTicks; // 2400 : bascule soleil → feu
const DAWN_END = TIME.dawnTicks; // 300
const DUSK_START = TIME.dayTicks - TIME.duskTicks; // 2100

/** Valeurs scalaires « d'intensité / couleur / poids » d'un éclairage (sans la direction du soleil). */
function scalars(l: Lighting): Record<string, number> {
  const rgb = (name: string, c: Rgb): Record<string, number> => ({ [`${name}.r`]: c.r, [`${name}.g`]: c.g, [`${name}.b`]: c.b });
  return {
    ...rgb("sunColor", l.sunColor),
    ...rgb("hemiSky", l.hemiSky),
    ...rgb("hemiGround", l.hemiGround),
    ...rgb("background", l.background),
    sunIntensity: l.sunIntensity,
    hemiIntensity: l.hemiIntensity,
    overlay2D: l.overlay2D,
    sunWeight: l.sunWeight,
    fireSpotWeight: l.fireSpotWeight,
    fireGlowWeight: l.fireGlowWeight,
    playerLightWeight: l.playerLightWeight,
    daylight: l.daylight,
  };
}

/** Plus grand écart entre deux éclairages, champ par champ ; [champ, écart]. */
function maxJump(a: Lighting, b: Lighting): [string, number] {
  const sa = scalars(a);
  const sb = scalars(b);
  let worst: [string, number] = ["", 0];
  for (const k of Object.keys(sa)) {
    const d = Math.abs((sa[k] as number) - (sb[k] as number));
    if (d > worst[1]) worst = [k, d];
  }
  return worst;
}

/** Luminance relative (RVB linéaire). */
function lum(c: Rgb): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** « Quantité de lumière » ambiante perçue (soleil + hémisphère), sans le feu. */
function ambient(l: Lighting): number {
  return l.sunIntensity * lum(l.sunColor) + l.hemiIntensity * lum(l.hemiSky);
}

describe("lightingAt — pureté, domaine, périodicité", () => {
  it("se charge sans three ; aucun Math.random ; même entrée ⇒ même sortie", () => {
    const spy = vi.spyOn(Math, "random");
    try {
      for (let t = 0; t < 2 * CYCLE_TICKS; t += 37.5) expect(lightingAt(t)).toEqual(lightingAt(t));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("périodique : lightingAt(t + k·CYCLE) = lightingAt(t) (temps réels exacts en binaire)", () => {
    for (const t of [0, 0.5, 149.25, 300, 1200.75, 2099.5, 2250, 2399.875, 2400, 2400.125, 3000, 3599.5]) {
      for (const k of [1, 2, 10]) {
        expect(lightingAt(t + k * CYCLE_TICKS), `t = ${t}, k = ${k}`).toEqual(lightingAt(t));
      }
    }
  });

  it("temps invalide (NaN, ±Infinity, négatif) ⇒ comme p = 0, sans NaN", () => {
    const zero = lightingAt(0);
    for (const t of [NaN, Infinity, -Infinity, -1, -2400]) {
      const l = lightingAt(t);
      expect(l).toEqual(zero);
      for (const v of Object.values(scalars(l))) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("p = cyclePos(t) et phase = lightPhase(t).phase", () => {
    for (let t = 0; t < 2 * CYCLE_TICKS; t += 50) {
      const l = lightingAt(t + 0.25);
      expect(l.p).toBe((t + 0.25) % CYCLE_TICKS);
      expect(l.phase).toBe(lightPhase(t + 0.25).phase);
    }
    expect(lightingAt(0).phase).toBe("dawn");
    expect(lightingAt(DAWN_END).phase).toBe("day");
    expect(lightingAt(DUSK_START).phase).toBe("dusk");
    expect(lightingAt(DUSK).phase).toBe("night");
    expect(lightingAt(CYCLE_TICKS - 0.001).phase).toBe("night");
  });
});

describe("lightingAt — bornes et relations entre poids", () => {
  it("sur deux cycles (pas 0,5) : poids dans [0, 1], couleurs dans [0, 1], direction du soleil normée", () => {
    const errors: string[] = [];
    for (let t = 0; t < 2 * CYCLE_TICKS; t += 0.5) {
      const l = lightingAt(t);
      const at = `t = ${t}`;
      for (const [k, v] of Object.entries(scalars(l))) {
        if (!Number.isFinite(v)) errors.push(`${at}: ${k} non fini`);
        if (k.includes(".") && (v < 0 || v > 1)) errors.push(`${at}: ${k} = ${v} hors [0, 1]`);
      }
      for (const k of ["sunWeight", "fireSpotWeight", "playerLightWeight", "overlay2D", "daylight"] as const) {
        if (l[k] < 0 || l[k] > 1) errors.push(`${at}: ${k} = ${l[k]}`);
      }
      if (l.fireGlowWeight < 0.35 - 1e-12 || l.fireGlowWeight > 1 + 1e-12) errors.push(`${at}: fireGlowWeight ${l.fireGlowWeight}`);
      if (l.sunIntensity < 0) errors.push(`${at}: sunIntensity < 0`);
      if (l.hemiIntensity <= 0) errors.push(`${at}: hémisphère éteint (scène noire)`);
      if (Math.abs(l.sunWeight - Math.min(1, l.sunIntensity / SUN_FULL_INTENSITY)) > 1e-12) errors.push(`${at}: sunWeight ≠ I/2`);
      if (Math.abs(l.fireGlowWeight - (0.35 + 0.65 * (1 - l.sunWeight))) > 1e-12) errors.push(`${at}: fireGlowWeight`);
      if (Math.abs(l.playerLightWeight - (1 - l.sunWeight)) > 1e-12) errors.push(`${at}: playerLightWeight`);
      if (l.daylight !== Math.max(l.sunWeight, 0.25)) errors.push(`${at}: daylight`);
      if (l.fireSpotWeight !== fireSpotWeightAt(l.p)) errors.push(`${at}: fireSpotWeight ≠ fireSpotWeightAt`);
      if (l.shadowOwner !== shadowOwnerAt(l.p)) errors.push(`${at}: shadowOwner ≠ shadowOwnerAt`);
      const n = Math.hypot(l.sunDir.x, l.sunDir.y, l.sunDir.z);
      if (Math.abs(n - 1) > 1e-9) errors.push(`${at}: |sunDir| = ${n}`);
    }
    expect(errors.slice(0, 10)).toEqual([]);
  });

  it("sunWeight = 0 sur toute la nuit [2400, 3600) ; soleil au-dessus de l'horizon le jour", () => {
    for (let p = DUSK; p < CYCLE_TICKS; p += 0.25) {
      expect(lightingAt(p).sunWeight).toBe(0);
      expect(lightingAt(p).sunIntensity).toBe(0);
    }
    for (let p = 0; p < DUSK; p += 10) expect(lightingAt(p).sunDir.y).toBeGreaterThan(0);
  });

  it("fireSpotWeight : 0 sur [0, 2400) ; montée sur [2400, 2460] ; 1 sur [2460, 3540] ; descente sur [3540, 3600)", () => {
    for (let p = 0; p < DUSK; p += 0.5) expect(fireSpotWeightAt(p)).toBe(0);
    let last = -1;
    for (let p = DUSK; p <= DUSK + 60; p += 0.5) {
      const w = fireSpotWeightAt(p);
      expect(w).toBeGreaterThanOrEqual(last);
      last = w;
    }
    expect(fireSpotWeightAt(DUSK + 60)).toBe(1);
    for (let p = DUSK + 60; p <= CYCLE_TICKS - 60; p += 1) expect(fireSpotWeightAt(p)).toBe(1);
    last = 2;
    for (let p = CYCLE_TICKS - 60; p < CYCLE_TICKS; p += 0.5) {
      const w = fireSpotWeightAt(p);
      expect(w).toBeLessThanOrEqual(last);
      last = w;
    }
    expect(fireSpotWeightAt(DUSK + 30)).toBeCloseTo(0.5, 12); // smoothstep symétrique
    expect(fireSpotWeightAt(CYCLE_TICKS - 30)).toBeCloseTo(0.5, 12);
  });

  it("smoothstep01 : 0 → 0, 1 → 1, ½ → ½, borné hors de [0, 1], croissante", () => {
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(0.5)).toBe(0.5);
    expect(smoothstep01(-3)).toBe(0);
    expect(smoothstep01(7)).toBe(1);
    let last = -1;
    for (let x = 0; x <= 1; x += 0.01) {
      expect(smoothstep01(x)).toBeGreaterThanOrEqual(last);
      last = smoothstep01(x);
    }
  });
});

describe("lightingAt — bascules des ombres (critère non ajustable)", () => {
  it("creux EXACT aux deux bascules : sunWeight = fireSpotWeight = 0 en p = 2400 et p = 0 (ticks 0, 2400, 3600, 6000, 7200)", () => {
    for (const t of [0, DUSK, CYCLE_TICKS, CYCLE_TICKS + DUSK, 2 * CYCLE_TICKS]) {
      const l = lightingAt(t);
      expect(l.sunWeight, `t = ${t}`).toBe(0);
      expect(l.fireSpotWeight, `t = ${t}`).toBe(0);
      expect(l.sunIntensity).toBe(0);
    }
  });

  it("creux sur ±10 ticks (1 s) autour des bascules : sunWeight ≤ 0,02 et fireSpotWeight ≤ 0,1", () => {
    for (const center of [DUSK, CYCLE_TICKS, CYCLE_TICKS + DUSK, 2 * CYCLE_TICKS]) {
      for (let d = -10; d <= 10; d += 0.25) {
        const l = lightingAt(center + d);
        expect(l.sunWeight, `t = ${center + d}`).toBeLessThanOrEqual(0.02);
        expect(l.fireSpotWeight, `t = ${center + d}`).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("shadowOwner bascule EXACTEMENT en p = 2400 (sun → fire) et en p = 0 ≡ 3600 (fire → sun)", () => {
    for (const k of [0, 1, 5]) {
      const base = k * CYCLE_TICKS;
      expect(lightingAt(base + DUSK - 1e-6).shadowOwner).toBe("sun");
      expect(lightingAt(base + DUSK).shadowOwner).toBe("fire");
      expect(lightingAt(base + CYCLE_TICKS - 1e-6).shadowOwner).toBe("fire");
      expect(lightingAt(base + CYCLE_TICKS).shadowOwner).toBe("sun");
    }
    expect(lightingAt(0).shadowOwner).toBe("sun");
    // Balayage : une seule bascule dans chaque sens par cycle, aux instants prévus.
    const switches: [number, string][] = [];
    let prev = lightingAt(0).shadowOwner;
    for (let t = 0.5; t <= 2 * CYCLE_TICKS; t += 0.5) {
      const o = lightingAt(t).shadowOwner;
      if (o !== prev) switches.push([t, o]);
      prev = o;
    }
    expect(switches).toEqual([
      [DUSK, "fire"],
      [CYCLE_TICKS, "sun"],
      [CYCLE_TICKS + DUSK, "fire"],
      [2 * CYCLE_TICKS, "sun"],
    ]);
  });

  it("shadowOwnerAt : « fire » ssi p ∈ [2400, 3600)", () => {
    expect(shadowOwnerAt(0)).toBe("sun");
    expect(shadowOwnerAt(DUSK - 0.001)).toBe("sun");
    expect(shadowOwnerAt(DUSK)).toBe("fire");
    expect(shadowOwnerAt(CYCLE_TICKS - 0.001)).toBe("fire");
    expect(shadowOwnerAt(CYCLE_TICKS)).toBe("sun");
  });
});

describe("lightingAt — continuité (aucun saut d'intensité ni de couleur)", () => {
  it("écart d'un tick au suivant < 0,03 sur tous les champs, sur deux cycles (pas 0,25)", () => {
    let worst: [number, string, number] = [0, "", 0];
    for (let t = 0; t < 2 * CYCLE_TICKS; t += 0.25) {
      const [k, d] = maxJump(lightingAt(t), lightingAt(t + 1));
      if (d > worst[2]) worst = [t, k, d];
    }
    expect(worst[2], `pire écart à t = ${worst[0]} (${worst[1]})`).toBeLessThan(0.03);
  });

  it("limites à gauche et à droite égales autour de chaque image clé et de chaque bascule", () => {
    const keys = [0, DAWN_END / 2, DAWN_END, DUSK_START, (DUSK_START + DUSK) / 2, DUSK, DUSK + 60, DUSK + 120, CYCLE_TICKS - 120, CYCLE_TICKS - 60, CYCLE_TICKS];
    for (const k of keys) {
      for (const base of [0, CYCLE_TICKS]) {
        const t = base + k;
        const left = lightingAt(t - 1e-6);
        const right = lightingAt(t + 1e-6);
        const [field, d] = maxJump(left, right);
        expect(d, `p = ${k} (${field})`).toBeLessThan(1e-4);
        // Et un voisinage de ±1 tick reste proche (pente bornée).
        const [field2, d2] = maxJump(lightingAt(t - 1), lightingAt(t + 1));
        expect(d2, `p = ${k} ±1 (${field2})`).toBeLessThan(0.06);
      }
    }
  });

  it("direction du soleil continue tant qu'il éclaire (sunWeight > 0)", () => {
    for (let t = 0; t < DUSK; t += 0.5) {
      const a = lightingAt(t);
      const b = lightingAt(t + 0.5);
      if (a.sunWeight === 0 && b.sunWeight === 0) continue;
      const d = Math.hypot(a.sunDir.x - b.sunDir.x, a.sunDir.y - b.sunDir.y, a.sunDir.z - b.sunDir.z);
      expect(d, `t = ${t}`).toBeLessThan(0.01);
    }
  });
});

describe("lightingAt — la nuit est plus sombre que le jour", () => {
  it("plein jour (p = 300..2100) : soleil plein, aucun voile 2D, lueur du feu minimale", () => {
    for (let p = DAWN_END; p <= DUSK_START; p += 25) {
      const l = lightingAt(p);
      expect(l.sunIntensity).toBe(SUN_FULL_INTENSITY);
      expect(l.sunWeight).toBe(1);
      expect(l.overlay2D).toBe(0);
      expect(l.fireSpotWeight).toBe(0);
      expect(l.fireGlowWeight).toBeCloseTo(0.35, 12);
      expect(l.playerLightWeight).toBe(0);
      expect(l.daylight).toBe(1);
      expect(l.shadowOwner).toBe("sun");
    }
  });

  it("toute la nuit est plus sombre que tout le plein jour (ambiance, fond, voile 2D)", () => {
    let dayMinAmbient = Infinity;
    let dayMinBg = Infinity;
    let dayMaxVeil = -Infinity;
    for (let p = DAWN_END; p <= DUSK_START; p += 10) {
      const l = lightingAt(p);
      dayMinAmbient = Math.min(dayMinAmbient, ambient(l));
      dayMinBg = Math.min(dayMinBg, lum(l.background));
      dayMaxVeil = Math.max(dayMaxVeil, l.overlay2D);
    }
    for (let p = DUSK; p < CYCLE_TICKS; p += 10) {
      const l = lightingAt(p);
      expect(ambient(l), `p = ${p}`).toBeLessThan(dayMinAmbient / 3);
      expect(lum(l.background), `p = ${p}`).toBeLessThan(dayMinBg / 3);
      expect(l.overlay2D, `p = ${p}`).toBeGreaterThanOrEqual(0.5);
      expect(l.overlay2D).toBeGreaterThan(dayMaxVeil);
      expect(l.daylight).toBe(0.25);
      expect(l.playerLightWeight).toBe(1);
      expect(l.fireGlowWeight).toBeCloseTo(1, 12);
    }
  });

  it("aube et crépuscule : intermédiaires (ni plein jour, ni nuit noire)", () => {
    const day = ambient(lightingAt(1200));
    const night = ambient(lightingAt(3000));
    for (const p of [DAWN_END / 2, (DUSK_START + DUSK) / 2]) {
      const a = ambient(lightingAt(p));
      expect(a).toBeLessThan(day);
      expect(a).toBeGreaterThan(night);
      const l = lightingAt(p);
      expect(l.sunWeight).toBeGreaterThan(0);
      expect(l.sunWeight).toBeLessThan(1);
      expect(l.overlay2D).toBeGreaterThan(0);
      expect(l.overlay2D).toBeLessThan(0.55);
    }
  });
});

describe("fireFlicker — vacillement du feu", () => {
  it("borné à 1 ± 12 % sur 10 minutes d'affichage (pas de 7 ms)", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let ms = 0; ms <= 600_000; ms += 7) {
      const f = fireFlicker(ms);
      min = Math.min(min, f);
      max = Math.max(max, f);
    }
    expect(min).toBeGreaterThanOrEqual(0.88);
    expect(max).toBeLessThanOrEqual(1.12);
    // Il vacille réellement.
    expect(max - min).toBeGreaterThan(0.1);
  });

  it("déterministe : fonction du seul temps d'affichage, sans Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    try {
      for (const ms of [0, 16.67, 1234.5, 99_999, 1e9]) expect(fireFlicker(ms)).toBe(fireFlicker(ms));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(fireFlicker(0)).toBe(fireFlicker(0));
    expect(fireFlicker(100)).not.toBe(fireFlicker(0));
  });

  it("continu : deux images à 60 FPS diffèrent de moins de 3 % (pas de scintillement image par image)", () => {
    for (let ms = 0; ms < 20_000; ms += 16) expect(Math.abs(fireFlicker(ms + 16) - fireFlicker(ms))).toBeLessThan(0.03);
  });
});

describe("stepLitFade — mémoire de vue du feu allumé", () => {
  it("rallumage : 0 → 1 en 0,5 s ; extinction : 1 → 0 en 0,5 s ; bornée", () => {
    expect(stepLitFade(0, true, 0.25)).toBeCloseTo(0.5, 12);
    expect(stepLitFade(0.5, true, 0.25)).toBeCloseTo(1, 12);
    expect(stepLitFade(0.9, true, 0.25)).toBe(1);
    expect(stepLitFade(1, false, 0.25)).toBeCloseTo(0.5, 12);
    expect(stepLitFade(0.1, false, 0.25)).toBe(0);
    let v = 0;
    let frames = 0;
    while (v < 1) {
      v = stepLitFade(v, true, 1 / 60);
      frames++;
    }
    expect(frames).toBeGreaterThanOrEqual(30); // 0,5 s à 60 FPS (31 si arrondi flottant)
    expect(frames).toBeLessThanOrEqual(31);
  });

  it("dt nul ou négatif ⇒ inchangé ; durée nulle ⇒ immédiat", () => {
    expect(stepLitFade(0.3, true, 0)).toBe(0.3);
    expect(stepLitFade(0.3, false, -1)).toBe(0.3);
    expect(stepLitFade(0, true, 0.01, 0)).toBe(1);
    expect(stepLitFade(1, false, 0.01, 0)).toBe(0);
  });
});

describe("conversions de couleur", () => {
  it("hexToLinear puis linearToCss redonne les composantes sRGB", () => {
    for (const hex of [0x000000, 0xffffff, 0xff8040, 0x1e2a44, 0xfff1d6, 0x123456]) {
      const css = linearToCss(hexToLinear(hex));
      expect(css).toEqual({ r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff });
    }
  });

  it("linéaire : blanc = 1, noir = 0, gris sRGB 50 % ≈ 0,214", () => {
    expect(hexToLinear(0xffffff)).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToLinear(0x000000)).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToLinear(0x808080).r).toBeCloseTo(0.2158, 3);
  });
});
