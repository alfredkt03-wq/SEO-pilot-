import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Mandatory privacy webhook. Metaglow SEO doesn't read customers from Shopify;
// the only customer details it holds are email addresses a merchant typed in
// for review requests, which the merchant can see and export from the Reviews
// page. authenticate.webhook verifies Shopify's HMAC signature and rejects fakes.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — review-request recipients are visible to the merchant in the app`);
  return new Response();
};
