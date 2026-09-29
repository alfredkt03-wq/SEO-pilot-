import db from "../db.server";
import { extractInternalLinks } from "./links.server";
import { checkHomepage } from "./homepage.server";
import {
  META_DESC_MAX,
  META_DESC_MIN,
  SEO_TITLE_MAX,
  SEO_TITLE_MIN,
  THIN_CONTENT_WORDS,
  type SuggestContext,
  stripHtml,
  suggestAltText,
  suggestMetaDescription,
  suggestSeoTitle,
  wordCount,
} from "./suggestions";

// How many resources of each type to pull per scan, in pages of PAGE_SIZE.
// The dashboard passes the plan's limit (SCAN_PAGES in plans.ts); this
// default is the Free plan's.
const PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 3; // 150 resources per type per scan

export type IssueType =
  | "MISSING_SEO_TITLE"
  | "SEO_TITLE_TOO_SHORT"
  | "SEO_TITLE_TOO_LONG"
  | "MISSING_META_DESCRIPTION"
  | "META_DESCRIPTION_TOO_SHORT"
  | "META_DESCRIPTION_TOO_LONG"
  | "MISSING_ALT_TEXT"
  | "OVERSIZED_IMAGE"
  | "THIN_CONTENT"
  | "DUPLICATE_SEO_TITLE"
  | "DUPLICATE_META_DESCRIPTION"
  | "BROKEN_INTERNAL_LINK"
  | "HOMEPAGE_TITLE"
  | "HOMEPAGE_META_DESCRIPTION"
  | "HOMEPAGE_H1"
  | "HOMEPAGE_SOCIAL_IMAGE";

// Images wider than this slow down page load (Core Web Vitals / LCP) without
// looking any sharper on a typical storefront. Shopify's CDN can serve a
// resized version, but the *source* file being this large still costs the
// merchant unnecessary storage and, on themes that don't use `image_url`
// transforms consistently, real load time.
const OVERSIZED_IMAGE_WIDTH = 2048;

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export type ScannedResourceType = "PRODUCT" | "PAGE" | "COLLECTION";

export interface DraftIssue {
  resourceType: ScannedResourceType | "HOMEPAGE";
  resourceId: string;
  resourceTitle: string;
  resourceHandle: string;
  imageId?: string;
  brokenLinkPath?: string;
  type: IssueType;
  severity: Severity;
  message: string;
  suggestion?: string;
}

interface ResourceRecord {
  resourceType: ScannedResourceType;
  id: string;
  title: string;
  handle: string;
  seoTitle: string;
  seoDescription: string;
  plainBody: string;
  rawBodyHtml: string;
  productType?: string | null;
  vendor?: string | null;
  images?: { id: string; alt: string | null; width: number | null }[];
}

interface FetchResult {
  records: ResourceRecord[];
  fullyScanned: boolean;
}

export interface AuditOptions {
  maxPages?: number;
  // Store sells in INR — suggestions use India-specific wording
  india?: boolean;
}

