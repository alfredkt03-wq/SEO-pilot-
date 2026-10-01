import type { Config } from "@react-router/dev/config";

// Behind Render's proxy the server sees the request as http://, while the
// browser sends Origin: https://… . React Router treats that mismatch as a
// forged request and answers every form/button POST with 400 "Bad Request".
// Allow our own host (taken from SHOPIFY_APP_URL) plus Shopify's admin.
const appHost = (() => {
  try {
    return process.env.SHOPIFY_APP_URL ? new URL(process.env.SHOPIFY_APP_URL).host : null;
  } catch {
    return null;
  }
})();

export default {
  allowedActionOrigins: [
    ...(appHost ? [appHost] : []),
    "seo-pilot-l7ay.onrender.com",
    "admin.shopify.com",
    "*.myshopify.com",
  ],
} satisfies Config;
