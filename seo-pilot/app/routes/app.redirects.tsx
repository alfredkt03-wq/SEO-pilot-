import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { checkPlan, requirePlan } from "../lib/billing.server";
import { recordRedirectCreated } from "../lib/impact.server";
import type { RedirectRow } from "../lib/types";

// Redirects are part of every paid plan (Basic and up); there is no free tier.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  const bulk = tier === "exclusive" || tier === "agency";
  const prefillPath = new URL(request.url).searchParams.get("path") ?? "";

  const redirectsRes = await admin.graphql(
    `#graphql
    query ListRedirects {
      urlRedirects(first: 100, reverse: true) {
        edges { node { id path target } }
      }
    }`,
  );
  const json = await redirectsRes.json();
  const redirects: RedirectRow[] = (json.data?.urlRedirects?.edges ?? []).map(
    (e: { node: RedirectRow }) => e.node,
  );

  return { redirects, prefillPath, bulk };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Redirect manager is a paid feature (Basic and up), like the rest of the app.
  if (intent === "create" || intent === "bulk" || intent === "delete") {
    await requirePlan(admin, billing, session.shop);
  }

  if (intent === "create") {
    const path = String(formData.get("path") || "").trim();
    const target = String(formData.get("target") || "").trim();
    if (!path.startsWith("/") || !target) {
      return { error: "Path must start with / and target can't be empty." };
    }
    const res = await admin.graphql(
      `#graphql
      mutation CreateRedirect($urlRedirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $urlRedirect) {
          urlRedirect { id path target }
          userErrors { field message }
        }
      }`,
      { variables: { urlRedirect: { path, target } } },
    );
    const json = await res.json();
    if ((json as any).errors?.length || !json.data?.urlRedirectCreate) {
      return { error: "Shopify didn't accept the redirect. Please try again in a moment." };
    }
    const errors = json.data.urlRedirectCreate.userErrors ?? [];
    if (errors.length > 0) {
      return { error: errors.map((e: any) => e.message).join("; ") };
    }
    await recordRedirectCreated(session.shop);
    return { ok: true };
  }

  if (intent === "bulk") {
    const { tier } = await checkPlan(billing);
    if (tier !== "exclusive" && tier !== "agency") {
      return { error: "Bulk import is on Exclusive and Agency." };
    }
    // One redirect per line: old path, then new path, separated by comma, tab or space.
    const lines = String(formData.get("lines") || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 200) return { error: "Up to 200 redirects at a time." };
    let made = 0;
    const failed: string[] = [];
    for (const line of lines) {
      const [from, to] = line.split(/[,\t ]+/).map((x) => x.trim());
      if (!from?.startsWith("/") || !to) { failed.push(line); continue; }
      const r = await admin.graphql(
        `#graphql
        mutation BulkRedirect($urlRedirect: UrlRedirectInput!) {
          urlRedirectCreate(urlRedirect: $urlRedirect) { userErrors { message } }
        }`,
        { variables: { urlRedirect: { path: from, target: to } } },
      );
      const rj = await r.json();
      if ((rj as any).errors?.length || !rj.data?.urlRedirectCreate) {
        // Usually Shopify throttling: wait briefly and try this line once more.
        await new Promise((ok) => setTimeout(ok, 1500));
        const r2 = await admin.graphql(
          `#graphql
          mutation BulkRedirectRetry($urlRedirect: UrlRedirectInput!) {
            urlRedirectCreate(urlRedirect: $urlRedirect) { userErrors { message } }
          }`,
          { variables: { urlRedirect: { path: from, target: to } } },
        );
        const rj2 = await r2.json();
        if ((rj2 as any).errors?.length || !rj2.data?.urlRedirectCreate || rj2.data.urlRedirectCreate.userErrors?.length) {
          failed.push(line);
        } else {
          made++;
          await recordRedirectCreated(session.shop);
        }
        continue;
      }
      const errs = rj.data.urlRedirectCreate.userErrors ?? [];
      if (errs.length) failed.push(line); else { made++; await recordRedirectCreated(session.shop); }
    }
    return failed.length
      ? { error: `${made} created. ${failed.length} skipped (bad format or already exists), first: ${failed[0]}` }
      : { ok: true };
  }

  if (intent === "delete") {
    const id = String(formData.get("id") || "");
    const res = await admin.graphql(
      `#graphql
      mutation DeleteRedirect($id: ID!) {
        urlRedirectDelete(id: $id) {
          deletedUrlRedirectId
          userErrors { field message }
        }
      }`,
      { variables: { id } },
    );
    const json = await res.json();
    if ((json as any).errors?.length || !json.data?.urlRedirectDelete) {
      return { error: "Shopify didn't delete the redirect. Please try again in a moment." };
    }
    const errors = json.data.urlRedirectDelete.userErrors ?? [];
    if (errors.length > 0) {
      return { error: errors.map((e: any) => e.message).join("; ") };
    }
    return { ok: true };
  }

  return { error: "Unknown action" };
};

