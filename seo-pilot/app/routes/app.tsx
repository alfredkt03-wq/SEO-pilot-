import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { SUPPORT_EMAIL } from "../lib/support";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/fixes">Fixes</s-link>
        <s-link href="/app/editor">Editor</s-link>
        <s-link href="/app/bulk">Bulk edit</s-link>
        <s-link href="/app/tools">Tools</s-link>
        <s-link href="/app/reviews">Reviews</s-link>
        <s-link href="/app/manual">Manual</s-link>
        <s-link href="/app/billing">Plan</s-link>
        <s-link href={`mailto:${SUPPORT_EMAIL}`}>Support</s-link>
      </s-app-nav>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 16px 0" }}>
        <s-button href="/app">Dashboard</s-button>
        <s-button href="/app/fixes">Fixes</s-button>
        <s-button href="/app/editor">Editor</s-button>
        <s-button href="/app/bulk">Bulk edit</s-button>
        <s-button href="/app/tools">All tools</s-button>
        <s-button href="/app/reviews">Reviews</s-button>
        <s-button href="/app/billing">Plan</s-button>
      </div>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
