import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory privacy webhook, sent 48 hours after a shop uninstalls: delete
// everything stored for that shop.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — deleting shop data`);

  await db.session.deleteMany({ where: { shop } });
  await db.seoIssue.deleteMany({ where: { shop } });
  await db.seoScan.deleteMany({ where: { shop } });
  await db.shopSettings.deleteMany({ where: { shop } });

  return new Response();
};
