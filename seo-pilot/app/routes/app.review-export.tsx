// Data for the "Download CSV" button on the review requests page. The page
// turns this into a file in the browser, the same way the SEO report does.
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { checkPlan } from "../lib/billing.server";
import { monthlyLimit } from "../lib/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  if (monthlyLimit(tier) === 0) return { export: [] as ExportRow[] };
  const rows = await db.reviewRequest.findMany({ where: { shop: session.shop }, orderBy: { sentAt: "desc" }, take: 5000 });
  return {
    export: rows.map(
      (r): ExportRow => ({
        email: r.email,
        name: r.name ?? "",
        status: r.status,
        sentAt: r.sentAt.toISOString(),
        opened: r.clickedAt ? "yes" : "no",
        rating: r.rating ?? "",
        comment: r.comment ?? "",
        ratedAt: r.ratedAt ? r.ratedAt.toISOString() : "",
        reminded: r.remindedAt ? "yes" : "no",
      }),
    ),
  };
};

interface ExportRow {
  email: string;
  name: string;
  status: string;
  sentAt: string;
  opened: string;
  rating: number | string;
  comment: string;
  ratedAt: string;
  reminded: string;
}
