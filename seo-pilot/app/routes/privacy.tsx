// Public privacy policy — required by the Shopify App Store listing. Lives
// outside the embedded admin (no authenticate.admin call, no App Bridge
// session needed) so it's reachable as a plain URL from the App Store, a
// browser, or a link in an email — same public route pattern as "/"
// (_index.tsx) and /terms, sharing the PublicShell visual identity.
import { SUPPORT_EMAIL } from "../lib/support";
import { PublicFonts, PublicShell } from "../components/public-shell";

const LAST_UPDATED = "September 27, 2026";

export default function Privacy() {
  return (
    <>
      <PublicFonts />
      <PublicShell>
        <div className="pp-doc">
          <h1>Privacy Policy</h1>
          <div className="pp-updated">Last updated: {LAST_UPDATED}</div>

          <section>
            <h2>SEO Pilot Privacy Policy</h2>
            <p>
              SEO Pilot ("the app") is a Shopify app that scans a store's products, collections and
              pages for SEO issues and helps fix them. This page explains what data the app accesses,
              why, and what happens to it.
            </p>
          </section>

          <section>
            <h2>What the app can access</h2>
            <p>
              SEO Pilot requests these Shopify Admin API scopes: <strong>write_products</strong>,{" "}
              <strong>write_content</strong>, and <strong>write_online_store_navigation</strong>. In
              plain terms, that's your products, pages, collections, blog content, images, and URL
              redirects — the parts of your store that affect search results.
            </p>
            <p>
              <strong>
                The app never requests access to customer data, orders, or payment information.
              </strong>{" "}
              It has no scope that would let it read or write any of that, and it doesn't need to —
              SEO doesn't touch customer records.
            </p>
          </section>

          <section>
            <h2>What the app stores</h2>
            <p>
              The app stores, on its own servers (not Shopify's), only what it needs to run scans and
              show your results over time:
            </p>
            <ul>
              <li>Your shop domain and Shopify access token, so it can read and update your store's content</li>
              <li>Scan results and SEO issues found (titles, descriptions, alt text, broken links) — the resource name and ID, not customer-facing traffic or sales data</li>
              <li>Your store's billing and storefront currency, to price plans correctly and localize suggestions</li>
              <li>How many AI-written suggestions you've used, to enforce plan limits</li>
              <li>
                If you choose to connect Google Search Console (Premium/Exclusive plans only, and only
                if you click "Connect"): a Google refresh token and your search performance stats
                (clicks, impressions, top queries). This is entirely optional and can be disconnected
                at any time from the Search Console page in the app.
              </li>
            </ul>
            <p style={{ marginTop: 12 }}>
              None of this is customer personal data. It's store-configuration and SEO-performance
              data only.
            </p>
          </section>

          <section>
            <h2>Third parties the app uses</h2>
            <ul>
              <li>
                <strong>Anthropic (Claude)</strong> — when you use an AI-write feature, the relevant
                product/page title and description are sent to Anthropic's API to generate a
                suggestion. Nothing is sent unless you click an AI-write button. See{" "}
                <a href="https://www.anthropic.com/legal/privacy">Anthropic's privacy policy</a>.
              </li>
              <li>
                <strong>Google (Search Console API)</strong> — only if you connect it. Read-only
                access to your verified Search Console property; the app never modifies anything in
                Search Console.
              </li>
              <li>
                <strong>Hosting</strong> — the app runs on Render and stores its database on Neon,
                both of which host the app's infrastructure but do not independently access or use
                your data.
              </li>
            </ul>
            <p style={{ marginTop: 12 }}>
              The app does not sell data, does not use your store's content to train any model, and
              does not share data with anyone beyond what's listed above.
            </p>
          </section>

          <section>
            <h2>Data retention and deletion</h2>
            <p>
              Your data is kept only while the app is installed. If you uninstall SEO Pilot, Shopify
              notifies the app automatically and all stored data for your shop — access tokens, scan
              history, Google Search Console tokens — is deleted. The app also honors Shopify's
              mandatory data-request and customer-redaction webhooks; since it never stores customer
              personal data, there is nothing to return or redact on those requests beyond confirming
              that.
            </p>
          </section>

          <section>
            <h2>Security</h2>
            <p>
              All data is transmitted over HTTPS. Access tokens and Google refresh tokens are stored
              in the app's database and are never exposed to the browser or to any party other than
              the services listed above.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions about this policy, or a request to see or delete your store's data ahead of
              uninstalling: email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. See also
              the <a href="/terms">Terms of Service</a>.
            </p>
          </section>
        </div>
      </PublicShell>
    </>
  );
}
