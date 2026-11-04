import type { ActionFunctionArgs } from "react-router";
import { authenticateWebhook } from "../lib/webhook-auth.server";
import db from "../db.server";
import { withRetry } from "../lib/db-retry.server";
import { clearPlanCache } from "../lib/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Verifies the HMAC; an invalid signature throws a 401 (intended).
  const { shop, topic } = await authenticateWebhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  clearPlanCache(shop);

  // Idempotent: webhooks can fire twice or after the data is already gone, so
  // this never depends on a session existing. The settings row is kept (with the
  // Google connection and autopilot switched off) so the month's AI usage counter
  // survives an uninstall/reinstall; shop/redact deletes it completely later.
  await withRetry(
    () =>
      db.$transaction([
        db.session.deleteMany({ where: { shop } }),
        db.seoIssue.deleteMany({ where: { shop } }),
        db.seoScan.deleteMany({ where: { shop } }),
        db.shopSettings.updateMany({
          where: { shop },
          data: {
            gscRefreshToken: null,
            gscSiteUrl: null,
            gscConnectedAt: null,
            gscLastCheckedAt: null,
            gscClicks28d: null,
            gscImpressions28d: null,
            gscTopQueries: null,
            autoOptimizeNew: false,
          },
        }),
      ]),
    "uninstalled",
  );

  return new Response(null, { status: 200 });
};
