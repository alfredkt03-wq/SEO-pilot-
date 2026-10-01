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

const TOOLS: Array<{ title: string; body: string; href: string; min: PaidTier | null }> = [
  { title: "Autopilot", body: "Checks every new product the moment you add it. Exclusive and Agency can also write its SEO text automatically.", href: "/app/autopilot", min: "premium" },
  { title: "Content check", body: "Shows which pages need more or clearer text so Google understands them.", href: "/app/content", min: "premium" },
  { title: "Internal links", body: "Finds pages that mention another page without linking to it, and adds the link in one click.", href: "/app/internal-links", min: "basic" },
  { title: "Redirects", body: "Fix broken links (404s) by sending the old address to the right page. Exclusive and Agency can import many at once.", href: "/app/redirects", min: null },
  { title: "Images", body: "Shrink oversized images so your pages load faster.", href: "/app/images", min: "basic" },
  { title: "SEO report", body: "Your score and open issues on one page, with a CSV download and print to PDF. Agency adds your business name.", href: "/app/report", min: "exclusive" },
];

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
          <style>{`.tl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:8px}.tl-card{border:1px solid #dfe6d6;border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}.tl-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tl-title{font-weight:650;font-size:15px}.tl-plan{font-size:11px;font-weight:650;color:#c4570a;background:#fff3e6;border-radius:999px;padding:2px 8px}.tl-card p{margin:0;font-size:13px;line-height:1.5;color:#5f6f63;flex:1}@media(max-width:700px){.tl-grid{grid-template-columns:1fr}}`}</style>
          {TOOLS.map((t) => {
            const locked = t.min !== null && RANK[tier] < RANK[t.min];
            return (
              <div className="tl-card" key={t.href}>
                <div className="tl-top">
                  <span className="tl-title">{t.title}</span>
                  {t.min && locked && <span className="tl-plan">{TIER_LABEL[t.min]}</span>}
                </div>
                <p>{t.body}</p>
                <s-button variant="secondary" href={locked ? "/app/billing" : t.href}>{locked ? "See plans" : "Open"}</s-button>
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
