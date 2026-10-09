// Analyse minimale du Markdown de CREDITS.md (docs/design/ui-polish.md §4.2). PUR, sans DOM :
// titres, paragraphes, listes, tableaux (rendus en listes), et en ligne : liens [texte](url) et <url>,
// gras **x**, code `x`. Aucun HTML n'est interprété : tout reste du texte (le DOM est construit avec
// textContent par credits.ts). Seuls les liens http(s) deviennent des liens.

export type CreditsInline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type CreditsBlock =
  | { type: "heading"; level: 1 | 2 | 3; inlines: CreditsInline[] }
  | { type: "paragraph"; inlines: CreditsInline[] }
  | { type: "list"; items: CreditsInline[][] };

function safeHref(url: string): string | null {
  const u = url.trim();
  return /^https?:\/\/[^\s<>"]+$/i.test(u) ? u : null;
}

/** Éléments en ligne d'un texte. */
export function parseInline(src: string): CreditsInline[] {
  const out: CreditsInline[] = [];
  let buf = "";
  const flush = (): void => {
    if (buf) out.push({ type: "text", text: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\*\*([^*]+)\*\*/))) {
      flush();
      out.push({ type: "strong", text: m[1] ?? "" });
      i += m[0].length;
    } else if ((m = rest.match(/^`([^`]+)`/))) {
      flush();
      out.push({ type: "code", text: m[1] ?? "" });
      i += m[0].length;
    } else if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      flush();
      const href = safeHref(m[2] ?? "");
      out.push(href ? { type: "link", text: m[1] ?? "", href } : { type: "text", text: m[1] ?? "" });
      i += m[0].length;
    } else if ((m = rest.match(/^<(https?:\/\/[^>\s]+)>/i))) {
      flush();
      const href = safeHref(m[1] ?? "");
      out.push(href ? { type: "link", text: href, href } : { type: "text", text: m[0] });
      i += m[0].length;
    } else {
      buf += src[i];
      i++;
    }
  }
  flush();
  return out;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isTableSep = (line: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

/** Blocs du document. Ne lève jamais. */
export function parseCreditsMd(md: string): CreditsBlock[] {
  const blocks: CreditsBlock[] = [];
  const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: CreditsInline[][] | null = null;

  const flushPara = (): void => {
    if (para.length > 0) blocks.push({ type: "paragraph", inlines: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = (): void => {
    if (list && list.length > 0) blocks.push({ type: "list", items: list });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const t = line.trim();
    if (t === "") {
      flushPara();
      flushList();
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      const level = Math.min(3, (h[1] ?? "#").length) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, inlines: parseInline(h[2] ?? "") });
      continue;
    }
    // Tableau : ligne d'en-tête suivie d'une ligne de séparation.
    if (t.startsWith("|") && isTableSep(lines[i + 1] ?? "")) {
      flushPara();
      flushList();
      const header = splitRow(t);
      i += 2;
      const items: CreditsInline[][] = [];
      for (; i < lines.length; i++) {
        const row = (lines[i] ?? "").trim();
        if (!row.startsWith("|")) break;
        const cells = splitRow(row);
        const item: CreditsInline[] = [];
        cells.forEach((cell, k) => {
          if (k === 0) {
            item.push(...parseInline(cell).map((x) => (x.type === "text" ? { type: "strong" as const, text: x.text } : x)));
            return;
          }
          item.push({ type: "text", text: k === 1 ? " — " : " · " });
          const name = header[k];
          if (name) item.push({ type: "text", text: `${name.replace(/\*\*/g, "")} : ` });
          item.push(...parseInline(cell));
        });
        items.push(item);
      }
      i--;
      if (items.length > 0) blocks.push({ type: "list", items });
      continue;
    }
    const li = t.match(/^[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      if (!list) list = [];
      list.push(parseInline(li[1] ?? ""));
      continue;
    }
    flushList();
    para.push(t);
  }
  flushPara();
  flushList();
  return blocks;
}
