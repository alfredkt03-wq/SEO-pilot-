import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { checkPlan } from "../lib/billing.server";
import { canAutoWrite, canWatch } from "../lib/autopilot.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  const s = await db.shopSettings.findUnique({ where: { shop: session.shop }, select: { autoOptimizeNew: true } });
  return { tier, watch: canWatch(tier), auto: canAutoWrite(tier), enabled: Boolean(s?.autoOptimizeNew) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { tier } = await checkPlan(billing);
  if (!canAutoWrite(tier)) return { ok: false as const, error: "Automatic writing is on Exclusive and Agency." };
  const on = (await request.formData()).get("enabled") === "on";
  await db.shopSettings.upsert({
    where: { shop: session.shop },
    update: { autoOptimizeNew: on },
    create: { shop: session.shop, autoOptimizeNew: on },
  });
  return { ok: true as const, on };
};

export default function Autopilot() {
  const { watch, auto, enabled } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const on = fetcher.formData ? fetcher.formData.get("enabled") === "on" : enabled;

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) shopify.toast.show(fetcher.data.on ? "Autopilot on" : "Autopilot off");
    else shopify.toast.show(fetcher.data.error, { isError: true });
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="New product autopilot">
      <s-link slot="breadcrumb-actions" href="/app/tools">Tools</s-link>
      <s-section heading="What this does">
        <s-paragraph>
          Every time you add a product, Metaglow SEO checks it for you. Most new products go live
          with no SEO title and no meta description, so they start out weaker in Google. Autopilot
          catches that the moment the product is created.
        </s-paragraph>
      </s-section>

      {!watch ? (
        <s-banner heading="Autopilot is on Premium and above" tone="info">
          <s-paragraph>Premium checks every new product. Exclusive and Agency can also fill in the SEO text automatically.</s-paragraph>
          <s-button slot="primary-action" href="/app/billing">See plans</s-button>
        </s-banner>
      ) : (
        <>
          <s-section heading="New product check">
            <s-badge tone="success">On</s-badge>
            <s-paragraph>
              New products missing an SEO title or meta description appear on the Fixes page with a
              suggested text ready. Nothing on your store changes until you apply it.
            </s-paragraph>
          </s-section>

          <s-section heading="Write it automatically">
            {!auto ? (
              <>
                <s-paragraph>
                  On Exclusive and Agency, Autopilot can write the missing SEO title and description for
                  you as soon as a product is created. Text you already wrote is never changed.
                </s-paragraph>
                <s-button href="/app/billing">See Exclusive</s-button>
              </>
            ) : (
              <fetcher.Form method="post">
                <s-stack direction="block" gap="base">
                  <s-paragraph>
                    When on, a new product gets a template-written SEO title and meta description
                    straight away. Only empty fields are filled, and you can edit them any time in the Editor.
                  </s-paragraph>
                  <input type="hidden" name="enabled" value={on ? "off" : "on"} />
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</s-badge>
                    <s-button type="submit" variant={on ? "secondary" : "primary"}>
                      {on ? "Turn off" : "Turn on"}
                    </s-button>
                  </s-stack>
                </s-stack>
              </fetcher.Form>
            )}
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
