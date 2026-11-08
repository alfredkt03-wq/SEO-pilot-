import { Fragment, useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { checkPlan, checkPlanCached } from "../lib/billing.server";
import { REVIEW_MAX_PER_SEND, TIER_LABEL } from "../lib/plans";
import {
  emailsUsedThisMonth,
  monthlyLimit,
  prepareReviewLinks,
  reviewStats,
  reviewsConfigured,
  sendReviewRequests,
  shopLabel,
} from "../lib/reviews.server";
import { parseRecipients } from "../lib/recipients";
import { PageStrip } from "../components/PageStrip";
import { DEFAULT_MESSAGE, DEFAULT_SUBJECT, REVIEW_PRESETS } from "../lib/review-text";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { tier } = await checkPlanCached(billing, session.shop);
  const limit = monthlyLimit(tier);
  const settings = await db.shopSettings.findUnique({ where: { shop: session.shop } });
  const stats = await reviewStats(session.shop);
  const used = await emailsUsedThisMonth(session.shop);
  return {
    tier,
    allowed: limit > 0,
    limit,
    used,
    configured: reviewsConfigured(),
    store: shopLabel(session.shop, settings?.brandName),
    reviewLink: settings?.reviewLink ?? "",
    replyTo: settings?.reviewReplyTo ?? "",
    subject: settings?.reviewSubject ?? "",
    message: settings?.reviewMessage ?? "",
    defaultSubject: DEFAULT_SUBJECT,
    defaultMessage: DEFAULT_MESSAGE,
    stats: {
      sent: stats.sent,
      clicked: stats.clicked,
      rated: stats.rated,
      average: stats.average,
    },
    recent: stats.recent.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      status: r.status,
      sentAt: r.sentAt.toISOString(),
      rating: r.rating,
      comment: r.comment,
      clicked: Boolean(r.clickedAt),
    })),
  };
};

function cleanUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

