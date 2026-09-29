// Homepage SEO check. The homepage's title, meta description and social
// sharing image are set under Online Store → Preferences in Shopify admin
// (and partly by the theme) — there's no Admin API field for them — so this
// reads what the live storefront actually serves. Issues found here are
// "needs a human look" items with instructions, never auto-fixed.
import type { DraftIssue } from "./seo-audit.server";
import { META_DESC_MAX, META_DESC_MIN, SEO_TITLE_MAX, SEO_TITLE_MIN } from "./suggestions";

export interface HomepageCheck {
  issues: DraftIssue[];
  checksTotal: number;
  checksPassed: number;
}

export interface HomepageFacts {
  title: string;
  metaDescription: string;
  h1Count: number;
  hasSocialImage: boolean;
}

const PREFERENCES = "Shopify admin → Online Store → Preferences";

// Returns null when the homepage can't be checked (password page on, network
// error, non-HTML response) — the caller then counts no checks at all rather
// than guessing.
export async function checkHomepage(shop: string): Promise<HomepageCheck | null> {
  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://${shop}/`, {
      signal: controller.signal,
      headers: { Accept: "text/html", "User-Agent": "SEO-Pilot-Homepage-Check/1.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    // Password-protected storefronts redirect "/" to "/password"
    if (res.url && new URL(res.url).pathname.startsWith("/password")) return null;
    html = await res.text();
  } catch {
    return null;
  }

  if (isPasswordPage(html)) return null;
  return evaluateHomepage(parseHomepage(html));
}

export function isPasswordPage(html: string): boolean {
  return /<form[^>]+action=["'][^"']*\/password["']/i.test(html) || /template-password/i.test(html);
}

export function parseHomepage(html: string): HomepageFacts {
  const head = html.split(/<\/head>/i)[0] ?? html;
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => parseAttributes(m[0]));

  const metaDescription =
    metas.find((a) => (a.name ?? "").toLowerCase() === "description")?.content ?? "";
  const hasSocialImage = metas.some(
    (a) => (a.property ?? "").toLowerCase() === "og:image" && Boolean(a.content?.trim()),
  );
  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;

  return {
    title: decodeEntities(titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim(),
    metaDescription: decodeEntities(metaDescription).replace(/\s+/g, " ").trim(),
    h1Count,
    hasSocialImage,
  };
}

export function evaluateHomepage(facts: HomepageFacts): HomepageCheck {
  const issues: DraftIssue[] = [];
  let checksTotal = 0;
  let checksPassed = 0;
  const base = {
    resourceType: "HOMEPAGE" as const,
    resourceId: "homepage",
    resourceTitle: "Homepage",
    resourceHandle: "",
  };

  checksTotal += 1;
  const titleLen = facts.title.length;
  if (titleLen === 0) {
    issues.push({
      ...base,
      type: "HOMEPAGE_TITLE",
      severity: "HIGH",
      message: `Your homepage has no title. Add one under ${PREFERENCES} → "Homepage title".`,
    });
  } else if (titleLen > SEO_TITLE_MAX) {
    issues.push({
      ...base,
      type: "HOMEPAGE_TITLE",
      severity: "LOW",
      message: `Homepage title is ${titleLen} characters — Google typically cuts it off past ${SEO_TITLE_MAX}. Shorten it under ${PREFERENCES}.`,
    });
  } else if (titleLen < SEO_TITLE_MIN) {
    issues.push({
      ...base,
      type: "HOMEPAGE_TITLE",
      severity: "MEDIUM",
      message: `Homepage title "${facts.title}" is very short. Say what you sell, e.g. "Brand – Handmade Cotton Kurtas". Change it under ${PREFERENCES}.`,
    });
  } else {
    checksPassed += 1;
  }

  checksTotal += 1;
  const descLen = facts.metaDescription.length;
  if (descLen === 0) {
    issues.push({
      ...base,
      type: "HOMEPAGE_META_DESCRIPTION",
      severity: "HIGH",
      message: `Your homepage has no meta description — this is the text under your store's name in Google. Add one under ${PREFERENCES}.`,
    });
  } else if (descLen > META_DESC_MAX) {
    issues.push({
      ...base,
      type: "HOMEPAGE_META_DESCRIPTION",
      severity: "LOW",
      message: `Homepage meta description is ${descLen} characters — Google typically cuts it off past ${META_DESC_MAX}. Shorten it under ${PREFERENCES}.`,
    });
  } else if (descLen < META_DESC_MIN) {
    issues.push({
      ...base,
      type: "HOMEPAGE_META_DESCRIPTION",
      severity: "LOW",
      message: `Homepage meta description is only ${descLen} characters — there's room to say what you sell and why to buy from you. Edit it under ${PREFERENCES}.`,
    });
  } else {
    checksPassed += 1;
  }

  checksTotal += 1;
  if (facts.h1Count === 0) {
    issues.push({
      ...base,
      type: "HOMEPAGE_H1",
      severity: "LOW",
      message:
        "Your homepage has no main heading (H1). Most themes use the first slideshow or banner heading — add a heading there that says what you sell.",
    });
  } else {
    checksPassed += 1;
  }

  checksTotal += 1;
  if (!facts.hasSocialImage) {
    issues.push({
      ...base,
      type: "HOMEPAGE_SOCIAL_IMAGE",
      severity: "LOW",
      message: `No social sharing image — links to your store on WhatsApp, Facebook and X show without a picture. Add one under ${PREFERENCES} → "Social sharing image".`,
    });
  } else {
    checksPassed += 1;
  }

  return { issues, checksTotal, checksPassed };
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? "";
  }
  return attrs;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—");
}
