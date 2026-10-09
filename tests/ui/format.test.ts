// Formatage des nombres du HUD (src/ui/format.ts, docs/design/ui-polish.md §1.8). Fonctions pures.

import { formatCount, formatExact } from "../../src/ui/format";

const NBSP = " "; // espace insécable avant l'unité
const NNBSP = " "; // espace fine insécable (séparateur de milliers de formatExact)
const MINUS = "−"; // moins typographique
const DASH = "—"; // tiret cadratin (valeur non finie)

describe("formatCount — table du plan (§1.8)", () => {
  const table: readonly [number, string][] = [
    [0, "0"],
    [7, "7"],
    [999, "999"],
    [1000, `1${NBSP}k`],
    [1099, `1${NBSP}k`], // « ,0 » omis (1,099 tronqué à 1,0)
    [1234, `1,2${NBSP}k`],
    [9999, `9,9${NBSP}k`], // tronqué, jamais arrondi à 10 k
    [10_000, `10${NBSP}k`],
    [12_345, `12${NBSP}k`],
    [999_999, `999${NBSP}k`],
    [1_000_000, `1${NBSP}M`],
    [3_456_789, `3,4${NBSP}M`],
    [340_000_000, `340${NBSP}M`],
    [1_000_000_000, `1${NBSP}Md`],
    [1_234_567_890, `1,2${NBSP}Md`],
    [-1234, `${MINUS}1,2${NBSP}k`],
    [-7, `${MINUS}7`],
    [12.7, "12"], // décimal tronqué vers 0
    [-12.7, `${MINUS}12`],
    [999.99, "999"],
    [1999.9, `1,9${NBSP}k`],
  ];
  for (const [n, want] of table) {
    it(`${n} ⇒ ${JSON.stringify(want)}`, () => {
      expect(formatCount(n)).toBe(want);
    });
  }

  it("NaN, +Infinity, −Infinity ⇒ « — »", () => {
    expect(formatCount(Number.NaN)).toBe(DASH);
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe(DASH);
    expect(formatCount(Number.NEGATIVE_INFINITY)).toBe(DASH);
  });

  it("−0 et les décimaux dans ]−1, 0[ ⇒ « 0 » sans signe", () => {
    expect(formatCount(-0)).toBe("0");
    expect(formatCount(-0.4)).toBe("0");
    expect(formatCount(-0.999)).toBe("0");
  });

  it("espace insécable U+00A0 (jamais une espace ordinaire) avant l'unité, moins U+2212 (jamais « - »)", () => {
    for (const n of [1000, 1234, 12_345, 3_456_789, 2e9, -5000]) {
      const s = formatCount(n);
      expect(s, String(n)).toMatch(new RegExp(`${NBSP}(k|M|Md)$`));
      expect(s, String(n)).not.toContain(" ");
      expect(s, String(n)).not.toContain("-");
    }
    expect(formatCount(-1234).startsWith(MINUS)).toBe(true);
  });

  it("Md n'a pas de plafond et jamais de notation exponentielle", () => {
    expect(formatCount(1e12)).toBe(`1000${NBSP}Md`);
    for (const n of [1e15, 1e21, 1e25, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]) {
      const s = formatCount(n);
      expect(s, String(n)).toMatch(new RegExp(`^\\d+${NBSP}Md$`));
      expect(s, String(n)).not.toMatch(/e/i);
    }
  });

  /** Valeur représentée par une sortie de formatCount (pour vérifier la troncature). */
  function parseCount(s: string): number {
    const m = s.match(new RegExp(`^(${MINUS}?)(\\d+)(?:,(\\d))?(?:${NBSP}(k|M|Md))?$`));
    if (!m) throw new Error(`forme inattendue : ${JSON.stringify(s)}`);
    const unit = m[4] === "Md" ? 1e9 : m[4] === "M" ? 1e6 : m[4] === "k" ? 1e3 : 1;
    const v = (Number(m[2]) + Number(m[3] ?? 0) / 10) * unit;
    return m[1] ? -v : v;
  }

  it("troncature : la valeur affichée ne dépasse jamais |n| et en garde au moins 90 % (balayage déterministe)", () => {
    let x = 12345;
    const next = (): number => {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      return x;
    };
    const samples: number[] = [];
    for (let k = 0; k < 13; k++) for (const m of [1, 2, 5, 9.99]) samples.push(Math.floor(m * 10 ** k));
    for (let i = 0; i < 2000; i++) samples.push(next() % 10 ** ((i % 11) + 1));
    for (const n of samples) {
      for (const v of [n, -n]) {
        const shown = Math.abs(parseCount(formatCount(v)));
        expect(shown, `${v} ⇒ ${formatCount(v)}`).toBeLessThanOrEqual(Math.abs(Math.trunc(v)));
        expect(shown, `${v} ⇒ ${formatCount(v)}`).toBeGreaterThanOrEqual(Math.abs(Math.trunc(v)) * 0.9);
      }
    }
  });

  it("ne lève jamais, même sur des entrées hors contrat", () => {
    const weird: unknown[] = [undefined, null, "12", "", {}, [], true, Symbol("s"), 10n, () => 1, Number.MIN_VALUE, -Number.MAX_VALUE];
    for (const w of weird) {
      expect(() => formatCount(w as number)).not.toThrow();
      expect(typeof formatCount(w as number)).toBe("string");
    }
    expect(formatCount("12" as unknown as number)).toBe(DASH); // pas de coercition implicite
  });
});

describe("formatExact — aria-label (§1.8)", () => {
  const table: readonly [number, string][] = [
    [0, "0"],
    [7, "7"],
    [999, "999"],
    [1000, `1${NNBSP}000`],
    [1234, `1${NNBSP}234`],
    [9999, `9${NNBSP}999`],
    [12_345, `12${NNBSP}345`],
    [999_999, `999${NNBSP}999`],
    [1_000_000, `1${NNBSP}000${NNBSP}000`],
    [3_456_789, `3${NNBSP}456${NNBSP}789`],
    [-1234, `${MINUS}1${NNBSP}234`],
    [12.7, "12"],
    [-0, "0"],
  ];
  for (const [n, want] of table) {
    it(`${n} ⇒ ${JSON.stringify(want)}`, () => {
      expect(formatExact(n)).toBe(want);
    });
  }

  it("NaN / ±Infinity ⇒ « — » ; grands nombres sans notation exponentielle ; ne lève jamais", () => {
    expect(formatExact(Number.NaN)).toBe(DASH);
    expect(formatExact(Number.POSITIVE_INFINITY)).toBe(DASH);
    expect(formatExact(Number.NEGATIVE_INFINITY)).toBe(DASH);
    expect(formatExact(1e21)).toBe(`1${`${NNBSP}000`.repeat(7)}`);
    expect(formatExact(1e21)).not.toMatch(/e/i);
    for (const w of [undefined, null, "1234", {}, Symbol("s"), 1n] as unknown[]) {
      expect(() => formatExact(w as number)).not.toThrow();
    }
  });

  it("séparateur U+202F uniquement (ni espace ordinaire, ni U+00A0)", () => {
    for (const n of [1234, 12_345_678, -987_654]) {
      const s = formatExact(n);
      expect(s).not.toContain(" ");
      expect(s).not.toContain(NBSP);
      expect(s.replaceAll(NNBSP, "").replace(MINUS, "-")).toBe(String(n));
    }
  });
});
