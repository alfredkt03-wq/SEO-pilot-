// AI writing: SEO titles, meta descriptions and image alt text, written by
// Claude Haiku (Anthropic's cheapest current model) from the store's own
// product/page content. Called with plain fetch — no SDK dependency.
//
// Cost control: every generated text uses one credit from the shop's
// allowance (plans.ts). Rough cost per credit with Haiku 4.5 ($1 / $5 per
// million input/output tokens, Sept 2026): a few hundred input tokens plus
// ~60 output tokens for text, plus ~750 image tokens for alt text — well
// under $0.002 per credit.
//
// Environment:
//   ANTHROPIC_API_KEY   required — without it the AI buttons explain that
//                       AI writing isn't set up, and nothing else breaks
//   AI_MODEL            optional override of the model ID
//   ANTHROPIC_BASE_URL  optional, for testing against a local stub
import db from "../db.server";
import { AI_CREDITS, type Tier } from "./plans";
import { META_DESC_MAX, SEO_TITLE_MAX, stripHtml, truncateAtWord } from "./suggestions";
import type { SeoIssueRow } from "./types";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ALT_TEXT_MAX = 125;
const IMAGE_WIDTH = 768;
const MAX_IMAGE_BYTES = 4_500_000;
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const TITLE_ISSUE_TYPES = new Set([
  "MISSING_SEO_TITLE",
  "SEO_TITLE_TOO_LONG",
  "SEO_TITLE_TOO_SHORT",
  "DUPLICATE_SEO_TITLE",
]);
export const DESCRIPTION_ISSUE_TYPES = new Set([
  "MISSING_META_DESCRIPTION",
  "META_DESCRIPTION_TOO_LONG",
  "META_DESCRIPTION_TOO_SHORT",
  "DUPLICATE_META_DESCRIPTION",
]);

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Which issues the AI writer can produce a fix for. Thin product and
// collection descriptions need Premium or Exclusive (a longer text, and it
// replaces what the shopper reads on the page, not just the Google snippet).
export function isAiWritable(
  issue: Pick<SeoIssueRow, "type" | "resourceType" | "imageId">,
  tier: Tier = "free",
): boolean {
  if (issue.resourceType === "HOMEPAGE") return false;
  if (issue.type === "MISSING_ALT_TEXT") return Boolean(issue.imageId);
  if (issue.type === "THIN_CONTENT") {
    return (
      (tier === "premium" || tier === "exclusive" || tier === "agency") &&
      (issue.resourceType === "PRODUCT" || issue.resourceType === "COLLECTION")
    );
  }
  return TITLE_ISSUE_TYPES.has(issue.type) || DESCRIPTION_ISSUE_TYPES.has(issue.type);
}

// ---------------------------------------------------------------- credits

export interface AiAllowance {
  limit: number;
  used: number;
  remaining: number;
  period: "lifetime" | "month";
}

function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7); // "2026-09" (UTC)
}

export async function getAiAllowance(shop: string, tier: Tier): Promise<AiAllowance> {
  const row = await db.shopSettings.findUnique({
    where: { shop },
    select: { aiCreditsUsedTotal: true, aiCreditsMonth: true, aiCreditsUsedMonth: true },
  });
  const limit = AI_CREDITS[tier];
  if (tier !== "free") {
    const used = row?.aiCreditsMonth === currentMonth() ? row.aiCreditsUsedMonth : 0;
    return { limit, used, remaining: Math.max(0, limit - used), period: "month" };
  }
  const used = row?.aiCreditsUsedTotal ?? 0;
  return { limit, used, remaining: Math.max(0, limit - used), period: "lifetime" };
}

export async function recordAiCredits(shop: string, count: number): Promise<void> {
  if (count <= 0) return;
  const month = currentMonth();
  const row = await db.shopSettings.findUnique({
    where: { shop },
    select: { aiCreditsMonth: true },
  });
  if (!row) {
    await db.shopSettings.create({
      data: { shop, aiCreditsUsedTotal: count, aiCreditsMonth: month, aiCreditsUsedMonth: count },
    });
    return;
  }
  await db.shopSettings.update({
    where: { shop },
    data:
      row.aiCreditsMonth === month
        ? { aiCreditsUsedTotal: { increment: count }, aiCreditsUsedMonth: { increment: count } }
        : { aiCreditsUsedTotal: { increment: count }, aiCreditsMonth: month, aiCreditsUsedMonth: count },
  });
}

// ---------------------------------------------------------------- writing

export interface ResourceContext {
  kind: "PRODUCT" | "COLLECTION" | "PAGE";
  title: string;
  body: string;
  productType?: string | null;
  vendor?: string | null;
  currentSeoTitle?: string | null;
  currentSeoDescription?: string | null;
  // First product / collection image, for the description writer
  imageUrl?: string | null;
  // Store sells in INR
  india: boolean;
}

