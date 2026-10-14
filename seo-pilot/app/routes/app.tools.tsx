import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { checkPlan } from "../lib/billing.server";
import { TIER_LABEL, type PaidTier } from "../lib/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  return { tier };
};

const RANK: Record<string, number> = { free: 0, basic: 1, premium: 2, exclusive: 3, agency: 4 };

const ICONS: Record<string, string> = {
  autopilot: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  content: "M6 3h9l4 4v14H6V3zM14 3v5h5M9 13h7M9 17h7",
  links: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  redirects: "M5 12h14M13 6l6 6-6 6",
  images: "M4 5h16v14H4V5zM4 16l5-5 4 4 3-3 4 4M15 9.5h.01",
  report: "M5 20V10M12 20V4M19 20v-7",
  reviews: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
};

const TOOLS: Array<{ key: string; title: string; body: string; href: string; min: PaidTier | null }> = [
  { key: "autopilot", title: "Autopilot", body: "Checks every new product the moment you add it. Exclusive and Agency can also write its SEO text automatically.", href: "/app/autopilot", min: "premium" },
  { key: "content", title: "Content check", body: "Shows which pages need more or clearer text so Google understands them.", href: "/app/content", min: "premium" },
  { key: "links", title: "Internal links", body: "Finds pages that mention another page without linking to it, and adds the link in one click.", href: "/app/internal-links", min: "basic" },
  { key: "redirects", title: "Redirects", body: "Fix broken links (404s) by sending the old address to the right page. Exclusive and Agency can import many at once.", href: "/app/redirects", min: null },
  { key: "images", title: "Images", body: "Shrink oversized images so your pages load faster.", href: "/app/images", min: "basic" },
  { key: "report", title: "SEO report", body: "Your score and open issues on one page, with a CSV download and print to PDF. Agency adds your business name.", href: "/app/report", min: "exclusive" },
];

const TOOLS_CSS = `
.tl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:12px}
.tl-card{border:1px solid #e1e3e5;border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:10px;align-items:flex-start;background:#fff}
.tl-card:hover{border-color:#b5b9bd}
.tl-head{display:flex;gap:12px;align-items:center;width:100%}
.tl-icon{width:34px;height:34px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;color:#0f6b57;background:#e8f3ef;border:1px solid #c6e0d6}
.tl-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tl-title{font-weight:600;font-size:15px;color:#202223}
.tl-plan{font-size:11px;font-weight:600;color:#0f6b57;background:#e8f3ef;border-radius:999px;padding:2px 9px}
.tl-card p{margin:0;font-size:13px;line-height:1.55;color:#52627f;flex:1}
@media(max-width:700px){.tl-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.tl-card{transition:none}.tl-card:hover{transform:none}}
`;

export default function Tools() {
  const { tier } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Tools">
      <s-section>
        <s-paragraph>
          Everything beyond the scan and the fixes lives here. Not sure where to start? Open the{" "}
          <s-link href="/app/manual">Manual</s-link>.
        </s-paragraph>
        <div className="tl-grid">
          <style>{TOOLS_CSS}</style>
          {TOOLS.map((t) => {
            const locked = t.min !== null && RANK[tier] < RANK[t.min];
            return (
              <div className="tl-card" key={t.href}>
                <div className="tl-head">
                  <span className="tl-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[t.key]} /></svg>
                  </span>
                  <div className="tl-top">
                    <span className="tl-title">{t.title}</span>
                    {t.min && locked && <span className="tl-plan">{TIER_LABEL[t.min]}</span>}
                  </div>
                </div>
                <p>{t.body}</p>
                <s-button variant={locked ? "secondary" : "primary"} href={locked ? "/app/billing" : t.href}>{locked ? "See plans" : "Open"}</s-button>
              </div>
            );
          })}
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
