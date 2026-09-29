import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleNewProduct } from "../lib/autopilot.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload } = await authenticate.webhook(request);
  const gid = (payload as any)?.admin_graphql_api_id;
  // Always answer 200 quickly; a failure here must never make Shopify retry forever.
  if (admin && gid) {
    try {
      await handleNewProduct(admin, shop, gid);
    } catch (err) {
      console.error("products/create autopilot failed", shop, err);
    }
  }
  return new Response();
};
