import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Clean up the store's data. The settings row is kept (with the Google
  // connection and autopilot switched off) so the month's AI usage counter
  // survives an uninstall/reinstall; shop/redact deletes it completely later.
  await db.seoIssue.deleteMany({ where: { shop } });
  await db.seoScan.deleteMany({ where: { shop } });
  await db.shopSettings.updateMany({
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
  });

  return new Response();
};
