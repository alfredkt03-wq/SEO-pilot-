import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { setNoindex, setResourceSeo } from "../lib/apply-fix.server";
import { recordFixesApplied } from "../lib/impact.server";
import { TRIAL_DAYS } from "../lib/plans";
import { checkPlan, getPricing, getShopMarket, isIndianStore, requirePlan } from "../lib/billing.server";
import {
  aiConfigured,
  aiWriteMetaDescription,
  aiWriteSeoTitle,
  getAiAllowance,
  loadResourceContext,
  recordAiCredits,
} from "../lib/ai.server";
import {
  isEditorType,
  storefrontPath,
  toGid,
  type EditorResourceType,
} from "../lib/editor";
import { fieldStatus, META_DESC_MAX, META_DESC_MIN, SEO_TITLE_MAX, SEO_TITLE_MIN } from "../lib/suggestions";

const RESOURCE_TYPE_UPPER: Record<EditorResourceType, "PRODUCT" | "PAGE" | "COLLECTION"> = {
  product: "PRODUCT",
  page: "PAGE",
  collection: "COLLECTION",
};

const TITLE_ISSUE_TYPES = ["MISSING_SEO_TITLE", "SEO_TITLE_TOO_LONG", "SEO_TITLE_TOO_SHORT", "DUPLICATE_SEO_TITLE"];
const DESCRIPTION_ISSUE_TYPES = [
  "MISSING_META_DESCRIPTION",
  "META_DESCRIPTION_TOO_LONG",
  "META_DESCRIPTION_TOO_SHORT",
  "DUPLICATE_META_DESCRIPTION",
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);

  if (!isEditorType(params.type) || !params.id) {
    throw new Response("Not found", { status: 404 });
  }
  const type = params.type;
  const gid = toGid(type, params.id);

  const [nodeRes, planStatus, pricing] = await Promise.all([
    admin.graphql(
      `#graphql
      query SeoPilotEditorResource($id: ID!) {
        node(id: $id) {
          id
          ... on Product {
            title
            handle
            seo { title description }
            noindex: metafield(namespace: "seo_pilot", key: "noindex") { value }
          }
          ... on Page {
            title
            handle
            titleTag: metafield(namespace: "global", key: "title_tag") { value }
            descriptionTag: metafield(namespace: "global", key: "description_tag") { value }
            noindex: metafield(namespace: "seo_pilot", key: "noindex") { value }
          }
          ... on Collection {
            title
            handle
            seo { title description }
            noindex: metafield(namespace: "seo_pilot", key: "noindex") { value }
          }
        }
      }`,
      { variables: { id: gid } },
    ),
    checkPlan(billing),
    getPricing(admin, session.shop),
  ]);
  const { hasActivePayment, tier } = planStatus;
  const aiAllowance = await getAiAllowance(session.shop, tier);

  const json = await nodeRes.json();
  const node = json.data?.node;
  if (!node) {
    throw new Response("Not found", { status: 404 });
  }

  const seoTitle: string = node.seo?.title ?? node.titleTag?.value ?? "";
  const seoDescription: string = node.seo?.description ?? node.descriptionTag?.value ?? "";
  const noindex: boolean = node.noindex?.value === "true";

  return {
    type,
    id: params.id,
    resourceTitle: node.title as string,
    handle: node.handle as string,
    seoTitle,
    seoDescription,
    noindex,
    shopDomain: session.shop,
    hasActivePayment,
    pricing,
    ai: { ...aiAllowance, configured: aiConfigured() },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);

  if (!isEditorType(params.type) || !params.id) {
    throw new Response("Not found", { status: 404 });
  }
  const type = params.type;
  const gid = toGid(type, params.id);

  // Saving a manual edit, and AI writing from the editor, need the paid plan
  // (Free plan AI writes are used from the Fixes page).
  await requirePlan(admin, billing, session.shop);

  const formData = await request.formData();

  if (formData.get("intent") === "ai") {
    if (!aiConfigured()) return { mode: "ai" as const, ok: false as const, error: "AI writing isn't set up yet." };
    const { tier } = await checkPlan(billing);
    const allowance = await getAiAllowance(session.shop, tier);
    if (allowance.remaining < 2) {
      return { mode: "ai" as const, ok: false as const, error: "Not enough AI writes left this month (needs 2)." };
    }
    try {
      const market = await getShopMarket(admin, session.shop);
      const ctx = await loadResourceContext(admin, gid, isIndianStore(market));
      if (!ctx) return { mode: "ai" as const, ok: false as const, error: "Couldn't load this item." };
      const [aiTitle, aiDescription] = await Promise.all([aiWriteSeoTitle(ctx), aiWriteMetaDescription(ctx)]);
      await recordAiCredits(session.shop, 2);
      return { mode: "ai" as const, ok: true as const, title: aiTitle, description: aiDescription };
    } catch (err: any) {
      return { mode: "ai" as const, ok: false as const, error: err?.message ?? "AI writing failed" };
    }
  }

  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  const noindex = formData.get("noindex") === "true";

  const [result, noindexResult] = await Promise.all([
    setResourceSeo(admin, RESOURCE_TYPE_UPPER[type], gid, { title, description }),
    setNoindex(admin, gid, noindex),
  ]);

  if (!noindexResult.ok && result.ok) {
    // Title/description saved but noindex didn't — surface it rather than
    // silently dropping half the save.
    return { mode: "save" as const, ok: false as const, error: `Saved title/description, but couldn't save the noindex setting: ${noindexResult.error}` };
  }

  if (result.ok) {
    // Keep the Fixes list in sync — a manual edit here resolves the same
    // underlying issue an auto-fix would have (and the next scan will
    // re-derive the true state either way).
    const typesToClear = [...TITLE_ISSUE_TYPES, ...DESCRIPTION_ISSUE_TYPES];
    await db.seoIssue.updateMany({
      where: { shop: session.shop, resourceId: gid, type: { in: typesToClear } },
      data: { fixed: true },
    });
    await recordFixesApplied(session.shop, 1);
  }

  return { mode: "save" as const, ...result };
};

