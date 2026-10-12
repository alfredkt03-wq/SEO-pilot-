import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { setResourceSeo } from "../lib/apply-fix.server";
import { recordFixesApplied } from "../lib/impact.server";
import { isEditorType, searchEditorResources, type EditorResourceType } from "../lib/editor";
import { META_DESC_MAX, SEO_TITLE_MAX, itemSeoScore } from "../lib/suggestions";
import { PageStrip } from "../components/PageStrip";
import { ScoreChip } from "../components/ScoreChip";

const TYPES: { value: EditorResourceType; label: string; plural: string }[] = [
  { value: "product", label: "Product", plural: "Products" },
  { value: "page", label: "Page", plural: "Pages" },
  { value: "collection", label: "Collection", plural: "Collections" },
];

const RESOURCE_TYPE_UPPER: Record<EditorResourceType, "PRODUCT" | "PAGE" | "COLLECTION"> = {
  product: "PRODUCT",
  page: "PAGE",
  collection: "COLLECTION",
};

const SEO_ISSUE_TYPES = [
  "MISSING_SEO_TITLE",
  "SEO_TITLE_TOO_LONG",
  "SEO_TITLE_TOO_SHORT",
  "DUPLICATE_SEO_TITLE",
  "MISSING_META_DESCRIPTION",
  "META_DESCRIPTION_TOO_LONG",
  "META_DESCRIPTION_TOO_SHORT",
  "DUPLICATE_META_DESCRIPTION",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const type: EditorResourceType = isEditorType(url.searchParams.get("type"))
    ? (url.searchParams.get("type") as EditorResourceType)
    : "product";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const items = await searchEditorResources(admin, type, q);
  return { type, q, items };
};

// Writing text by hand is free on every plan (same as the single-item editor).
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const type = form.get("type");
  if (!isEditorType(typeof type === "string" ? type : null)) {
    return { ok: false as const, saved: 0, errors: ["Unknown item type."] };
  }
  const resourceType = RESOURCE_TYPE_UPPER[type as EditorResourceType];
  const ids = form.getAll("id").map(String);

  let saved = 0;
  const errors: string[] = [];

  for (const gid of ids) {
    const title = String(form.get(`title:${gid}`) ?? "");
    const description = String(form.get(`description:${gid}`) ?? "");
    const origTitle = String(form.get(`origTitle:${gid}`) ?? "");
    const origDescription = String(form.get(`origDescription:${gid}`) ?? "");
    if (title === origTitle && description === origDescription) continue;

    const label = String(form.get(`label:${gid}`) ?? "an item");
    const result = await setResourceSeo(admin, resourceType, gid, { title, description });
    if (result.ok) {
      saved += 1;
      await db.seoIssue.updateMany({
        where: { shop: session.shop, resourceId: gid, type: { in: SEO_ISSUE_TYPES } },
        data: { fixed: true },
      });
    } else {
      errors.push(`${label}: ${result.error ?? "couldn't save"}`);
    }
  }

  if (saved > 0) await recordFixesApplied(session.shop, saved);
  return { ok: errors.length === 0, saved, errors };
};

const BULK_CSS = `
.bk-hint{font-size:12px;color:#5b6b85}
`;

export default function BulkEditor() {
  const { type, q, items } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const noun = TYPES.find((t) => t.value === type)?.label.toLowerCase() ?? type;
  const saving = fetcher.state !== "idle";

  useEffect(() => {
    const d = fetcher.data;
    if (!d || fetcher.state !== "idle") return;
    if (d.saved > 0) shopify.toast.show(`Saved ${d.saved} ${d.saved === 1 ? "item" : "items"}`);
    else if (d.errors.length === 0) shopify.toast.show("Nothing changed");
  }, [fetcher.data, fetcher.state, shopify]);

  const errors = fetcher.data?.errors ?? [];

  return (
    <s-page heading="Bulk editor" inlineSize="large">
      <PageStrip
        icon="pen"
        title="Edit many titles and descriptions at once"
        text="Change the text right in the table, then save everything in one click. Free on every plan."
      />
      <style>{BULK_CSS}</style>

      {errors.length > 0 && (
        <s-banner heading="Some items couldn't be saved" tone="warning">
          <s-unordered-list>
            {errors.map((e: string, i: number) => (
              <s-list-item key={i}>{e}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            {TYPES.map((t, i) => (
              <s-stack key={t.value} direction="inline" gap="base" alignItems="center">
                {i > 0 && <s-text color="subdued">·</s-text>}
                {t.value === type ? (
                  <s-text type="strong">{t.plural}</s-text>
                ) : (
                  <Link to={`/app/bulk?type=${t.value}`}>{t.plural}</Link>
                )}
              </s-stack>
            ))}
          </s-stack>

          <Form method="get">
            <input type="hidden" name="type" value={type} />
            <s-stack direction="inline" gap="base" alignItems="end">
              <s-text-field
                name="q"
                label={`Search ${noun}s by title`}
                labelAccessibilityVisibility="exclusive"
                placeholder={`Search ${noun}s by title…`}
                defaultValue={q}
              />
              <s-button type="submit">Search</s-button>
              {q && (
                <s-button variant="tertiary" href={`/app/bulk?type=${type}`}>
                  Clear
                </s-button>
              )}
            </s-stack>
          </Form>

          {items.length === 0 ? (
            <s-paragraph>
              {q
                ? `No ${noun}s match "${q}".`
                : `No ${noun}s found yet — add some in Shopify admin, then come back here.`}
            </s-paragraph>
          ) : (
            <fetcher.Form method="post" key={`${type}:${q}`}>
              <input type="hidden" name="type" value={type} />
              <s-stack direction="block" gap="base">
                <s-text color="subdued">
                  Best length: title up to {SEO_TITLE_MAX} characters, description up to {META_DESC_MAX}.
                  Only rows you change are saved.
                </s-text>
                {items.map((item) => (
                  <s-box key={item.id} padding="base" border="base" borderRadius="base">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name={`label:${item.id}`} value={item.title} />
                    <input type="hidden" name={`origTitle:${item.id}`} value={item.seoTitle} />
                    <input type="hidden" name={`origDescription:${item.id}`} value={item.seoDescription} />
                    <s-stack direction="block" gap="small-300">
                      <s-text type="strong">{item.title}</s-text>
                      {(() => {
                        const r = itemSeoScore(item.seoTitle, item.seoDescription);
                        return <ScoreChip score={r.score} tone={r.tone} />;
                      })()}
                      <s-text-field
                        name={`title:${item.id}`}
                        label="SEO title"
                        defaultValue={item.seoTitle}
                        placeholder={item.title}
                      />
                      <s-text-area
                        name={`description:${item.id}`}
                        label="Meta description"
                        rows={2}
                        defaultValue={item.seoDescription}
                      />
                    </s-stack>
                  </s-box>
                ))}
                <div>
                  <s-button type="submit" variant="primary" {...(saving ? { loading: true } : {})}>
                    Save all changes
                  </s-button>
                </div>
              </s-stack>
            </fetcher.Form>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
