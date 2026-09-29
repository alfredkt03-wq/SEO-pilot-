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
export async function checkPlan(billing: Billing): Promise<PlanStatus> {
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ALL_PLANS,
    isTest: isTestPayment,
  });
  const planName = appSubscriptions?.[0]?.name ?? null;
  const tier = hasActivePayment ? tierFromPlanName(planName) : "free";
  // A paid subscription under a name we don't know still counts as paid
  return { tier: hasActivePayment && tier === "free" ? "basic" : tier, hasActivePayment, planName };
}

// Starts (or switches to) a subscription — including its 7-day trial — at
// the price that matches the shop's billing currency. Redirects the
// merchant to Shopify's confirmation page; approving it replaces any
// current plan. There's no free tier: this is the only way into the app.
export async function requestPlan(admin: any, billing: Billing, shop: string, tier: PaidTier = "basic") {
  const pricing = await getPricing(admin, shop);
  return billing.request({ plan: pricing[tier].plan, isTest: isTestPayment });
}

// Gate for paid actions: passes through when any paid plan is active,
// otherwise sends the merchant to start Basic at their local price.
export async function requirePlan(admin: any, billing: Billing, shop: string) {
  await billing.require({
    plans: ALL_PLANS,
    isTest: isTestPayment,
    onFailure: async () => requestPlan(admin, billing, shop, "basic"),
  });
}
