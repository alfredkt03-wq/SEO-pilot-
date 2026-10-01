import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { PLANS, TRIAL_DAYS } from "./lib/plans";

// Where this app is reachable from the internet, checked in this order:
//   SHOPIFY_APP_URL     — explicit setting; always wins when present
//   HOST                — `shopify app dev` hands its temporary tunnel URL
//                         over under this name (seen with Shopify CLI 4.8)
//   RENDER_EXTERNAL_URL — set automatically by Render on every web service
//                         (its full https://….onrender.com address), so a
//                         Render deploy works without configuring anything
// Resolved in one place so a missing value fails with a message that says
// what to actually do, rather than the SDK's opaque "empty appUrl
// configuration".
function resolveAppUrl(): string {
  const fromEnv =
    process.env.SHOPIFY_APP_URL ||
    process.env.HOST ||
    process.env.RENDER_EXTERNAL_URL ||
    "";
  if (fromEnv) return fromEnv;

  throw new Error(
    "Metaglow SEO: no app URL available. In local development this is normally " +
      "supplied automatically by `npm run dev` (the Shopify CLI) — if you see " +
      "this, the CLI didn't pass it through, and setting SHOPIFY_APP_URL in a " +
      ".env file at the project root to the tunnel URL shown in the terminal " +
      "will unblock you. When deploying, set SHOPIFY_APP_URL to your app's " +
      "real public URL.",
  );
}

function recurring(amount: number, currencyCode: "USD" | "INR") {
  return {
    trialDays: TRIAL_DAYS,
    lineItems: [{ amount, currencyCode, interval: BillingInterval.Every30Days as const }],
  };
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: resolveAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  // Eight plan names: Basic, Premium, Exclusive and Agency, each in USD and in INR.
  // Shops that pay Shopify in rupees are charged the INR price directly, so
  // they see ₹ on their bill instead of a converted USD amount plus
  // Shopify's currency-exchange fee. billing.server.ts picks the right one
  // per shop.
  billing: {
    [PLANS.basic.usd]: recurring(PLANS.basic.priceUsd, "USD"),
    [PLANS.basic.inr]: recurring(PLANS.basic.priceInr, "INR"),
    [PLANS.premium.usd]: recurring(PLANS.premium.priceUsd, "USD"),
    [PLANS.premium.inr]: recurring(PLANS.premium.priceInr, "INR"),
    [PLANS.exclusive.usd]: recurring(PLANS.exclusive.priceUsd, "USD"),
    [PLANS.exclusive.inr]: recurring(PLANS.exclusive.priceInr, "INR"),
    [PLANS.agency.usd]: recurring(PLANS.agency.priceUsd, "USD"),
    [PLANS.agency.inr]: recurring(PLANS.agency.priceInr, "INR"),
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
// Exported for the Google OAuth routes (auth.gsc.*), which need the exact
// same public app URL to build a redirect_uri that matches what's
// registered in the Google Cloud OAuth client.
export { resolveAppUrl };
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
