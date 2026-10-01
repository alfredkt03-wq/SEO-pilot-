import { SUPPORT_EMAIL } from "../lib/support";
import { TRIAL_DAYS } from "../lib/plans";

// Plain-language guide for merchants who have never heard of SEO. Static
// content only — no data loading — so it works before a plan is started.
// Thresholds quoted here (title 10–70, description 120–160, 40 words, 2048px)
// mirror the ones in lib/suggestions.ts and lib/seo-audit.server.ts.

const PROBLEMS: Array<{ name: string; meaning: string; action: string }> = [
  {
    name: "Missing SEO title",
    meaning:
      "The headline Google shows for this page in search results is empty, so Google guesses one.",
    action: "Fixed automatically. Check the wording if you like.",
  },
  {
    name: "SEO title too short / too long",
    meaning:
      "Good titles are roughly 10–70 characters. Longer ones get cut off with “…” in Google.",
    action: "Fixed automatically.",
  },
  {
    name: "Missing meta description",
    meaning:
      "The 1–2 sentence blurb under your headline in Google is empty. A good blurb makes people click.",
    action: "Fixed automatically (or written by AI on paid plans).",
  },
  {
    name: "Meta description too short / too long",
    meaning: "Good blurbs are roughly 120–160 characters. Longer ones get cut off.",
    action: "Fixed automatically.",
  },
  {
    name: "Missing alt text",
    meaning:
      "An image has no short written description. Google can't “see” pictures, and screen readers for blind visitors need this too.",
    action: "Fixed automatically.",
  },
  {
    name: "Oversized image",
    meaning: "A photo is much bigger than needed, which makes the page load slowly.",
    action: "Go to Tools → Images and click “Create compressed copy”.",
  },
  {
    name: "Thin content",
    meaning:
      "The page has very little text (under about 40 words). Google prefers pages that explain things properly.",
    action: "On paid plans, AI can write a description. Otherwise add more text yourself in the Editor.",
  },
  {
    name: "Duplicate title / description",
    meaning:
      "Two pages share the same title or blurb, so Google can't tell them apart.",
    action: "Use “Write with AI” on the Fixes page to get a unique one, or edit it yourself.",
  },
  {
    name: "Broken link",
    meaning: "A link on your store points to a page that no longer exists — visitors see an error.",
    action: "Go to Tools → Redirects and send the old address to the right page.",
  },
  {
    name: "Homepage items",
    meaning:
      "Your homepage title, description, main heading or sharing image is missing or weak. This is your shop's front door in Google.",
    action: "These need a human decision, so they're never changed automatically. Use the Editor.",
  },
];

const PAGES: Array<{ name: string; body: string }> = [
  { name: "Dashboard", body: "Your score, your scan button, and the one-click fix. Start here." },
  { name: "Fixes", body: "The full list of problems found. Tick the ones you want and apply them." },
  { name: "Editor", body: "Change any product, collection or page title and description by hand." },
  { name: "Content check", body: "Premium and above. Reads the text on your products, collections and pages and tells you where to add more words or make it clearer, worst first. You edit the text in Shopify." },
  { name: "Tools", body: "Everything beyond the scan and fixes: Autopilot, Content check, Internal links, Redirects, Images and the SEO report." },
  { name: "Autopilot", body: "Premium and above. Checks every new product the moment you add it. Exclusive and Agency can switch on automatic SEO text for new products." },
  { name: "Report", body: "Exclusive and Agency. A one-page summary of your score and open issues, with a CSV download and print-to-PDF. Agency puts your own business name on it and adds the content check." },
  { name: "Internal links", body: "Finds pages that mention another page by name without linking to it. One click adds the link, which helps Google find and rank your pages." },
  { name: "Redirects", body: "Send an old or broken web address to the right page, so visitors and Google don't hit a dead end." },
  { name: "Images", body: "Shrinks photos that are too big so your pages load faster." },
  { name: "Plan", body: "Choose or change your plan. Every plan starts with a free trial." },
];

