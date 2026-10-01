import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { fetchAndCompressImage, uploadCompressedImage } from "../lib/image-optimize.server";
import { TRIAL_DAYS } from "../lib/plans";
import { checkPlan, requirePlan } from "../lib/billing.server";
import type { SeoIssueRow } from "../lib/types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const [oversized, planStatus] = await Promise.all([
    db.seoIssue.findMany({
      where: { shop: session.shop, type: "OVERSIZED_IMAGE", fixed: false, imageId: { not: null } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    checkPlan(billing),
  ]);
  const { hasActivePayment } = planStatus;

  return { oversized: oversized as SeoIssueRow[], hasActivePayment };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);

  // Compressing an image downloads, re-encodes and re-uploads real image
  // bytes — part of the paid plans.
  await requirePlan(admin, billing, session.shop);

  const formData = await request.formData();
  const issueId = String(formData.get("issueId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  if (!issueId || !imageId) {
    return { ok: false as const, error: "Missing image reference" };
  }

  try {
    const nodeRes = await admin.graphql(
      `#graphql
      query SeoPilotImageSource($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            alt
            image { url altText }
          }
        }
      }`,
      { variables: { id: imageId } },
    );
    const nodeJson = await nodeRes.json();
    const sourceUrl: string | undefined = nodeJson?.data?.node?.image?.url;
    const alt: string | null = nodeJson?.data?.node?.alt ?? nodeJson?.data?.node?.image?.altText ?? null;
    if (!sourceUrl) {
      return { ok: false as const, error: "Couldn't find the source image on Shopify" };
    }

    const compressed = await fetchAndCompressImage(sourceUrl);
    const filename = `seo-pilot-optimized-${Date.now()}.${compressed.extension}`;
    const uploaded = await uploadCompressedImage(admin, compressed, filename, alt);

    const savingsPct = Math.round((1 - compressed.compressedBytes / compressed.originalBytes) * 100);

    return {
      ok: true as const,
      issueId,
      savingsPct,
      originalKb: Math.round(compressed.originalBytes / 1024),
      compressedKb: Math.round(compressed.compressedBytes / 1024),
      fileUrl: uploaded.url,
    };
  } catch (err: any) {
    return { ok: false as const, error: err?.message ?? "Something went wrong compressing this image" };
  }
};

export default function Images() {
  const { oversized, hasActivePayment } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Image optimization">
      <s-link slot="breadcrumb-actions" href="/app/tools">Tools</s-link>
      {!hasActivePayment && (
        <s-banner heading="Subscription required" tone="warning">
          <s-paragraph>
            Compressing images needs an active plan. Start a {TRIAL_DAYS}-day free trial to try it.
          </s-paragraph>
          <s-button slot="secondary-actions" href="/app/billing">
            View plan
          </s-button>
        </s-banner>
      )}

      <s-section heading={`Oversized images (${oversized.length})`}>
        <s-paragraph>
          <s-text color="subdued">
            SEO Pilot never touches your live product images. "Create compressed copy" downloads
            the image, shrinks and re-compresses it, and adds the result as a new file in your
            Files library — swap it into the product yourself whenever you're ready.
          </s-text>
        </s-paragraph>

        {oversized.length === 0 ? (
          <s-paragraph>No oversized images found. Run a new scan from the dashboard.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Resource</s-table-header>
              <s-table-header>Issue</s-table-header>
              <s-table-header>Result</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {oversized.map((issue) => (
                <ImageRow key={issue.id} issue={issue} disabled={!hasActivePayment} />
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

function ImageRow({ issue, disabled }: { issue: SeoIssueRow; disabled: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const working = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle" && !fetcher.data.ok) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, fetcher.state, shopify]);

  return (
    <s-table-row>
      <s-table-cell>
        {issue.resourceTitle}
        <br />
        <s-text color="subdued">{issue.resourceType.toLowerCase()}</s-text>
      </s-table-cell>
      <s-table-cell>{issue.message}</s-table-cell>
      <s-table-cell>
        {fetcher.data?.ok ? (
          <s-stack direction="block" gap="small-300">
            <s-badge tone="success">
              {`${fetcher.data.savingsPct}% smaller (${fetcher.data.originalKb}KB → ${fetcher.data.compressedKb}KB)`}
            </s-badge>
            {fetcher.data.fileUrl && (
              <s-link href={fetcher.data.fileUrl} target="_blank">
                View compressed file
              </s-link>
            )}
          </s-stack>
        ) : (
          <fetcher.Form method="post">
            <input type="hidden" name="issueId" value={issue.id} />
            <input type="hidden" name="imageId" value={issue.imageId ?? ""} />
            <s-button type="submit" variant="tertiary" disabled={disabled} {...(working ? { loading: true } : {})}>
              Create compressed copy
            </s-button>
          </fetcher.Form>
        )}
      </s-table-cell>
    </s-table-row>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
