import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory privacy webhook. Metaglow SEO doesn't read customers from Shopify.
// The only customer details it holds are the email addresses (and optional
// first names) a merchant typed in to send a review request, so when Shopify
// asks to erase a customer, delete any request for that email in that shop.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const email = String((payload as any)?.customer?.email ?? "").trim().toLowerCase();
  if (email) {
    const { count } = await db.reviewRequest.deleteMany({ where: { shop, email } });
    console.log(`Received ${topic} webhook for ${shop} — removed ${count} review request(s)`);
  } else {
    console.log(`Received ${topic} webhook for ${shop} — no email in payload`);
  }
  return new Response();
};
