import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { checkPlan } from "../lib/billing.server";
import { analyzeAll, type ContentReport } from "../lib/content-analysis.server";
import { loadNodes } from "../lib/internal-links.server";
import { estimateMinutesSaved } from "../lib/impact.server";

// Exclusive: SEO report with CSV download. Agency: the same report under your
// own business name, with the content check included — made to hand to a client.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  const eligible = tier === "exclusive" || tier === "agency";
  if (!eligible) return { eligible, tier, shop: session.shop };

  const [scan, settings, issues] = await Promise.all([
    db.seoScan.findUnique({ where: { shop: session.shop } }),
    db.shopSettings.findUnique({ where: { shop: session.shop } }),
    db.seoIssue.findMany({
      where: { shop: session.shop, fixed: false },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
  ]);
  const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  issues.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));

  const content: ContentReport[] = tier === "agency" ? analyzeAll(await loadNodes(admin), 40) : [];
  return {
    eligible,
    tier,
    shop: session.shop,
    scan: scan ? { score: scan.score, previousScore: scan.previousScore, scannedAt: scan.scannedAt.toISOString() } : null,
    brandName: settings?.brandName ?? "",
    minutesSaved: estimateMinutesSaved(settings?.totalFixesApplied ?? 0, settings?.totalRedirectsCreated ?? 0),
    fixes: settings?.totalFixesApplied ?? 0,
    issues: issues.map((i) => ({
      severity: i.severity,
      type: i.type,
      resourceType: i.resourceType,
      title: i.resourceTitle,
      handle: i.resourceHandle,
      message: i.message,
    })),
    content,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  if (tier !== "agency") return { ok: false as const, error: "Your own name on the report is part of Agency." };
  const name = String((await request.formData()).get("brandName") ?? "").trim().slice(0, 80);
  await db.shopSettings.upsert({
    where: { shop: session.shop },
    update: { brandName: name || null },
    create: { shop: session.shop, brandName: name || null },
  });
  return { ok: true as const };
};

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function Report() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) shopify.toast.show("Saved");
    else shopify.toast.show(fetcher.data.error, { isError: true });
  }, [fetcher.data, shopify]);

  if (!data.eligible) {
    return (
      <s-page heading="SEO report">
      <s-link slot="breadcrumb-actions" href="/app/tools">Tools</s-link>
        <s-banner heading="SEO reports are on Exclusive and Agency" tone="info">
          <s-paragraph>
            A one-page report of your score and open issues, with a CSV download you can open in
            Excel or Google Sheets. Agency adds your own business name and a content check.
          </s-paragraph>
          <s-button slot="primary-action" href="/app/billing">See plans</s-button>
        </s-banner>
      </s-page>
    );
  }

  const { scan, issues, content, tier } = data;
  const agency = tier === "agency";
  const title = agency && data.brandName ? `SEO report by ${data.brandName}` : "SEO report";

  const downloadCsv = () => {
    const rows = [["Severity", "Type", "Page type", "Page", "Handle", "Problem"], ...issues.map((i) => [i.severity, i.type, i.resourceType, i.title, i.handle, i.message])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seo-report-${data.shop.replace(".myshopify.com", "")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <s-page heading={title}>
      <s-button slot="primary-action" variant="primary" onClick={downloadCsv}>Download issues (CSV)</s-button>
      <s-button slot="secondary-actions" onClick={() => window.print()}>Print or save as PDF</s-button>

      {!scan ? (
        <s-banner heading="Run a scan first" tone="info">
          <s-paragraph>The report is built from your latest scan.</s-paragraph>
          <s-button slot="primary-action" href="/app">Go to dashboard</s-button>
        </s-banner>
      ) : (
        <>
          <s-section heading={data.shop}>
            <s-stack direction="inline" gap="large">
              <s-box><s-text type="strong">{scan.score}/100</s-text><br /><s-text color="subdued">SEO score</s-text></s-box>
              {scan.previousScore != null && (
                <s-box><s-text type="strong">{scan.score - scan.previousScore >= 0 ? "+" : ""}{scan.score - scan.previousScore}</s-text><br /><s-text color="subdued">since previous scan</s-text></s-box>
              )}
              <s-box><s-text type="strong">{issues.length}</s-text><br /><s-text color="subdued">open issues</s-text></s-box>
              <s-box><s-text type="strong">{data.fixes}</s-text><br /><s-text color="subdued">fixes applied</s-text></s-box>
              <s-box><s-text type="strong">~{data.minutesSaved} min</s-text><br /><s-text color="subdued">estimated time saved</s-text></s-box>
            </s-stack>
            <s-paragraph>Scanned {new Date(scan.scannedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Time saved is an estimate.</s-paragraph>
          </s-section>

          <s-section heading={`Open issues (${issues.length})`}>
            {issues.length === 0 ? (
              <s-paragraph>No open issues.</s-paragraph>
            ) : (
              <s-table>
                <s-table-header-row>
                  <s-table-header>Severity</s-table-header>
                  <s-table-header>Page</s-table-header>
                  <s-table-header>Problem</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {issues.slice(0, 60).map((i, n) => (
                    <s-table-row key={n}>
                      <s-table-cell><s-badge tone={i.severity === "HIGH" ? "critical" : i.severity === "MEDIUM" ? "warning" : "neutral"}>{i.severity.toLowerCase()}</s-badge></s-table-cell>
                      <s-table-cell>{i.title}</s-table-cell>
                      <s-table-cell>{i.message}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            )}
            {issues.length > 60 && <s-paragraph>Showing 60 of {issues.length}. The CSV has all of them.</s-paragraph>}
          </s-section>

          {agency && (
            <s-section heading="Content check">
              {content.length === 0 ? (
                <s-paragraph>No pages need more or clearer text.</s-paragraph>
              ) : (
                <s-table>
                  <s-table-header-row>
                    <s-table-header>Page</s-table-header>
                    <s-table-header>Score</s-table-header>
                    <s-table-header>What to do</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {content.map((r) => (
                      <s-table-row key={r.id}>
                        <s-table-cell>{r.title}</s-table-cell>
                        <s-table-cell>{r.score}</s-table-cell>
                        <s-table-cell>{r.tips.join(" ")}</s-table-cell>
                      </s-table-row>
                    ))}
                  </s-table-body>
                </s-table>
              )}
            </s-section>
          )}
        </>
      )}

      {agency && (
        <s-section slot="aside" heading="Your business name">
          <s-paragraph>Shown in the report title. Print or save as PDF to give it to a client.</s-paragraph>
          <fetcher.Form method="post">
            <s-stack direction="block" gap="base">
              <s-text-field name="brandName" label="Business name" defaultValue={data.brandName} />
              <s-button type="submit">Save</s-button>
            </s-stack>
          </fetcher.Form>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
