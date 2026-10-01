// Shared visual shell for the app's public, non-embedded pages (landing page
// at "/", "/privacy", "/terms"). They render in a plain browser tab, not
// inside Shopify admin, so they carry their own identity: warm paper ground,
// espresso brown, and a single gold accent with a Fraunces serif — flat,
// hairline rules, square corners, no gradients or glows.
import type { ReactNode } from "react";

export function PublicFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=Source+Sans+3:wght@400;600&display=swap"
      />
    </>
  );
}

const styles = `
  body { margin: 0; }
  .pp-root {
    --bg: #faf6ee;
    --surface: #f2eadb;
    --border: #e2d6c1;
    --text: #2b2016;
    --text-dim: #5e4f3f;
    --text-faint: #7d6d5a;
    --deep: #261b12;
    --gold: #b8893b;
    --gold-light: #d9b36a;
    --gold-dark: #8f6726;
    font-family: "Source Sans 3", -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .pp-root h1, .pp-root h2, .pp-root h3 {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 500;
    text-wrap: balance;
    margin: 0;
  }
  .pp-wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; width: 100%; box-sizing: border-box; }

  /* Header / footer */
  .pp-topline { display: none; }
  .pp-header { border-bottom: 1px solid var(--border); background: var(--bg); position: sticky; top: 0; z-index: 10; }
  .pp-header .pp-wrap { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 20px; padding-bottom: 20px; }
  .pp-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); }
  .pp-logo-mark { width: 30px; height: 30px; border: 1.5px solid var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .pp-logo-mark svg { stroke: var(--gold-dark); }
  .pp-logo-word { font-family: "Fraunces", Georgia, serif; font-weight: 500; font-size: 19px; letter-spacing: 0.01em; }
  .pp-nav { display: flex; gap: 28px; align-items: center; }
  .pp-nav a { color: var(--text-dim); text-decoration: none; font-size: 15px; }
  .pp-nav a:hover { color: var(--text); }
  .pp-nav .pp-nav-cta { color: var(--text); border-bottom: 1.5px solid var(--gold); padding: 2px 0; font-weight: 600; }
  .pp-nav .pp-nav-cta:hover { color: var(--gold-dark); }
  .pp-main { flex-grow: 1; width: 100%; max-width: 1080px; margin: 0 auto; padding: 0 24px 96px; box-sizing: border-box; }
  .pp-main-wide { flex-grow: 1; }
  .pp-footer { border-top: 1px solid var(--border); color: var(--text-faint); font-size: 14px; }
  .pp-footer .pp-wrap { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-top: 28px; padding-bottom: 28px; }
  .pp-footer a { color: var(--text-faint); text-decoration: none; }
  .pp-footer a:hover { color: var(--text); }

  /* Buttons */
  .pp-btn-cta {
    display: inline-flex; align-items: center; gap: 10px;
    background: var(--gold); color: #1f160c;
    font-family: inherit; font-size: 16px; font-weight: 600;
    padding: 15px 26px; border-radius: 2px; text-decoration: none; border: none; cursor: pointer;
  }
  .pp-btn-cta:hover { background: var(--gold-light); }
  .pp-btn-cta:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
  .pp-btn-cta.green { background: var(--deep); color: #faf6ee; }
  .pp-btn-cta.green:hover { background: #3a2a1b; }
  .pp-btn-cta.green:focus-visible { outline-color: var(--gold); }

  /* Hero band */
  .pp-hero-band { background: var(--deep); color: #f3ead9; }
  .pp-hero { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 72px; align-items: center; padding-top: 88px; padding-bottom: 96px; }
  .pp-eyebrow { display: block; font-size: 13px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold-light); margin-bottom: 24px; }
  .pp-hero h1 { font-size: 54px; font-weight: 400; letter-spacing: -0.01em; line-height: 1.1; color: #faf3e4; }
  .pp-hero h1 em { font-style: italic; color: var(--gold-light); }
  .pp-hero-sub { margin: 24px 0 0; font-size: 18.5px; line-height: 1.65; color: #d8cbb5; max-width: 500px; }
  .pp-cta-row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; margin-top: 36px; }
  .pp-trust-row { display: flex; flex-wrap: wrap; gap: 8px 28px; margin-top: 32px; }
  .pp-trust-item { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; color: #d8cbb5; }
  .pp-trust-item svg { color: var(--gold-light); flex-shrink: 0; }

  /* Product preview (an illustration of the app, marked "Example") */
  .pp-mock { background: var(--bg); color: var(--text); border-radius: 2px; padding: 24px; border: 1px solid var(--gold); }
  .pp-mock-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .pp-mock-title { font-size: 14.5px; font-weight: 600; }
  .pp-mock-tag { font-size: 11px; font-weight: 600; color: var(--text-faint); letter-spacing: 0.1em; text-transform: uppercase; }
  .pp-mock-score { display: flex; align-items: center; gap: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
  .pp-mock-score circle:first-child { stroke: var(--border); }
  .pp-mock-score circle:last-child { stroke: var(--gold); }
  .pp-mock-grade { font-family: "Fraunces", Georgia, serif; font-weight: 500; font-size: 28px; line-height: 1; }
  .pp-mock-grade small { display: block; font-family: "Source Sans 3", sans-serif; font-size: 12px; color: var(--text-faint); margin-top: 4px; }
  .pp-mock-note { font-size: 14px; color: var(--text-dim); line-height: 1.5; }
  .pp-mock-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); font-size: 14.5px; }
  .pp-pill { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 2px; min-width: 62px; text-align: center; }
  .pp-pill.high { background: #ecd3c9; color: #7a2a14; }
  .pp-pill.med { background: #efdfb8; color: #6b4a0a; }
  .pp-pill.low { background: #e8e0d0; color: #5a4d3b; }
  .pp-mock-btn { margin-top: 18px; background: var(--deep); color: #faf6ee; border-radius: 2px; padding: 12px; text-align: center; font-size: 14.5px; font-weight: 600; }

  /* Sections */
  .pp-section { padding: 96px 0; }
  .pp-section.tint { background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .pp-section h2 { font-size: 36px; letter-spacing: -0.01em; line-height: 1.15; }
  .pp-lead { margin: 16px 0 0; font-size: 18px; line-height: 1.65; color: var(--text-dim); max-width: 580px; }

  /* Steps */
  .pp-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px; margin-top: 52px; }
  .pp-step { border-top: 1px solid var(--border); padding-top: 22px; }
  .pp-step-num { font-family: "Fraunces", Georgia, serif; font-size: 26px; color: var(--gold); margin-bottom: 10px; }
  .pp-step h3 { font-size: 21px; margin-bottom: 8px; }
  .pp-step p { margin: 0; font-size: 16.5px; line-height: 1.6; color: var(--text-dim); max-width: 320px; }

  /* Features */
  .pp-feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 44px 48px; margin-top: 52px; }
  .pp-feature-card { border-top: 1px solid var(--border); padding-top: 22px; }
  .pp-feature-icon { display: none; }
  .pp-feature-card h3 { font-size: 20px; margin-bottom: 8px; }
  .pp-feature-card p { margin: 0; font-size: 16px; line-height: 1.6; color: var(--text-dim); }

  /* Pricing */
  .pp-plans { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 52px; align-items: start; border: 1px solid var(--border); }
  .pp-plan { padding: 30px 26px; border-right: 1px solid var(--border); }
  .pp-plan:last-child { border-right: none; }
  .pp-plan.featured { background: var(--surface); }
  .pp-plan-name { font-family: "Fraunces", Georgia, serif; font-size: 22px; color: var(--text); }
  .pp-plan.featured .pp-plan-name::after { content: " · most chosen"; font-family: "Source Sans 3", sans-serif; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold-dark); }
  .pp-plan-price { margin-top: 12px; font-family: "Fraunces", Georgia, serif; font-size: 38px; font-weight: 400; }
  .pp-plan-price span { font-family: "Source Sans 3", sans-serif; font-size: 15px; color: var(--text-faint); }
  .pp-plan-inr { margin-top: 4px; font-size: 14px; color: var(--text-faint); }
  .pp-plan ul { list-style: none; margin: 22px 0 0; padding: 20px 0 0; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 11px; }
  .pp-plan li { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 1.45; color: var(--text-dim); }
  .pp-plan li svg { color: var(--gold); flex-shrink: 0; margin-top: 2px; }
  .pp-plans-note { margin-top: 26px; font-size: 15px; color: var(--text-dim); }

  /* Closing call to action */
  .pp-closing { text-align: center; }
  .pp-closing .pp-lead { margin-left: auto; margin-right: auto; }
  .pp-closing .pp-cta-row { justify-content: center; }

  /* Legal / long-form pages */
  .pp-doc { padding-top: 56px; }
  .pp-doc h1 { font-size: 34px; }
  .pp-doc .pp-updated { color: var(--text-faint); font-size: 14px; margin-top: 8px; }
  .pp-doc section { max-width: 720px; margin-top: 40px; }
  .pp-doc section h2 { font-size: 20px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .pp-doc p { font-size: 16px; line-height: 1.65; color: var(--text-dim); margin: 0 0 12px; max-width: 65ch; }
  .pp-doc p:last-child { margin-bottom: 0; }
  .pp-doc strong { color: var(--text); font-weight: 600; }
  .pp-doc a { color: var(--gold-dark); }
  .pp-doc ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
  .pp-doc li { font-size: 16px; line-height: 1.6; color: var(--text-dim); }

  @media (max-width: 1100px) { .pp-plans { grid-template-columns: repeat(2, 1fr); } .pp-plan:nth-child(2) { border-right: none; } .pp-plan:nth-child(-n+2) { border-bottom: 1px solid var(--border); } }
  @media (max-width: 900px) {
    .pp-hero { grid-template-columns: 1fr; gap: 48px; padding-top: 56px; padding-bottom: 64px; }
    .pp-hero h1 { font-size: 38px; }
    .pp-steps, .pp-feature-grid, .pp-plans { grid-template-columns: 1fr; }
    .pp-plan { border-right: none; border-bottom: 1px solid var(--border); }
    .pp-plan:last-child { border-bottom: none; }
    .pp-section { padding: 64px 0; }
    .pp-section h2 { font-size: 29px; }
  }
  @media (max-width: 640px) {
    .pp-nav .pp-nav-cta { display: none; }
    .pp-doc h1 { font-size: 27px; }
  }
`;

export function PublicStyles() {
  return <style dangerouslySetInnerHTML={{ __html: styles }} />;
}

export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="pp-root">
      <PublicStyles />
      <div className="pp-topline" />
      <header className="pp-header">
        <div className="pp-wrap">
          <a className="pp-logo" href="/">
            <span className="pp-logo-mark">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
              </svg>
            </span>
            <span className="pp-logo-word">Metaglow SEO</span>
          </a>
          <nav className="pp-nav">
            <a href="/#pricing">Pricing</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/#get" className="pp-nav-cta">
              Get started
            </a>
          </nav>
        </div>
      </header>
      <main className={wide ? "pp-main-wide" : "pp-main"}>{children}</main>
      <footer className="pp-footer">
        <div className="pp-wrap">
          <span>© 2026 Metaglow SEO</span>
          <span>
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