const SYSTEM_PROMPT = `You write search engine metadata for Shopify online stores.

Rules:
- Use only facts found in the information provided. Never invent prices, discounts, offers, shipping or delivery promises, cash on delivery, ratings, awards, materials, sizes or claims like "best" or "No. 1".
- Write in the same language as the product information.
- Natural, specific wording a shopper would click. No emojis, no ALL CAPS words, no exclamation marks, no keyword stuffing, no repeated words.
- Reply with the finished text only: no quotes, no labels, no explanation.`;

function describeResource(ctx: ResourceContext): string {
  const lines = [
    `Type: ${ctx.kind.toLowerCase()}`,
    `Name: ${ctx.title}`,
  ];
  if (ctx.productType) lines.push(`Category: ${ctx.productType}`);
  if (ctx.vendor) lines.push(`Brand: ${ctx.vendor}`);
  const body = stripHtml(ctx.body).slice(0, 1500);
  if (body) lines.push(`Description: ${body}`);
  if (ctx.currentSeoTitle) lines.push(`Current SEO title: ${ctx.currentSeoTitle}`);
  if (ctx.currentSeoDescription) lines.push(`Current meta description: ${ctx.currentSeoDescription}`);
  return lines.join("\n");
}

function indiaHint(ctx: ResourceContext): string {
  if (!ctx.india || (ctx.kind !== "PRODUCT" && ctx.kind !== "COLLECTION")) return "";
  return '\nThe store sells to shoppers in India. Where it reads naturally, include "online in India" or "in India" once.';
}

export async function aiWriteSeoTitle(ctx: ResourceContext): Promise<string> {
  const text = await callClaude(
    `${describeResource(ctx)}

Write the SEO title (the blue headline in Google results) for this ${ctx.kind.toLowerCase()}. 45–65 characters, never more than ${SEO_TITLE_MAX}. Most important search words first.${indiaHint(ctx)}`,
    120,
  );
  return finish(text, SEO_TITLE_MAX);
}

export async function aiWriteMetaDescription(ctx: ResourceContext): Promise<string> {
  const text = await callClaude(
    `${describeResource(ctx)}

Write the meta description (the text under the headline in Google results). 130–155 characters, never more than ${META_DESC_MAX}. Say what it is and give one concrete reason to click, based only on the information above.${indiaHint(ctx)}`,
    200,
  );
  return finish(text, META_DESC_MAX);
}

export async function aiWriteAltText(productTitle: string, imageUrl: string): Promise<string> {
  const image = await fetchImageForAi(imageUrl);
  const text = await callClaude(
    [
      {
        type: "image",
        source: { type: "base64", media_type: image.mediaType, data: image.base64 },
      },
      {
        type: "text",
        text: `This photo is on the Shopify product page for "${productTitle}". Write its alt text: describe what is visible, mention the product naturally, under ${ALT_TEXT_MAX} characters. Don't start with "Image of" or "Photo of".`,
      },
    ],
    120,
  );
  return finish(text, ALT_TEXT_MAX);
}

// Pro: writes a fuller product/collection description for thin-content
// items. Returns simple HTML (paragraphs and at most one bullet list), with
// every tag other than p/ul/li/strong removed. Uses the first product photo
// too, when there is one, so the text can describe what's actually visible
// instead of guessing.
export async function aiWriteDescriptionHtml(ctx: ResourceContext, imageUrl?: string | null): Promise<string> {
  const content: unknown[] = [];
  if (imageUrl) {
    try {
      const image = await fetchImageForAi(imageUrl);
      content.push({
        type: "image",
        source: { type: "base64", media_type: image.mediaType, data: image.base64 },
      });
    } catch {
      // Photo is optional — carry on with text only
    }
  }
  content.push({
    type: "text",
    text: `${describeResource(ctx)}

Write a ${ctx.kind === "COLLECTION" ? "collection" : "product"} description for the store page, 60–120 words.${imageUrl ? " A photo of it is attached — you may describe what is clearly visible in it." : ""} Only state facts from the information above${imageUrl ? " or visible in the photo" : ""}; if something (material, size, care, origin) isn't given, leave it out. Format as HTML using only <p>, <ul>, <li> and <strong> tags: one or two short paragraphs, optionally followed by one short bullet list of key features. No headings, no links, no prices, no shipping or delivery promises.${indiaHint(ctx)}`,
  });
  const raw = await callClaude(content, 500);
  const html = sanitizeDescriptionHtml(raw);
  if (stripHtml(html).split(/\s+/).filter(Boolean).length < 15) {
    throw new Error("AI returned too little text to use");
  }
  return html;
}

