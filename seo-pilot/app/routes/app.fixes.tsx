import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { applyFixesToIssues, isFixable } from "../lib/apply-fix.server";
import { recordFixesApplied } from "../lib/impact.server";
import { checkPlan, getShopMarket, isIndianStore, getPricing } from "../lib/billing.server";
import {
  aiConfigured,
  aiSuggestionForIssue,
  getAiAllowance,
  isAiWritable,
  mapWithConcurrency,
  recordAiCredits,
} from "../lib/ai.server";
import { AI_CREDITS, TRIAL_DAYS } from "../lib/plans";
import { fieldStatus, META_DESC_MAX, META_DESC_MIN, SEO_TITLE_MAX, SEO_TITLE_MIN, stripHtml } from "../lib/suggestions";

const TITLE_TYPES = new Set(["MISSING_SEO_TITLE", "SEO_TITLE_TOO_LONG", "SEO_TITLE_TOO_SHORT", "DUPLICATE_SEO_TITLE", "HOMEPAGE_TITLE"]);
const DESC_TYPES = new Set([
  "MISSING_META_DESCRIPTION",
  "META_DESCRIPTION_TOO_LONG",
  "META_DESCRIPTION_TOO_SHORT",
  "DUPLICATE_META_DESCRIPTION",
  "HOMEPAGE_META_DESCRIPTION",
]);
import type { RedactableSeoIssueRow, SeoIssueRow } from "../lib/types";

// Most AI writes in one click — keeps the request well under a minute
const AI_BATCH_MAX = 25;

const TYPE_LABELS: Record<string, string> = {
  MISSING_SEO_TITLE: "Missing SEO title",
  SEO_TITLE_TOO_LONG: "SEO title too long",
  SEO_TITLE_TOO_SHORT: "SEO title too short",
  MISSING_META_DESCRIPTION: "Missing meta description",
  META_DESCRIPTION_TOO_LONG: "Meta description too long",
  META_DESCRIPTION_TOO_SHORT: "Meta description too short",
  MISSING_ALT_TEXT: "Missing image alt text",
  OVERSIZED_IMAGE: "Oversized image",
  THIN_CONTENT: "Thin content",
  DUPLICATE_SEO_TITLE: "Duplicate SEO title",
  DUPLICATE_META_DESCRIPTION: "Duplicate meta description",
  BROKEN_INTERNAL_LINK: "Broken internal link",
  HOMEPAGE_TITLE: "Homepage title",
  HOMEPAGE_META_DESCRIPTION: "Homepage meta description",
  HOMEPAGE_H1: "Homepage main heading",
  HOMEPAGE_SOCIAL_IMAGE: "Social sharing image",
};

const RESOURCE_LABELS: Record<string, string> = {
  PRODUCT: "product",
  COLLECTION: "collection",
  PAGE: "page",
  HOMEPAGE: "homepage",
};

const SEVERITY_TONE: Record<string, "critical" | "warning" | "info"> = {
  HIGH: "critical",
  MEDIUM: "warning",
  LOW: "info",
};

const SEVERITY_ICON: Record<string, string> = {
  HIGH: "alert-triangle",
  MEDIUM: "alert-circle",
  LOW: "info",
};

const DUPLICATE_TYPES = new Set(["DUPLICATE_SEO_TITLE", "DUPLICATE_META_DESCRIPTION"]);
const EDITABLE_IN_EDITOR = new Set([
  "MISSING_SEO_TITLE",
  "SEO_TITLE_TOO_LONG",
  "SEO_TITLE_TOO_SHORT",
  "MISSING_META_DESCRIPTION",
  "META_DESCRIPTION_TOO_LONG",
  "META_DESCRIPTION_TOO_SHORT",
  "DUPLICATE_SEO_TITLE",
  "DUPLICATE_META_DESCRIPTION",
]);

