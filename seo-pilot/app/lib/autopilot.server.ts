// New-product autopilot. Runs from the products/create webhook.
//  - Premium and above: the new product is checked and any missing SEO title or
//    description shows up on the Fixes page. Nothing on the store changes.
//  - Exclusive and Agency, if the merchant switched it on: the missing SEO
//    title and description are written automatically. Fields that already have
//    text are never touched.
import db from "../db.server";
import { setResourceSeo } from "./apply-fix.server";
import { recordFixesApplied } from "./impact.server";
import { tierFromPlanName, type Tier } from "./plans";
import { stripHtml, suggestMetaDescription, suggestSeoTitle } from "./suggestions";

export async function activeTier(admin: any): Promise<Tier> {
  try {
    const res = await admin.graphql(
      `#graphql
      query SeoPilotTier { currentAppInstallation { activeSubscriptions { name } } }`,
    );
    const name = (await res.json()).data?.currentAppInstallation?.activeSubscriptions?.[0]?.name;
    return tierFromPlanName(name);
  } catch {
    return "free";
  }
}

export const canWatch = (t: Tier) => t === "premium" || t === "exclusive" || t === "agency";
export const canAutoWrite = (t: Tier) => t === "exclusive" || t === "agency";

export async function handleNewProduct(admin: any, shop: string, productGid: string) {
  const tier = await activeTier(admin);
  if (!canWatch(tier)) return { skipped: "no plan" as const };

  const res = await admin.graphql(
    `#graphql
    query SeoPilotNewProduct($id: ID!) {
      product(id: $id) { id title handle descriptionHtml productType vendor seo { title description } }
    }`,
    { variables: { id: productGid } },
  );
  const p = (await res.json()).data?.product;
  if (!p) return { skipped: "not found" as const };

  const settings = await db.shopSettings.findUnique({
    where: { shop },
    select: { autoOptimizeNew: true, storeCurrency: true },
  });
  const ctx = { india: settings?.storeCurrency === "INR", kind: "PRODUCT" as const };
  const needTitle = !(p.seo?.title ?? "").trim();
  const needDesc = !(p.seo?.description ?? "").trim();
  if (!needTitle && !needDesc) return { skipped: "already set" as const };

  const title = needTitle ? suggestSeoTitle(p.title, p.productType, ctx) : undefined;
  const description = needDesc
    ? suggestMetaDescription(p.title, stripHtml(p.descriptionHtml), { productType: p.productType, vendor: p.vendor, ...ctx })
    : undefined;

  if (settings?.autoOptimizeNew && canAutoWrite(tier)) {
    const r = await setResourceSeo(admin, "PRODUCT", p.id, { title, description });
    if (r.ok) {
      await recordFixesApplied(shop, (title ? 1 : 0) + (description ? 1 : 0));
      return { wrote: true as const };
    }
  }

  // Watch only: list what's missing on the Fixes page (no duplicates).
  const base = { shop, resourceType: "PRODUCT", resourceId: p.id, resourceTitle: p.title, resourceHandle: p.handle };
  const rows = [
    title && { ...base, type: "MISSING_SEO_TITLE", severity: "HIGH", message: "No SEO title set — Shopify falls back to the resource title, which is rarely optimized for search.", suggestion: title },
    description && { ...base, type: "MISSING_META_DESCRIPTION", severity: "HIGH", message: "No meta description set — Google will generate one automatically, which usually converts worse.", suggestion: description },
  ].filter(Boolean) as Array<typeof base & { type: string; severity: string; message: string; suggestion: string }>;
  for (const row of rows) {
    const exists = await db.seoIssue.findFirst({ where: { shop, resourceId: p.id, type: row.type, fixed: false } });
    if (!exists) await db.seoIssue.create({ data: row });
  }
  return { flagged: rows.length };
}