async function saveTemplate(shop: string, form: FormData) {
  const subject = String(form.get("subject") ?? "").trim().slice(0, 150);
  const message = String(form.get("message") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 1500);
  // Saving the standard text (or nothing) stores null so the default is used.
  const reviewSubject = subject && subject !== DEFAULT_SUBJECT ? subject : null;
  const reviewMessage = message && message !== DEFAULT_MESSAGE ? message : null;
  await db.shopSettings.upsert({
    where: { shop },
    update: { reviewSubject, reviewMessage },
    create: { shop, reviewSubject, reviewMessage },
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (monthlyLimit(tier) === 0) {
    return { ok: false as const, mode: intent, error: "Review requests are part of Premium, Exclusive and Agency." };
  }

  if (intent === "settings") {
    const link = cleanUrl(String(form.get("reviewLink") ?? ""));
    if (link === null) return { ok: false as const, mode: "settings", error: "The review link must start with https://" };
    const replyTo = String(form.get("replyTo") ?? "").trim();
    if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(replyTo)) {
      return { ok: false as const, mode: "settings", error: "Enter a valid reply email address." };
    }
    await db.shopSettings.upsert({
      where: { shop: session.shop },
      update: { reviewLink: link || null, reviewReplyTo: replyTo || null },
      create: { shop: session.shop, reviewLink: link || null, reviewReplyTo: replyTo || null },
    });
    return { ok: true as const, mode: "settings" };
  }

  if (intent === "template") {
    await saveTemplate(session.shop, form);
    return { ok: true as const, mode: "template" };
  }

  if (intent === "prepare") {
    if (form.get("consent") !== "yes") {
      return { ok: false as const, mode: "prepare", error: "Please confirm these customers bought from you." };
    }
    const { valid, invalid } = parseRecipients(String(form.get("recipients") ?? ""));
    if (valid.length === 0) {
      return { ok: false as const, mode: "prepare", error: "Add at least one valid email address." };
    }
    if (valid.length > REVIEW_MAX_PER_SEND) {
      return { ok: false as const, mode: "prepare", error: `Up to ${REVIEW_MAX_PER_SEND} at a time.` };
    }
    if (form.has("subject") || form.has("message")) await saveTemplate(session.shop, form);
    const prepared = await prepareReviewLinks({ shop: session.shop, recipients: valid, invalid });
    return { ok: true as const, mode: "prepare", prepared };
  }

  if (intent === "send") {
    if (!reviewsConfigured()) {
      return { ok: false as const, mode: "send", error: "Email sending isn't set up on this server yet." };
    }
    if (form.get("consent") !== "yes") {
      return { ok: false as const, mode: "send", error: "Please confirm these customers bought from you." };
    }
    const settings = await db.shopSettings.findUnique({ where: { shop: session.shop } });
    if (!settings?.reviewReplyTo) {
      return { ok: false as const, mode: "send", error: "Add a reply email below first, so customers can write back to you." };
    }
    const { valid, invalid } = parseRecipients(String(form.get("recipients") ?? ""));
    if (valid.length === 0) {
      return { ok: false as const, mode: "send", error: "Add at least one valid email address." };
    }
    if (valid.length > REVIEW_MAX_PER_SEND) {
      return { ok: false as const, mode: "send", error: `Send up to ${REVIEW_MAX_PER_SEND} at a time.` };
    }
    if (form.has("subject") || form.has("message")) await saveTemplate(session.shop, form);
    const summary = await sendReviewRequests({ shop: session.shop, tier, recipients: valid, invalid });
    return { ok: true as const, mode: "send", summary };
  }

  return { ok: false as const, mode: intent, error: "Unknown action." };
};


const CSS = `
.rv-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.rv-tile{border:1px solid #e1e3e5;border-radius:8px;padding:14px 16px;background:#fff}
.rv-num{font-size:26px;font-weight:650;line-height:1.1;color:#202223;font-variant-numeric:tabular-nums}
.rv-num small{font-size:14px;font-weight:500;color:#616a75}
.rv-lab{font-size:13px;color:#616a75;margin-top:4px}
.rv-row{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid #edeeef}
.rv-row:first-child{border-top:0}
.rv-who{min-width:0;display:flex;flex-direction:column;gap:2px}
.rv-who b{font-size:14px;font-weight:600;color:#202223;overflow:hidden;text-overflow:ellipsis}
.rv-who span{font-size:12px;color:#616a75}
.rv-note{font-size:13px;color:#3d4247;margin-top:2px}
.rv-stars{color:#b7791f;letter-spacing:1px;font-size:14px;white-space:nowrap}
.rv-pill{font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;white-space:nowrap}
.rv-alt{background:#fff;color:#3d4247;border-color:#c9cccf}
.rv-open{font-size:13px;font-weight:600;color:#c2410c;text-decoration:none;padding:6px 10px;border:1px solid #f6d3bd;border-radius:6px;background:#fff1e8;white-space:nowrap}
.rv-pill.sent{background:#f1f2f3;color:#616a75}
.rv-pill.open{background:#fff1e8;color:#c2410c}
.rv-pill.bad{background:#fdecea;color:#b42318}
.rv-mail{border:1px solid #e1e3e5;border-radius:8px;background:#f6f6f7;padding:12px}
.rv-mail-card{background:#fff;border:1px solid #e1e3e5;border-radius:8px;padding:14px;font-size:12px;line-height:1.5;color:#3d4247}
.rv-mail-card b{color:#202223}
.rv-mail-stars{color:#f5a623;font-size:24px;letter-spacing:4px;margin:8px 0 2px}
.rv-mail-sub{font-size:11px;color:#616a75;margin-bottom:8px;line-height:1.6;overflow-wrap:anywhere}
@media(max-width:760px){.rv-tiles{grid-template-columns:repeat(2,1fr)}}
`;

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function Reviews() {
  const d = useLoaderData<typeof loader>();
  const sendFetcher = useFetcher<typeof action>();
  const saveFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [recipients, setRecipients] = useState("");
  const [consent, setConsent] = useState(false);
  const parsed = useMemo(() => parseRecipients(recipients), [recipients]);
  const [prepared, setPrepared] = useState<Array<{ email: string; name: string | null; subject: string; text: string }>>([]);
  // Rows whose Gmail window the merchant has opened. Opening is not sending —
  // the merchant still presses Send in Gmail — so this only tracks progress.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const gmailUrl = (p: { email: string; subject: string; text: string }) =>
    `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(p.email)}&su=${encodeURIComponent(p.subject)}&body=${encodeURIComponent(p.text)}`;
  // Per-customer edits: the merchant can rewrite one customer's email before
  // opening it. The rating link stays in the text, so keep that line.
  const [edits, setEdits] = useState<Record<string, { subject: string; text: string }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const mailFor = (p: { email: string; subject: string; text: string }) => ({ ...p, ...(edits[p.email] ?? {}) });
  const markOpened = (email: string) => setOpened((prev) => new Set(prev).add(email));
  const openNext = () => {
    const next = prepared.find((p) => !opened.has(p.email));
    if (!next) return;
    markOpened(next.email);
    window.open(gmailUrl(mailFor(next)), "_blank", "noopener");
  };
  const [reviewLink, setReviewLink] = useState(d.reviewLink);
  const [replyTo, setReplyTo] = useState(d.replyTo);
  const [subject, setSubject] = useState(d.subject || d.defaultSubject);
  const [message, setMessage] = useState(d.message || d.defaultMessage);
  const tplFetcher = useFetcher<typeof action>();

  const sending = sendFetcher.state !== "idle";
  const saving = saveFetcher.state !== "idle";
  const left = Math.max(0, d.limit - d.used);

  useEffect(() => {
    const r = sendFetcher.data;
    if (!r || sendFetcher.state !== "idle") return;
    if (r.ok && "prepared" in r && r.prepared) {
      const p = r.prepared;
      const bits = [`${p.items.length} ready`];
      if (p.skippedRecent) bits.push(`${p.skippedRecent} asked in the last 30 days`);
      if (p.skippedOptedOut) bits.push(`${p.skippedOptedOut} unsubscribed`);
      if (p.invalid.length) bits.push(`${p.invalid.length} not valid`);
      shopify.toast.show(bits.join(" · "));
      setPrepared(p.items);
      setOpened(new Set());
      setEdits({});
      setEditing(null);
      if (p.items.length > 0) setRecipients("");
    } else if (r.ok && "summary" in r && r.summary) {
      const s = r.summary;
      const bits = [`${s.sent} sent`];
      if (s.skippedRecent) bits.push(`${s.skippedRecent} asked in the last 30 days`);
      if (s.skippedOptedOut) bits.push(`${s.skippedOptedOut} unsubscribed`);
      if (s.failed) bits.push(`${s.failed} failed`);
      if (s.invalid.length) bits.push(`${s.invalid.length} not valid`);
      if (s.stoppedAtLimit) bits.push("monthly limit reached");
      shopify.toast.show(bits.join(" · "), { isError: s.sent === 0 && s.failed > 0 });
      if (s.sent > 0) setRecipients("");
    } else if (!r.ok && "error" in r) {
      shopify.toast.show(r.error, { isError: true });
    }
  }, [sendFetcher.data, sendFetcher.state, shopify]);

  useEffect(() => {
    const r = saveFetcher.data;
    if (!r || saveFetcher.state !== "idle") return;
    if (r.ok) shopify.toast.show("Saved");
    else if ("error" in r) shopify.toast.show(r.error, { isError: true });
  }, [saveFetcher.data, saveFetcher.state, shopify]);

  useEffect(() => {
    const r = tplFetcher.data;
    if (!r || tplFetcher.state !== "idle") return;
    if (r.ok) shopify.toast.show("Email saved");
    else if ("error" in r) shopify.toast.show(r.error, { isError: true });
  }, [tplFetcher.data, tplFetcher.state, shopify]);

  const dirty = subject !== (d.subject || d.defaultSubject) || message !== (d.message || d.defaultMessage);

  const fillTpl = (t: string) => t.replace(/\{store\}/gi, d.store).replace(/\{name\}/gi, "Anna");

  if (!d.allowed) {
    return (
      <s-page heading="Reviews">
        <PageStrip icon="star" title="Ask happy customers for a review" text="Send a short request by email and see who rates you." />
        <s-section>
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Review requests are part of Premium, Exclusive and Agency. Reviews can put star ratings next to your products in Google,
              which gets more clicks.
            </s-paragraph>
            <s-button variant="primary" href="/app/billing">See plans</s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const average = d.stats.average ? d.stats.average.toFixed(1) : "–";

  return (
    <s-page heading="Reviews">
      <PageStrip icon="star" title="Ask happy customers for a review" text="Send a short request by email and see who rates you." />

      {!d.configured && (
        <s-banner tone="info" heading="Metaglow does not send these emails for you">
          <s-paragraph>
            1. Paste your customers below and press Create emails. 2. For each customer, press Open in Gmail (or Outlook).
            3. Press Send in your mail app. Nothing is sent until you press Send there. Every rating link is tracked here.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Your results">
        <style>{CSS}</style>
        <div className="rv-tiles">
          <div className="rv-tile"><div className="rv-num">{d.stats.sent}</div><div className="rv-lab">{d.configured ? "Emails sent" : "Requests created"}</div></div>
          <div className="rv-tile"><div className="rv-num">{d.stats.clicked}</div><div className="rv-lab">Opened the rating page</div></div>
          <div className="rv-tile"><div className="rv-num">{d.stats.rated}</div><div className="rv-lab">Ratings received</div></div>
          <div className="rv-tile"><div className="rv-num">{average}<small>{d.stats.average ? " / 5" : ""}</small></div><div className="rv-lab">Average rating</div></div>
        </div>
      </s-section>

      <s-section heading="Send review requests">
        <s-stack direction="block" gap="base">
          <s-text-area
            name="recipients"
            label="Customers to ask"
            rows={5}
            value={recipients}
            placeholder={"anna@example.com, Anna\nben@example.com"}
            onInput={(e: any) => setRecipients(e.target.value)}
            details={
              recipients.trim() === ""
                ? `One per line: email, then an optional first name — or paste a customer export from Shopify. Up to ${REVIEW_MAX_PER_SEND} at a time.`
                : `${parsed.valid.length} ready${parsed.invalid.length ? ` · ${parsed.invalid.length} not valid (${parsed.invalid.slice(0, 2).join(", ")}${parsed.invalid.length > 2 ? ", …" : ""})` : ""}${parsed.valid.length > REVIEW_MAX_PER_SEND ? ` · only ${REVIEW_MAX_PER_SEND} at a time` : ""}`
            }
          />
          <s-text color="subdued">The email your customers get. Change it here — it is saved when you create or send.</s-text>

          <s-stack direction="inline" gap="small-300" alignItems="center">
            <s-text color="subdued">Start from:</s-text>
            {REVIEW_PRESETS.map((p) => (
              <s-button
                key={p.key}
                variant="tertiary"
                onClick={() => {
                  setSubject(p.subject);
                  setMessage(p.message);
                }}
              >
                {p.label}
              </s-button>
            ))}
          </s-stack>
          <s-text-field
            name="subject"
            label="Subject"
            value={subject}
            maxLength={150}
            onInput={(e: any) => setSubject(e.target.value)}
          />
          <s-text-area
            name="message"
            label="Message"
            rows={5}
            value={message}
            maxLength={1500}
            onInput={(e: any) => setMessage(e.target.value)}
            details="Write it like you would to a customer. Use {store} for your store name and {name} for their first name. The greeting, the star rating and the unsubscribe link are added automatically."
          />
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button
              variant="secondary"
              disabled={!dirty}
              {...(tplFetcher.state !== "idle" ? { loading: true } : {})}
              onClick={() => tplFetcher.submit({ intent: "template", subject, message }, { method: "post" })}
            >
              Save my email text
            </s-button>
            <s-text color="subdued">
              {dirty ? "Unsaved changes — also saved when you create or send." : "Saved. It is used for every request."}
            </s-text>
          </s-stack>
          <s-checkbox
            name="consent"
            label="These customers have bought from my store"
            checked={consent}
            onChange={(e: any) => setConsent(Boolean(e.target.checked))}
            details="Only ask people you have actually served. Every email has an unsubscribe link."
          />
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button
              variant="primary"
              disabled={!consent || recipients.trim() === "" || (d.configured && left === 0)}
              {...(sending ? { loading: true } : {})}
              onClick={() => sendFetcher.submit({ intent: d.configured ? "send" : "prepare", recipients, consent: consent ? "yes" : "no", subject, message }, { method: "post" })}
            >
              {d.configured ? "Send requests" : "Create emails"}
            </s-button>
            {d.configured && (
              <s-text color="subdued">
                {left} of {d.limit} left this month on {TIER_LABEL[d.tier]}
              </s-text>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      {prepared.length > 0 && (
        <s-section heading={`Not sent yet — ${prepared.length} ready`}>
          <s-stack direction="block" gap="small-300">
            <s-text color="subdued">Press the button, then press Send in the Gmail window that opens. Repeat until every customer is done. Opening is not sending — nothing goes out until you press Send in Gmail.</s-text>
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-button variant="primary" disabled={opened.size >= prepared.length} onClick={openNext}>
                {opened.size >= prepared.length ? "All opened" : "Open next in Gmail"}
              </s-button>
              <s-text color="subdued">{opened.size} of {prepared.length} opened</s-text>
            </s-stack>
            {prepared.map((orig) => {
              const p = mailFor(orig);
              return (
                <Fragment key={orig.email}>
                  <div className="rv-row">
                    <div className="rv-who">
                      <b>{orig.name ? `${orig.name} · ` : ""}{orig.email}{opened.has(orig.email) ? " · opened" : ""}</b>
                      <span>{p.subject}</span>
                    </div>
                    <s-stack direction="inline" gap="small-300">
                      <a
                        className="rv-open"
                        target="_blank"
                        rel="noreferrer"
                        href={gmailUrl(p)}
                        onClick={() => markOpened(orig.email)}
                      >
                        Open in Gmail
                      </a>
                      <a
                        className="rv-open rv-alt"
                        target="_top"
                        href={`mailto:${p.email}?subject=${encodeURIComponent(p.subject)}&body=${encodeURIComponent(p.text)}`}
                      >
                        Outlook / other
                      </a>
                      <s-button variant="tertiary" onClick={() => setEditing(editing === orig.email ? null : orig.email)}>
                        {editing === orig.email ? "Done" : "Edit"}
                      </s-button>
                      <s-button
                        variant="tertiary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(`Subject: ${p.subject}\n\n${p.text}`);
                            shopify.toast.show("Copied");
                          } catch {
                            shopify.toast.show("Couldn't copy — use Open in Gmail", { isError: true });
                          }
                        }}
                      >
                        Copy
                      </s-button>
                    </s-stack>
                  </div>
                  {editing === orig.email && (
                    <s-stack direction="block" gap="small-300">
                      <s-text-field
                        label={`Subject for ${orig.email}`}
                        value={p.subject}
                        maxLength={150}
                        onInput={(e: any) => setEdits((prev) => ({ ...prev, [orig.email]: { subject: e.target.value, text: p.text } }))}
                      />
                      <s-text-area
                        label="Message (keep the rating link line)"
                        rows={8}
                        value={p.text}
                        onInput={(e: any) => setEdits((prev) => ({ ...prev, [orig.email]: { subject: p.subject, text: e.target.value } }))}
                        details="Only this customer's email changes."
                      />
                    </s-stack>
                  )}
                </Fragment>
              );
            })}
          </s-stack>
        </s-section>
      )}

      <s-section heading="Where replies and reviews go">
        <s-stack direction="block" gap="base">
          <s-text-field
            name="replyTo"
            label="Reply email"
            value={replyTo}
            placeholder="support@yourstore.com"
            onInput={(e: any) => setReplyTo(e.target.value)}
            details="If a customer replies to the email, it lands here."
          />
          <s-text-field
            name="reviewLink"
            label="Public review link (optional)"
            value={reviewLink}
            placeholder="https://g.page/r/your-review-link"
            onInput={(e: any) => setReviewLink(e.target.value)}
            details="After rating, every customer is offered this link, for example your Google review page or a reviews page on your store."
          />
          <s-stack direction="inline" gap="base">
            <s-button
              {...(saving ? { loading: true } : {})}
              onClick={() => saveFetcher.submit({ intent: "settings", replyTo, reviewLink }, { method: "post" })}
            >
              Save
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Recent requests">
        <s-button slot="primary-action" href="/app/review-requests">View all requests</s-button>
        {d.recent.length === 0 ? (
          <s-paragraph>Nothing sent yet. Your first requests will show up here.</s-paragraph>
        ) : (
          <div>
            {d.recent.map((r) => (
              <div className="rv-row" key={r.id}>
                <div className="rv-who">
                  <b>{r.name ? `${r.name} · ${r.email}` : r.email}</b>
                  <span>{when(r.sentAt)}</span>
                  {r.comment && <div className="rv-note">“{r.comment.slice(0, 160)}”</div>}
                </div>
                {r.status === "failed" ? (
                  <span className="rv-pill bad">Not delivered</span>
                ) : r.rating ? (
                  <span className="rv-stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                ) : r.clicked ? (
                  <span className="rv-pill open">Opened</span>
                ) : (
                  <span className="rv-pill sent">Sent</span>
                )}
              </div>
            ))}
          </div>
        )}
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-unordered-list>
          <s-list-item>Paste the customers you want to ask.</s-list-item>
          <s-list-item>Each one gets a short email with a link to a rating page.</s-list-item>
          <s-list-item>Their rating shows up here. Everyone is also offered your public review link.</s-list-item>
        </s-unordered-list>
      </s-section>
      <s-section slot="aside" heading="Preview">
        <div className="rv-mail">
          <div className="rv-mail-sub">
            <div>From: {d.store}</div>
            <div>Replies go to: {replyTo.trim() || "not set yet"}</div>
            <div>Subject: {fillTpl(subject || d.defaultSubject)}</div>
          </div>
          <div className="rv-mail-card">
            <p style={{ margin: "0 0 8px" }}>Hi Anna,</p>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{fillTpl(message || d.defaultMessage)}</p>
            <div className="rv-mail-stars" aria-hidden="true">★★★★★</div>
          </div>
        </div>
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
