import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";

import { PLANS, planFeatures, TIER_LABEL, TRIAL_DAYS } from "../lib/plans";
import { PublicFonts, PublicShell } from "../components/public-shell";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Shopify Admin opens the app at "/" with the shop handle in the query
  // string. Hand straight off to the embedded dashboard, forwarding every
  // parameter — App Bridge needs `host` and `embedded` to set up the session,
  // so they can't be dropped here.
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Merchants install from the Shopify App Store, where Shopify itself
  // handles the install and tells the app which store it is — so this page
  // has no store-address form. Set SHOPIFY_APP_STORE_URL (in Render) to the
  // listing URL once it exists; until then the page says "coming soon".
  return { appStoreUrl: process.env.SHOPIFY_APP_STORE_URL || null };
};

function Icon({ path, size = 20 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const CHECK = "M20 6L9 17l-5-5";
const ARROW = "M5 12h14M13 6l6 6-6 6";
const SCAN = "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35";
const WRENCH = "M14.7 6.3a4 4 0 10-5.66 5.66L3 18v3h3l6.04-6.04a4 4 0 005.66-5.66l-2.5 2.5-2-2 2.5-2.5z";
const LINK = "M9 17H7a5 5 0 010-10h2M15 7h2a5 5 0 010 10h-2M8 12h8";
const CODE = "M8 6L3 12l5 6M16 6l5 6-5 6";
const CHART = "M4 20V10M10 20V4M16 20v-7M22 20H2";
const EYEOFF = "M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.5 5.1A9.7 9.7 0 0112 5c5 0 9 4 10.4 7-.5 1-1.2 2-2.1 3M6.7 6.7C4.7 8 3.2 9.8 1.6 12 3 15 7 19 12 19c1.3 0 2.6-.3 3.7-.7";

const STEPS = [
  { title: "Scan your store", body: "One click checks your products, collections, pages and homepage. Nothing on your store changes." },
  { title: "See what to fix", body: "Every problem is explained in plain words and sorted by how much it matters." },
  { title: "Fix it in a click", body: "Apply the fixes you approve. AI can write titles and descriptions for the rest." },
];

const FEATURES: Array<{ title: string; body: string; icon: string; tone: "green" | "gold" }> = [
  { title: "Full-store scan", body: "Products, collections, pages and homepage — checked for titles, meta descriptions, alt text and thin content.", icon: SCAN, tone: "green" },
  { title: "One-click fixes", body: "Template or AI-written fixes. You confirm before anything changes on your store.", icon: WRENCH, tone: "gold" },
  { title: "Broken links & redirects", body: "Finds dead links and sends visitors to the right page, without touching your theme code.", icon: LINK, tone: "green" },
  { title: "Internal links", body: "Finds pages that mention another page without linking to it and adds the link in one click.", icon: LINK, tone: "gold" },
  { title: "Structured data", body: "Schema.org markup for products, articles and breadcrumbs, so Google can show richer results.", icon: CODE, tone: "gold" },
];

const PLAN_CARDS = (["basic", "premium", "exclusive", "agency"] as const).map((t) => ({
  name: TIER_LABEL[t],
  usd: PLANS[t].priceUsd,
  inr: PLANS[t].priceInr,
  featured: t === "premium",
  items: planFeatures(t),
}));

const TRUST = [`${TRIAL_DAYS}-day free trial`, "Cancel anytime in Shopify", "Rupee pricing for Indian shops"];

function GetApp({ appStoreUrl, onLight = false }: { appStoreUrl: string | null; onLight?: boolean }) {
  if (appStoreUrl) {
    return (
      <a className={`pp-btn-cta${onLight ? " green" : ""}`} href={appStoreUrl}>
        Get it on the Shopify App Store
        <Icon path={ARROW} size={19} />
      </a>
    );
  }
  // No listing URL yet: show nothing rather than a "coming soon" line.
  return null;
}

export default function Index() {
  const { appStoreUrl } = useLoaderData<typeof loader>();

  return (
    <>
      <PublicFonts />
      <PublicShell wide>
        <div className="pp-hero-band">
          <div className="pp-wrap">
            <section className="pp-hero">
              <div>
                <span className="pp-eyebrow">Made for growing Indian stores</span>
                <h1>
                  Fix the <em>SEO gaps</em> keeping your store out of Google
                </h1>
                <p className="pp-hero-sub">
                  SEO Pilot scans your products, collections, pages and homepage for what keeps them
                  out of Google — missing titles, weak descriptions, unlabeled images, broken links —
                  and fixes it in a click. No SEO knowledge needed.
                </p>
                <div className="pp-cta-row">
                  <GetApp appStoreUrl={appStoreUrl} />
                </div>
                <div className="pp-trust-row">
                  {TRUST.map((t) => (
                    <span className="pp-trust-item" key={t}>
                      <Icon path={CHECK} size={16} />
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pp-mock" aria-label="Example of the SEO Pilot dashboard">
                <div className="pp-mock-top">
                  <span className="pp-mock-title">Store SEO score</span>
                  <span className="pp-mock-tag">Example</span>
                </div>
                <div className="pp-mock-score">
                  <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
                    <circle cx="42" cy="42" r="34" fill="none" stroke="#e8eee2" strokeWidth="9" />
                    <circle
                      cx="42"
                      cy="42"
                      r="34"
                      fill="none"
                      stroke="#167a44"
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray="213.6"
                      strokeDashoffset="44.9"
                      transform="rotate(-90 42 42)"
                    />
                  </svg>
                  <div>
                    <div className="pp-mock-grade">
                      B+<small>79 / 100</small>
                    </div>
                  </div>
                  <div className="pp-mock-note">4 problems to fix.<br />3 can be fixed automatically.</div>
                </div>
                <div className="pp-mock-row">
                  <span className="pp-pill high">High</span>
                  <span>Missing meta description</span>
                </div>
                <div className="pp-mock-row">
                  <span className="pp-pill high">High</span>
                  <span>Duplicate SEO title</span>
                </div>
                <div className="pp-mock-row">
                  <span className="pp-pill med">Medium</span>
                  <span>Missing alt text on 3 images</span>
                </div>
                <div className="pp-mock-row" style={{ borderBottom: "none" }}>
                  <span className="pp-pill low">Low</span>
                  <span>SEO title a little short</span>
                </div>
                <div className="pp-mock-btn">Fix everything automatically</div>
              </div>
            </section>
          </div>
        </div>

        <section className="pp-section" id="how">
          <div className="pp-wrap">
            <h2>Three steps. No SEO knowledge.</h2>
            <p className="pp-lead">
              If you have never touched SEO, you can still use this. It tells you what is wrong in
              plain words, and there is a manual inside the app.
            </p>
            <div className="pp-steps">
              {STEPS.map((s, i) => (
                <div className="pp-step" key={s.title}>
                  <div className="pp-step-num">{i + 1}</div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pp-section tint">
          <div className="pp-wrap">
            <h2>Everything your store needs to be found</h2>
            <div className="pp-feature-grid">
              {FEATURES.map((f) => (
                <div className="pp-feature-card" key={f.title}>
                  <div className={`pp-feature-icon ${f.tone}`}>
                    <Icon path={f.icon} size={21} />
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pp-section" id="pricing">
          <div className="pp-wrap">
            <h2>Simple pricing, in your currency</h2>
            <p className="pp-lead">
              Every plan starts with a {TRIAL_DAYS}-day free trial. Shops billed in Indian rupees pay the
              rupee price.
            </p>
            <div className="pp-plans">
              {PLAN_CARDS.map((p) => (
                <div className={`pp-plan${p.featured ? " featured" : ""}`} key={p.name}>
                  <div className="pp-plan-name">{p.name}</div>
                  <div className="pp-plan-price">
                    ${p.usd.toFixed(2)} <span>/ month</span>
                  </div>
                  <div className="pp-plan-inr">₹{p.inr} / month for shops billed in rupees</div>
                  <ul>
                    {p.items.map((item) => (
                      <li key={item}>
                        <Icon path={CHECK} size={16} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="pp-plans-note">
              SEO Pilot helps you follow Google's best practices. It can't promise a ranking or a
              traffic increase — nobody honestly can.
            </p>
          </div>
        </section>

        <section className="pp-section tint pp-closing" id="get">
          <div className="pp-wrap">
            <h2>Give your store a better chance on Google</h2>
            <p className="pp-lead">
              Scan your store in a minute and see exactly what to fix. Free for {TRIAL_DAYS} days.
            </p>
            <div className="pp-cta-row">
              <GetApp appStoreUrl={appStoreUrl} onLight />
            </div>
          </div>
        </section>
      </PublicShell>
    </>
  );
}
