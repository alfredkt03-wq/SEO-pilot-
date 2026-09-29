// Pure text helpers used to draft one-click SEO fixes without calling any
// external API. The AI writer (ai.server.ts) is the richer alternative; these
// templates are the always-available fallback and cost nothing to run.

export const SEO_TITLE_MIN = 10;
export const SEO_TITLE_MAX = 70;
// Google shows up to ~155-160 characters in the snippet, so under 120
// wastes free visible space — 120 is the "well optimized" floor most SEO
// tools (incl. TinySEO) use, not just an arbitrary cutoff.
export const META_DESC_MIN = 120;
export const META_DESC_MAX = 160;
export const THIN_CONTENT_WORDS = 40;

export interface FieldStatus {
  label: string;
  tone: "critical" | "caution" | "success";
}

// Shared by the manual editor and the Fixes table so both grade length the
// same way: red under min, green in range, red again once Google would
// truncate it.
export function fieldStatus(len: number, min: number, max: number): FieldStatus {
  if (len === 0) return { label: "empty", tone: "critical" };
  if (len > max) return { label: "too long, Google will likely truncate it", tone: "critical" };
  if (len < min) return { label: "a bit short", tone: "caution" };
  return { label: "good length", tone: "success" };
}

// Where the wording is aimed. "india" is used for stores that sell in INR:
// Indian shoppers very commonly search "<product> online in India" / "buy
// <product> online", the same pattern Amazon.in and Flipkart put in their
// own page titles — so for products and collections the suggestion includes
// it. Pages (About, Contact…) and blog posts keep neutral wording.
export interface SuggestContext {
  india?: boolean;
  kind?: "PRODUCT" | "COLLECTION" | "PAGE" | "ARTICLE";
}

const INDIA_TITLE_SUFFIX = " – Buy Online in India";

function wantsIndiaWording(ctx: SuggestContext): boolean {
  return Boolean(ctx.india) && (ctx.kind === "PRODUCT" || ctx.kind === "COLLECTION");
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–-]+$/, "").trim();
}

export function suggestSeoTitle(
  title: string,
  productType?: string | null,
  ctx: SuggestContext = {},
): string {
  const clean = title.trim();

  if (clean.length > SEO_TITLE_MAX) {
    return truncateAtWord(clean, SEO_TITLE_MAX);
  }

  if (wantsIndiaWording(ctx) && !/\bindia\b/i.test(clean)) {
    const withIndia = `${clean}${INDIA_TITLE_SUFFIX}`;
    if (withIndia.length <= SEO_TITLE_MAX) return withIndia;
  }

  if (clean.length >= SEO_TITLE_MIN) {
    return clean;
  }
  // Too short — pad with category context so it reads naturally and hits a
  // healthier length for search snippets.
  if (productType) {
    const padded = `${clean} – ${productType}`;
    return padded.length <= SEO_TITLE_MAX ? padded : clean;
  }
  return clean;
}

export function suggestMetaDescription(
  title: string,
  plainDescription: string,
  opts: { productType?: string | null; vendor?: string | null } & SuggestContext = {},
): string {
  const base = plainDescription.trim();
  const india = wantsIndiaWording(opts);

  if (base.length >= META_DESC_MIN) {
    // Lead with "Buy X online in India." only when the title is short enough
    // to leave most of the snippet for the store's own words.
    if (india && title.trim().length <= 50) {
      return truncateAtWord(`Buy ${title.trim()} online in India. ${base}`, META_DESC_MAX);
    }
    return truncateAtWord(base, META_DESC_MAX);
  }

  const parts: string[] = [];
  parts.push(india ? `Buy ${title.trim()}` : `Shop ${title.trim()}`);
  if (opts.productType) parts.push(`— ${opts.productType}`);
  if (opts.vendor) parts.push(`by ${opts.vendor}`);
  let sentence = parts.join(" ") + (india ? " online in India." : ".");
  if (base) {
    sentence += ` ${base}`;
  } else {
    sentence += india ? " See price, details and availability." : " See full details, pricing and availability.";
  }
  return truncateAtWord(sentence, META_DESC_MAX);
}

export function suggestAltText(resourceTitle: string, index: number, total: number): string {
  if (total <= 1) return resourceTitle.trim();
  return `${resourceTitle.trim()} — photo ${index} of ${total}`;
}