// Keeps only <p>, <ul>, <li>, <strong> (attribute-free); drops everything
// else. Exported for tests.
export function sanitizeDescriptionHtml(raw: string): string {
  let html = raw.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "");
  html = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (tag, name: string) => {
    const lower = name.toLowerCase();
    if (!["p", "ul", "li", "strong"].includes(lower)) return "";
    return tag.startsWith("</") ? `</${lower}>` : `<${lower}>`;
  });
  // Plain text with no tags at all: wrap each paragraph
  if (!/<p>|<ul>/.test(html)) {
    html = html
      .split(/\n\s*\n/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${para}</p>`)
      .join("");
  }
  return html.replace(/\s*\n\s*/g, " ").trim();
}

// ---------------------------------------------------------------- per issue

// Writes a fix for one scan issue with AI, looking up the resource's current
// content first so the text is based on the store's own words.
export async function aiSuggestionForIssue(
  admin: any,
  issue: Pick<SeoIssueRow, "type" | "resourceType" | "resourceId" | "resourceTitle" | "imageId">,
  india: boolean,
): Promise<string> {
  if (issue.type === "MISSING_ALT_TEXT") {
    if (!issue.imageId) throw new Error("Missing image reference");
    const res = await admin.graphql(
      `#graphql
      query SeoPilotAiImage($id: ID!) {
        node(id: $id) { ... on MediaImage { image { url } } }
      }`,
      { variables: { id: issue.imageId } },
    );
    const json = await res.json();
    const url: string | undefined = json.data?.node?.image?.url;
    if (!url) throw new Error("Couldn't find this image on Shopify");
    return aiWriteAltText(issue.resourceTitle, url);
  }

  const ctx = await loadResourceContext(admin, issue.resourceId, india);
  if (!ctx) throw new Error("Couldn't load this item from Shopify");
  if (issue.type === "THIN_CONTENT") return aiWriteDescriptionHtml(ctx, ctx.imageUrl);
  if (TITLE_ISSUE_TYPES.has(issue.type)) return aiWriteSeoTitle(ctx);
  if (DESCRIPTION_ISSUE_TYPES.has(issue.type)) return aiWriteMetaDescription(ctx);
  throw new Error("AI can't write a fix for this kind of issue");
}

export async function loadResourceContext(
  admin: any,
  resourceId: string,
  india: boolean,
): Promise<ResourceContext | null> {
  const res = await admin.graphql(
    `#graphql
    query SeoPilotAiResource($id: ID!) {
      node(id: $id) {
        __typename
        ... on Product {
          title
          description
          productType
          vendor
          seo { title description }
          featuredMedia { preview { image { url } } }
        }
        ... on Collection {
          title
          description
          seo { title description }
          image { url }
        }
        ... on Page {
          title
          body
          titleTag: metafield(namespace: "global", key: "title_tag") { value }
          descriptionTag: metafield(namespace: "global", key: "description_tag") { value }
        }
      }
    }`,
    { variables: { id: resourceId } },
  );
  const json = await res.json();
  const n = json.data?.node;
  if (!n) return null;
  const kindByType: Record<string, ResourceContext["kind"]> = {
    Product: "PRODUCT",
    Collection: "COLLECTION",
    Page: "PAGE",
  };
  const kind = kindByType[n.__typename];
  if (!kind) return null;
  return {
    kind,
    title: n.title ?? "",
    body: n.description ?? n.body ?? "",
    productType: n.productType ?? null,
    vendor: n.vendor ?? null,
    currentSeoTitle: n.seo?.title ?? n.titleTag?.value ?? null,
    currentSeoDescription: n.seo?.description ?? n.descriptionTag?.value ?? null,
    imageUrl: n.featuredMedia?.preview?.image?.url ?? n.image?.url ?? null,
    india,
  };
}

// Runs `worker` over `items` with at most `limit` running at once, so a batch
// of 25 AI calls finishes in a few seconds without hammering either API.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await worker(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// ---------------------------------------------------------------- plumbing

async function callClaude(content: string | unknown[], maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI writing isn't set up yet (no ANTHROPIC_API_KEY)");
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || DEFAULT_MODEL,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = json?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`AI request failed: ${detail}`);
    }
    const text = (json?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("");
    return text;
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("AI request timed out");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Cleans model output into a single line of the right length. Exported for
// tests.
export function finish(raw: string, maxLen: number): string {
  let text = raw.trim().split(/\r?\n/).find((l) => l.trim()) ?? "";
  text = text
    .replace(/^(seo title|title|meta description|description|alt text)\s*:\s*/i, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new Error("AI returned an empty answer");
  return truncateAtWord(text, maxLen);
}

async function fetchImageForAi(imageUrl: string): Promise<{ base64: string; mediaType: string }> {
  // Ask Shopify's CDN for a smaller copy (fewer tokens, faster) in a format
  // the model accepts — AVIF, which the CDN may otherwise pick, isn't.
  const url = new URL(imageUrl);
  url.searchParams.set("width", String(IMAGE_WIDTH));
  const res = await fetch(url, { headers: { Accept: "image/jpeg,image/png,image/webp;q=0.9" } });
  if (!res.ok) throw new Error(`Couldn't download the image (HTTP ${res.status})`);
  const mediaType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.includes(mediaType)) {
    throw new Error(`Image format ${mediaType || "unknown"} isn't supported for AI alt text`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image is too large for AI alt text");
  return { base64: bytes.toString("base64"), mediaType };
}
