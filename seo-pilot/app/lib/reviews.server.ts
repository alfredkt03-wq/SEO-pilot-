// Review requests: a merchant types in customers they have served, the app
// emails each one a link to a short rating page, and counts what comes back.
// Emails go out through Resend (RESEND_API_KEY). The app never reads customers
// from Shopify; every recipient is typed in by the merchant.
import { randomBytes } from "node:crypto";
import db from "../db.server";
import { REVIEW_EMAILS, REVIEW_MAX_PER_SEND, type Tier } from "./plans";

export const MAX_PER_SEND = REVIEW_MAX_PER_SEND;
const RESEND_AGAIN_DAYS = 30;

export function reviewsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.REVIEW_FROM_EMAIL);
}

export function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export function monthlyLimit(tier: Tier): number {
  return REVIEW_EMAILS[tier] ?? 0;
}

export async function emailsUsedThisMonth(shop: string): Promise<number> {
  const row = await db.shopSettings.findUnique({ where: { shop } });
  return row && row.reviewEmailsMonth === monthKey() ? row.reviewEmailsUsedMonth : 0;
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export interface Recipient {
  email: string;
  name: string | null;
}

// One recipient per line: "email" or "email, Name" (also "Name <email>").
export function parseRecipients(text: string): { valid: Recipient[]; invalid: string[] } {
  const valid: Recipient[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    let email = "";
    let name = "";
    const angle = line.match(/^(.*)<([^>]+)>\s*$/);
    if (angle) {
      name = angle[1].trim().replace(/^"|"$/g, "");
      email = angle[2].trim();
    } else {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      email = parts[0];
      name = parts.slice(1).join(" ").trim();
    }
    email = email.toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) {
      invalid.push(line.slice(0, 80));
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push({ email, name: name ? name.slice(0, 60) : null });
  }
  return { valid, invalid };
}

function appUrl(): string {
  return (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
}

export function shopLabel(shop: string, brandName: string | null | undefined): string {
  return (brandName && brandName.trim()) || shop.replace(".myshopify.com", "");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildEmail(opts: { store: string; name: string | null; ratingUrl: string; unsubscribeUrl: string; reminder?: boolean }) {
  const hello = opts.name ? `Hi ${opts.name.split(" ")[0]},` : "Hi,";
  const subject = opts.reminder ? `A quick reminder: how was your order from ${opts.store}?` : `How was your order from ${opts.store}?`;
  const text = [
    hello,
    "",
    opts.reminder
      ? `A quick reminder from ${opts.store}: if you have half a minute, we would love to hear how your order went.`
      : `Thank you for shopping at ${opts.store}. Could you spare half a minute to tell us how it went?`,
    "",
    `Rate your order: ${opts.ratingUrl}`,
    "",
    `Your feedback helps ${opts.store} and other shoppers.`,
    "",
    `You received this because ${opts.store} asked for your feedback. Don't want these emails? ${opts.unsubscribeUrl}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#202223">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e1e3e5;border-radius:8px">
<tr><td style="padding:28px 28px 8px;font-size:15px;line-height:1.6">
<p style="margin:0 0 14px">${esc(hello)}</p>
<p style="margin:0 0 20px">${opts.reminder ? `A quick reminder from <strong>${esc(opts.store)}</strong>: if you have half a minute, we would love to hear how your order went.` : `Thank you for shopping at <strong>${esc(opts.store)}</strong>. Could you spare half a minute to tell us how it went?`}</p>
<p style="margin:0 0 22px"><a href="${esc(opts.ratingUrl)}" style="display:inline-block;background:#0f6b57;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Rate your order</a></p>
<p style="margin:0;color:#616a75;font-size:13px">Your feedback helps ${esc(opts.store)} and other shoppers.</p>
</td></tr>
<tr><td style="padding:18px 28px 24px;color:#8c9196;font-size:12px;line-height:1.5">You received this because ${esc(opts.store)} asked for your feedback. <a href="${esc(opts.unsubscribeUrl)}" style="color:#8c9196">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

async function sendViaResend(args: {
  to: string;
  fromName: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const fromAddress = process.env.REVIEW_FROM_EMAIL as string;
  const safeName = args.fromName.replace(/["<>\r\n]/g, "").slice(0, 60) || "Review request";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${safeName} <${fromAddress}>`,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
        headers: {
          "List-Unsubscribe": `<${args.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Email service said ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the email service" };
  }
}

export interface SendSummary {
  sent: number;
  skippedOptedOut: number;
  skippedRecent: number;
  failed: number;
  invalid: string[];
  stoppedAtLimit: boolean;
}

export async function sendReviewRequests(opts: {
  shop: string;
  tier: Tier;
  recipients: Recipient[];
  invalid: string[];
}): Promise<SendSummary> {
  const { shop, tier } = opts;
  const settings = await db.shopSettings.findUnique({ where: { shop } });
  const store = shopLabel(shop, settings?.brandName);
  const limit = monthlyLimit(tier);
  let used = await emailsUsedThisMonth(shop);
  const since = new Date(Date.now() - RESEND_AGAIN_DAYS * 86400000);

  const optedOut = new Set(
    (await db.emailOptOut.findMany({ where: { email: { in: opts.recipients.map((r) => r.email) } } })).map((o) => o.email),
  );
  const recent = new Set(
    (
      await db.reviewRequest.findMany({
        where: { shop, status: "sent", sentAt: { gte: since }, email: { in: opts.recipients.map((r) => r.email) } },
        select: { email: true },
      })
    ).map((r) => r.email),
  );

  const summary: SendSummary = { sent: 0, skippedOptedOut: 0, skippedRecent: 0, failed: 0, invalid: opts.invalid, stoppedAtLimit: false };

  for (const r of opts.recipients) {
    if (optedOut.has(r.email)) { summary.skippedOptedOut++; continue; }
    if (recent.has(r.email)) { summary.skippedRecent++; continue; }
    if (used >= limit) { summary.stoppedAtLimit = true; break; }

    const token = randomBytes(18).toString("base64url");
    const ratingUrl = `${appUrl()}/r/${token}`;
    const unsubscribeUrl = `${appUrl()}/u/${token}`;
    const mail = buildEmail({ store, name: r.name, ratingUrl, unsubscribeUrl });
    const result = await sendViaResend({
      to: r.email,
      fromName: store,
      replyTo: settings?.reviewReplyTo || null,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      unsubscribeUrl,
    });
    await db.reviewRequest.create({
      data: { token, shop, email: r.email, name: r.name, status: result.ok ? "sent" : "failed" },
    });
    if (result.ok) {
      summary.sent++;
      used++;
    } else {
      summary.failed++;
    }
  }

  if (summary.sent > 0) {
    await db.shopSettings.upsert({
      where: { shop },
      create: { shop, reviewEmailsMonth: monthKey(), reviewEmailsUsedMonth: summary.sent },
      update: { reviewEmailsMonth: monthKey(), reviewEmailsUsedMonth: used },
    });
  }
  return summary;
}

export async function reviewStats(shop: string) {
  const [sent, clicked, rated, avg, recent] = await Promise.all([
    db.reviewRequest.count({ where: { shop, status: "sent" } }),
    db.reviewRequest.count({ where: { shop, status: "sent", clickedAt: { not: null } } }),
    db.reviewRequest.count({ where: { shop, rating: { not: null } } }),
    db.reviewRequest.aggregate({ where: { shop, rating: { not: null } }, _avg: { rating: true } }),
    db.reviewRequest.findMany({ where: { shop }, orderBy: { sentAt: "desc" }, take: 20 }),
  ]);
  return { sent, clicked, rated, average: avg._avg.rating, recent };
}

export const REMIND_AFTER_DAYS = 3;

export function canRemind(r: { status: string; rating: number | null; remindedAt: Date | null; sentAt: Date }): boolean {
  return (
    r.status === "sent" &&
    r.rating === null &&
    r.remindedAt === null &&
    r.sentAt.getTime() <= Date.now() - REMIND_AFTER_DAYS * 86400000
  );
}

// Sends one reminder to each given request (already filtered to this shop).
// Each reminder counts against the monthly limit, like a first email.
async function sendReminders(shop: string, tier: Tier, requests: Array<{ id: string; token: string; email: string; name: string | null }>) {
  const settings = await db.shopSettings.findUnique({ where: { shop } });
  const store = shopLabel(shop, settings?.brandName);
  const limit = monthlyLimit(tier);
  let used = await emailsUsedThisMonth(shop);
  const optedOut = new Set(
    (await db.emailOptOut.findMany({ where: { email: { in: requests.map((r) => r.email) } } })).map((o) => o.email),
  );
  let sent = 0;
  let failed = 0;
  let skippedOptedOut = 0;
  let stoppedAtLimit = false;
  for (const r of requests) {
    if (optedOut.has(r.email)) { skippedOptedOut++; continue; }
    if (used >= limit) { stoppedAtLimit = true; break; }
    const mail = buildEmail({
      store,
      name: r.name,
      ratingUrl: `${appUrl()}/r/${r.token}`,
      unsubscribeUrl: `${appUrl()}/u/${r.token}`,
      reminder: true,
    });
    const result = await sendViaResend({
      to: r.email,
      fromName: store,
      replyTo: settings?.reviewReplyTo || null,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      unsubscribeUrl: `${appUrl()}/u/${r.token}`,
    });
    if (result.ok) {
      await db.reviewRequest.update({ where: { id: r.id }, data: { remindedAt: new Date() } });
      sent++;
      used++;
    } else {
      failed++;
    }
  }
  if (sent > 0) {
    await db.shopSettings.upsert({
      where: { shop },
      create: { shop, reviewEmailsMonth: monthKey(), reviewEmailsUsedMonth: sent },
      update: { reviewEmailsMonth: monthKey(), reviewEmailsUsedMonth: used },
    });
  }
  return { sent, failed, skippedOptedOut, stoppedAtLimit };
}

export async function remindOne(shop: string, tier: Tier, id: string) {
  const r = await db.reviewRequest.findFirst({ where: { id, shop } });
  if (!r || !canRemind(r)) return { sent: 0, failed: 0, skippedOptedOut: 0, stoppedAtLimit: false, notEligible: true };
  return { ...(await sendReminders(shop, tier, [r])), notEligible: false };
}

export async function remindAllWaiting(shop: string, tier: Tier) {
  const cutoff = new Date(Date.now() - REMIND_AFTER_DAYS * 86400000);
  const waiting = await db.reviewRequest.findMany({
    where: { shop, status: "sent", rating: null, remindedAt: null, sentAt: { lte: cutoff } },
    orderBy: { sentAt: "asc" },
    take: MAX_PER_SEND,
  });
  return sendReminders(shop, tier, waiting);
}

export async function waitingForReminder(shop: string): Promise<number> {
  const cutoff = new Date(Date.now() - REMIND_AFTER_DAYS * 86400000);
  return db.reviewRequest.count({ where: { shop, status: "sent", rating: null, remindedAt: null, sentAt: { lte: cutoff } } });
}
