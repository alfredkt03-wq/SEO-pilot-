# SEO Pilot

A Shopify SEO app: scans products, pages and collections for common SEO
problems, lets the merchant fix most of them in one click *or* write their
own title/description with a live Google preview, manages 404 redirects,
optimizes oversized images, and ships a theme app embed that adds JSON-LD
structured data to the storefront. Free to scan and review; **$7.39/month**
(3-day free trial) unlocks everything else — one flat plan, no feature
gating between tiers.

Built on Shopify's official React Router app template
(`@shopify/shopify-app-react-router`), Prisma (SQLite for local dev), and
Polaris web components for the UI — the same building blocks Shopify's own
template apps use, so it looks and behaves like a native admin app.

## Why one plan, and why $7.39

It doesn't call any paid third-party AI API — meta title/description/alt
text suggestions are generated with plain text templates
(`app/lib/suggestions.server.ts`), and image compression runs locally with
`sharp`, so the only real ongoing cost is hosting. That's the whole basis
for the price; it isn't a promotional rate. It's also why there's no "AI
rewrite my product descriptions" feature: doing that well needs a paid LLM
call per product, which breaks this pricing model. If you want that, the
honest way to add it is as a separate, metered add-on purchase — not
folded into the base plan — so see it as a deliberate scope decision, not
an oversight.

A single plan was a deliberate choice over splitting features into tiers:
every check, every fix, the manual editor, redirects, image optimization
and JSON-LD are all in the one subscription. Scanning and reviewing issues
stays free either way — the paid plan is what's needed to write anything
back to the store. An active subscription also scans a bigger catalog per
run than the free/no-payment state (`PAID_MAX_PAGES` in
`app/lib/seo-audit.server.ts`) — the one differentiator that's actually
enforceable server-side, unlike the JSON-LD theme embed, which Shopify has
no mechanism to gate by subscription without hurting storefront load time.

## What's implemented

- **SEO audit** (`app/lib/seo-audit.server.ts`): scans up to 150 products,
  150 pages and 150 collections per run before subscribing (3 pages of 50),
  or up to 300 of each once subscribed (`PAID_MAX_PAGES`) — see "Scaling
  up" below. Checks SEO title length, meta description length, missing image
  alt text, oversized source images (>2048px wide), thin body content
  (<40 words), duplicate titles/descriptions across the catalog, broken
  internal links (a product/page/collection link pointing at a handle that
  no longer exists), and whether `/sitemap.xml` actually resolves (catches
  the classic case where a storefront's password page is still on, so every
  URL — sitemap included — silently 200s with login HTML instead of the
  real page). Produces a 0–100 score. Broken-internal-link detection is only
  applied to a resource type once that scan actually reached the end of its
  catalog (`fullyScanned` per type in `runSeoAudit`) — otherwise a link to
  page 151 of a 400-product catalog would be wrongly flagged as dead. When a
  scan is capped before reaching the end, the Dashboard shows a "didn't
  cover your whole catalog" notice right after that scan, rather than
  silently presenting a partial score as complete.
- **Getting started checklist** (Dashboard): three steps — run your first
  scan, start the trial, fix your first issue — each derived from data
  already on the dashboard (no separate onboarding-state table), shown
  until all three are done.
- **One-click fixes** (`app/lib/apply-fix.server.ts`): applies a suggested
  SEO title/description/alt text directly via the Admin GraphQL API, one
  issue at a time or in bulk ("Apply selected fixes" on the Fixes page, or
  "Fix everything automatically" on the Dashboard, which do the exact same
  per-issue logic via the shared `applyFixesToIssues` helper). Products and
  collections use their native `seo` field; **pages don't have one** —
  Shopify stores page/blog/article SEO title & description as the
  `global.title_tag` / `global.description_tag` metafields instead, which
  is what this app writes to (verified against Shopify's current GraphQL
  schema and Shopify's own community docs — this is a common mistake to
  get wrong).
