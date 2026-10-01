import db from "../db.server";
import type { authenticate } from "../shopify.server";
import {
  ALL_PLANS,
  pricingForBillingCurrency,
  tierFromPlanName,
  type PaidTier,
  type PlanStatus,
  type Pricing,
} from "./plans";

type AdminContext = Awaited<ReturnType<typeof authenticate.admin>>;
type Billing = AdminContext["billing"];

export const isTestPayment = process.env.NODE_ENV !== "production";

export interface ShopMarket {
  // Currency the shop pays Shopify (and apps) in — decides the plan price.
  billingCurrency: string | null;
  // Currency the storefront sells in — "INR" means the store sells to India,
  // which switches suggestions to India-specific wording.
  storeCurrency: string | null;
}

// Both currencies are cached on ShopSettings after the first lookup: they
// almost never change, and this runs on nearly every page load. If the lookup
// fails, nothing is cached and the app falls back to USD pricing and neutral
// wording, then tries again on the next request.
export async function getShopMarket(admin: any, shop: string): Promise<ShopMarket> {
  const cached = await db.shopSettings.findUnique({
    where: { shop },
    select: { billingCurrency: true, storeCurrency: true },
  });
  if (cached?.billingCurrency && cached.storeCurrency) {
    return { billingCurrency: cached.billingCurrency, storeCurrency: cached.storeCurrency };
  }

  try {
    const res = await admin.graphql(
      `#graphql
      query SeoPilotShopMarket {
        shopBillingPreferences { currency }
        shop { currencyCode }
      }`,
    );
    const json = await res.json();
    const billingCurrency: string | null = json.data?.shopBillingPreferences?.currency ?? null;
    const storeCurrency: string | null = json.data?.shop?.currencyCode ?? null;
    if (billingCurrency && storeCurrency) {
      await db.shopSettings.upsert({
        where: { shop },
        update: { billingCurrency, storeCurrency },
        create: { shop, billingCurrency, storeCurrency },
      });
    }
    return { billingCurrency, storeCurrency };
  } catch {
    return { billingCurrency: null, storeCurrency: null };
  }
}

export function isIndianStore(market: ShopMarket): boolean {
  return market.storeCurrency === "INR";
}

export async function getPricing(admin: any, shop: string): Promise<Pricing> {
  const market = await getShopMarket(admin, shop);
  return pricingForBillingCurrency(market.billingCurrency);
}

// Any of the four paid plan names counts, so a shop whose billing currency
// changes after subscribing is never locked out.
// `isTest: true` in check/require means "count test subscriptions too" (real
// ones always count). Development stores get test subscriptions automatically,
// so without this a dev or review store would approve a plan and still look
// unpaid. Real merchants are still charged: requestPlan uses isTestPayment.
const TIER_RANK = { free: 0, basic: 1, premium: 2, exclusive: 3, agency: 4 } as const;

export async function checkPlan(billing: Billing): Promise<PlanStatus> {
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ALL_PLANS,
    isTest: true,
  });
  // If more than one subscription is listed (e.g. during a plan switch), use
  // the highest plan rather than whichever came first.
  const subs = appSubscriptions ?? [];
  let planName: string | null = null;
  let best: keyof typeof TIER_RANK = "free";
  for (const s of subs) {
    const t = tierFromPlanName(s.name);
    if (TIER_RANK[t] > TIER_RANK[best] || planName === null) {
      best = t;
      planName = s.name;
    }
  }
  // A paid subscription under a name we don't know still counts as paid
  return { tier: hasActivePayment && best === "free" ? "basic" : hasActivePayment ? best : "free", hasActivePayment, planName };
}

// Starts (or switches to) a subscription — including its free trial — at
// the price that matches the shop's billing currency. Redirects the
// merchant to Shopify's confirmation page; approving it replaces any
// current plan. There's no free tier: this is the only way into the app.
// If Shopify refuses the rupee version, it falls back to the dollar plan so
// the merchant is never stuck.
export async function requestPlan(admin: any, billing: Billing, shop: string, tier: PaidTier = "basic") {
  const pricing = await getPricing(admin, shop);
  try {
    return await billing.request({ plan: pricing[tier].plan, isTest: isTestPayment });
  } catch (err) {
    // A successful request throws a redirect Response to Shopify's approval page.
    if (err instanceof Response) throw err;
    if (pricing.currency === "INR") {
      return billing.request({ plan: pricingForBillingCurrency("USD")[tier].plan, isTest: isTestPayment });
    }
    throw err;
  }
}

// Gate for paid actions: passes through when any paid plan is active,
// otherwise sends the merchant to start Basic at their local price.
export async function requirePlan(admin: any, billing: Billing, shop: string) {
  await billing.require({
    plans: ALL_PLANS,
    isTest: true,
    onFailure: async () => requestPlan(admin, billing, shop, "basic"),
  });
}
