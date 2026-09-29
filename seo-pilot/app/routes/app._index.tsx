import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { runSeoAudit } from "../lib/seo-audit.server";
import { applyFixesToIssues, isFixable } from "../lib/apply-fix.server";
import { estimateMinutesSaved, recordFixesApplied } from "../lib/impact.server";
import { checkPlan, getShopMarket, isIndianStore, requirePlan } from "../lib/billing.server";
import { aiConfigured, getAiAllowance } from "../lib/ai.server";
import { runSpeedCheck } from "../lib/speed.server";
import { AI_CREDITS, SCAN_PAGES, TIER_LABEL, TRIAL_DAYS, pricingForBillingCurrency } from "../lib/plans";
import type { SeoIssueRow } from "../lib/types";

// After this long without a scan, the dashboard nudges the merchant to
// re-scan — products, pages and posts change, and new issues creep in.
const RESCAN_REMINDER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  const [scan, openIssues, planStatus, market] = await Promise.all([
    db.seoScan.findUnique({ where: { shop } }),
    db.seoIssue.findMany({
      where: { shop, fixed: false },
      select: { severity: true, type: true, suggestion: true, resourceType: true },
    }),
    checkPlan(billing),
    getShopMarket(admin, shop),
  ]);
  const { hasActivePayment, tier } = planStatus;
  // Read after getShopMarket, which may have just created this row
  const [shopSettings, aiAllowance] = await Promise.all([
    db.shopSettings.findUnique({ where: { shop } }),
    getAiAllowance(shop, tier),
  ]);

  const severityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
  for (const i of openIssues) severityCounts[i.severity] = (severityCounts[i.severity] ?? 0) + 1;
  const fixableCount = openIssues.filter(isFixable).length;

  const totalFixesApplied = shopSettings?.totalFixesApplied ?? 0;
  const totalRedirectsCreated = shopSettings?.totalRedirectsCreated ?? 0;

  const daysSinceScan = scan ? Math.floor((Date.now() - new Date(scan.scannedAt).getTime()) / DAY_MS) : null;

  return {
    scan,
    daysSinceScan,
    severityCounts,
    fixableCount,
    hasActivePayment,
    tier,
    pricing: pricingForBillingCurrency(market.billingCurrency),
    india: isIndianStore(market),
    shopDomain: shop,
    ai: { ...aiAllowance, configured: aiConfigured() },
    speed: shopSettings?.speedCheckedAt
      ? {
          score: shopSettings.speedScore,
          lcp: shopSettings.speedLcp,
          cls: shopSettings.speedCls,
          tbt: shopSettings.speedTbt,
          checkedAt: shopSettings.speedCheckedAt,
        }
      : null,
    impact: {
      totalFixesApplied,
      totalRedirectsCreated,
      minutesSaved: estimateMinutesSaved(totalFixesApplied, totalRedirectsCreated),
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "autofix") {
    // "Fix everything automatically" needs the paid plan.
    await requirePlan(admin, billing, session.shop);

    const openIssues: SeoIssueRow[] = await db.seoIssue.findMany({
      where: { shop: session.shop, fixed: false },
    });
    const fixable = openIssues.filter(isFixable);
    const result = await applyFixesToIssues(admin, fixable);
    if (result.fixed > 0) {
      await recordFixesApplied(session.shop, result.fixed);
    }

    return { mode: "autofix" as const, fixed: result.fixed, failed: result.failed };
  }

  if (intent === "speed") {
    try {
      const res = await admin.graphql(
        `#graphql
        query SeoPilotPrimaryDomain { shop { primaryDomain { url } } }`,
      );
      const json = await res.json();
      const url: string = json.data?.shop?.primaryDomain?.url ?? `https://${session.shop}`;
      const speed = await runSpeedCheck(session.shop, url);
      return { mode: "speed" as const, ok: true as const, score: speed.score };
    } catch (err: any) {
      return { mode: "speed" as const, ok: false as const, error: err?.message ?? "Speed test failed" };
    }
  }

  // No free tier — a shop with no active plan/trial can't scan at all.
  // Without this, SCAN_PAGES.free (0) would silently run a zero-page scan
  // and show a false "no issues found" instead of asking them to start a plan.
  const [{ tier, hasActivePayment }, market] = await Promise.all([
    checkPlan(billing),
    getShopMarket(admin, session.shop),
  ]);
  if (!hasActivePayment) {
    return { mode: "scan" as const, blocked: true as const };
  }
  const summary = await runSeoAudit(admin, session.shop, {
    maxPages: SCAN_PAGES[tier],
    india: isIndianStore(market),
  });
  return { mode: "scan" as const, blocked: false as const, summary };
};

