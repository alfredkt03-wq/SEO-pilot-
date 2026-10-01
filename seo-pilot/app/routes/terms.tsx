// Public Terms of Service — required by the Shopify App Store listing, and
// the page that actually limits liability exposure. Same public,
// unauthenticated route pattern as privacy.tsx and "/", sharing the
// PublicShell visual identity.
//
// This is standard small-SaaS boilerplate, not a substitute for a lawyer.
// It meaningfully reduces risk (disclaims guarantees on SEO/ranking results,
// caps damages) but isn't bulletproof — worth a real legal review once this
// app has real revenue at stake.
import { SUPPORT_EMAIL } from "../lib/support";
import { PublicFonts, PublicShell } from "../components/public-shell";

const LAST_UPDATED = "September 27, 2026";

export const meta = () => [
  { title: "Terms of Service - Metaglow SEO" },
  { name: "description", content: "The terms for using Metaglow SEO, a Shopify app for fixing SEO problems." },
];

export default function Terms() {
  return (
    <>
      <PublicFonts />
      <PublicShell>
        <div className="pp-doc">
          <h1>Terms of Service</h1>
          <div className="pp-updated">Last updated: {LAST_UPDATED}</div>

          <section>
            <h2>Metaglow SEO Terms of Service</h2>
            <p>
              By installing or using Metaglow SEO ("the app"), you agree to these terms. If you don't
              agree, don't install or use the app.
            </p>
          </section>

          <section>
            <h2>What the app does</h2>
            <p>
              Metaglow SEO scans your Shopify store for SEO issues and offers fixes, which you review and
              apply — automatically where you choose "Fix everything," or one at a time. You are
              responsible for reviewing any fix, AI-written or template-based, before or after it's
              applied, and for how your store's content reads once changed.
            </p>
          </section>

          <section>
            <h2>No guaranteed results</h2>
            <p>
              Metaglow SEO helps you follow known SEO best practices. It does <strong>not</strong>{" "}
              guarantee any specific search ranking, traffic increase, sales increase, or inclusion in
              Google or any other search engine's results. Search engine rankings depend on many
              factors outside this app's or its developer's control, including changes search engines
              make to their own algorithms at any time.
            </p>
          </section>

          <section>
            <h2>AI-generated content</h2>
            <p>
              Where the app offers AI-written titles, descriptions or alt text, that content is
              generated automatically and may occasionally be inaccurate, generic, or need editing.
              You are solely responsible for reviewing AI-generated content before it goes live on
              your store, including for accuracy about your products, pricing, or claims made about
              them. The app is instructed not to invent prices, offers or delivery promises, but this
              is a best-effort instruction to an AI system, not a guarantee.
            </p>
          </section>

          <section>
            <h2>"As is," no warranty</h2>
            <p>
              The app is provided <strong>"as is" and "as available,"</strong> without warranties of
              any kind, express or implied, including but not limited to warranties of
              merchantability, fitness for a particular purpose, or non-infringement. The developer
              does not warrant that the app will be uninterrupted, error-free, or that any issue it
              finds or fix it applies will be accurate or complete.
            </p>
          </section>

          <section>
            <h2>Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, the developer of Metaglow SEO will not be liable
              for any indirect, incidental, special, consequential, or punitive damages, or any loss
              of profits, revenue, data, or business opportunity, arising from your use of or
              inability to use the app — even if advised of the possibility of such damages. Where
              liability cannot be fully excluded, the developer's total liability for any claim
              relating to the app is limited to the amount you paid for the app in the three (3)
              months before the claim arose.
            </p>
          </section>

          <section>
            <h2>Your responsibilities</h2>
            <ul>
              <li>You keep control of your Shopify account and who has access to it</li>
              <li>You review changes the app makes to your store, especially bulk "Fix everything" runs</li>
              <li>You use the app only for a store you own or are authorized to manage</li>
              <li>You comply with Shopify's own Acceptable Use Policy and Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2>Billing</h2>
            <p>
              Paid plans are billed through Shopify's standard app billing, in the currency shown on
              the Plans page. Free trials, where offered, convert automatically to a paid subscription
              unless canceled before the trial ends. You can cancel or switch plans at any time from
              Shopify admin → Settings → Apps.
            </p>
          </section>

          <section>
            <h2>Termination</h2>
            <p>
              You may stop using the app at any time by uninstalling it. The developer may suspend or
              discontinue the app, or your access to it, at any time — for example if required by
              Shopify, by law, or in response to abuse.
            </p>
          </section>

          <section>
            <h2>Changes to these terms</h2>
            <p>
              These terms may be updated from time to time; continued use of the app after a change
              means you accept the updated terms. Material changes will be reflected by the "Last
              updated" date above.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions about these terms: email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              See also the <a href="/privacy">Privacy Policy</a>.
            </p>
          </section>
        </div>
      </PublicShell>
    </>
  );
}
