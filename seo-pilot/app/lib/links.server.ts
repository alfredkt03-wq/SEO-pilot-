// Finds internal storefront links (to /products/, /collections/ or /pages/)
// inside a block of HTML, so the audit can flag ones that point at a handle
// that no longer exists — the same "broken link detection" every competing
// SEO app advertises, without needing to crawl the live storefront.

export interface InternalLink {
  resourceType: "PRODUCT" | "COLLECTION" | "PAGE";
  handle: string;
  path: string;
}

const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;
const INTERNAL_PATH_RE = /^\/(products|collections|pages)\/([a-z0-9][a-z0-9-]*)/i;

const TYPE_BY_SEGMENT: Record<string, InternalLink["resourceType"]> = {
  products: "PRODUCT",
  collections: "COLLECTION",
  pages: "PAGE",
};

export function extractInternalLinks(html: string | null | undefined): InternalLink[] {
  if (!html) return [];
  const found = new Map<string, InternalLink>();
  let match: RegExpExecArray | null;
  HREF_RE.lastIndex = 0;
  while ((match = HREF_RE.exec(html))) {
    const raw = match[1];
    // Strip a same-origin absolute prefix if present (https://shop.com/products/x),
    // query strings and fragments, so we're left with a clean path.
    const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
    const path = withoutOrigin.split(/[?#]/)[0];
    const m = INTERNAL_PATH_RE.exec(path);
    if (!m) continue;
    const resourceType = TYPE_BY_SEGMENT[m[1].toLowerCase()];
    const handle = m[2].toLowerCase();
    const key = `${resourceType}:${handle}`;
    if (!found.has(key)) {
      found.set(key, { resourceType, handle, path: `/${m[1]}/${handle}` });
    }
  }
  return [...found.values()];
}
