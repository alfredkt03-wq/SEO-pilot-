import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { checkPlan, requirePlan } from "../lib/billing.server";
import { TRIAL_DAYS } from "../lib/plans";
import {
  insertLink,
  loadNodes,
  suggestLinks,
  type LinkKind,
  type LinkNode,
  type LinkSuggestion,
} from "../lib/internal-links.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  const { hasActivePayment } = await checkPlan(billing);
  if (!hasActivePayment) return { hasActivePayment, suggestions: [] as LinkSuggestion[] };
  const suggestions = suggestLinks(await loadNodes(admin));
  return { hasActivePayment, suggestions };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  await requirePlan(admin, billing, session.shop);

  const f = await request.formData();
  const sourceId = String(f.get("sourceId") ?? "");
  const sourceKind = String(f.get("sourceKind") ?? "") as LinkKind;
  const phrase = String(f.get("phrase") ?? "");
  const path = String(f.get("path") ?? "");
  if (!sourceId || !phrase || !/^\/(products|collections|pages)\/[a-z0-9-]+$/i.test(path)) {
    return { ok: false as const, error: "Missing link details." };
  }

  // Re-read the current text right before writing, so an edit made since the
  // page loaded is never overwritten with a stale copy.
  const field = sourceKind === "PAGE" ? "body" : "descriptionHtml";
  const res = await admin.graphql(
    `#graphql
    query SeoPilotLinkSource($id: ID!) {
      node(id: $id) {
        ... on Product { descriptionHtml }
        ... on Collection { descriptionHtml }
        ... on Page { body }
      }
    }`,
    { variables: { id: sourceId } },
  );
  const current: string | undefined = (await res.json()).data?.node?.[field];
  if (current == null) return { ok: false as const, error: "Couldn't read that page." };
  const updated = insertLink(current, phrase, path);
  if (!updated) return { ok: false as const, error: "That text has changed — reload to see fresh suggestions." };

  let mutation: string;
  let variables: Record<string, unknown>;
  if (sourceKind === "PRODUCT") {
    mutation = `#graphql
      mutation SeoPilotLinkProduct($product: ProductUpdateInput!) {
        productUpdate(product: $product) { userErrors { message } }
      }`;
    variables = { product: { id: sourceId, descriptionHtml: updated } };
  } else if (sourceKind === "COLLECTION") {
    mutation = `#graphql
      mutation SeoPilotLinkCollection($input: CollectionInput!) {
        collectionUpdate(input: $input) { userErrors { message } }
      }`;
    variables = { input: { id: sourceId, descriptionHtml: updated } };
  } else {
    mutation = `#graphql
      mutation SeoPilotLinkPage($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) { userErrors { message } }
      }`;
    variables = { id: sourceId, page: { body: updated } };
  }
  const out = await (await admin.graphql(mutation, { variables })).json();
  const errs = Object.values(out.data ?? {}).flatMap((v: any) => v?.userErrors ?? []);
  if (errs.length || (out as any).errors) {
    return { ok: false as const, error: errs[0]?.message ?? "Shopify couldn't save the change." };
  }
  return { ok: true as const };
};

const KIND_LABEL: Record<LinkKind, string> = { PRODUCT: "Product", COLLECTION: "Collection", PAGE: "Page" };

export default function InternalLinks() {
  const { hasActivePayment, suggestions } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) shopify.toast.show("Link added");
    else shopify.toast.show(fetcher.data.error, { isError: true });
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Internal links">
      <s-link slot="breadcrumb-actions" href="/app/tools">Tools</s-link>
      <s-section heading="What this does">
        <s-paragraph>
          Internal links are links from one page of your store to another. Google uses them to find
          your pages and to decide which ones matter. Below are places where a page already mentions
          another page by name but doesn't link to it. One click adds the link.
        </s-paragraph>
      </s-section>

      {!hasActivePayment ? (
        <s-banner heading="Start your free trial to use this" tone="info">
          <s-paragraph>Every plan includes it, with a {TRIAL_DAYS}-day free trial.</s-paragraph>
          <s-button slot="primary-action" href="/app/billing">See plans</s-button>
        </s-banner>
      ) : suggestions.length === 0 ? (
        <s-section heading="Suggestions">
          <s-paragraph>
            No missing links found in your first 100 products, 100 collections and 50 pages. Nice.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section heading={`${suggestions.length} link${suggestions.length === 1 ? "" : "s"} you can add`}>
          <s-table>
            <s-table-header-row>
              <s-table-header>On this page</s-table-header>
              <s-table-header>Link the words</s-table-header>
              <s-table-header>To</s-table-header>
              <s-table-header>Add</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {suggestions.map((s) => (
                <s-table-row key={`${s.sourceId}|${s.targetPath}`}>
                  <s-table-cell>
                    {s.sourceTitle} <s-badge>{KIND_LABEL[s.sourceKind]}</s-badge>
                  </s-table-cell>
                  <s-table-cell>“{s.phrase}”</s-table-cell>
                  <s-table-cell>
                    {s.targetTitle} <s-badge>{KIND_LABEL[s.targetKind]}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <fetcher.Form method="post">
                      <input type="hidden" name="sourceId" value={s.sourceId} />
                      <input type="hidden" name="sourceKind" value={s.sourceKind} />
                      <input type="hidden" name="phrase" value={s.phrase} />
                      <input type="hidden" name="path" value={s.targetPath} />
                      <s-button type="submit" variant="primary">Add link</s-button>
                    </fetcher.Form>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-section slot="aside" heading="Good to know">
        <s-paragraph>
          Only plain text is linked. Words already inside a link or a heading are skipped, and each
          page gets at most 3 suggestions so nothing looks stuffed.
        </s-paragraph>
        <s-paragraph>Reload this page after adding links to see fresh suggestions.</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
