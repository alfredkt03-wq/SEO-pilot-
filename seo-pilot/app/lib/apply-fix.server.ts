import db from "../db.server";
import type { SeoIssueRow } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Shopify's GraphQL Admin API is cost-based rate limited. A single fix here
// is cheap, but "fix everything" can fire hundreds of mutations back to
// back — without this, a bigger store's bulk fix starts hitting THROTTLED
// partway through and those issues get reported as failed even though
// nothing was actually wrong with them. Retries with backoff, then gives up
// and reports the real error if Shopify keeps throttling.
async function graphqlWithRetry(admin: any, query: string, options?: any, attempt = 1): Promise<any> {
  const res = await admin.graphql(query, options);
  const json = await res.json();
  const isThrottled =
    res.status === 429 || (json?.errors ?? []).some((e: any) => e.extensions?.code === "THROTTLED");
  if (isThrottled && attempt < 4) {
    await sleep(500 * attempt); // 500ms, 1s, 1.5s
    return graphqlWithRetry(admin, query, options, attempt + 1);
  }
  return json;
}

// Duplicate-title/description issues have no template suggestion (there's
// no safe way to make two titles unique mechanically), so they only become
// fixable once the AI writer has produced a unique replacement.
const TITLE_TYPES = new Set([
  "MISSING_SEO_TITLE",
  "SEO_TITLE_TOO_LONG",
  "SEO_TITLE_TOO_SHORT",
  "DUPLICATE_SEO_TITLE",
]);
const DESCRIPTION_TYPES = new Set([
  "MISSING_META_DESCRIPTION",
  "META_DESCRIPTION_TOO_LONG",
  "META_DESCRIPTION_TOO_SHORT",
  "DUPLICATE_META_DESCRIPTION",
]);

export function isFixable(issue: Pick<SeoIssueRow, "type" | "suggestion" | "resourceType">): boolean {
  if (!issue.suggestion) return false;
  if (issue.resourceType === "HOMEPAGE") return false;
  return (
    issue.type === "MISSING_ALT_TEXT" ||
    TITLE_TYPES.has(issue.type) ||
    DESCRIPTION_TYPES.has(issue.type) ||
    // Only ever has a suggestion when Pro's AI description writer made one
    (issue.type === "THIN_CONTENT" && (issue.resourceType === "PRODUCT" || issue.resourceType === "COLLECTION"))
  );
}

// admin is the authenticated GraphQL client from authenticate.admin()
export async function applyFix(
  admin: any,
  issue: Pick<SeoIssueRow, "type" | "resourceType" | "resourceId" | "imageId" | "suggestion">,
): Promise<{ ok: boolean; error?: string }> {
  if (!issue.suggestion) return { ok: false, error: "No suggestion available" };

  if (issue.type === "MISSING_ALT_TEXT") {
    if (!issue.imageId) return { ok: false, error: "Missing image reference" };
    const json = await graphqlWithRetry(
      admin,
      `#graphql
      mutation SeoPilotSetAlt($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) {
          files { id alt }
          userErrors { field message }
        }
      }`,
      { variables: { files: [{ id: issue.imageId, alt: issue.suggestion }] } },
    );
    return toResult(json, "fileUpdate");
  }

  if (issue.type === "THIN_CONTENT") {
    // Replaces the product/collection description shoppers see (HTML from
    // the AI writer, already limited to p/ul/li/strong).
    if (issue.resourceType === "PRODUCT") {
      const json = await graphqlWithRetry(
        admin,
        `#graphql
        mutation SeoPilotSetProductDescription($product: ProductUpdateInput!) {
          productUpdate(product: $product) {
            product { id }
            userErrors { field message }
          }
        }`,
        { variables: { product: { id: issue.resourceId, descriptionHtml: issue.suggestion } } },
      );
      return toResult(json, "productUpdate");
    }
    if (issue.resourceType === "COLLECTION") {
      const json = await graphqlWithRetry(
        admin,
        `#graphql
        mutation SeoPilotSetCollectionDescription($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection { id }
            userErrors { field message }
          }
        }`,
        { variables: { input: { id: issue.resourceId, descriptionHtml: issue.suggestion } } },
      );
      return toResult(json, "collectionUpdate");
    }
    return { ok: false, error: "Descriptions can only be written for products and collections" };
  }

  const isTitle = TITLE_TYPES.has(issue.type);
  const isDescription = DESCRIPTION_TYPES.has(issue.type);
  if (!isTitle && !isDescription) {
    return { ok: false, error: `No automatic fix for ${issue.type}` };
  }
  const seoInput = isTitle ? { title: issue.suggestion } : { description: issue.suggestion };

  if (issue.resourceType === "PRODUCT") {
    const json = await graphqlWithRetry(
      admin,
      `#graphql
      mutation SeoPilotSetProductSeo($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id seo { title description } }
          userErrors { field message }
        }
      }`,
      { variables: { product: { id: issue.resourceId, seo: seoInput } } },
    );
    return toResult(json, "productUpdate");
  }

  if (issue.resourceType === "COLLECTION") {
    const json = await graphqlWithRetry(
      admin,
      `#graphql
      mutation SeoPilotSetCollectionSeo($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id seo { title description } }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id: issue.resourceId, seo: seoInput } } },
    );
    return toResult(json, "collectionUpdate");
  }

  if (issue.resourceType === "PAGE") {
    // Pages have no first-class `seo` field — SEO
    // title/description live in the `global` metafield namespace
    // (title_tag / description_tag), the same fields the admin's search
    // engine listing preview reads/writes.
    const key = isTitle ? "title_tag" : "description_tag";
    const json = await graphqlWithRetry(
      admin,
      `#graphql
      mutation SeoPilotSetPageSeo($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key value }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId: issue.resourceId,
              namespace: "global",
              key,
              type: "single_line_text_field",
              value: issue.suggestion,
            },
          ],
        },
      },
    );
    return toResult(json, "metafieldsSet");
  }

  return { ok: false, error: `Unknown resource type ${issue.resourceType}` };
}

