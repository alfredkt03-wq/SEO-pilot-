import type { ActionFunctionArgs } from "react-router";
import { authenticateWebhook } from "../lib/webhook-auth.server";
import db from "../db.server";
import { withRetry } from "../lib/db-retry.server";

// Mandatory privacy webhook, sent 48 hours after a shop uninstalls: delete
// everything stored for that shop.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticateWebhook(request);
  console.log(`Received ${topic} webhook for ${shop} — deleting shop data`);

  await withRetry(
    () =>
      db.$transaction([
        db.session.deleteMany({ where: { shop } }),
        db.seoIssue.deleteMany({ where: { shop } }),
        db.seoScan.deleteMany({ where: { shop } }),
        db.reviewRequest.deleteMany({ where: { shop } }),
        db.shopSettings.deleteMany({ where: { shop } }),
      ]),
    "shop-redact",
  );

  return new Response(null, { status: 200 });
};
