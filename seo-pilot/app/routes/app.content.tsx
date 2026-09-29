import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { checkPlan } from "../lib/billing.server";
import { analyzeAll, type ContentReport } from "../lib/content-analysis.server";
import { loadNodes } from "../lib/internal-links.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  const eligible = tier === "premium" || tier === "exclusive" || tier === "agency";
  if (!eligible) return { eligible, reports: [] as ContentReport[] };
  return { eligible, reports: analyzeAll(await loadNodes(admin)) };
};

const KIND: Record<ContentReport["kind"], string> = { PRODUCT: "Product", COLLECTION: "Collection", PAGE: "Page" };
const tone = (score: number) => (score < 50 ? "critical" : score < 80 ? "warning" : "success");

// The text itself is edited in Shopify admin. Pages go to the pages list,
// since the deep link for a single page differs between admin versions.
const adminLink = (r: ContentReport) => {
  const id = r.id.split("/").pop();
  if (r.kind === "PRODUCT") return `shopify://admin/products/${id}`;
  if (r.kind === "COLLECTION") return `shopify://admin/collections/${id}`;
  return "shopify://admin/pages";
};

export default function Content() {
  const { eligible, reports } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Content check">
      <s-link slot="breadcrumb-actions" href="/app/tools">Tools</s-link>
      <s-section heading="What this does">
        <s-paragraph>
          Google learns what a page is about from its text. This checks the text on your products,
          collections and pages and tells you, in plain words, where to add more or make it easier
          to read. It follows common guidelines. It can't promise a ranking.
        </s-paragraph>
      </s-section>

      {!eligible ? (
        <s-banner heading="Content check is on Premium and above" tone="info">
          <s-paragraph>
            It looks at your whole catalog and lists the pages that need more or better text, worst first.
          </s-paragraph>
          <s-button slot="primary-action" href="/app/billing">See plans</s-button>
        </s-banner>
      ) : reports.length === 0 ? (
        <s-section heading="Results">
          <s-paragraph>Nothing to improve in your first 100 products, 100 collections and 50 pages.</s-paragraph>
        </s-section>
      ) : (
        <s-section heading={`${reports.length} page${reports.length === 1 ? "" : "s"} to improve, worst first`}>
          <s-table>
            <s-table-header-row>
              <s-table-header>Page</s-table-header>
              <s-table-header>Words</s-table-header>
              <s-table-header>Score</s-table-header>
              <s-table-header>What to do</s-table-header>
              <s-table-header>Edit text</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {reports.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>
                    {r.title} <s-badge>{KIND[r.kind]}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{r.words} / aim for {r.target}</s-table-cell>
                  <s-table-cell><s-badge tone={tone(r.score)}>{r.score}</s-badge></s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-200">
                      {r.tips.map((t) => (
                        <s-text key={t}>{t}</s-text>
                      ))}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-button variant="secondary" href={adminLink(r)} target="_top">Open in Shopify</s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
