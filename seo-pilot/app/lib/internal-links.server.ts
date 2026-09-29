// Internal-link suggestions. When one page's text mentions another page by
// name ("our Merino Wool Socks are...") but doesn't link to it, that's a
// missed internal link. Google follows internal links to discover pages and
// to judge which ones matter, and shoppers use them to move around.
//
// Everything here is pure string work so it can be checked without Shopify.

import { extractInternalLinks } from "./links.server";

export type LinkKind = "PRODUCT" | "COLLECTION" | "PAGE";

export interface LinkNode {
  id: string;
  kind: LinkKind;
  title: string;
  handle: string;
  html: string;
}

export interface LinkSuggestion {
  sourceId: string;
  sourceKind: LinkKind;
  sourceTitle: string;
  targetKind: LinkKind;
  targetTitle: string;
  targetPath: string;
  phrase: string;
}

const SEGMENT: Record<LinkKind, string> = { PRODUCT: "products", COLLECTION: "collections", PAGE: "pages" };

export const pathFor = (kind: LinkKind, handle: string) => `/${SEGMENT[kind]}/${handle}`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Very short or one-short-word titles ("Tea", "Sale") would match everywhere.
const usableTitle = (t: string) => {
  const title = t.trim();
  return title.length >= 6 && /[a-z]/i.test(title);
};

// Splits html into tag and text pieces and reports, for each text piece,
// whether it sits inside an existing link or a heading. Those are skipped so
// we never nest a link inside a link or turn a heading into a link.
function pieces(html: string) {
  const parts = html.split(/(<[^>]*>)/g);
  let anchor = 0;
  let heading = 0;
  return parts.map((p) => {
    if (p.startsWith("<")) {
      const tag = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(p);
      if (tag) {
        const closing = tag[1] === "/";
        const name = tag[2].toLowerCase();
        if (name === "a") anchor = Math.max(0, anchor + (closing ? -1 : 1));
        if (/^h[1-6]$/.test(name)) heading = Math.max(0, heading + (closing ? -1 : 1));
      }
      return { text: p, isTag: true, skip: true };
    }
    return { text: p, isTag: false, skip: anchor > 0 || heading > 0 };
  });
}

// Finds the first place `title` appears as plain text, whole-word.
export function findLinkablePhrase(html: string, title: string): string | null {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(title.trim())})(?![\\p{L}\\p{N}])`, "iu");
  for (const p of pieces(html)) {
    if (p.skip) continue;
    const m = re.exec(p.text);
    if (m) return m[2];
  }
  return null;
}

// Wraps the first plain-text occurrence of `phrase` in a link.
export function insertLink(html: string, phrase: string, path: string): string | null {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(phrase)})(?![\\p{L}\\p{N}])`, "iu");
  let done = false;
  const out = pieces(html).map((p) => {
    if (done || p.skip) return p.text;
    const m = re.exec(p.text);
    if (!m) return p.text;
    done = true;
    const start = m.index + m[1].length;
    return `${p.text.slice(0, start)}<a href="${path}">${m[2]}</a>${p.text.slice(start + m[2].length)}`;
  });
  return done ? out.join("") : null;
}

export function suggestLinks(nodes: LinkNode[], max = 60): LinkSuggestion[] {
  const linked = new Map<string, Set<string>>();
  for (const n of nodes) {
    linked.set(
      n.id,
      new Set(extractInternalLinks(n.html).map((l) => `${l.resourceType}:${l.handle}`)),
    );
  }

  const targets = nodes.filter((n) => usableTitle(n.title));
  const out: LinkSuggestion[] = [];
  // Track one suggestion per (source, target) and at most 3 per source page,
  // so a long description doesn't get stuffed with links.
  const perSource = new Map<string, number>();

  for (const source of nodes) {
    if (!source.html) continue;
    for (const target of targets) {
      if (target.id === source.id) continue;
      if ((perSource.get(source.id) ?? 0) >= 3) break;
      if (linked.get(source.id)?.has(`${target.kind}:${target.handle.toLowerCase()}`)) continue;
      const phrase = findLinkablePhrase(source.html, target.title);
      if (!phrase) continue;
      perSource.set(source.id, (perSource.get(source.id) ?? 0) + 1);
      out.push({
        sourceId: source.id,
        sourceKind: source.kind,
        sourceTitle: source.title,
        targetKind: target.kind,
        targetTitle: target.title,
        targetPath: pathFor(target.kind, target.handle),
        phrase,
      });
      if (out.length >= max) return out;
    }
  }
  return out;
}

// Pulls the text of products, collections and pages (first 100 / 100 / 50).
const QUERY = `#graphql
  query SeoPilotLinkNodes {
    products(first: 100) { nodes { id title handle descriptionHtml } }
    collections(first: 100) { nodes { id title handle descriptionHtml } }
    pages(first: 50) { nodes { id title handle body } }
  }`;

export async function loadNodes(admin: any): Promise<LinkNode[]> {
  const res = await admin.graphql(QUERY);
  const d = (await res.json()).data ?? {};
  const map = (list: any[] | undefined, kind: LinkKind, field: string): LinkNode[] =>
    (list ?? []).map((n) => ({ id: n.id, kind, title: n.title, handle: n.handle, html: n[field] ?? "" }));
  return [
    ...map(d.pages?.nodes, "PAGE", "body"),
    ...map(d.collections?.nodes, "COLLECTION", "descriptionHtml"),
    ...map(d.products?.nodes, "PRODUCT", "descriptionHtml"),
  ];
}