// Free-form save from the manual SEO editor (/app/editor) — unlike applyFix,
// which replays one pre-computed suggestion, this writes whatever title
// and/or description the merchant typed. Passing a field as `undefined`
// leaves that field untouched on the resource; pass an empty string to
// clear it. Same three resource-type branches as applyFix, because Product
// and Collection expose a native `seo{title,description}` field while Page
// stores the same two values as `global.title_tag` /
// `global.description_tag` metafields (it has no native `seo` field on
// the Admin GraphQL schema).
export async function setResourceSeo(
  admin: any,
  resourceType: "PRODUCT" | "COLLECTION" | "PAGE",
  resourceId: string,
  fields: { title?: string; description?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (fields.title === undefined && fields.description === undefined) {
    return { ok: false, error: "Nothing to save" };
  }

  if (resourceType === "PRODUCT") {
    const seo: Record<string, string> = {};
    if (fields.title !== undefined) seo.title = fields.title;
    if (fields.description !== undefined) seo.description = fields.description;
    const json = await graphqlWithRetry(
      admin,
      `#graphql
      mutation SeoPilotEditProductSeo($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id seo { title description } }
          userErrors { field message }
        }
      }`,
      { variables: { product: { id: resourceId, seo } } },
    );
    return toResult(json, "productUpdate");
  }

  if (resourceType === "COLLECTION") {
    const seo: Record<string, string> = {};
    if (fields.title !== undefined) seo.title = fields.title;
    if (fields.description !== undefined) seo.description = fields.description;
    const json = await graphqlWithRetry(
      admin,
      `#graphql
      mutation SeoPilotEditCollectionSeo($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id seo { title description } }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id: resourceId, seo } } },
    );
    return toResult(json, "collectionUpdate");
  }

  // PAGE
  const metafields: Array<{
    ownerId: string;
    namespace: string;
    key: string;
    type: string;
    value: string;
  }> = [];
  if (fields.title !== undefined) {
    metafields.push({
      ownerId: resourceId,
      namespace: "global",
      key: "title_tag",
      type: "single_line_text_field",
      value: fields.title,
    });
  }
  if (fields.description !== undefined) {
    metafields.push({
      ownerId: resourceId,
      namespace: "global",
      key: "description_tag",
      type: "single_line_text_field",
      value: fields.description,
    });
  }
  const json = await graphqlWithRetry(
    admin,
    `#graphql
    mutation SeoPilotEditPageSeo($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key value }
        userErrors { field message }
      }
    }`,
    { variables: { metafields } },
  );
  return toResult(json, "metafieldsSet");
}

// Sets or clears "noindex" on a product, collection or page — tells Google
// not to show it in search results. Works the same way title_tag/
// description_tag do: a metafield, read by the SEO Schema theme app embed
// (extensions/seo-schema), which emits <meta name="robots" content="noindex">
// when it's on. It has no effect until the merchant turns that embed on in
// Theme Editor > App embeds — same requirement as the JSON-LD it also ships.
export async function setNoindex(
  admin: any,
  resourceId: string,
  noindex: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const json = await graphqlWithRetry(
    admin,
    `#graphql
    mutation SeoPilotSetNoindex($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key value }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: resourceId,
            namespace: "seo_pilot",
            key: "noindex",
            type: "boolean",
            value: noindex ? "true" : "false",
          },
        ],
      },
    },
  );
  return toResult(json, "metafieldsSet");
}

export interface BulkFixResult {
  fixed: number;
  failed: number;
  errors: Array<{ issue: SeoIssueRow; error: string }>;
}

// Shared by the "Apply selected fixes" table (Fixes page) and the dashboard's
// one-click "Fix everything automatically" button, so both apply the exact
// same per-issue logic and can't silently drift apart.
export async function applyFixesToIssues(admin: any, issues: SeoIssueRow[]): Promise<BulkFixResult> {
  let fixed = 0;
  let failed = 0;
  const errors: BulkFixResult["errors"] = [];

  for (const issue of issues) {
    const result = await applyFix(admin, issue);
    if (result.ok) {
      await db.seoIssue.update({ where: { id: issue.id }, data: { fixed: true } });
      fixed += 1;
    } else {
      failed += 1;
      errors.push({ issue, error: result.error ?? "Unknown error" });
    }
    // A small gap between mutations, on top of graphqlWithRetry's backoff —
    // "fix everything" on a big catalog is exactly the case that would
    // otherwise slam straight into Shopify's rate limit.
    await sleep(150);
  }

  return { fixed, failed, errors };
}

function toResult(json: any, mutationName: string): { ok: boolean; error?: string } {
  const payload = json?.data?.[mutationName];
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e: any) => e.message).join("; ") };
  }
  if (json?.errors?.length) {
    return { ok: false, error: json.errors.map((e: any) => e.message).join("; ") };
  }
  return { ok: true };
}