// admin is the authenticated GraphQL client returned by authenticate.admin()
export async function runSeoAudit(admin: any, shop: string, options: AuditOptions = {}) {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const india = Boolean(options.india);

  const productsResult = await fetchProducts(admin, maxPages);
  const pagesResult = await fetchPages(admin, maxPages);
  const collectionsResult = await fetchCollections(admin, maxPages);

  const products = productsResult.records;
  const pages = pagesResult.records;
  const collections = collectionsResult.records;

  const all: ResourceRecord[] = [...products, ...pages, ...collections];

  const issues: DraftIssue[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  const seoTitleMap = new Map<string, ResourceRecord[]>();
  const metaDescMap = new Map<string, ResourceRecord[]>();

  for (const item of all) {
    const r = evaluateResource(item, india);
    issues.push(...r.issues);
    checksTotal += r.checksTotal;
    checksPassed += r.checksPassed;

    if (item.seoTitle.trim()) {
      const key = item.seoTitle.trim().toLowerCase();
      seoTitleMap.set(key, [...(seoTitleMap.get(key) ?? []), item]);
    }
    if (item.seoDescription.trim()) {
      const key = item.seoDescription.trim().toLowerCase();
      metaDescMap.set(key, [...(metaDescMap.get(key) ?? []), item]);
    }
  }

  // Duplicate detection across the whole catalog — search engines penalize
  // identical titles/descriptions across multiple pages.
  for (const [, group] of seoTitleMap) {
    if (group.length > 1) {
      checksTotal += group.length;
      for (const item of group) {
        issues.push({
          resourceType: item.resourceType,
          resourceId: item.id,
          resourceTitle: item.title,
          resourceHandle: item.handle,
          type: "DUPLICATE_SEO_TITLE",
          severity: "MEDIUM",
          message: `SEO title is identical on ${group.length} resources.`,
        });
      }
    } else {
      checksTotal += 1;
      checksPassed += 1;
    }
  }
  for (const [, group] of metaDescMap) {
    if (group.length > 1) {
      checksTotal += group.length;
      for (const item of group) {
        issues.push({
          resourceType: item.resourceType,
          resourceId: item.id,
          resourceTitle: item.title,
          resourceHandle: item.handle,
          type: "DUPLICATE_META_DESCRIPTION",
          severity: "MEDIUM",
          message: `Meta description is identical on ${group.length} resources.`,
        });
      }
    } else {
      checksTotal += 1;
      checksPassed += 1;
    }
  }

  // Broken internal links — only trustworthy for a resource type once we've
  // actually seen its whole catalog (see `fullyScanned`); otherwise a link
  // to page 151 of a 400-product catalog would be wrongly flagged as dead.
  const handleSets: Record<"PRODUCT" | "COLLECTION" | "PAGE", Set<string> | null> = {
    PRODUCT: productsResult.fullyScanned ? new Set(products.map((p) => p.handle)) : null,
    COLLECTION: collectionsResult.fullyScanned ? new Set(collections.map((c) => c.handle)) : null,
    PAGE: pagesResult.fullyScanned ? new Set(pages.map((p) => p.handle)) : null,
  };

  for (const item of all) {
    const links = extractInternalLinks(item.rawBodyHtml);
    for (const link of links) {
      const knownHandles = handleSets[link.resourceType];
      if (!knownHandles) continue; // can't verify this resource type yet
      checksTotal += 1;
      if (knownHandles.has(link.handle)) {
        checksPassed += 1;
        continue;
      }
      issues.push({
        resourceType: item.resourceType,
        resourceId: item.id,
        resourceTitle: item.title,
        resourceHandle: item.handle,
        type: "BROKEN_INTERNAL_LINK",
        severity: "HIGH",
        message: `Links to ${link.path}, which doesn't match any scanned ${link.resourceType.toLowerCase()} handle. Fix the link or add a redirect.`,
        brokenLinkPath: link.path,
      });
    }
  }

  // Homepage — checked from the live storefront HTML, because its SEO title
  // and description are theme/Preferences settings with no Admin API field.
  // Skipped (no issues, no checks counted) when the storefront is password
  // protected; the sitemap banner already covers that case.
  const homepage = await checkHomepage(shop);
  if (homepage) {
    checksTotal += homepage.checksTotal;
    checksPassed += homepage.checksPassed;
    issues.push(...homepage.issues);
  }

  const score = checksTotal === 0 ? 100 : Math.round((checksPassed / checksTotal) * 100);

  const sitemapOk = await checkSitemapReachable(shop);
  const previous = await db.seoScan.findUnique({ where: { shop }, select: { score: true } });

  // One transaction — a connection drop between the delete and the insert
  // used to leave the shop with a completed scan but zero issues on file.
  await db.$transaction([
    db.seoIssue.deleteMany({ where: { shop } }),
    ...(issues.length > 0
      ? [
          db.seoIssue.createMany({
            data: issues.map((i) => ({
              shop,
              resourceType: i.resourceType,
              resourceId: i.resourceId,
              resourceTitle: i.resourceTitle,
              resourceHandle: i.resourceHandle,
              imageId: i.imageId,
              brokenLinkPath: i.brokenLinkPath,
              type: i.type,
              severity: i.severity,
              message: i.message,
              suggestion: i.suggestion,
              aiGenerated: false,
            })),
          }),
        ]
      : []),
  ]);

  // Only these fields are persisted (they match the SeoScan columns) — the
  // fully-scanned flags below are returned to the caller for an immediate
  // "this scan didn't cover your whole catalog" notice, but deliberately
  // aren't stored, so adding them never risks drifting from the actual
  // database schema.
  const dbFields = {
    score,
    productsScanned: products.length,
    pagesScanned: pages.length,
    collectionsScanned: collections.length,
    totalIssues: issues.length,
    sitemapOk,
    previousScore: previous?.score ?? null,
  };

  await db.seoScan.upsert({
    where: { shop },
    update: { ...dbFields, scannedAt: new Date() },
    create: { shop, ...dbFields },
  });

  return {
    ...dbFields,
    // True only when this run actually reached the end of that resource
    // type's catalog (see fetchProducts/fetchPages/fetchCollections) — false
    // means the store has more than maxPages * PAGE_SIZE of that type, so
    // the score above is based on a subset, not the whole catalog.
    productsFullyScanned: productsResult.fullyScanned,
    pagesFullyScanned: pagesResult.fullyScanned,
    collectionsFullyScanned: collectionsResult.fullyScanned,
  };
}

function evaluateResource(item: ResourceRecord, india: boolean): {
  issues: DraftIssue[];
  checksTotal: number;
  checksPassed: number;
} {
  const issues: DraftIssue[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  const base = {
    resourceType: item.resourceType,
    resourceId: item.id,
    resourceTitle: item.title,
    resourceHandle: item.handle,
  };
  const ctx: SuggestContext = { india, kind: item.resourceType };

  // SEO title
  checksTotal += 1;
  const titleLen = item.seoTitle.trim().length;
  if (titleLen === 0) {
    issues.push({
      ...base,
      type: "MISSING_SEO_TITLE",
      severity: "HIGH",
      message: "No SEO title set — Shopify falls back to the resource title, which is rarely optimized for search.",
      suggestion: suggestSeoTitle(item.title, item.productType, ctx),
    });
  } else if (titleLen > SEO_TITLE_MAX) {
    issues.push({
      ...base,
      type: "SEO_TITLE_TOO_LONG",
      severity: "LOW",
      message: `SEO title is ${titleLen} characters — Google typically truncates past ${SEO_TITLE_MAX}.`,
      suggestion: suggestSeoTitle(item.seoTitle, item.productType),
    });
  } else if (titleLen < SEO_TITLE_MIN) {
    issues.push({
      ...base,
      type: "SEO_TITLE_TOO_SHORT",
      severity: "LOW",
      message: `SEO title is only ${titleLen} characters — too short to describe the page well.`,
      suggestion: suggestSeoTitle(item.title, item.productType, ctx),
    });
  } else {
    checksPassed += 1;
  }

  // Meta description
  checksTotal += 1;
  const descLen = item.seoDescription.trim().length;
  if (descLen === 0) {
    issues.push({
      ...base,
      type: "MISSING_META_DESCRIPTION",
      severity: "HIGH",
      message: "No meta description set — Google will generate one automatically, which usually converts worse.",
      suggestion: suggestMetaDescription(item.title, item.plainBody, {
        productType: item.productType,
        vendor: item.vendor,
        ...ctx,
      }),
    });
  } else if (descLen > META_DESC_MAX) {
    issues.push({
      ...base,
      type: "META_DESCRIPTION_TOO_LONG",
      severity: "LOW",
      message: `Meta description is ${descLen} characters — Google typically truncates past ${META_DESC_MAX}.`,
      suggestion: suggestMetaDescription(item.title, stripHtml(item.seoDescription), {
        productType: item.productType,
        vendor: item.vendor,
      }),
    });
  } else if (descLen < META_DESC_MIN) {
    issues.push({
      ...base,
      type: "META_DESCRIPTION_TOO_SHORT",
      severity: "LOW",
      message: `Meta description is only ${descLen} characters — there's room to say more and improve click-through.`,
      suggestion: suggestMetaDescription(item.title, item.plainBody, {
        productType: item.productType,
        vendor: item.vendor,
        ...ctx,
      }),
    });
  } else {
    checksPassed += 1;
  }

  // Thin content
  checksTotal += 1;
  const words = wordCount(item.plainBody);
  if (words < THIN_CONTENT_WORDS) {
    issues.push({
      ...base,
      type: "THIN_CONTENT",
      severity: "MEDIUM",
      message: `Only ${words} word${words === 1 ? "" : "s"} of body content — thin pages tend to rank worse.`,
    });
  } else {
    checksPassed += 1;
  }

  // Image alt text + oversized source files (products only, for now)
  if (item.images) {
    const total = item.images.length;
    item.images.forEach((img, idx) => {
      checksTotal += 1;
      if (!img.alt || !img.alt.trim()) {
        issues.push({
          ...base,
          type: "MISSING_ALT_TEXT",
          severity: "MEDIUM",
          message: `Image ${idx + 1} of ${total} is missing alt text.`,
          suggestion: suggestAltText(item.title, idx + 1, total),
          imageId: img.id,
        });
      } else {
        checksPassed += 1;
      }

      checksTotal += 1;
      if (img.width && img.width > OVERSIZED_IMAGE_WIDTH) {
        issues.push({
          ...base,
          type: "OVERSIZED_IMAGE",
          severity: "LOW",
          message: `Image ${idx + 1} of ${total} is ${img.width}px wide — resize/compress it before upload to speed up page load.`,
          imageId: img.id,
        });
      } else {
        checksPassed += 1;
      }
    });
  }

  return { issues, checksTotal, checksPassed };
}

// Confirms /sitemap.xml actually serves a sitemap. This catches the classic
// Shopify footgun where the storefront's password/"coming soon" page is
// still on, which returns 200 for every URL (sitemap included) but with
// login-page HTML instead of XML — Google can't index anything in that
// state. Always checked against the *.myshopify.com domain, which resolves
// regardless of what custom domain is connected.
async function checkSitemapReachable(shop: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://${shop}/sitemap.xml`, {
      signal: controller.signal,
      headers: { Accept: "application/xml,text/xml" },
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const text = await res.text();
    return /<(sitemapindex|urlset)[\s>]/i.test(text);
  } catch {
    // Network hiccup or timeout — don't fail the whole scan over it, but
    // don't claim the sitemap is fine either.
    return false;
  }
}

async function fetchProducts(admin: any, maxPages: number): Promise<FetchResult> {
  const records: ResourceRecord[] = [];
  let cursor: string | null = null;
  let fullyScanned = false;
  for (let page = 0; page < maxPages; page++) {
    const response: Response = await admin.graphql(
      `#graphql
      query ScanProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              description
              descriptionHtml
              vendor
              productType
              seo { title description }
              media(first: 10) {
                edges {
                  node {
                    id
                    alt
                    mediaContentType
                    ... on MediaImage { image { width } }
                  }
                }
              }
            }
          }
        }
      }`,
      { variables: { first: PAGE_SIZE, after: cursor } },
    );
    const json = await response.json();
    const conn = json.data?.products;
    for (const edge of conn?.edges ?? []) {
      const n = edge.node;
      records.push({
        resourceType: "PRODUCT",
        id: n.id,
        title: n.title,
        handle: n.handle,
        seoTitle: n.seo?.title ?? "",
        seoDescription: n.seo?.description ?? "",
        plainBody: n.description ?? "",
        rawBodyHtml: n.descriptionHtml ?? "",
        vendor: n.vendor,
        productType: n.productType,
        images: (n.media?.edges ?? [])
          .filter((e: any) => e.node.mediaContentType === "IMAGE")
          .map((e: any) => ({
            id: e.node.id,
            alt: e.node.alt,
            width: e.node.image?.width ?? null,
          })),
      });
    }
    if (!conn?.pageInfo?.hasNextPage) {
      fullyScanned = true;
      break;
    }
    cursor = conn.pageInfo.endCursor;
  }
  return { records, fullyScanned };
}

// Unlike Product and Collection, the Page type has no first-class `seo`
// field — its SEO title/description live in the `global` metafield
// namespace (`title_tag` / `description_tag`), the same fields the Shopify
// admin's "Search engine listing preview" panel reads and writes for Pages.
async function fetchPages(admin: any, maxPages: number): Promise<FetchResult> {
  const records: ResourceRecord[] = [];
  let cursor: string | null = null;
  let fullyScanned = false;
  for (let page = 0; page < maxPages; page++) {
    const response: Response = await admin.graphql(
      `#graphql
      query ScanPages($first: Int!, $after: String) {
        pages(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              body
              titleTag: metafield(namespace: "global", key: "title_tag") { value }
              descriptionTag: metafield(namespace: "global", key: "description_tag") { value }
            }
          }
        }
      }`,
      { variables: { first: PAGE_SIZE, after: cursor } },
    );
    const json = await response.json();
    const conn = json.data?.pages;
    for (const edge of conn?.edges ?? []) {
      const n = edge.node;
      records.push({
        resourceType: "PAGE",
        id: n.id,
        title: n.title,
        handle: n.handle,
        seoTitle: n.titleTag?.value ?? "",
        seoDescription: n.descriptionTag?.value ?? "",
        plainBody: stripHtml(n.body),
        rawBodyHtml: n.body ?? "",
      });
    }
    if (!conn?.pageInfo?.hasNextPage) {
      fullyScanned = true;
      break;
    }
    cursor = conn.pageInfo.endCursor;
  }
  return { records, fullyScanned };
}

async function fetchCollections(admin: any, maxPages: number): Promise<FetchResult> {
  const records: ResourceRecord[] = [];
  let cursor: string | null = null;
  let fullyScanned = false;
  for (let page = 0; page < maxPages; page++) {
    const response: Response = await admin.graphql(
      `#graphql
      query ScanCollections($first: Int!, $after: String) {
        collections(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              descriptionHtml
              seo { title description }
            }
          }
        }
      }`,
      { variables: { first: PAGE_SIZE, after: cursor } },
    );
    const json = await response.json();
    const conn = json.data?.collections;
    for (const edge of conn?.edges ?? []) {
      const n = edge.node;
      records.push({
        resourceType: "COLLECTION",
        id: n.id,
        title: n.title,
        handle: n.handle,
        seoTitle: n.seo?.title ?? "",
        seoDescription: n.seo?.description ?? "",
        plainBody: stripHtml(n.descriptionHtml),
        rawBodyHtml: n.descriptionHtml ?? "",
      });
    }
    if (!conn?.pageInfo?.hasNextPage) {
      fullyScanned = true;
      break;
    }
    cursor = conn.pageInfo.endCursor;
  }
  return { records, fullyScanned };
}