export default function Manual() {
  return (
    <s-page heading="How to use Metaglow SEO">
      <s-section heading="First, what is SEO?">
        <s-paragraph>
          SEO means making your shop easy for Google to understand, so more people find you when they
          search. Google reads a few things on each page: the headline it shows (the{" "}
          <s-text type="strong">title</s-text>), the short blurb under it (the{" "}
          <s-text type="strong">description</s-text>), the text on the page, and what your pictures
          show (<s-text type="strong">alt text</s-text>). If those are missing or messy, Google
          understands your shop less well and shows it less often.
        </s-paragraph>
        <s-paragraph>
          Metaglow SEO checks all of that for you, tells you what is missing in plain words, and fixes
          most of it in a click. You don't need to learn anything else to use it.
        </s-paragraph>
      </s-section>

      <s-section heading="Quick start — about 5 minutes">
        <s-unordered-list>
          <s-list-item>
            <s-text type="strong">1. Start your free trial.</s-text> Open the{" "}
            <s-link href="/app/billing">Plan</s-link> page and pick a plan. The first {TRIAL_DAYS} days
            are free.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">2. Scan your store.</s-text> On the{" "}
            <s-link href="/app">Dashboard</s-link>, click “Run first scan”. It looks at your products,
            collections, pages and homepage. Nothing on your store changes during a scan.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">3. Look at your score.</s-text> Higher is better. Red “High” problems
            matter most, so those are the ones to fix first.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">4. Fix the easy ones.</s-text> Click “Fix everything automatically”.
            It asks you to confirm first. Or choose “Review first” to look at each fix before it goes
            live.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">5. Handle what's left.</s-text> Open <s-link href="/app/fixes">Fixes</s-link>{" "}
            for the rest. Each row says what's wrong, and has a button to fix or edit it.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">6. Scan again in a few weeks.</s-text> New products bring new gaps.
            Scanning again keeps your shop tidy.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="What the problems mean">
        <s-paragraph>
          Every problem has a colour. <s-badge tone="critical">High</s-badge> matters most,{" "}
          <s-badge tone="warning">Medium</s-badge> is worth doing,{" "}
          <s-badge tone="info">Low</s-badge> is a small polish.
        </s-paragraph>
        <s-table>
          <s-table-header-row>
            <s-table-header>Problem</s-table-header>
            <s-table-header>What it means</s-table-header>
            <s-table-header>What to do</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {PROBLEMS.map((p) => (
              <s-table-row key={p.name}>
                <s-table-cell>
                  <s-text type="strong">{p.name}</s-text>
                </s-table-cell>
                <s-table-cell>{p.meaning}</s-table-cell>
                <s-table-cell>{p.action}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="What each page in the menu does">
        <s-table>
          <s-table-header-row>
            <s-table-header>Menu item</s-table-header>
            <s-table-header>What it's for</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {PAGES.map((p) => (
              <s-table-row key={p.name}>
                <s-table-cell>
                  <s-text type="strong">{p.name}</s-text>
                </s-table-cell>
                <s-table-cell>{p.body}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Common questions">
        <s-paragraph>
          <s-text type="strong">Will my shop rank first on Google?</s-text> Nobody can promise that,
          and Metaglow SEO doesn't. It removes the gaps that hold a shop back. Google decides the rest,
          and changes usually take a few weeks to show.
        </s-paragraph>
        <s-paragraph>
          <s-text type="strong">Is a scan safe?</s-text> Yes. A scan only reads your store. Changes
          happen only when you apply a fix.
        </s-paragraph>
        <s-paragraph>
          <s-text type="strong">Can I change something the app wrote?</s-text> Yes. Open the{" "}
          <s-link href="/app/editor">Editor</s-link>, find the product or page, and type whatever you
          prefer.
        </s-paragraph>
        <s-paragraph>
          <s-text type="strong">What are AI credits?</s-text> Each AI-written title, description or
          image label uses one credit. Your plan includes a monthly amount, and it resets on the 1st.
        </s-paragraph>
        <s-paragraph>
          <s-text type="strong">What does “NoIndex” do?</s-text> It tells Google to hide a page from
          search results. Use it only for pages you don't want strangers to find. It needs the “SEO
          Schema” app embed switched on in your theme editor.
        </s-paragraph>
        <s-paragraph>
          <s-text type="strong">I'm stuck.</s-text> Email{" "}
          <s-link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</s-link> and describe what you see.
          A screenshot helps.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Start here">
        <s-paragraph>New to the app? Do these three things:</s-paragraph>
        <s-unordered-list>
          <s-list-item>Pick a plan (free trial)</s-list-item>
          <s-list-item>Scan your store</s-list-item>
          <s-list-item>Click “Fix everything automatically”</s-list-item>
        </s-unordered-list>
        <s-button variant="primary" href="/app">
          Go to dashboard
        </s-button>
      </s-section>
    </s-page>
  );
}