- **Manual SEO editor** (`app/routes/app.editor.tsx`,
  `app.editor.$type.$id.tsx`): search any product, page or collection and
  write your own SEO title and meta description by hand, with a live
  Google-style search-result preview and colored character counters — for
  merchants who'd rather write the copy themselves than accept a computed
  suggestion. Saving here resolves the matching issue on the Fixes page too.
- **Redirect manager** (`app/routes/app.redirects.tsx`): list, create and
  delete URL redirects via `urlRedirects` / `urlRedirectCreate` /
  `urlRedirectDelete`. A broken-link issue found during a scan links
  straight into this page with the "from" path pre-filled.
- **Structured data / JSON-LD** (`extensions/seo-schema/`): a Theme App
  Extension (app embed) that a merchant turns on under **Theme editor > App
  embeds**. Injects `Organization`, `Product` (price/availability/offers)
  and `BreadcrumbList` schema.org markup, plus an optional `WebSite`
  sitelinks-searchbox block on the homepage. Pure Liquid, no JS, so it can't
  slow the storefront down — this is deliberately shipped as a Theme App
  Extension rather than any script-injection approach, since a slow
  storefront is the one thing merchants care about more than SEO. Every
  value is emitted through Liquid's `json` filter (never hand-quoted), and
  `variant.price` is read as a raw integer subunit and divided by 100 in
  Liquid rather than passed through a locale-formatted money filter — using
  `money_without_currency` there would silently emit a comma-decimal price
  ("19,99") on shops using European number formatting, which isn't valid
  JSON. Settings let a merchant turn off any one piece (e.g. if their theme
  already emits its own product schema) rather than an all-or-nothing embed.
- **Your impact** (`app/lib/impact.server.ts`, dashboard aside): lifetime
  counters — issues fixed, redirects created, and a disclosed, conservative
  estimate of manual minutes saved (~2 min/fix, ~3 min/redirect) — so the
  dashboard says something a non-technical merchant can act on, instead of
  just an abstract score. Deliberately labeled "since you installed SEO
  Pilot" rather than "this month": these are simple running totals, not a
  time-series log, and the copy never claims more precision than that.
- **Safe image optimization** (`app/lib/image-optimize.server.ts`,
  `app/routes/app.images.tsx`): for each `OVERSIZED_IMAGE` issue,
  downloads the current image, resizes it (max 2048px wide) and re-encodes
  it with `sharp` (mozjpeg for JPEG, palette PNG, or WebP — matching the
  source format), then uploads the *result* as a new file in the merchant's
  Files library via the verified `stagedUploadsCreate` (resource: `IMAGE`)
  → PUT → `fileCreate` flow. **It never touches the live product image or
  deletes anything** — the merchant reviews the compressed copy and swaps it
  in themselves via Shopify's native product editor whenever they're ready.
  This is a deliberate trade-off over in-place replacement: one extra manual
  step for the merchant, in exchange for zero risk of corrupting a live
  product's imagery and no need for this app to hold broader media-write
  permissions than it already has.
- **Billing** (`app/lib/plans.server.ts`, `app/shopify.server.ts`,
  `app/routes/app.billing.tsx`): a single flat-rate plan ($7.39/month, 3-day
  free trial) via Shopify's Billing API (`billing.require` / `billing.check`
  / `billing.request`). Scanning and reviewing issues is free; writing
  anything back to the store (fixes, manual edits, redirects, image
  optimization) requires the active subscription.
- **Clean uninstall** (`app/routes/webhooks.app.uninstalled.tsx`): deletes
  every row this app ever wrote for that shop (`Session`, `SeoScan`,
  `SeoIssue`, `ShopSettings`) on the `app/uninstalled` webhook, so nothing
  lingers if the merchant reinstalls later. The theme app embed is removed
  from the theme automatically by Shopify on uninstall — that part isn't
  this app's code to write.

## Deliberately not built (and why)

