// Google Search Console integration (Premium/Exclusive). Talks to Google's
// OAuth 2.0 and Search Console REST APIs directly via fetch — no googleapis
// SDK dependency, same pattern as ai.server.ts's raw Anthropic calls.
//
// Setup required before this works (can't be skipped by code): a Google
// Cloud project with the "Search Console API" enabled, an OAuth 2.0 Web
// Client ID, and its Client Secret, set as GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET. The redirect URI registered in that OAuth client
// must exactly match `${appUrl}/auth/gsc/callback`.

import db from "../db.server";

const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_API = "https://www.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export function gscConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function requireCreds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google Search Console isn't set up yet — GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET aren't configured.",
    );
  }
  return { clientId, clientSecret };
}

// `state` carries the shop domain through Google's redirect so the callback
// knows which shop to save the tokens against (Google's OAuth flow has no
// other way to pass that through).
export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = requireCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // forces a refresh_token on every connect, not just the first
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = requireCreds();
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(json.error_description || json.error || "Google didn't accept the authorization code");
  }
  return json;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = requireCreds();
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(json.error_description || json.error || "Couldn't refresh the Google Search Console connection");
  }
  return json.access_token;
}

// Lists the Search Console properties (sites) this Google account can see —
// used right after connecting to find the one matching the shop's domain,
// since Search Console properties are managed in Google, not chosen by us.
export async function listSites(accessToken: string): Promise<string[]> {
  const res = await fetch(`${GSC_API}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Couldn't list Search Console properties");
  return (json.siteEntry ?? [])
    .filter((s: any) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s: any) => s.siteUrl as string);
}

// Picks the property that best matches the storefront domain, preferring an
// exact domain-property match ("sc-domain:") over a URL-prefix property.
export function pickSiteForDomain(sites: string[], shopDomain: string): string | null {
  const bare = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const domainProp = sites.find((s) => s === `sc-domain:${bare}`);
  if (domainProp) return domainProp;
  const urlProp = sites.find((s) => s.includes(bare));
  if (urlProp) return urlProp;
  return sites[0] ?? null;
}

export interface GscStats {
  clicks: number;
  impressions: number;
  topQueries: Array<{ query: string; clicks: number; impressions: number }>;
}

// Last 28 full days — Search Console data usually lags 2-3 days, so "today"
// isn't final yet and is deliberately excluded.
export async function fetchSearchAnalytics(accessToken: string, siteUrl: string): Promise<GscStats> {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 28);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch(`${GSC_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ["query"],
      rowLimit: 10,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Couldn't fetch Search Console data");

  const rows: Array<{ keys: string[]; clicks: number; impressions: number }> = json.rows ?? [];
  const topQueries = rows.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions }));
  const clicks = topQueries.reduce((sum, r) => sum + r.clicks, 0);
  const impressions = topQueries.reduce((sum, r) => sum + r.impressions, 0);
  return { clicks, impressions, topQueries };
}

export interface GscStatus {
  connected: boolean;
  siteUrl: string | null;
  connectedAt: Date | null;
  lastCheckedAt: Date | null;
  clicks28d: number | null;
  impressions28d: number | null;
  topQueries: Array<{ query: string; clicks: number; impressions: number }>;
}

export async function getGscStatus(shop: string): Promise<GscStatus> {
  const row = await db.shopSettings.findUnique({
    where: { shop },
    select: {
      gscRefreshToken: true,
      gscSiteUrl: true,
      gscConnectedAt: true,
      gscLastCheckedAt: true,
      gscClicks28d: true,
      gscImpressions28d: true,
      gscTopQueries: true,
    },
  });
  return {
    connected: Boolean(row?.gscRefreshToken),
    siteUrl: row?.gscSiteUrl ?? null,
    connectedAt: row?.gscConnectedAt ?? null,
    lastCheckedAt: row?.gscLastCheckedAt ?? null,
    clicks28d: row?.gscClicks28d ?? null,
    impressions28d: row?.gscImpressions28d ?? null,
    topQueries: row?.gscTopQueries ? JSON.parse(row.gscTopQueries) : [],
  };
}

// Re-fetches from Google and caches the result — called when the page is
// opened and the cache is more than 12 hours old, so a merchant tabbing back
// and forth doesn't cause a Google API call every time.
export async function refreshGscStats(shop: string): Promise<GscStatus> {
  const row = await db.shopSettings.findUnique({
    where: { shop },
    select: { gscRefreshToken: true, gscSiteUrl: true },
  });
  if (!row?.gscRefreshToken || !row.gscSiteUrl) {
    throw new Error("Google Search Console isn't connected for this store");
  }
  const accessToken = await refreshAccessToken(row.gscRefreshToken);
  const stats = await fetchSearchAnalytics(accessToken, row.gscSiteUrl);
  await db.shopSettings.update({
    where: { shop },
    data: {
      gscClicks28d: stats.clicks,
      gscImpressions28d: stats.impressions,
      gscTopQueries: JSON.stringify(stats.topQueries),
      gscLastCheckedAt: new Date(),
    },
  });
  return getGscStatus(shop);
}

export async function disconnectGsc(shop: string): Promise<void> {
  await db.shopSettings.update({
    where: { shop },
    data: {
      gscRefreshToken: null,
      gscSiteUrl: null,
      gscConnectedAt: null,
      gscLastCheckedAt: null,
      gscClicks28d: null,
      gscImpressions28d: null,
      gscTopQueries: null,
    },
  });
}
