import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { checkPlan } from "../lib/billing.server";
import {
  REMIND_AFTER_DAYS,
  canRemind,
  monthlyLimit,
  remindAllWaiting,
  remindOne,
  reviewsConfigured,
  waitingForReminder,
} from "../lib/reviews.server";
import { PageStrip } from "../components/PageStrip";
import type { loader as exportLoader } from "./app.review-export";

const PAGE_SIZE = 25;
type Filter = "all" | "rated" | "waiting" | "failed";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "rated", label: "Rated" },
  { key: "waiting", label: "No answer yet" },
  { key: "failed", label: "Not delivered" },
];

function whereFor(shop: string, filter: Filter, q: string) {
  const where: Record<string, unknown> = { shop };
  if (filter === "rated") where.rating = { not: null };
  if (filter === "waiting") { where.status = "sent"; where.rating = null; }
  if (filter === "failed") where.status = "failed";
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  const url = new URL(request.url);
  const shop = session.shop;

  const rawFilter = url.searchParams.get("status");
  const filter: Filter = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as Filter) : "all";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page"))) || 1);

  const where = whereFor(shop, filter, q);
  const [total, rows, counts, waitingForRemind] = await Promise.all([
    db.reviewRequest.count({ where }),
    db.reviewRequest.findMany({ where, orderBy: { sentAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    Promise.all([
      db.reviewRequest.count({ where: { shop } }),
      db.reviewRequest.count({ where: { shop, rating: { not: null } } }),
      db.reviewRequest.count({ where: { shop, status: "sent", rating: null } }),
      db.reviewRequest.count({ where: { shop, status: "failed" } }),
    ]),
    waitingForReminder(shop),
  ]);
  const optedOut = new Set(
    (await db.emailOptOut.findMany({ where: { email: { in: rows.map((r) => r.email) } } })).map((o) => o.email),
  );

  return {
    allowed: monthlyLimit(tier) > 0,
    configured: reviewsConfigured(),
    filter,
    q,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    counts: { all: counts[0], rated: counts[1], waiting: counts[2], failed: counts[3] } as Record<Filter, number>,
    waitingForRemind,
    remindAfterDays: REMIND_AFTER_DAYS,
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      status: r.status,
      sentAt: r.sentAt.toISOString(),
      opened: Boolean(r.clickedAt),
      rating: r.rating,
      comment: r.comment,
      reminded: Boolean(r.remindedAt),
      canRemind: canRemind(r),
      unsubscribed: optedOut.has(r.email),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (monthlyLimit(tier) === 0) {
    return { ok: false as const, error: "Review requests are part of Premium, Exclusive and Agency." };
  }

  if (intent === "delete") {
    const id = String(form.get("id") ?? "");
    await db.reviewRequest.deleteMany({ where: { id, shop } });
    return { ok: true as const, message: "Removed" };
  }

  if (intent === "remind" || intent === "remindAll") {
    if (!reviewsConfigured()) return { ok: false as const, error: "Email sending isn't set up on this server yet." };
    const s =
      intent === "remind"
        ? await remindOne(shop, tier, String(form.get("id") ?? ""))
        : { ...(await remindAllWaiting(shop, tier)), notEligible: false };
    if (s.notEligible) return { ok: false as const, error: "This request can't get a reminder (answered, already reminded, or too recent)." };
    const bits = [`${s.sent} reminder${s.sent === 1 ? "" : "s"} sent`];
    if (s.skippedOptedOut) bits.push(`${s.skippedOptedOut} unsubscribed`);
    if (s.failed) bits.push(`${s.failed} failed`);
    if (s.stoppedAtLimit) bits.push("monthly limit reached");
    return { ok: s.sent > 0 || s.failed === 0, message: bits.join(" · "), error: bits.join(" · ") };
  }

  return { ok: false as const, error: "Unknown action." };
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const CSS = `
.rq-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.rq-tab{font-size:13px;font-weight:600;border:1px solid #e1e3e5;border-radius:999px;padding:5px 12px;color:#3d4247;text-decoration:none;background:#fff}
.rq-tab.on{background:#e8f3ef;border-color:#c6e0d6;color:#0f6b57}
.rq-tab span{font-weight:500;color:#616a75;margin-left:4px}
.rq-row{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 0;border-top:1px solid #edeeef}
.rq-row:first-child{border-top:0}
.rq-who{min-width:0;display:flex;flex-direction:column;gap:2px}
.rq-who b{font-size:14px;font-weight:600;color:#202223;overflow:hidden;text-overflow:ellipsis}
.rq-who span{font-size:12px;color:#616a75}
.rq-note{font-size:13px;color:#3d4247;margin-top:2px}
.rq-side{display:flex;gap:10px;align-items:center;flex:none;flex-wrap:wrap;justify-content:flex-end}
.rq-stars{color:#b7791f;letter-spacing:1px;font-size:14px;white-space:nowrap}
.rq-pill{font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;white-space:nowrap}
.rq-pill.sent{background:#f1f2f3;color:#616a75}
.rq-pill.open{background:#e8f3ef;color:#0f6b57}
.rq-pill.bad{background:#fdecea;color:#b42318}
.rq-pill.warn{background:#fff4e5;color:#8a5a00}
.rq-pager{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:14px}
@media(max-width:700px){.rq-row{flex-direction:column;align-items:flex-start}.rq-side{justify-content:flex-start}}
`;

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function ReviewRequests() {
  const d = useLoaderData<typeof loader>();
  const act = useFetcher<typeof action>();
  const exporter = useFetcher<typeof exportLoader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const [search, setSearch] = useState(d.q);

  useEffect(() => {
    const r = act.data;
    if (!r || act.state !== "idle") return;
    if (r.ok) shopify.toast.show("message" in r && r.message ? r.message : "Done");
    else if ("error" in r) shopify.toast.show(r.error, { isError: true });
  }, [act.data, act.state, shopify]);

  useEffect(() => {
    const x = exporter.data;
    if (!x || exporter.state !== "idle") return;
    const head = ["Email", "Name", "Status", "Sent", "Opened rating page", "Rating", "Comment", "Rated at", "Reminder sent"];
    const lines = x.export.map((r) => [r.email, r.name, r.status, r.sentAt, r.opened, r.rating, r.comment, r.ratedAt, r.reminded].map(csvCell).join(","));
    const blob = new Blob(["﻿" + [head.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "review-requests.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [exporter.data, exporter.state]);

  const base = (over: Record<string, string>) => {
    const p = new URLSearchParams({ status: d.filter, ...(d.q ? { q: d.q } : {}), ...over });
    if (p.get("status") === "all") p.delete("status");
    if (p.get("page") === "1") p.delete("page");
    const qs = p.toString();
    return `/app/review-requests${qs ? `?${qs}` : ""}`;
  };

  if (!d.allowed) {
    return (
      <s-page heading="All review requests">
        <s-section>
          <s-paragraph>Review requests are part of Premium, Exclusive and Agency.</s-paragraph>
          <s-button variant="primary" href="/app/billing">See plans</s-button>
        </s-section>
      </s-page>
    );
  }

  const busy = act.state !== "idle";

  return (
    <s-page heading="All review requests">
      <PageStrip icon="star" title="Every request you've sent" text="Find a customer, send a reminder, or download the list." />
      <s-button slot="primary-action" href="/app/reviews">Back to Reviews</s-button>
      <s-button
        slot="secondary-actions"
        {...(exporter.state !== "idle" ? { loading: true } : {})}
        onClick={() => exporter.load("/app/review-export")}
      >
        Download CSV
      </s-button>

      <s-section>
        <style>{CSS}</style>
        <div className="rq-tabs">
          {FILTERS.map((f) => (
            <a key={f.key} className={`rq-tab${d.filter === f.key ? " on" : ""}`} href={base({ status: f.key, page: "1" })}>
              {f.label}<span>{d.counts[f.key]}</span>
            </a>
          ))}
        </div>

        <s-stack direction="inline" gap="base" alignItems="end">
          <s-text-field
            name="q"
            label="Search by name or email"
            value={search}
            onInput={(e: any) => setSearch(e.target.value)}
          />
          <s-button onClick={() => navigate(base({ q: search.trim(), page: "1" }))}>Search</s-button>
          {d.q && <s-button variant="tertiary" onClick={() => { setSearch(""); navigate(base({ q: "", page: "1" })); }}>Clear</s-button>}
        </s-stack>

        {d.waitingForRemind > 0 && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-text>
                {d.waitingForRemind} customer{d.waitingForRemind === 1 ? "" : "s"} haven't answered after {d.remindAfterDays} days. Each can get one reminder.
              </s-text>
              <s-button
                disabled={!d.configured}
                {...(busy ? { loading: true } : {})}
                onClick={() => act.submit({ intent: "remindAll" }, { method: "post" })}
              >
                Remind them (up to 25)
              </s-button>
            </s-stack>
          </s-box>
        )}
      </s-section>

      <s-section heading={d.q ? `Results for “${d.q}”` : "Requests"}>
        {d.rows.length === 0 ? (
          <s-paragraph>{d.q || d.filter !== "all" ? "Nothing matches this filter." : "Nothing sent yet."}</s-paragraph>
        ) : (
          <div>
            {d.rows.map((r) => (
              <div className="rq-row" key={r.id}>
                <div className="rq-who">
                  <b>{r.name ? `${r.name} · ${r.email}` : r.email}</b>
                  <span>Sent {when(r.sentAt)}{r.reminded ? " · reminder sent" : ""}</span>
                  {r.comment && <div className="rq-note">“{r.comment.slice(0, 240)}”</div>}
                </div>
                <div className="rq-side">
                  {r.unsubscribed && <span className="rq-pill warn">Unsubscribed</span>}
                  {r.status === "failed" ? (
                    <span className="rq-pill bad">Not delivered</span>
                  ) : r.rating ? (
                    <span className="rq-stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  ) : r.opened ? (
                    <span className="rq-pill open">Opened</span>
                  ) : (
                    <span className="rq-pill sent">Sent</span>
                  )}
                  {r.canRemind && !r.unsubscribed && (
                    <s-button
                      disabled={!d.configured}
                      {...(busy ? { loading: true } : {})}
                      onClick={() => act.submit({ intent: "remind", id: r.id }, { method: "post" })}
                    >
                      Remind
                    </s-button>
                  )}
                  <s-button
                    variant="tertiary"
                    tone="critical"
                    onClick={() => { if (window.confirm("Remove this request from your list?")) act.submit({ intent: "delete", id: r.id }, { method: "post" }); }}
                  >
                    Remove
                  </s-button>
                </div>
              </div>
            ))}
          </div>
        )}
        {d.pages > 1 && (
          <div className="rq-pager">
            {d.page > 1 ? <s-button href={base({ page: String(d.page - 1) })}>Previous</s-button> : <span />}
            <s-text color="subdued">Page {d.page} of {d.pages} · {d.total} requests</s-text>
            {d.page < d.pages ? <s-button href={base({ page: String(d.page + 1) })}>Next</s-button> : <span />}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