const RING_C = 2 * Math.PI * 62;
const TIER_RANK: Record<string, number> = { free: 0, basic: 1, premium: 2, exclusive: 3, agency: 4 };

const MORE_TOOLS: Array<{ title: string; body: string; href: string; cta: string; min: "basic" | "premium" | "exclusive" }> = [
  { title: "Internal links", body: "Add missing links between your own pages in one click.", href: "/app/internal-links", cta: "Find links", min: "basic" },
  { title: "Content check", body: "See which pages need more or clearer text.", href: "/app/content", cta: "Check content", min: "premium" },
  { title: "Autopilot", body: "Every new product checked the moment you add it.", href: "/app/autopilot", cta: "Open autopilot", min: "premium" },
  { title: "SEO report", body: "Score and open issues on one page, with CSV download.", href: "/app/report", cta: "Open report", min: "exclusive" },
];

const DASH_CSS = `
.sp-hero{display:flex;gap:32px;align-items:center;flex-wrap:wrap;padding:8px 4px}
.sp-ring{position:relative;width:148px;height:148px;flex:none}
.sp-ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.sp-ring-center b{font-size:44px;line-height:1;font-weight:700;letter-spacing:-.02em;color:#16241a}
.sp-ring-center span{font-size:12px;color:#5f6f63;margin-top:4px}
.sp-hero-body{display:flex;flex-direction:column;gap:12px;flex:1;min-width:240px}
.sp-grade-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sp-grade{color:#fff;font-weight:700;font-size:16px;min-width:34px;height:34px;padding:0 8px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center}
.sp-grade-label{font-size:18px;font-weight:650;color:#16241a}
.sp-meta{margin:0;font-size:13px;color:#5f6f63;line-height:1.5}
.sp-actions{display:flex;gap:8px;flex-wrap:wrap}
.sp-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}
.sp-tile{background:#f5f8f1;border:1px solid #dfe6d6;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.sp-tile b{font-size:26px;line-height:1.1;font-weight:700;color:#16241a}
.sp-tile b small{font-size:13px;font-weight:600;color:#5f6f63}
.sp-tile span{font-size:12.5px;color:#5f6f63}
.sp-cap{margin-top:16px;display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#5f6f63}
.sp-cap-track{height:6px;border-radius:3px;background:#e6ece1;overflow:hidden;max-width:320px}
.sp-cap-track div{height:100%;border-radius:3px}
.sp-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:32px 16px;border:1px dashed #cdd8c4;border-radius:12px;background:#f5f8f1}
.sp-empty-icon{width:64px;height:64px;border-radius:50%;background:#167a44;color:#fff;display:flex;align-items:center;justify-content:center}
.sp-empty h3{margin:0;font-size:19px;font-weight:650;color:#16241a}
.sp-empty p{margin:0;max-width:460px;font-size:14px;line-height:1.55;color:#5f6f63}
.sp-more{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.sp-more-card{border:1px solid #dfe6d6;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.sp-more-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sp-more-title{font-weight:650;font-size:14px;color:#16241a}
.sp-more-plan{font-size:11px;font-weight:650;color:#c4570a;background:#fff3e6;border-radius:999px;padding:2px 8px}
.sp-more-card p{margin:0;font-size:13px;line-height:1.5;color:#5f6f63;flex:1}
@media (max-width:900px){.sp-tiles,.sp-more{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){.sp-hero{gap:20px}.sp-tiles,.sp-more{grid-template-columns:1fr}}
`;

