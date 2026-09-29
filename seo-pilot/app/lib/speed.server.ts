// Mobile speed check via Google PageSpeed Insights (the same Lighthouse test
// as pagespeed.web.dev). Run on demand from the dashboard — one test takes
// roughly 10–40 seconds — and the latest result is cached on ShopSettings.
//
// Works without an API key for light use; set PAGESPEED_API_KEY (a free key
// from Google Cloud) for reliable quota once many stores use it.
import db from "../db.server";

export interface SpeedResult {
  score: number; // 0–100
  lcp: string | null; // e.g. "3.1 s"
  cls: string | null; // e.g. "0.02"
  tbt: string | null; // e.g. "450 ms"
}

export async function runSpeedCheck(shop: string, storefrontUrl: string): Promise<SpeedResult> {
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", storefrontUrl);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.set("category", "performance");
  if (process.env.PAGESPEED_API_KEY) endpoint.searchParams.set("key", process.env.PAGESPEED_API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let json: any;
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error?.message ?? `Speed test failed (HTTP ${res.status})`);
    }
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("Speed test took too long — try again in a minute");
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const result = parseSpeedResult(json);
  await db.shopSettings.upsert({
    where: { shop },
    update: {
      speedScore: result.score,
      speedLcp: result.lcp,
      speedCls: result.cls,
      speedTbt: result.tbt,
      speedCheckedAt: new Date(),
    },
    create: {
      shop,
      speedScore: result.score,
      speedLcp: result.lcp,
      speedCls: result.cls,
      speedTbt: result.tbt,
      speedCheckedAt: new Date(),
    },
  });
  return result;
}

// Exported for tests
export function parseSpeedResult(json: any): SpeedResult {
  const rawScore = json?.lighthouseResult?.categories?.performance?.score;
  if (typeof rawScore !== "number") throw new Error("Speed test returned no score");
  const audits = json?.lighthouseResult?.audits ?? {};
  return {
    score: Math.round(rawScore * 100),
    lcp: audits["largest-contentful-paint"]?.displayValue ?? null,
    cls: audits["cumulative-layout-shift"]?.displayValue ?? null,
    tbt: audits["total-blocking-time"]?.displayValue ?? null,
  };
}
