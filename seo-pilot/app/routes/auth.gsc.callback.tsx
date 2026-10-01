// Google redirects here after the merchant approves (or denies) access.
// This request lands at the top level, outside the Shopify embedded iframe
// (Google requires that), so it doesn't rely on an active embedded-app
// session — the shop domain instead comes back in `state`, exactly as we
// sent it when starting the flow in auth.gsc.tsx. Once the tokens are saved
// it redirects into `/app/search-console`, which Shopify's own auth
// middleware bounces back into the embedded iframe as usual.
import { redirect, type LoaderFunctionArgs } from "react-router";
import { resolveAppUrl } from "../shopify.server";
import db from "../db.server";
import { exchangeCodeForTokens, listSites, pickSiteForDomain } from "../lib/gsc.server";
import { verifySignedState } from "../lib/oauth-state.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // `state` is HMAC-signed in auth.gsc.tsx — verifying it here (instead of
  // trusting the raw shop string Google echoes back) stops anyone from
  // starting their own Google consent flow with a hand-picked `state` and
  // getting their tokens saved onto someone else's shop.
  const shop = verifySignedState(url.searchParams.get("state"));
  const error = url.searchParams.get("error");

  const back = (message?: string) => {
    const params = new URLSearchParams();
    if (message) params.set("gscError", message);
    if (shop) params.set("shop", shop);
    return redirect(`/app/search-console?${params.toString()}`);
  };

  if (!shop) return back("That connection link expired or is invalid — try connecting again.");
  if (error) return back(error === "access_denied" ? "Access was declined in Google." : error);
  if (!code) return back("Google didn't return an authorization code.");

  try {
    const redirectUri = `${resolveAppUrl()}/auth/gsc/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens.refresh_token) {
      // Happens if the merchant had already granted access before and
      // Google skipped issuing a new refresh token — `prompt=consent` in
      // buildAuthorizeUrl is meant to prevent this, but Google's behavior
      // here isn't fully guaranteed.
      return back("Google didn't grant a lasting connection — please try connecting again.");
    }

    const sites = await listSites(tokens.access_token);
    if (sites.length === 0) {
      return back(
        "No Search Console properties found on that Google account. Verify your store's domain in Search Console first, then reconnect.",
      );
    }
    const siteUrl = pickSiteForDomain(sites, shop);
    if (!siteUrl) {
      return back(
        "We couldn't tell which Search Console property is your store. Connect with a Google account that has only your store's property, or email support and we'll link it.",
      );
    }

    await db.shopSettings.upsert({
      where: { shop },
      update: { gscRefreshToken: tokens.refresh_token, gscSiteUrl: siteUrl, gscConnectedAt: new Date() },
      create: { shop, gscRefreshToken: tokens.refresh_token, gscSiteUrl: siteUrl, gscConnectedAt: new Date() },
    });

    return redirect(`/app/search-console?connected=1&shop=${encodeURIComponent(shop)}`);
  } catch (err: any) {
    return back(err?.message || "Couldn't connect Google Search Console.");
  }
};