function editorHref(issue: Pick<SeoIssueRow, "resourceType" | "resourceId">): string {
  return `/app/editor/${issue.resourceType.toLowerCase()}/${issue.resourceId.split("/").pop()}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  const [issuesRaw, planStatus, pricing] = await Promise.all([
    db.seoIssue.findMany({
      where: { shop, fixed: false },
      // Prisma sorts the severity string alphabetically here (HIGH, LOW,
      // MEDIUM) — not by actual priority. Re-sorted below by real severity.
      // No `take` limit: the dashboard's open-issue counts are computed from
      // the full unlimited set, so capping this list would silently make
      // this page's counts (and the issues a merchant can actually act on)
      // disagree with what the dashboard reports.
      orderBy: [{ createdAt: "asc" }],
    }),
    checkPlan(billing),
    getPricing(admin, shop),
  ]);
  const { hasActivePayment, tier } = planStatus;
  const aiAllowance = await getAiAllowance(shop, tier);

  const SEVERITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const issues = [...issuesRaw].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3),
  );

  // An AI-written duplicate fix becomes a one-click fix; a duplicate without
  // one stays in "needs a look", with a button to write a unique one.
  const fixable: SeoIssueRow[] = issues.filter(isFixable);
  const manual: SeoIssueRow[] = issues.filter((i: SeoIssueRow) => !isFixable(i));

  // Redact template suggestions from a shop with no active plan/trial —
  // server-side, not just hidden in the UI, because the loader's JSON
  // reaches the browser either way. `suggestionLength` keeps the table
  // informative without shipping the exact wording to a shop that hasn't
  // started a plan.
  const redact = (list: SeoIssueRow[]): (RedactableSeoIssueRow & { canApply: boolean; aiWritable: boolean })[] =>
    list.map((i) => {
      const canApply = hasActivePayment;
      return {
        ...i,
        suggestionLength: i.suggestion?.trim().length ?? 0,
        suggestion: canApply ? i.suggestion : null,
        canApply,
        aiWritable: isAiWritable(i, tier),
      };
    });

  return {
    fixable: redact(fixable),
    manual: redact(manual),
    hasActivePayment,
    tier,
    pricing,
    ai: { ...aiAllowance, configured: aiConfigured() },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "apply");
  const issueIds = formData.getAll("issueId").map((v) => String(v));
  const { hasActivePayment, tier } = await checkPlan(billing);

  if (intent === "ai") {
    if (!aiConfigured()) {
      return { mode: "ai" as const, written: 0, failed: 0, errors: ["AI writing isn't set up yet."] };
    }
    const allowance = await getAiAllowance(shop, tier);
    if (allowance.remaining <= 0) {
      return {
        mode: "ai" as const,
        written: 0,
        failed: 0,
        errors: [
          hasActivePayment
            ? "You've used all AI writes for this month — they reset on the 1st."
            : `Start a plan's ${TRIAL_DAYS}-day free trial to write with AI — Basic includes ${AI_CREDITS.basic} a month.`,
        ],
      };
    }

    const candidates: SeoIssueRow[] = await db.seoIssue.findMany({
      where: { id: { in: issueIds }, shop, fixed: false },
    });
    const writable = candidates
      .filter((i) => isAiWritable(i, tier))
      .slice(0, Math.min(AI_BATCH_MAX, allowance.remaining));
    const market = await getShopMarket(admin, shop);
    const india = isIndianStore(market);

    const results = await mapWithConcurrency(writable, 5, async (issue) => {
      const text = await aiSuggestionForIssue(admin, issue, india);
      await db.seoIssue.update({
        where: { id: issue.id },
        data: { suggestion: text, aiGenerated: true },
      });
      return text;
    });

    const written = results.filter((r) => r.status === "fulfilled").length;
    await recordAiCredits(shop, written);
    const errors = results
      .map((r, idx) =>
        r.status === "rejected"
          ? `${writable[idx].resourceTitle}: ${(r.reason as Error)?.message ?? "AI failed"}`
          : null,
      )
      .filter((e): e is string => e !== null);
    const skipped = candidates.length - writable.length;
    if (skipped > 0 && writable.length > 0) {
      errors.push(`${skipped} selected item(s) skipped — AI writes at most ${AI_BATCH_MAX} at a time, or you're near your limit.`);
    }
    return { mode: "ai" as const, written, failed: results.length - written, errors };
  }

  // Apply selected fixes — needs an active plan (trial or paid); there's no
  // free tier that can apply anything.
  if (issueIds.length === 0) {
    return { mode: "apply" as const, fixed: 0, failed: 0, errors: [] as string[] };
  }
  const selected: SeoIssueRow[] = await db.seoIssue.findMany({
    where: { id: { in: issueIds }, shop, fixed: false },
  });
  const allowed = hasActivePayment ? selected : [];
  const blocked = selected.length - allowed.length;

  const result = await applyFixesToIssues(admin, allowed.filter(isFixable));
  if (result.fixed > 0) {
    await recordFixesApplied(shop, result.fixed);
  }

  const errors = result.errors.map(
    (e) => `${e.issue.resourceTitle} (${TYPE_LABELS[e.issue.type] ?? e.issue.type}): ${e.error}`,
  );
  if (blocked > 0) {
    errors.push(`${blocked} selected fix(es) need an active plan — start a ${TRIAL_DAYS}-day free trial to apply them.`);
  }
  return { mode: "apply" as const, fixed: result.fixed, failed: result.failed, errors };
};