- **In-place product image replacement.** Image optimization (above)
  deliberately stops at "create a compressed copy in Files" instead of
  swapping it into the product automatically. Doing that automatically
  means: put the new image back in the exact same position among the
  product's other images, copy over alt text, and delete the old media —
  a several-step, partly-async sequence with real partial-failure states
  (e.g. the delete step failing leaves a duplicate image). That's a
  reasonable v2 to build and test against a real dev store; it's not one to
  ship untested against a merchant's live listings.
- **AI-rewritten product descriptions.** See "Why one plan, and why $7.39"
  above — it's a pricing-model decision, not a technical gap.
- **Internal-link-love / SEO "link juice" features.** Considered and
  deliberately skipped — link-equity distribution between a store's own
  pages is a marginal ranking factor for most small catalogs and adds
  complexity (a link graph, suggestions, more UI) out of proportion to the
  benefit for this app's audience.

## Before you do anything else

This project was written and type-checked (`npm run typecheck` passes with
**zero errors**) in a sandboxed environment that could install npm packages
but **could not reach `binaries.prisma.sh`**, so `npx prisma generate`
could not fully complete there and the Prisma-backed code paths (everything
touching `db.seoIssue` / `db.seoScan` / `db.shopSettings`) could not be
exercised end-to-end. Every Shopify GraphQL mutation/query, every Polaris
web component prop, and every Liquid object/filter used in the theme
extension was independently verified against Shopify's current schema/docs
and the actual shipped `@shopify/polaris-types` type definitions — that
part I have high confidence in. Two things worth knowing before you run it
yourself:

