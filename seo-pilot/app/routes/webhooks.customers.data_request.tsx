import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Mandatory privacy webhook. Metaglow SEO never stores customer data (only
// product/page SEO fields and scan results), so there is nothing to export.
// authenticate.webhook verifies Shopify's HMAC signature and rejects fakes.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — no customer data stored`);
  return new Response();
};
