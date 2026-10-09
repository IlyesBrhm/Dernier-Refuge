// Analyse du Markdown des crédits (src/ui/credits-md.ts, docs/design/ui-polish.md §4.2, §5) :
// aucun HTML interprété, seuls les liens http(s) deviennent des liens.

import credits from "../../CREDITS.md?raw";
import creditsPanelSource from "../../src/ui/credits.ts?raw";
import { parseCreditsMd, parseInline, type CreditsBlock, type CreditsInline } from "../../src/ui/credits-md";

function inlinesOf(blocks: CreditsBlock[]): CreditsInline[] {
  return blocks.flatMap((b) => (b.type === "list" ? b.items.flat() : b.inlines));
}

const textOf = (xs: CreditsInline[]): string => xs.map((x) => x.text).join("");

describe("le vrai CREDITS.md", () => {
  const blocks = parseCreditsMd(credits);

  it("titres : « Crédits » (niveau 1), puis les sections de niveau 2", () => {
    const headings = blocks.filter((b): b is Extract<CreditsBlock, { type: "heading" }> => b.type === "heading");
    expect(headings[0]?.level).toBe(1);
    expect(textOf(headings[0]?.inlines ?? [])).toBe("Crédits");
    const h2 = headings.filter((h) => h.level === 2).map((h) => textOf(h.inlines));
    expect(h2).toContain("Modèles 3D");
    expect(h2).toContain("Polices et icônes");
  });

  it("tableaux rendus en listes : une entrée par ligne, première cellule en gras, en-têtes repris", () => {
    const lists = blocks.filter((b): b is Extract<CreditsBlock, { type: "list" }> => b.type === "list");
    const rows = lists.flatMap((l) => l.items);
    const kaykit = rows.find((r) => r[0]?.type === "strong" && r[0].text === "KayKit Adventurers 2.0");
    expect(kaykit).toBeDefined();
    expect(textOf(kaykit ?? [])).toContain("Auteur : Kay Lousberg");
    expect(textOf(kaykit ?? [])).toContain("Licence : CC0 1.0");
    for (const name of ["Survival Kit 2.0", "Lucide (icônes)"]) {
      expect(rows.some((r) => r[0]?.type === "strong" && r[0].text.startsWith(name.split(" (")[0] ?? name)), name).toBe(true);
    }
    // Aucune ligne de séparation « |---| » ne fuit dans le texte.
    expect(inlinesOf(blocks).some((x) => /\|\s*-{3}/.test(x.text))).toBe(false);
  });

  it("liens : autoliens <https://…> et liens Markdown, tous en http(s)", () => {
    const links = inlinesOf(blocks).filter((x): x is Extract<CreditsInline, { type: "link" }> => x.type === "link");
    expect(links.length).toBeGreaterThanOrEqual(8);
    expect(links.map((l) => l.href)).toContain("https://kaylousberg.itch.io/kaykit-adventurers");
    expect(links.map((l) => l.href)).toContain("https://creativecommons.org/publicdomain/zero/1.0/");
    for (const l of links) expect(l.href).toMatch(/^https?:\/\//);
  });

  it("gras et code en ligne reconnus ; aucun « ** » ni « ` » résiduel", () => {
    const all = inlinesOf(blocks);
    expect(all.some((x) => x.type === "strong" && x.text === "CC0 1.0")).toBe(true);
    expect(all.some((x) => x.type === "code" && x.text === "assets-src/")).toBe(true);
    expect(all.some((x) => x.type === "text" && (x.text.includes("**") || x.text.includes("`")))).toBe(false);
  });
});

describe("pas d'injection HTML", () => {
  it("<script> reste du texte", () => {
    const blocks = parseCreditsMd("# Titre <script>alert(1)</script>\n\nPara <img src=x onerror=alert(1)> fin");
    expect(blocks).toEqual([
      { type: "heading", level: 1, inlines: [{ type: "text", text: "Titre <script>alert(1)</script>" }] },
      { type: "paragraph", inlines: [{ type: "text", text: "Para <img src=x onerror=alert(1)> fin" }] },
    ]);
  });

  it("seuls http(s) deviennent des liens (javascript:, data:, vbscript:, relatif, mailto: ⇒ texte)", () => {
    for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "/local", "mailto:a@b.c", "//evil.example"]) {
      const out = parseInline(`[clic](${href})`);
      expect(out.some((x) => x.type === "link"), href).toBe(false);
      expect(textOf(out), href).toContain("clic");
    }
    expect(parseInline("<javascript:alert(1)>").some((x) => x.type === "link")).toBe(false);
    expect(parseInline("[ok](https://example.org/a?b=1)")).toEqual([{ type: "link", text: "ok", href: "https://example.org/a?b=1" }]);
    expect(parseInline("<HTTP://EXAMPLE.ORG>")).toEqual([{ type: "link", text: "HTTP://EXAMPLE.ORG", href: "HTTP://EXAMPLE.ORG" }]);
  });

  it("URL http(s) contenant des guillemets ou chevrons ⇒ pas de lien", () => {
    expect(parseInline('[x](https://a.example/"onmouseover=alert(1))').some((x) => x.type === "link")).toBe(false);
    expect(parseInline("[x](https://a.example/<b>)").some((x) => x.type === "link")).toBe(false);
  });

  it("le panneau des crédits construit le DOM sans innerHTML / insertAdjacentHTML / outerHTML", () => {
    // Code sans les commentaires (qui peuvent citer innerHTML pour dire qu'il n'est pas utilisé).
    const code = creditsPanelSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment/);
    expect(code).toMatch(/\.textContent\s*=/);
    // Liens externes : nouvel onglet sans accès à la page d'origine.
    expect(code).toMatch(/\.rel\s*=\s*"noopener"/);
  });
});