export default function Dashboard() {
  const {
    scan,
    daysSinceScan,
    severityCounts,
    fixableCount,
    hasActivePayment,
    tier,
    pricing,
    india,
    shopDomain,
    ai,
    speed,
    impact,
  } = useLoaderData<typeof loader>();
  const scanFetcher = useFetcher<typeof action>();
  const autofixFetcher = useFetcher<typeof action>();
  const speedFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const scanning = scanFetcher.state !== "idle";
  const autofixing = autofixFetcher.state !== "idle";
  const speedTesting = speedFetcher.state !== "idle";
  const totalOpen = severityCounts.HIGH + severityCounts.MEDIUM + severityCounts.LOW;

  useEffect(() => {
    if (scanFetcher.data?.mode === "scan") {
      if (scanFetcher.data.blocked) {
        shopify.toast.show("Start a plan's free trial to scan your store", { isError: true });
      } else {
        const { summary } = scanFetcher.data;
        shopify.toast.show(`Scan complete — score ${summary.score}/100, ${summary.totalIssues} issue(s) found`);
      }
    }
  }, [scanFetcher.data, shopify]);

  useEffect(() => {
    if (autofixFetcher.data?.mode === "autofix") {
      const { fixed, failed } = autofixFetcher.data;
      shopify.toast.show(
        failed > 0 ? `Fixed ${fixed} issue(s), ${failed} failed — see Fixes for details` : `Fixed ${fixed} issue(s) automatically`,
        failed > 0 ? { isError: true } : undefined,
      );
    }
  }, [autofixFetcher.data, shopify]);

  useEffect(() => {
    if (speedFetcher.data?.mode === "speed") {
      if (speedFetcher.data.ok) {
        shopify.toast.show(`Mobile speed score: ${speedFetcher.data.score}/100`);
      } else {
        shopify.toast.show(speedFetcher.data.error, { isError: true });
      }
    }
  }, [speedFetcher.data, shopify]);

  const lastScanSummary =
    scanFetcher.data?.mode === "scan" && !scanFetcher.data.blocked ? scanFetcher.data.summary : null;
  const lastScanPartial =
    lastScanSummary != null &&
    (!lastScanSummary.productsFullyScanned ||
      !lastScanSummary.pagesFullyScanned ||
      !lastScanSummary.collectionsFullyScanned);

  const runScan = () => scanFetcher.submit({}, { method: "POST" });
  // "Fix everything" rewrites live store content in bulk, so it asks first
  // instead of firing on a single accidental click.
  const [confirmingFix, setConfirmingFix] = useState(false);
  const runAutofix = () => {
    setConfirmingFix(false);
    autofixFetcher.submit({ intent: "autofix" }, { method: "POST" });
  };
  const runSpeed = () => speedFetcher.submit({ intent: "speed" }, { method: "POST" });

  const hasScanned = Boolean(scan);
  const hasFixedOnce = impact.totalFixesApplied > 0;
  const gettingStartedDone = hasScanned && hasFixedOnce;
  const scanIsStale = daysSinceScan != null && daysSinceScan >= RESCAN_REMINDER_DAYS && !scanning;
  const scoreChange = scan && scan.previousScore != null ? scan.score - scan.previousScore : null;

  // A letter grade reads faster than a raw number — same thresholds SEO
  // report-card style tools generally use.
  const scoreGrade = (score: number): { grade: string; tone: "critical" | "warning" | "success"; label: string } => {
    if (score >= 90) return { grade: "A", tone: "success", label: "Excellent" };
    if (score >= 75) return { grade: "B", tone: "success", label: "Good" };
    if (score >= 60) return { grade: "C", tone: "warning", label: "Fair" };
    if (score >= 40) return { grade: "D", tone: "warning", label: "Needs work" };
    return { grade: "F", tone: "critical", label: "Poor" };
  };
  const { grade, tone: scoreTone, label: scoreLabel } = scan
    ? scoreGrade(scan.score)
    : { grade: "—", tone: "critical" as const, label: "" };

  // Not a true "% of catalog scanned" — we don't know the catalog's real
  // size until a scan reaches the end of it (see productsFullyScanned).
  // This instead shows how much of the plan's per-run scan capacity was
  // used, which is honest with what we actually know.
  const ringColor = scoreTone === "success" ? "#167a44" : scoreTone === "warning" ? "#b7791f" : "#c0362c";
  const scanCapacity = SCAN_PAGES[tier] * 50 * 3; // products + collections + pages
  const scannedCount = scan
    ? scan.productsScanned + scan.collectionsScanned + scan.pagesScanned
    : 0;
  const scanUsagePercent = scan ? Math.min(100, Math.round((scannedCount / scanCapacity) * 100)) : 0;

  return (
    <s-page heading="SEO Pilot">
      {hasActivePayment ? (
        <s-button slot="primary-action" onClick={runScan} {...(scanning ? { loading: true } : {})}>
          {scan ? "Re-scan store" : "Run first scan"}
        </s-button>
      ) : (
        <s-button slot="primary-action" href="/app/billing" variant="primary">
          Start free trial to scan
        </s-button>
      )}

      <s-button slot="secondary-actions" href="/app/manual">
        How to use
      </s-button>

      {scanIsStale && (
        <s-banner heading={`Your last scan was ${daysSinceScan} days ago`} tone="info">
          <s-paragraph>
            Products, collections and pages change — re-scan to catch anything new before Google
            does.
          </s-paragraph>
          <s-button slot="secondary-actions" onClick={runScan}>
            Re-scan now
          </s-button>
        </s-banner>
      )}

      {!hasActivePayment && (
        <s-section>
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small-300">
              <s-badge tone="success" icon="check-circle-filled">
                {TRIAL_DAYS}-day free trial
              </s-badge>
              <s-heading>Welcome to SEO Pilot</s-heading>
              <s-paragraph>
                Find out what is keeping your store out of Google, and fix it in a few clicks. You
                don't need to know anything about SEO — everything is explained in plain words.
              </s-paragraph>
            </s-stack>

            <s-stack direction="inline" gap="base">
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="small-300">
                  <s-text type="strong">1. Scan</s-text>
                  <s-text color="subdued">One click checks your whole store. Nothing changes.</s-text>
                </s-stack>
              </s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="small-300">
                  <s-text type="strong">2. Review</s-text>
                  <s-text color="subdued">See each problem, sorted by how much it matters.</s-text>
                </s-stack>
              </s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="small-300">
                  <s-text type="strong">3. Fix</s-text>
                  <s-text color="subdued">Apply fixes in a click, or let AI write them.</s-text>
                </s-stack>
              </s-box>
            </s-stack>

            <s-stack direction="inline" gap="base" alignItems="center">
              <s-button variant="primary" href="/app/billing">
                Start your free trial
              </s-button>
              <s-button href="/app/manual">How it works</s-button>
            </s-stack>
            <s-text color="subdued">
              Plans start at {pricing.basic.priceLabel}/month
              {pricing.currency === "INR" ? ", billed in rupees" : ""}. Cancel anytime from Shopify.
            </s-text>
          </s-stack>
        </s-section>
      )}

      {hasActivePayment && !gettingStartedDone && (
        <s-section heading="Getting started">
          <s-stack direction="block" gap="small-300">
            <ChecklistItem
              done={hasScanned}
              label="Run your first scan"
              detail="Checks your products, collections, pages and homepage for SEO issues."
            />
            <ChecklistItem
              done={hasFixedOnce}
              label="Fix your first issue"
              detail="Open Fixes and apply one — free during your trial."
              action={hasScanned && !hasFixedOnce ? { href: "/app/fixes", label: "Review issues" } : undefined}
            />
            <ChecklistItem
              done={false}
              label="Turn on structured data"
              detail="In your theme editor → App embeds → switch on “SEO Schema (JSON-LD)”. Adds product, article and business info Google can show in results."
            />
          </s-stack>
        </s-section>
      )}

      {lastScanPartial && (
        <s-banner heading="This scan didn't cover your whole catalog" tone="warning">
          <s-paragraph>
            Your store has more products, collections or pages than one scan checks.
            The score and issue list are based on that first batch, not everything you sell —{" "}
            {tier === "agency"
              ? "you're already on the largest scan size."
              : "a bigger plan checks more per run."}
          </s-paragraph>
          {tier !== "agency" && (
            <s-button slot="secondary-actions" href="/app/billing">
              See plans
            </s-button>
          )}
        </s-banner>
      )}

      {scan && !scan.sitemapOk && (
        <s-banner heading="Sitemap isn't reachable" tone="critical">
          <s-paragraph>
            <s-text type="strong">sitemap.xml</s-text> didn't return a valid sitemap. The most
            common cause is your storefront's password/"coming soon" page still being on — Google
            can't index anything while that's active.
          </s-paragraph>
          <s-button slot="secondary-actions" href={`https://${shopDomain}`} target="_blank">
            Check storefront
          </s-button>
        </s-banner>
      )}

      <style>{DASH_CSS}</style>
      <s-section heading="Store SEO score">
        {!scan ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
            </div>
            <h3>Ready for your first scan</h3>
            <p>
              One click checks your products, collections, pages and homepage for missing SEO titles,
              descriptions, image labels and more. Nothing on your store changes.
            </p>
            {hasActivePayment && (
              <s-button variant="primary" onClick={runScan} {...(scanning ? { loading: true } : {})}>
                Run first scan
              </s-button>
            )}
          </div>
        ) : (
          <div className="sp-hero">
            <div className="sp-ring" aria-label={`SEO score ${scan.score} out of 100`}>
              <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden="true">
                <circle cx="74" cy="74" r="62" fill="none" stroke="#e6ece1" strokeWidth="12" />
                <circle
                  cx="74" cy="74" r="62" fill="none" strokeWidth="12" strokeLinecap="round"
                  stroke={ringColor}
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - scan.score / 100)}
                  transform="rotate(-90 74 74)"
                />
              </svg>
              <div className="sp-ring-center">
                <b>{scan.score}</b>
                <span>out of 100</span>
              </div>
            </div>

            <div className="sp-hero-body">
              <div className="sp-grade-row">
                <span className="sp-grade" style={{ background: ringColor }}>{grade}</span>
                <span className="sp-grade-label">{scoreLabel}</span>
                {scoreChange != null && scoreChange !== 0 && (
                  <s-badge tone={scoreChange > 0 ? "success" : "warning"}>
                    {scoreChange > 0 ? `▲ +${scoreChange}` : `▼ ${scoreChange}`} since last scan
                  </s-badge>
                )}
              </div>
              <p className="sp-meta">
                Checked {scan.productsScanned} products, {scan.collectionsScanned} collections and{" "}
                {scan.pagesScanned} pages on {new Date(scan.scannedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              {totalOpen === 0 ? (
                <s-badge tone="success" icon="check-circle-filled">No open issues</s-badge>
              ) : (
                <s-stack direction="inline" gap="small">
                  {severityCounts.HIGH > 0 && <s-badge tone="critical">{severityCounts.HIGH} high</s-badge>}
                  {severityCounts.MEDIUM > 0 && <s-badge tone="warning">{severityCounts.MEDIUM} medium</s-badge>}
                  {severityCounts.LOW > 0 && <s-badge tone="info">{severityCounts.LOW} low</s-badge>}
                </s-stack>
              )}
              {totalOpen > 0 && (
                <div className="sp-actions">
                  {fixableCount > 0 && hasActivePayment && (
                    <s-button variant="primary" onClick={() => setConfirmingFix(true)} {...(autofixing ? { loading: true } : {})}>
                      Fix everything automatically
                    </s-button>
                  )}
                  <s-button href="/app/fixes" variant={fixableCount > 0 && hasActivePayment ? "secondary" : "primary"}>
                    Review issues
                  </s-button>
                </div>
              )}
              {fixableCount > 0 && hasActivePayment && (
                <p className="sp-meta">
                  {fixableCount} of {totalOpen} open issue{totalOpen === 1 ? "" : "s"} can be fixed automatically. The rest need a look on the Fixes page.
                </p>
              )}
            </div>
          </div>
        )}

        {confirmingFix && scan && fixableCount > 0 && hasActivePayment && (
          <s-banner tone="warning" heading={`Fix ${fixableCount} issue${fixableCount === 1 ? "" : "s"} now?`}>
            <s-paragraph>
              This updates the titles, descriptions and image labels on your live store right away.
              Want to look at each one first? Use "Review first" instead.
            </s-paragraph>
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-button variant="primary" onClick={runAutofix}>Yes, fix them</s-button>
              <s-button onClick={() => setConfirmingFix(false)}>Cancel</s-button>
              <s-button variant="tertiary" href="/app/fixes">Review first</s-button>
            </s-stack>
          </s-banner>
        )}

        {scan && (
          <>
            <div className="sp-tiles">
              <div className="sp-tile"><b>{totalOpen}</b><span>open issues</span></div>
              <div className="sp-tile"><b>{fixableCount}</b><span>can be auto-fixed</span></div>
              <div className="sp-tile"><b>{impact.totalFixesApplied}</b><span>fixes applied so far</span></div>
              <div className="sp-tile"><b>~{impact.minutesSaved}<small> min</small></b><span>editing time saved</span></div>
            </div>
            <div className="sp-cap">
              <span>{scannedCount} of {scanCapacity} scanned this run ({TIER_LABEL[tier]} plan limit)</span>
              <div className="sp-cap-track"><div style={{ width: `${scanUsagePercent}%`, background: lastScanPartial ? "#b7791f" : "#167a44" }} /></div>
            </div>
          </>
        )}
      </s-section>

      {hasActivePayment && (
        <s-section heading="Do more with SEO Pilot">
          <div className="sp-more">
            {MORE_TOOLS.map((t) => (
              <div className="sp-more-card" key={t.href}>
                <div className="sp-more-top">
                  <span className="sp-more-title">{t.title}</span>
                  {TIER_RANK[tier] < TIER_RANK[t.min] && <span className="sp-more-plan">{TIER_LABEL[t.min]}</span>}
                </div>
                <p>{t.body}</p>
                <s-button variant="secondary" href={t.href}>{TIER_RANK[tier] < TIER_RANK[t.min] ? "See plans" : t.cta}</s-button>
              </div>
            ))}
          </div>
        </s-section>
      )}

      <s-section heading="Mobile speed">
        <s-stack direction="block" gap="base">
          {speed && speed.score != null ? (
            <s-stack direction="inline" gap="large" alignItems="center">
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="small" alignItems="center">
                  <s-heading>{speed.score}/100</s-heading>
                  <s-badge tone={speed.score >= 90 ? "success" : speed.score >= 50 ? "warning" : "critical"}>
                    {speed.score >= 90 ? "Fast" : speed.score >= 50 ? "Needs work" : "Slow"}
                  </s-badge>
                </s-stack>
              </s-box>
              <s-stack direction="block" gap="small-300">
                <s-text>Main content visible after: {speed.lcp ?? "–"}</s-text>
                <s-text>Page blocked for: {speed.tbt ?? "–"}</s-text>
                <s-text>Layout shift: {speed.cls ?? "–"}</s-text>
                <s-text color="subdued">
                  Tested {new Date(speed.checkedAt).toLocaleString()} with Google PageSpeed, as a
                  phone on a mobile connection — most Indian shoppers browse on phones.
                </s-text>
              </s-stack>
            </s-stack>
          ) : (
            <s-paragraph>
              See how fast your homepage loads on a phone, using Google's own PageSpeed test. Takes
              up to a minute.
            </s-paragraph>
          )}
          <s-stack direction="inline" gap="small">
            <s-button onClick={runSpeed} {...(speedTesting ? { loading: true } : {})}>
              {speed ? "Test again" : "Test mobile speed"}
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="AI writing">
        {!ai.configured ? (
          <s-paragraph>
            <s-text color="subdued">AI writing is being set up and will appear here soon.</s-text>
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="small-300">
            <s-paragraph>
              <s-text type="strong">{ai.remaining}</s-text> of {ai.limit} AI writes left
              {ai.period === "month" ? ` this month (${TIER_LABEL[tier]})` : " on the Free plan"}.
            </s-paragraph>
            <s-paragraph>
              <s-text color="subdued">
                AI writes SEO titles, meta descriptions and image alt text from your own product
                info{india ? ", worded for shoppers in India" : ""}. You review every one before
                it's saved.
              </s-text>
            </s-paragraph>
            <s-button href="/app/fixes" variant="tertiary">
              Write fixes with AI
            </s-button>
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Your impact">
        {impact.totalFixesApplied === 0 && impact.totalRedirectsCreated === 0 ? (
          <s-paragraph>
            <s-text color="subdued">
              Nothing applied yet — once you fix issues or add redirects, this fills in.
            </s-text>
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="small-300">
            <s-paragraph>
              <s-text type="strong">{impact.totalFixesApplied}</s-text> SEO issue
              {impact.totalFixesApplied === 1 ? "" : "s"} fixed since you installed SEO Pilot
            </s-paragraph>
            <s-paragraph>
              <s-text type="strong">{impact.totalRedirectsCreated}</s-text> broken link
              {impact.totalRedirectsCreated === 1 ? "" : "s"} caught with a redirect — each one is a
              visitor (or Google) who didn't hit a dead page
            </s-paragraph>
            <s-paragraph>
              <s-text color="subdued">
                ≈ {impact.minutesSaved} minute{impact.minutesSaved === 1 ? "" : "s"} of manual editing
                saved, estimated at ~2 min per fix and ~3 min per redirect
              </s-text>
            </s-paragraph>
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="What SEO Pilot checks">
        <s-unordered-list>
          <s-list-item>SEO titles and meta descriptions on products, collections and pages</s-list-item>
          <s-list-item>Homepage title, description, main heading and social sharing image</s-list-item>
          <s-list-item>Product images without alt text</s-list-item>
          <s-list-item>Oversized source images that slow down page load</s-list-item>
          <s-list-item>Thin descriptions</s-list-item>
          <s-list-item>Duplicate titles/descriptions across your store</s-list-item>
          <s-list-item>Broken internal links (to a deleted product/page/collection)</s-list-item>
          <s-list-item>Whether your sitemap.xml is actually reachable by Google</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Also included">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-link href="/app/editor">SEO editor</s-link> — search any product, collection or page
            and write your own SEO title and meta description, with a live Google
            preview.
          </s-paragraph>
          <s-paragraph>
            <s-link href="/app/redirects">Redirect manager</s-link> — fix broken links (404s) with
            proper 301 redirects. Free.
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">Structured data (JSON-LD)</s-text> — a theme app embed that adds
            schema.org markup for your business, products, blog posts and breadcrumbs. Turn it on
            in your theme editor under <s-text type="strong">App embeds</s-text>.
          </s-paragraph>
          <s-paragraph>
            <s-link href="/app/images">Image optimization</s-link> — create compressed copies of
            your oversized images in your Files library, without touching your live product
            photos.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

function ChecklistItem({
  done,
  label,
  detail,
  action,
}: {
  done: boolean;
  label: string;
  detail: string;
  action?: { href: string; label: string };
}) {
  return (
    <s-stack direction="inline" gap="small" alignItems="center">
      <s-badge tone={done ? "success" : "neutral"} icon={done ? "check-circle-filled" : "circle"}>
        {done ? "Done" : "To do"}
      </s-badge>
      <s-stack direction="block" gap="small-300">
        <s-text type={done ? undefined : "strong"}>{label}</s-text>
        <s-text color="subdued">{detail}</s-text>
      </s-stack>
      {action && (
        <s-button href={action.href} variant="tertiary">
          {action.label}
        </s-button>
      )}
    </s-stack>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
