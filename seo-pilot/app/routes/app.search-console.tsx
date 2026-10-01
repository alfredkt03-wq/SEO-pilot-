import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { checkPlan } from "../lib/billing.server";
import { disconnectGsc, getGscStatus, gscConfigured, refreshGscStats } from "../lib/gsc.server";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  const eligible = tier === "premium" || tier === "exclusive" || tier === "agency";

  if (!eligible || !gscConfigured()) {
    return { eligible, configured: gscConfigured(), status: null as Awaited<ReturnType<typeof getGscStatus>> | null };
  }

  let status = await getGscStatus(session.shop);
  const stale =
    status.connected && (!status.lastCheckedAt || Date.now() - status.lastCheckedAt.getTime() > STALE_AFTER_MS);
  if (stale) {
    try {
      status = await refreshGscStats(session.shop);
    } catch {
      // Keep showing the last cached numbers rather than an error — the
      // connection itself may just be momentarily unreachable.
    }
  }
  return { eligible, configured: gscConfigured(), status };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  if (tier !== "premium" && tier !== "exclusive" && tier !== "agency") {
    return { ok: false, error: "Search Console needs Premium or above." };
  }
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "refresh") {
    try {
      await refreshGscStats(session.shop);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "Couldn't refresh." };
    }
  }
  if (intent === "disconnect") {
    await disconnectGsc(session.shop);
    return { ok: true };
  }
  return { ok: false, error: "Unknown action" };
};

export default function SearchConsole() {
  const { eligible, configured, status } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const gscError = params.get("gscError");
  const justConnected = params.get("connected") === "1";

  if (!configured) {
    return (
      <s-page heading="Search Console">
      <s-link slot="breadcrumb-actions" href="/app/tools">Tools</s-link>
        <s-banner heading="Not set up yet" tone="info">
          <s-paragraph>
            Search Console is temporarily unavailable. Everything else in the app works as normal.
            Please check back soon.
          </s-paragraph>
        </s-banner>
      </s-page>
    );
  }

  if (!eligible) {
    return (
      <s-page heading="Search Console">
        <s-banner heading="Needs Premium or above" tone="info">
          <s-paragraph>
            See what people search to find your store, and how many clicks and impressions your
            pages get — available on Premium and above.
          </s-paragraph>
          <s-button slot="secondary-actions" href="/app/billing">
            See plans
          </s-button>
        </s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading="Search Console">
      {gscError && (
        <s-banner heading="Couldn't connect" tone="critical">
          <s-paragraph>{gscError}</s-paragraph>
        </s-banner>
      )}
      {justConnected && status?.connected && (
        <s-banner heading="Connected" tone="success">
          <s-paragraph>Google Search Console is connected to {status.siteUrl}.</s-paragraph>
        </s-banner>
      )}

      {!status?.connected ? (
        <s-section heading="Connect Google Search Console">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              See real Google data for your store: what people search to find you, and how many
              clicks and impressions your pages get. Read-only — this never
              changes anything in Search Console.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button variant="primary" href="/auth/gsc">
                Connect Google Search Console
              </s-button>
            </s-stack>
            <s-text color="subdued">
              Your store's domain needs to already be a verified property in Search Console under
              the Google account you connect with.
            </s-text>
          </s-stack>
        </s-section>
      ) : (
        <>
          <s-section heading="Last 28 days">
            <s-stack direction="inline" gap="large">
              <s-stack direction="block" gap="small-300">
                <s-text color="subdued">Clicks</s-text>
                <s-heading>{status.clicks28d ?? "—"}</s-heading>
              </s-stack>
              <s-stack direction="block" gap="small-300">
                <s-text color="subdued">Impressions</s-text>
                <s-heading>{status.impressions28d ?? "—"}</s-heading>
              </s-stack>
            </s-stack>
            <s-text color="subdued">
              Connected to {status.siteUrl}
              {status.lastCheckedAt ? ` — updated ${new Date(status.lastCheckedAt).toLocaleString()}` : ""}
            </s-text>
          </s-section>

          <s-section heading="Top search queries">
            {status.topQueries.length === 0 ? (
              <s-paragraph>No query data yet — check back in a day or two.</s-paragraph>
            ) : (
              <s-table>
                <s-table-header-row>
                  <s-table-header>Query</s-table-header>
                  <s-table-header>Clicks</s-table-header>
                  <s-table-header>Impressions</s-table-header>
                </s-table-header-row>
                {status.topQueries.map((q) => (
                  <s-table-row key={q.query}>
                    <s-table-cell>{q.query}</s-table-cell>
                    <s-table-cell>{q.clicks}</s-table-cell>
                    <s-table-cell>{q.impressions}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table>
            )}
          </s-section>

          <s-section slot="aside" heading="Connection">
            <s-stack direction="block" gap="base">
              <form method="post">
                <input type="hidden" name="intent" value="refresh" />
                <s-button type="submit">Refresh now</s-button>
              </form>
              <form method="post">
                <input type="hidden" name="intent" value="disconnect" />
                <s-button type="submit" tone="critical">
                  Disconnect
                </s-button>
              </form>
            </s-stack>
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
