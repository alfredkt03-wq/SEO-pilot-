// Lifetime counters behind the dashboard's "Your impact" summary. Deliberately
// simple running totals rather than a time-series log — cheap to maintain,
// and the dashboard copy is written to match ("since you installed SEO
// Pilot", never "this month") so it never implies precision the data
// doesn't have.
import db from "../db.server";

// Rough, disclosed-on-screen estimate of manual time each action would have
// taken a merchant doing it by hand: looking up the right title/description
// length, writing it, and saving. Conservative on purpose.
const MINUTES_PER_FIX = 2;
const MINUTES_PER_REDIRECT = 3;

export async function recordFixesApplied(shop: string, count: number): Promise<void> {
  if (count <= 0) return;
  await db.shopSettings.upsert({
    where: { shop },
    update: { totalFixesApplied: { increment: count } },
    create: { shop, totalFixesApplied: count },
  });
}

export async function recordRedirectCreated(shop: string): Promise<void> {
  await db.shopSettings.upsert({
    where: { shop },
    update: { totalRedirectsCreated: { increment: 1 } },
    create: { shop, totalRedirectsCreated: 1 },
  });
}

export function estimateMinutesSaved(totalFixesApplied: number, totalRedirectsCreated: number): number {
  return totalFixesApplied * MINUTES_PER_FIX + totalRedirectsCreated * MINUTES_PER_REDIRECT;
}
