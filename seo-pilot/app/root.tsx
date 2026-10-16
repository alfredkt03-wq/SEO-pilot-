import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// Safety net for the bare "200" page. When Shopify's short-lived session token
// has expired, the server answers a page change with a non-error status that
// React Router shows as a plain number. Reloading fixes it (it signs in again
// silently), so do that once automatically instead of leaving the merchant on
// a blank page. If it happens again right away, show a normal message with a
// button instead of looping.
export function ErrorBoundary() {
  const error = useRouteError();
  const sessionIssue =
    isRouteErrorResponse(error) && [200, 401, 403, 410].includes(error.status);

  useEffect(() => {
    if (!sessionIssue) return;
    try {
      const key = "sp-auto-reload";
      const last = Number(window.sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 20000) {
        window.sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // Storage is blocked: skip the automatic reload, the button below still works.
    }
  }, [sessionIssue]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: "Inter, -apple-system, system-ui, sans-serif",
          color: "#202223",
          background: "#f6f6f7",
        }}
      >
        <div style={{ maxWidth: 460, margin: "15vh auto 0", padding: "0 20px", textAlign: "center" }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e1e3e5",
              borderRadius: 12,
              padding: "32px 28px",
              boxShadow: "0 1px 2px rgba(16,24,40,.05)",
            }}
          >
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>
              {sessionIssue ? "Reconnecting to Shopify" : "Something went wrong"}
            </h1>
            <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.5, color: "#616a75" }}>
              {sessionIssue
                ? "Your session needs a quick refresh. This usually takes a second."
                : "This page could not load. Nothing on your store was changed."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: "#202223",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