export default function EditorDetail() {
  const {
    type,
    resourceTitle,
    handle,
    seoTitle,
    seoDescription,
    noindex: initialNoindex,
    shopDomain,
    hasActivePayment,
    pricing,
    ai,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const aiFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [title, setTitle] = useState(seoTitle);
  const [description, setDescription] = useState(seoDescription);
  const [noindex, setNoindexState] = useState(initialNoindex);

  const saving = fetcher.state !== "idle";
  const aiWorking = aiFetcher.state !== "idle";

  useEffect(() => {
    const d = aiFetcher.data;
    if (d?.mode !== "ai" || aiFetcher.state !== "idle") return;
    if (d.ok) {
      setTitle(d.title);
      setDescription(d.description);
      shopify.toast.show("AI wrote a title and description — check them, then save");
    } else {
      shopify.toast.show(d.error, { isError: true });
    }
  }, [aiFetcher.data, aiFetcher.state, shopify]);

  const writeWithAi = () => aiFetcher.submit({ intent: "ai" }, { method: "post" });

  const titleLen = title.trim().length;
  const descLen = description.trim().length;

  const titleStatus = fieldStatus(titleLen, SEO_TITLE_MIN, SEO_TITLE_MAX);
  const descStatus = fieldStatus(descLen, META_DESC_MIN, META_DESC_MAX);

  const previewTitle = title.trim() || resourceTitle;
  const previewDescription =
    description.trim() || "No meta description set — Google will generate one automatically.";
  const previewUrl = `${shopDomain}${storefrontPath(type, handle)}`;

  const handleSave = () => {
    const data = new FormData();
    data.set("title", title.trim());
    data.set("description", description.trim());
    data.set("noindex", noindex ? "true" : "false");
    fetcher.submit(data, { method: "post" });
  };

  return (
    <s-page heading={resourceTitle} inlineSize="large">
      <s-button slot="primary-action" href="/app/editor" variant="tertiary">
        Back to editor
      </s-button>

      {!hasActivePayment && (
        <s-banner heading="Subscription required to save changes" tone="warning">
          <s-paragraph>
            You can preview changes for free. Saving needs Basic ({pricing.basic.priceLabel}/month
            after a {TRIAL_DAYS}-day free trial).
          </s-paragraph>
          <s-button slot="secondary-actions" href="/app/billing">
            View plan
          </s-button>
        </s-banner>
      )}

      {fetcher.data?.mode === "save" && !fetcher.data.ok && (
        <s-banner heading="Couldn't save" tone="critical">
          <s-paragraph>{fetcher.data.error}</s-paragraph>
        </s-banner>
      )}

      <s-section heading="Search engine listing">
        <s-stack direction="block" gap="large">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="small-300">
              <s-text color="subdued">{previewUrl}</s-text>
              <s-link href={`https://${previewUrl}`} target="_blank">
                <s-text type="strong">{truncatePreview(previewTitle, SEO_TITLE_MAX)}</s-text>
              </s-link>
              <s-text color="subdued">{truncatePreview(previewDescription, META_DESC_MAX)}</s-text>
            </s-stack>
          </s-box>

          <s-text-field
            name="title"
            label="SEO title"
            placeholder={resourceTitle}
            value={title}
            onInput={(e: any) => setTitle(e.target.value)}
            details={`${titleLen}/${SEO_TITLE_MAX} characters — ${titleStatus.label}`}
            error={titleStatus.tone === "critical" ? titleStatus.label : undefined}
          />

          <s-text-area
            name="description"
            label="Meta description"
            rows={3}
            value={description}
            onInput={(e: any) => setDescription(e.target.value)}
            details={`${descLen}/${META_DESC_MAX} characters — ${descStatus.label}`}
            error={descStatus.tone === "critical" ? descStatus.label : undefined}
          />

          <s-checkbox
            name="noindex"
            label="Hide from search engines (noindex)"
            checked={noindex}
            onChange={(e: any) => setNoindexState(Boolean(e.target.checked))}
            details="Hides this page from Google entirely — use only for a thin or duplicate page you don't want ranking. Needs the SEO Schema app embed turned on in Theme Editor to take effect."
          />

          {noindex && (
            <s-banner tone="warning">
              <s-paragraph>
                This page won't be shown in Google search results once this saves. Don't use this on
                a product you want customers to find.
              </s-paragraph>
            </s-banner>
          )}

          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button
              variant="primary"
              onClick={handleSave}
              disabled={!hasActivePayment}
              {...(saving ? { loading: true } : {})}
            >
              Save
            </s-button>
            {ai.configured && (
              <s-button
                onClick={writeWithAi}
                disabled={!hasActivePayment || ai.remaining < 2}
                {...(aiWorking ? { loading: true } : {})}
              >
                Write both with AI
              </s-button>
            )}
            {fetcher.data?.mode === "save" && fetcher.data.ok && !saving && (
              <s-badge tone="success">Saved</s-badge>
            )}
          </s-stack>
          {ai.configured && hasActivePayment && (
            <s-text color="subdued">
              AI uses 2 of your {ai.remaining} AI writes left this month. Nothing is saved until you
              press Save.
            </s-text>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Writing a good snippet">
        <s-unordered-list>
          <s-list-item>Titles: {SEO_TITLE_MIN}–{SEO_TITLE_MAX} characters, lead with the keyword that matters most.</s-list-item>
          <s-list-item>Descriptions: {META_DESC_MIN}–{META_DESC_MAX} characters, written like an ad — say what it is and why to click.</s-list-item>
          <s-list-item>Avoid repeating the exact same title or description on another page.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

function truncatePreview(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
