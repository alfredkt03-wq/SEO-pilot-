import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { checkPlan, getPricing, requestPlan } from "../lib/billing.server";
import { planFeatures, TIER_LABEL, TRIAL_DAYS, type PaidTier, type Tier } from "../lib/plans";
import { SUPPORT_EMAIL } from "../lib/support";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const [status, pricing] = await Promise.all([checkPlan(billing), getPricing(admin, session.shop)]);
  return { ...status, pricing };
};

// Starting or switching a plan is a redirect to Shopify's confirmation page;
// approving it there replaces any current plan.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const requested = formData.get("tier");
  const tier: PaidTier =
    requested === "agency" ? "agency" : requested === "exclusive" ? "exclusive" : requested === "premium" ? "premium" : "basic";
  return requestPlan(admin, billing, session.shop, tier);
};

// Order defines the ladder used for "Start trial" vs "Upgrade" vs "Switch"
// wording below — index compares where the merchant is against each plan.
// No permanent free plan: "free" here only means "hasn't started a trial".
const ORDER: Tier[] = ["free", "basic", "premium", "exclusive", "agency"];

const FEATURES: Record<PaidTier, string[]> = {
  basic: planFeatures("basic"),
  premium: planFeatures("premium"),
  exclusive: planFeatures("exclusive"),
  agency: planFeatures("agency"),
};

export default function Billing() {
  const { tier, planName, pricing } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const pendingTier = fetcher.state !== "idle" ? fetcher.formData?.get("tier") : null;
  const inIndia = pricing.currency === "INR";
  const currentIndex = ORDER.indexOf(tier);

  const choose = (t: PaidTier) => fetcher.submit({ tier: t }, { method: "POST" });

  const ctaFor = (t: PaidTier): string | undefined => {
    if (tier === t) return undefined;
    if (tier === "free") return `Start ${TRIAL_DAYS}-day free trial`;
    return ORDER.indexOf(t) > currentIndex ? `Upgrade to ${TIER_LABEL[t]}` : `Switch to ${TIER_LABEL[t]}`;
  };

  return (
    <s-page heading="Plans">
      {tier !== "free" ? (
        <s-banner heading={`You're on ${TIER_LABEL[tier]}`} tone="success">
          <s-paragraph>
            {planName ? `${planName}. ` : ""}Change plans below, or cancel any time from Shopify
            admin → Settings → Apps.
          </s-paragraph>
        </s-banner>
      ) : (
        <s-banner heading={`Every plan starts with a ${TRIAL_DAYS}-day free trial`} tone="info">
          <s-paragraph>
            No permanent free plan — pick the tier that fits your store below and try it free for{" "}
            {TRIAL_DAYS} days before you're charged.
          </s-paragraph>
        </s-banner>
      )}

      {inIndia && (
        <s-banner tone="info">
          <s-paragraph>
            Prices in rupees, charged on your normal Shopify bill — no dollar conversion and no
            currency-exchange fee.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Basic">
        <PlanBody
          price={`${pricing.basic.priceLabel} / month`}
          features={FEATURES.basic}
          current={tier === "basic"}
          cta={ctaFor("basic")}
          loading={pendingTier === "basic"}
          onChoose={() => choose("basic")}
        />
      </s-section>

      <s-section heading="Premium">
        <PlanBody
          price={`${pricing.premium.priceLabel} / month`}
          features={FEATURES.premium}
          current={tier === "premium"}
          cta={ctaFor("premium")}
          loading={pendingTier === "premium"}
          onChoose={() => choose("premium")}
        />
      </s-section>

      <s-section heading="Exclusive">
        <PlanBody
          price={`${pricing.exclusive.priceLabel} / month`}
          features={FEATURES.exclusive}
          current={tier === "exclusive"}
          cta={ctaFor("exclusive")}
          loading={pendingTier === "exclusive"}
          onChoose={() => choose("exclusive")}
        />
      </s-section>

      <s-section heading="Agency">
        <PlanBody
          price={`${pricing.agency.priceLabel} / month`}
          features={FEATURES.agency}
          current={tier === "agency"}
          cta={ctaFor("agency")}
          loading={pendingTier === "agency"}
          onChoose={() => choose("agency")}
        />
      </s-section>

      <s-section slot="aside" heading="Safe by design">
        <s-unordered-list>
          <s-list-item>Nothing changes in your store until you press Apply or Save.</s-list-item>
          <s-list-item>No speed-booster scripts added to your storefront.</s-list-item>
          <s-list-item>Your live product photos are never replaced — compressed copies go to Files.</s-list-item>
          <s-list-item>AI writes only from your own product info; it's told never to invent offers, prices or delivery promises.</s-list-item>
          <s-list-item>Cancel from Shopify any time — no calls, no emails needed.</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Need help?">
        <s-paragraph>
          Found a bug, or something that would make this better for your store? Email{" "}
          <s-link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</s-link> — it goes straight to
          the person who built this app.
        </s-paragraph>
        <s-paragraph>
          <s-link href="/privacy">Privacy Policy</s-link> ·{" "}
          <s-link href="/terms">Terms of Service</s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

function PlanBody({
  price,
  features,
  current,
  cta,
  loading,
  onChoose,
}: {
  price: string;
  features: string[];
  current: boolean;
  cta?: string;
  loading?: boolean;
  onChoose?: () => void;
}) {
  return (
    <s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="small" alignItems="center">
        <s-text type="strong">{price}</s-text>
        {current && <s-badge tone="success">Current plan</s-badge>}
      </s-stack>
      <s-unordered-list>
        {features.map((f) => (
          <s-list-item key={f}>{f}</s-list-item>
        ))}
      </s-unordered-list>
      {cta && onChoose && (
        <s-stack direction="inline">
          <s-button variant="primary" onClick={onChoose} {...(loading ? { loading: true } : {})}>
            {cta}
          </s-button>
        </s-stack>
      )}
    </s-stack>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
