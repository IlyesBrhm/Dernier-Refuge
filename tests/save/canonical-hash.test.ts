import { CanonicalError, canonicalStringify, hash64 } from "../../src/save/index";

describe("canonicalStringify", () => {
  it("ordre des clés indifférent ⇒ même chaîne ; clés triées, pas d'espaces", () => {
    const a = canonicalStringify({ b: 1, a: { d: [3, 1, 2], c: null }, Z: "x" });
    const b = canonicalStringify({ Z: "x", a: { c: null, d: [3, 1, 2] }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"Z":"x","a":{"c":null,"d":[3,1,2]},"b":1}');
  });

  it("tableaux : ordre conservé", () => {
    expect(canonicalStringify([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it("chaînes, booléens, négatifs, -0", () => {
    expect(canonicalStringify({ s: 'a"\\é', t: true, f: false, n: -5, z: -0 })).toBe(
      '{"f":false,"n":-5,"s":"a\\"\\\\é","t":true,"z":0}',
    );
  });

  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["1.5e300 (non sûr)", 1.5e300],
    ["2^53 (non sûr)", 2 ** 53],
    ["undefined", undefined],
    ["fonction", () => 1],
    ["symbole", Symbol("x")],
    ["bigint", 1n],
    ["Date", new Date(0)],
    ["Map", new Map()],
  ])("lève sur %s (directement et imbriqué)", (_n, v) => {
    expect(() => canonicalStringify(v)).toThrow(CanonicalError);
    expect(() => canonicalStringify({ a: [{ b: v }] })).toThrow(CanonicalError);
  });

  it("profondeur : 16 niveaux acceptés, 17 refusés (protège aussi des cycles)", () => {
    const nest = (n: number): unknown => (n === 0 ? 1 : [nest(n - 1)]);
    expect(() => canonicalStringify(nest(16))).not.toThrow();
    expect(() => canonicalStringify(nest(17))).toThrow(CanonicalError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalStringify(cyclic)).toThrow(CanonicalError);
  });

  it("objet à prototype nul accepté, accesseur refusé", () => {
    const o = Object.create(null) as Record<string, unknown>;
    o.a = 1;
    expect(canonicalStringify(o)).toBe('{"a":1}');
    const g = {};
    Object.defineProperty(g, "x", { get: () => 1, enumerable: true });
    expect(() => canonicalStringify(g)).toThrow(CanonicalError);
  });
});

describe("hash64 (gelé pour la v1)", () => {
  // Vecteurs figés : si l'un change, TOUTES les sauvegardes existantes deviennent invalides.
  it.each([
    ["", "488bdcb81aee8d83"],
    // Les 53 bits de poids faible = cyrb53("a") de référence (7929297801672961 = 0x1c2ba782c97901).
    ["a", "501c2ba782c97901"],
    ["mod-survie", "dd261d5e946a0191"],
    ['{"tick":0}', "d17c9194196e4d15"],
  ])("hash64(%j) = %s", (input, expected) => {
    expect(hash64(input)).toBe(expected);
  });

  it("les 53 bits de poids faible redonnent cyrb53 de référence (cyrb53('a'), cyrb53('b'))", () => {
    const low53 = (s: string): bigint => BigInt(`0x${hash64(s)}`) & ((1n << 53n) - 1n);
    expect(low53("a")).toBe(7929297801672961n);
    expect(low53("b")).toBe(8684336938537663n);
  });

  it("16 caractères hexadécimaux, 1 caractère changé ⇒ hash différent", () => {
    const base = '{"resources":{"wood":10}}';
    const h = hash64(base);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(hash64(base.replace("10", "11"))).not.toBe(h);
    expect(hash64(base + " ")).not.toBe(h);
    for (let i = 0; i < base.length; i++) {
      const mutated = base.slice(0, i) + String.fromCharCode(base.charCodeAt(i) ^ 1) + base.slice(i + 1);
      expect(hash64(mutated)).not.toBe(h);
    }
  });
});