describe("robustesse", () => {
  it("ne lève jamais (entrées vides, nulles, bizarres) et ne renvoie que des types connus", () => {
    const inputs: unknown[] = [
      "",
      null,
      undefined,
      42,
      "|",
      "| a |\n|---|",
      "| a | b |\n|---|---|\n| [x](javascript:1) | <script> |",
      "#",
      "####### sept",
      "**non fermé",
      "`non fermé",
      "[a](",
      "- \n- x",
      "\r\n\r\n# A\r\ntexte\r\n",
      "x".repeat(20_000),
      "[".repeat(5000),
    ];
    for (const md of inputs) {
      let blocks: CreditsBlock[] = [];
      expect(() => (blocks = parseCreditsMd(md as string))).not.toThrow();
      for (const b of blocks) {
        expect(["heading", "paragraph", "list"]).toContain(b.type);
        for (const x of inlinesOf([b])) {
          expect(["text", "strong", "code", "link"]).toContain(x.type);
          expect(typeof x.text).toBe("string");
          if (x.type === "link") expect(x.href).toMatch(/^https?:\/\//i);
        }
      }
    }
  });

  it("titres au-delà du niveau 3 ramenés à 3 ; listes et paragraphes", () => {
    const blocks = parseCreditsMd("#### Quatre\n\n- a\n- **b**\n\nligne 1\nligne 2");
    expect(blocks[0]).toEqual({ type: "heading", level: 3, inlines: [{ type: "text", text: "Quatre" }] });
    expect(blocks[1]).toEqual({ type: "list", items: [[{ type: "text", text: "a" }], [{ type: "strong", text: "b" }]] });
    expect(blocks[2]).toEqual({ type: "paragraph", inlines: [{ type: "text", text: "ligne 1 ligne 2" }] });
  });

  it("tableau avec cellule malveillante : texte, pas de lien", () => {
    const blocks = parseCreditsMd("| Nom | Lien |\n|---|---|\n| <b>x</b> | [y](javascript:alert(1)) |");
    const items = blocks.find((b) => b.type === "list");
    expect(items?.type).toBe("list");
    const flat = items && items.type === "list" ? items.items.flat() : [];
    expect(flat.some((x) => x.type === "link")).toBe(false);
    expect(textOf(flat)).toContain("<b>x</b>");
  });
});
