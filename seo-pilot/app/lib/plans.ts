// Plans: Basic, Premium, Exclusive and Agency (no permanent free plan). Each paid plan is one plain
// Shopify `lineItems` subscription (no usage/metered billing), offered at
// two prices (USD and INR).
//
// Shopify lets an app bill a merchant in their own billing currency. A shop
// that pays Shopify in Indian Rupees gets the INR version at an India price;
// every other shop gets the USD version. Shopify's billing config is keyed by
// plan name, so each price needs its own name — all six are listed wherever
// a subscription is checked.
//
// This file is imported by UI code, so it must stay free of server-only
// imports; the logic that picks a plan for a shop lives in billing.server.ts.

export type Tier = "free" | "basic" | "premium" | "exclusive" | "agency";
export type PaidTier = Exclude<Tier, "free">;

export const PLANS = {
  basic: { usd: "SEO Pilot Basic", inr: "SEO Pilot Basic India", priceUsd: 3.89, priceInr: 309 },
  premium: { usd: "SEO Pilot Premium", inr: "SEO Pilot Premium India", priceUsd: 17.99, priceInr: 1499 },
  exclusive: { usd: "SEO Pilot Exclusive", inr: "SEO Pilot Exclusive India", priceUsd: 29, priceInr: 2499 },
  agency: { usd: "SEO Pilot Agency", inr: "SEO Pilot Agency India", priceUsd: 59, priceInr: 4999 },
} as const;

export type PlanName = (typeof PLANS)[PaidTier]["usd" | "inr"];

export const ALL_PLANS: PlanName[] = [
  PLANS.basic.usd,
  PLANS.basic.inr,
  PLANS.premium.usd,
  PLANS.premium.inr,
  PLANS.exclusive.usd,
  PLANS.exclusive.inr,
  PLANS.agency.usd,
  PLANS.agency.inr,
];

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  basic: "Basic",
  premium: "Premium",
  exclusive: "Exclusive",
  agency: "Agency",
};

export const TRIAL_DAYS = 5;

// AI writing allowance. One credit = one generated title, meta description,
// alt text or product description. No permanent free tier — "free" here
// only means "hasn't started a trial yet" and gets nothing, so its
// allowance is 0. Paid plans reset on the 1st of each month (UTC).
export const AI_CREDITS: Record<Tier, number> = { free: 0, basic: 100, premium: 250, exclusive: 600, agency: 1500 };

// How many of each resource type (products, collections, pages)
// one scan checks. Pages of 50. Free is 0 — a shop must start a paid plan's
// trial to scan anything.
export const SCAN_PAGES: Record<Tier, number> = { free: 0, basic: 6, premium: 20, exclusive: 100, agency: 150 };

const RANK: Record<PaidTier, number> = { basic: 1, premium: 2, exclusive: 3, agency: 4 };

// Every feature a plan gives, in full. Each plan box lists everything the
// merchant gets, so nobody has to work out what "Everything in Basic" means.
// `from` is the lowest plan that includes the feature.
const FEATURES_BY_TIER: Array<{ from: PaidTier; text: string }> = [
  { from: "basic", text: "Homepage check and mobile speed test" },
  { from: "basic", text: "One-click fixes and “Fix everything”" },
  { from: "basic", text: "SEO editor with live Google preview" },
  { from: "basic", text: "Unique titles for duplicate pages, written by AI" },
  { from: "basic", text: "Image alt text fixes and image compression" },
  { from: "basic", text: "Internal link suggestions" },
  { from: "basic", text: "Redirect manager and broken link finder" },
  { from: "basic", text: "Structured data (JSON-LD) for Google" },
  { from: "premium", text: "New product autopilot — every new product is checked" },
  { from: "premium", text: "Content check — finds pages that need more or clearer text" },
  { from: "premium", text: "AI descriptions for thin product and collection pages" },
  { from: "exclusive", text: "Autopilot writes SEO text for new products (you turn it on)" },
  { from: "exclusive", text: "Bulk redirect import — up to 200 at a time" },
  { from: "exclusive", text: "SEO report with CSV download and print to PDF" },
  { from: "agency", text: "Your own business name on the report, with the content check included" },
];

const SUPPORT: Record<PaidTier, string> = {
  basic: "Email support",
  premium: "Priority email support",
  exclusive: "Fastest support and first access to new features",
  agency: "Direct email support, answered first, and help with your first scan",
};

export function planFeatures(tier: PaidTier): string[] {
  const pages = SCAN_PAGES[tier] * 50;
  return [
    `Scans up to ${pages} products, ${pages} collections and ${pages} pages`,
    `${AI_CREDITS[tier]} AI writes a month`,
    ...FEATURES_BY_TIER.filter((f) => RANK[f.from] <= RANK[tier]).map((f) => f.text),
    SUPPORT[tier],
  ];
}

export function tierFromPlanName(name: string | null | undefined): Tier {
  if (!name) return "free";
  if (name === PLANS.agency.usd || name === PLANS.agency.inr) return "agency";
  if (name === PLANS.exclusive.usd || name === PLANS.exclusive.inr) return "exclusive";
  if (name === PLANS.premium.usd || name === PLANS.premium.inr) return "premium";
  if (name === PLANS.basic.usd || name === PLANS.basic.inr) return "basic";
  return "free";
}

export interface Pricing {
  currency: "USD" | "INR";
  basic: { plan: PlanName; priceLabel: string };
  premium: { plan: PlanName; priceLabel: string };
  exclusive: { plan: PlanName; priceLabel: string };
  agency: { plan: PlanName; priceLabel: string };
}

export function pricingForBillingCurrency(currency: string | null | undefined): Pricing {
  if (currency === "INR") {
    return {
      currency: "INR",
      basic: { plan: PLANS.basic.inr, priceLabel: `₹${PLANS.basic.priceInr}` },
      premium: { plan: PLANS.premium.inr, priceLabel: `₹${PLANS.premium.priceInr}` },
      exclusive: { plan: PLANS.exclusive.inr, priceLabel: `₹${PLANS.exclusive.priceInr}` },
      agency: { plan: PLANS.agency.inr, priceLabel: `₹${PLANS.agency.priceInr}` },
    };
  }
  return {
    currency: "USD",
    basic: { plan: PLANS.basic.usd, priceLabel: `$${PLANS.basic.priceUsd.toFixed(2)}` },
    premium: { plan: PLANS.premium.usd, priceLabel: `$${PLANS.premium.priceUsd.toFixed(2)}` },
    exclusive: { plan: PLANS.exclusive.usd, priceLabel: `$${PLANS.exclusive.priceUsd.toFixed(2)}` },
    agency: { plan: PLANS.agency.usd, priceLabel: `$${PLANS.agency.priceUsd.toFixed(2)}` },
  };
}

export interface PlanStatus {
  tier: Tier;
  hasActivePayment: boolean;
  planName: string | null;
}

