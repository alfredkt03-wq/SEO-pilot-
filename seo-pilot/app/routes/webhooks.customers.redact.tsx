import type { ActionFunctionArgs } from "react-router";
import { authenticateWebhook } from "../lib/webhook-auth.server";
import db from "../db.server";
import { withRetry } from "../lib/db-retry.server";

// Mandatory privacy webhook. Metaglow SEO doesn't read customers from Shopify.
// The only customer details it holds are the email addresses (and optional
// first names) a merchant typed in to send a review request, so when Shopify
// asks to erase a customer, delete any request for that email in that shop.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhook(request);
  const email = String((payload as any)?.customer?.email ?? "").trim().toLowerCase();
  if (email) {
    const { count } = await withRetry<{ count: number }>(() => db.reviewRequest.deleteMany({ where: { shop, email } }), "customers-redact");
    console.log(`Received ${topic} webhook for ${shop} — removed ${count} review request(s)`);
  } else {
    console.log(`Received ${topic} webhook for ${shop} — no email in payload`);
  }
  return new Response(null, { status: 200 });
};