1. `tsconfig.json` needs `"rootDirs": [".", "./.react-router/types"]` for
   `react-router typegen`'s generated files to resolve against your real
   `app/` source — this project's tsconfig was initially missing it (copied
   from an incomplete reference at some point), which made `tsc --noEmit`
   fail on every route file with `Cannot find module './app/....tsx'`
   errors that had nothing to do with actual code problems. It's fixed here
   (checked against the upstream template's real `tsconfig.json`), along
   with a matching `env.d.ts`. If you ever see that error pattern again,
   this is the setting to check first.
2. Run this on your own machine with normal internet access:
   ```bash
   npm install
   npx prisma migrate dev --name init   # creates dev.sqlite + prisma/migrations/
   npm run typecheck                     # should still be 0 errors
   ```
   If `typecheck` reports anything under `.prisma`/`@prisma/client`, it
   means `prisma generate` didn't run — re-run `npx prisma generate` and
   try again.

## Setup

1. **Prerequisites**
   - Node.js `>=20.19 <22` or `>=22.12` (matches `package.json` engines)
   - [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) (`npm install -g @shopify/cli`, or just use `npx shopify`)
   - A [Shopify Partner account](https://partners.shopify.com) and a development store to test on

2. **Install and generate the database client**
   ```bash
   npm install
   npx prisma migrate dev --name init
   ```

3. **Link the app to a Partner account app**
   ```bash
   npm run config:link
   ```
   This creates/links a Partner Dashboard app entry and writes `client_id`
   into `shopify.app.toml`. Follow the CLI prompts.

4. **Run it**
   ```bash
   npm run dev
   ```
   The Shopify CLI starts a tunnel, writes `.env` for you (`SHOPIFY_API_KEY`,
   `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`), deploys the theme app extension
   alongside the app, and gives you a link to install on your development
   store. Charges made on a development store are automatically treated as
   test charges by Shopify regardless of the `isTest` flag, so you can
   safely click through the $7.39/month trial flow without being billed.

5. **Try the flow**: install on your dev store → Dashboard → "Run first
   scan" → "Review issues" → Fixes (select rows → "Apply selected fixes",
   or "Write my own" to jump into the Editor for that resource) — this is
   what triggers the billing prompt → approve the test charge → fixes apply
   for real via the Admin API. Then check Redirects, turn on the schema
   embed under **Online Store > Themes > Customize > App embeds**, and try
   "Fix everything automatically" on the Dashboard and "Create compressed
   copy" on the Images page — all part of the one subscription.

## Scaling up

- `PAGE_SIZE` / `DEFAULT_MAX_PAGES` / `PAID_MAX_PAGES` in
  `app/lib/seo-audit.server.ts` cap a scan at 150 resources per type before
  subscribing, 300 once subscribed, so a scan stays fast and well inside
  rate limits. For larger catalogs, raise these and/or move the scan into a
  background job (`runSeoAudit` is already isolated from the route that
  calls it, so wiring it behind a queue later is a small change, not a
  rewrite).
- "Your impact" counters are simple lifetime totals on `ShopSettings`. If
  you want a real "this month" breakdown later, that needs an append-only
  events table (one row per fix/redirect with a timestamp) instead of an
  incrementing counter — a bigger change, deliberately not done up front.

## Deploying for real (App Store)

- SQLite (`prisma/schema.prisma`, currently `file:dev.sqlite`) is fine for
  local development only — most hosts (Render, Fly.io, Railway, a Docker
  container) don't give you a persistent disk by default. For production,
  switch the datasource to Postgres or MySQL and set `DATABASE_URL`; the
  Prisma session storage and this app's own tables both come along for free
  since they go through the same Prisma client.
- `npm run deploy` (`shopify app deploy`) pushes `shopify.app.toml` (scopes,
  webhooks, app URL) **and** the `extensions/seo-schema` theme app extension
  to the Partner Dashboard in one go.
- Image optimization depends on `sharp`, a native (compiled) dependency —
  it needs a host that can `npm install` in the target OS/CPU environment
  (or a Docker build stage for it), not a host that only accepts a
  pre-built pure-JS bundle.
- Set `NODE_ENV=production` on your host. That's what flips `isTest` to
  `false` for billing (see `isTestPayment` near the top of
  `app/shopify.server.ts` and every route that writes to the store) — real
  charges only happen once this is set.
- When you submit the listing, price the plan in the Partner Dashboard
  listing form to match the code: $7.39/month, 3-day free trial, so what
  merchants see on the listing page matches what they're actually charged.
- Mention the schema/JSON-LD embed in your listing screenshots — it's the
  single feature most competing SEO apps use as their headline pitch, and
  merchants specifically search for "JSON-LD" / "schema markup" / "rich
  results" in app store reviews of this category.

## Project layout

```
app/
  shopify.server.ts        Shopify app config + single-plan billing definition
  db.server.ts              Prisma client singleton
  lib/
    plans.server.ts         Plan name/price/trial length + resolvePlanStatus
    support.ts               Support contact email shown in the app
    seo-audit.server.ts     Scans the store, scores it, writes SeoIssue rows
    suggestions.server.ts   Pure text helpers that draft the one-click fixes
    apply-fix.server.ts     Applies a fix/manual edit via the right Admin mutation
    image-optimize.server.ts Compresses + uploads a copy of an oversized image
    editor.server.ts        Search helpers for the manual SEO editor
    impact.server.ts        Lifetime "your impact" counters
    links.server.ts         Extracts internal links from HTML for broken-link detection
    types.ts                Plain domain types shared across routes
  routes/
    app.tsx                          Embedded app shell + nav (incl. Support link)
    app._index.tsx                    Dashboard: score, impact, scan, bulk auto-fix
    app.fixes.tsx                     Issue list + one-click / bulk apply
    app.editor.tsx                     Manual SEO editor: search/browse
    app.editor.$type.$id.tsx            Manual SEO editor: edit one resource
    app.redirects.tsx                 Redirect (404) manager
    app.images.tsx                    Image optimization: compressed copies
    app.billing.tsx                   Plan page: subscribe + support contact
    auth.$.tsx, webhooks.*            Standard Shopify auth + lifecycle webhooks
extensions/
  seo-schema/                Theme App Extension: JSON-LD structured data app embed
    blocks/seo-json-ld.liquid
prisma/schema.prisma        Session (required by Shopify) + SeoScan/SeoIssue/ShopSettings
```