type Row = RedactableSeoIssueRow & { canApply: boolean; aiWritable: boolean };

export default function Fixes() {
  const { fixable, manual, hasActivePayment, tier, pricing, ai } = useLoaderData<typeof loader>();
  const applyFetcher = useFetcher<typeof action>();
  const aiFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const applying = applyFetcher.state !== "idle";
  const aiWorking = aiFetcher.state !== "idle";
  const aiPendingIds = new Set(
    aiWorking ? (aiFetcher.formData?.getAll("issueId").map(String) ?? []) : [],
  );
  const aiAvailable = ai.configured && ai.remaining > 0;

  useEffect(() => {
    const d = applyFetcher.data;
    if (d?.mode === "apply" && applyFetcher.state === "idle" && (d.fixed || d.failed)) {
      shopify.toast.show(
        d.failed > 0 ? `Fixed ${d.fixed}, ${d.failed} failed — see details below` : `Fixed ${d.fixed} issue(s)`,
        d.failed > 0 ? { isError: true } : undefined,
      );
    }
  }, [applyFetcher.data, applyFetcher.state, shopify]);

  useEffect(() => {
    const d = aiFetcher.data;
    if (d?.mode === "ai" && aiFetcher.state === "idle" && d.written > 0) {
      shopify.toast.show(`AI wrote ${d.written} fix${d.written === 1 ? "" : "es"} — review, then apply`);
    }
  }, [aiFetcher.data, aiFetcher.state, shopify]);

  const writeWithAi = (ids: string[]) => {
    const data = new FormData();
    data.set("intent", "ai");
    ids.forEach((id) => data.append("issueId", id));
    aiFetcher.submit(data, { method: "post" });
  };

  const errors = [
    ...(applyFetcher.data?.errors ?? []),
    ...(aiFetcher.data?.mode === "ai" ? aiFetcher.data.errors : []),
  ];

  return (
    <s-page heading="Fixes">
      {!hasActivePayment && (
        <s-banner heading="Start your free trial" tone="info">
          <s-paragraph>
            Scanning and fixing need an active plan. Start Basic's {TRIAL_DAYS}-day free trial —
            {pricing.basic.priceLabel}/month after — to scan your store and fix what we find.
          </s-paragraph>
          <s-button slot="secondary-actions" href="/app/billing">
            See plans
          </s-button>
        </s-banner>
      )}

      {errors.length > 0 && (
        <s-banner heading="Some things need attention" tone="warning">
          <s-unordered-list>
            {errors.map((e: string, i: number) => (
              <s-list-item key={i}>{e}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      <s-section heading={`One-click fixes (${fixable.length})`}>
        {fixable.length === 0 ? (
          <s-paragraph>No one-click fixes right now. Run a new scan from the dashboard.</s-paragraph>
        ) : (
          <applyFetcher.Form method="post">
            <input type="hidden" name="intent" value="apply" />
            <s-stack direction="block" gap="base">
              <s-text color="subdued">
                Suggestions marked AI were written from your own product info. Nothing is saved
                to your store until you apply it. Use "Write with AI" on a row to rewrite one.
              </s-text>
              <s-table>
                <s-table-header-row>
                  <s-table-header>Fix</s-table-header>
                  <s-table-header>Item</s-table-header>
                  <s-table-header>Issue</s-table-header>
                  <s-table-header>Suggested fix</s-table-header>
                  <s-table-header>Severity</s-table-header>
                  <s-table-header>Options</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {fixable.map((issue: Row) => (
                    <s-table-row key={issue.id}>
                      <s-table-cell>
                        <s-checkbox
                          name="issueId"
                          value={issue.id}
                          label="Select"
                          disabled={!issue.canApply}
                        />
                      </s-table-cell>
                      <s-table-cell>
                        {issue.resourceTitle}
                        <br />
                        <s-text color="subdued">{RESOURCE_LABELS[issue.resourceType] ?? issue.resourceType}</s-text>
                      </s-table-cell>
                      <s-table-cell>{TYPE_LABELS[issue.type] ?? issue.type}</s-table-cell>
                      <s-table-cell>
                        {issue.canApply ? (
                          <s-stack direction="block" gap="small-300">
                            {issue.aiGenerated && <s-badge tone="info">AI</s-badge>}
                            <s-text>
                              {issue.type === "THIN_CONTENT"
                                ? `New description: ${stripHtml(issue.suggestion)}`
                                : issue.suggestion}
                            </s-text>
                            {(() => {
                              const len = issue.suggestion?.trim().length ?? 0;
                              if (TITLE_TYPES.has(issue.type)) {
                                const s = fieldStatus(len, SEO_TITLE_MIN, SEO_TITLE_MAX);
                                return <s-text color="subdued">{len}/{SEO_TITLE_MAX} characters — {s.label}</s-text>;
                              }
                              if (DESC_TYPES.has(issue.type)) {
                                const s = fieldStatus(len, META_DESC_MIN, META_DESC_MAX);
                                return <s-text color="subdued">{len}/{META_DESC_MAX} characters — {s.label}</s-text>;
                              }
                              return null;
                            })()}
                          </s-stack>
                        ) : (
                          <s-stack direction="inline" gap="small-300" alignItems="center">
                            <s-icon type="lock" color="subdued" />
                            <s-text color="subdued">
                              {issue.suggestionLength} characters — needs Basic, or write it with AI
                            </s-text>
                          </s-stack>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge tone={SEVERITY_TONE[issue.severity] ?? "neutral"} icon={SEVERITY_ICON[issue.severity] as any}>{issue.severity}</s-badge>
                      </s-table-cell>
                      <s-table-cell>
                        <s-stack direction="block" gap="small-300">
                          {ai.configured && issue.aiWritable && (
                            <s-button
                              variant="tertiary"
                              disabled={!aiAvailable}
                              onClick={() => writeWithAi([issue.id])}
                              {...(aiPendingIds.has(issue.id) ? { loading: true } : {})}
                            >
                              {issue.aiGenerated ? "Rewrite with AI" : "Write with AI"}
                            </s-button>
                          )}
                          {EDITABLE_IN_EDITOR.has(issue.type) && hasActivePayment && (
                            <s-button variant="tertiary" href={editorHref(issue)}>
                              Write my own
                            </s-button>
                          )}
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
              <s-button type="submit" variant="primary" {...(applying ? { loading: true } : {})}>
                Apply selected fixes
              </s-button>
            </s-stack>
          </applyFetcher.Form>
        )}
      </s-section>

      {manual.length > 0 && (
        <s-section heading={`Needs a human look (${manual.length})`}>
          <s-paragraph>
            These need judgment or a change outside Metaglow SEO — each one says what to do.
          </s-paragraph>
          <s-table>
            <s-table-header-row>
              <s-table-header>Item</s-table-header>
              <s-table-header>Issue</s-table-header>
              <s-table-header>Severity</s-table-header>
              <s-table-header>Action</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {manual.map((issue: Row) => (
                <s-table-row key={issue.id}>
                  <s-table-cell>
                    {issue.resourceTitle}
                    <br />
                    <s-text color="subdued">{RESOURCE_LABELS[issue.resourceType] ?? issue.resourceType}</s-text>
                  </s-table-cell>
                  <s-table-cell>{issue.message}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={SEVERITY_TONE[issue.severity] ?? "neutral"} icon={SEVERITY_ICON[issue.severity] as any}>{issue.severity}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-300">
                      {issue.brokenLinkPath && (
                        <s-button
                          variant="tertiary"
                          href={`/app/redirects?path=${encodeURIComponent(issue.brokenLinkPath)}`}
                        >
                          Fix in Redirects
                        </s-button>
                      )}
                      {issue.type === "THIN_CONTENT" && ai.configured && issue.aiWritable && (
                        <s-button
                          variant="tertiary"
                          disabled={!aiAvailable}
                          onClick={() => writeWithAi([issue.id])}
                          {...(aiPendingIds.has(issue.id) ? { loading: true } : {})}
                        >
                          Write description with AI
                        </s-button>
                      )}
                      {issue.type === "THIN_CONTENT" &&
                        tier !== "premium" &&
                        tier !== "exclusive" &&
                        tier !== "agency" &&
                        (issue.resourceType === "PRODUCT" || issue.resourceType === "COLLECTION") && (
                          <s-button variant="tertiary" href="/app/billing">
                            AI descriptions: Premium
                          </s-button>
                        )}
                      {DUPLICATE_TYPES.has(issue.type) && ai.configured && issue.aiWritable && (
                        <s-button
                          variant="tertiary"
                          disabled={!aiAvailable}
                          onClick={() => writeWithAi([issue.id])}
                          {...(aiPendingIds.has(issue.id) ? { loading: true } : {})}
                        >
                          Write a unique one with AI
                        </s-button>
                      )}
                      {DUPLICATE_TYPES.has(issue.type) && hasActivePayment && (
                        <s-button variant="tertiary" href={editorHref(issue)}>
                          Edit in Editor
                        </s-button>
                      )}
                    </s-stack>
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