export default function Redirects() {
  const { redirects, prefillPath, bulk } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (createFetcher.data && "error" in createFetcher.data && createFetcher.data.error) {
      shopify.toast.show(createFetcher.data.error, { isError: true });
    } else if (createFetcher.data && "ok" in createFetcher.data && createFetcher.data.ok) {
      shopify.toast.show("Saved");
    }
  }, [createFetcher.data, shopify]);

  return (
    <s-page heading="Redirects">
      <s-link slot="breadcrumb-actions" href="/app/tools">Tools</s-link>
      <s-section heading="Fix a broken link (404)">
        <s-paragraph>
          Point an old or mistyped URL to the right page. Example: redirect{" "}
          <s-text type="strong">/products/old-handle</s-text> to{" "}
          <s-text type="strong">/products/new-handle</s-text>.
        </s-paragraph>
        {/* Keyed on the current count so a successful create remounts the
            form (clearing the fields) instead of leaving stale text behind. */}
        <createFetcher.Form method="post" key={redirects.length}>
          <input type="hidden" name="intent" value="create" />
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field
              name="path"
              label="From path"
              placeholder="/products/old-handle"
              defaultValue={prefillPath}
            />
            <s-text-field
              name="target"
              label="Redirect to"
              placeholder="/products/new-handle"
            />
            <s-button type="submit" variant="primary">
              Create redirect
            </s-button>
          </s-stack>
        </createFetcher.Form>
      </s-section>

      <s-section heading="Import many at once">
        {bulk ? (
          <createFetcher.Form method="post">
            <input type="hidden" name="intent" value="bulk" />
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Moving stores or renaming lots of pages? Paste one redirect per line, old path then new
                path: <s-text type="strong">/products/old-name /products/new-name</s-text>. Up to 200 at a time.
              </s-paragraph>
              <s-text-area name="lines" label="Redirects" rows={6} />
              <s-button type="submit" variant="primary">Import redirects</s-button>
            </s-stack>
          </createFetcher.Form>
        ) : (
          <>
            <s-paragraph>Paste hundreds of redirects in one go. Included in Exclusive and Agency.</s-paragraph>
            <s-button href="/app/billing">See Exclusive</s-button>
          </>
        )}
      </s-section>

      <s-section heading={`Existing redirects (${redirects.length})`}>
        {redirects.length === 0 ? (
          <s-paragraph>No redirects yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>From</s-table-header>
              <s-table-header>To</s-table-header>
              <s-table-header>Remove</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {redirects.map((r: RedirectRow) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.path}</s-table-cell>
                  <s-table-cell>{r.target}</s-table-cell>
                  <s-table-cell>
                    <createFetcher.Form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={r.id} />
                      <s-button type="submit" variant="tertiary">
                        Delete
                      </s-button>
                    </createFetcher.Form>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
