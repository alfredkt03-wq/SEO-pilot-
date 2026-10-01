// Starts the Google OAuth flow for Search Console. Requires Premium or
// Exclusive — gated here rather than only in the UI, since this URL could
// otherwise be hit directly.
import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate, resolveAppUrl } from "../shopify.server";
import { buildAuthorizeUrl, gscConfigured } from "../lib/gsc.server";
import { checkPlan } from "../lib/billing.server";
import { buildSignedState } from "../lib/oauth-state.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing, redirect: adminRedirect } = await authenticate.admin(request);

  if (!gscConfigured()) {
    throw new Response(
      "Google Search Console isn't set up on this app yet (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
      { status: 503 },
    );
  }

  const { tier } = await checkPlan(billing);
  if (tier !== "premium" && tier !== "exclusive" && tier !== "agency") {
    return redirect("/app/billing");
  }

  const redirectUri = `${resolveAppUrl()}/auth/gsc/callback`;
  // Google refuses to load inside the Shopify admin iframe, so the redirect
  // has to happen at the top level of the browser window.
  return adminRedirect(buildAuthorizeUrl(redirectUri, buildSignedState(session.shop)), { target: "_top" });
};
