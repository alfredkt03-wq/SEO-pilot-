// Shared visual shell for the app's public, non-embedded pages (the landing
// page at "/", "/privacy", "/terms"). These render in a plain browser tab —
// before install, or linked from the App Store listing — never inside
// Shopify admin, so unlike the dashboard (built from Shopify's own Polaris
// components, whose colors are fixed) these carry SEO Pilot's own identity:
// white ground, deep green, and saffron as the single warm accent. The
// saffron is a nod to the app's Indian market via a real tricolor color,
// never the flag itself (India's Flag Code restricts commercial use of the
// actual flag/emblem).
//
// Deliberately flat: solid colors, hairline borders, small radii, no
// gradients, glows or hover-lift — those read as generic template design.
import type { ReactNode } from "react";

export function PublicFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
      />
    </>
  );
}

const styles = `
  body { margin: 0; }
  .pp-root {
    --bg: #ffffff;
    --surface: #f5f8f1;
    --border: #dfe6d6;
    --text: #16241a;
    --text-dim: #4f5d48;
    --text-faint: #66725f;
    --deep: #12301f;
    --green: #167a44;
    --green-dark: #0f5c33;
    --green-tint: rgba(22, 122, 68, 0.1);
    --saffron: #ff9933;
    --saffron-ink: #c4570a;
    --saffron-tint: rgba(255, 153, 51, 0.18);
    font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .pp-root h1, .pp-root h2, .pp-root h3 {
    font-family: "Sora", -apple-system, BlinkMacSystemFont, sans-serif;
    text-wrap: balance;
    margin: 0;
  }
  .pp-wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; width: 100%; box-sizing: border-box; }

  /* Header / footer */
  .pp-topline {
    height: 4px;
    background: linear-gradient(90deg, #ff9933 0%, #ff9933 33.3%, #f4f1e8 33.3%, #f4f1e8 66.6%, #1d9a56 66.6%, #1d9a56 100%);
  }
  .pp-header {
    border-bottom: 1px solid var(--border);
    background: #fff;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .pp-header .pp-wrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-top: 18px;
    padding-bottom: 18px;
  }
  .pp-logo { display: flex; align-items: center; gap: 11px; text-decoration: none; color: var(--text); }
  .pp-logo-mark {
    width: 34px; height: 34px; border-radius: 8px; background: var(--green);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .pp-logo-word { font-family: "Sora", sans-serif; font-weight: 650; font-size: 17px; letter-spacing: -0.01em; }
  .pp-nav { display: flex; gap: 26px; align-items: center; }
  .pp-nav a { color: var(--text-dim); text-decoration: none; font-size: 14px; font-weight: 500; }
  .pp-nav a:hover { color: var(--text); }
  .pp-nav .pp-nav-cta {
    background: var(--green); color: #fff; padding: 9px 16px; border-radius: 6px; font-weight: 600;
  }
  .pp-nav .pp-nav-cta:hover { background: var(--green-dark); color: #fff; }
  .pp-main { flex-grow: 1; width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 24px 96px; box-sizing: border-box; }
  .pp-main-wide { flex-grow: 1; }
  .pp-footer { border-top: 1px solid var(--border); color: var(--text-faint); font-size: 13px; }
  .pp-footer .pp-wrap {
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    padding-top: 26px; padding-bottom: 26px;
  }
  .pp-footer a { color: var(--text-faint); text-decoration: none; }
  .pp-footer a:hover { color: var(--text); }

  /* Buttons */
  .pp-btn-cta {
    display: inline-flex; align-items: center; gap: 10px;
    background: var(--saffron); color: #1a1206;
    font-family: inherit; font-size: 17px; font-weight: 700;
    padding: 17px 28px; border-radius: 8px; text-decoration: none; border: none; cursor: pointer;
  }
  .pp-btn-cta:hover { background: #ffab57; }
  .pp-btn-cta:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
  .pp-btn-cta.green { background: var(--green); color: #fff; }
  .pp-btn-cta.green:hover { background: var(--green-dark); }
  .pp-btn-cta.green:focus-visible { outline-color: var(--saffron); }
  .pp-soon {
    display: inline-flex; align-items: center; gap: 10px;
    border: 2px solid rgba(255, 255, 255, 0.45); color: #fff;
    font-size: 16px; font-weight: 600; padding: 15px 24px; border-radius: 8px;
  }
  .pp-soon.light { border-color: var(--green); color: var(--green); }
  .pp-link-light { color: #dfe8e0; font-weight: 600; text-decoration: underline; text-underline-offset: 5px; font-size: 15px; }
  .pp-link-light:hover { color: #fff; }

  /* Hero band */
  .pp-hero-band { background: var(--deep); color: #fff; }
  .pp-hero {
    display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 64px; align-items: center;
    padding-top: 84px; padding-bottom: 92px;
  }
  .pp-eyebrow {
    display: inline-block; font-size: 13px; font-weight: 700; letter-spacing: 0.01em;
    color: #ffc48a; border: 1px solid rgba(255, 153, 51, 0.5);
    padding: 7px 14px; border-radius: 999px; margin-bottom: 26px;
  }
  .pp-hero h1 { font-size: 56px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.06; color: #fff; }
  .pp-hero h1 em { font-style: normal; color: var(--saffron); }
  .pp-hero-sub { margin: 24px 0 0; font-size: 18px; line-height: 1.65; color: #cfe0d3; max-width: 520px; }
  .pp-cta-row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; margin-top: 36px; }
  .pp-trust-row { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 30px; }
  .pp-trust-item { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #dfe8e0; }
  .pp-trust-item svg { color: var(--saffron); flex-shrink: 0; }

  /* Product preview (an illustration of the app, marked "Example") */
  .pp-mock { background: #fff; color: var(--text); border-radius: 10px; padding: 22px; box-shadow: 0 20px 44px rgba(0, 0, 0, 0.28); }
  .pp-mock-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .pp-mock-title { font-size: 13.5px; font-weight: 700; }
  .pp-mock-tag { font-size: 11px; font-weight: 700; color: var(--text-faint); border: 1px solid var(--border); border-radius: 4px; padding: 2px 7px; text-transform: uppercase; letter-spacing: 0.06em; }
  .pp-mock-score { display: flex; align-items: center; gap: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
  .pp-mock-grade { font-family: "Sora", sans-serif; font-weight: 700; font-size: 26px; line-height: 1; }
  .pp-mock-grade small { display: block; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 600; color: var(--text-faint); margin-top: 3px; }
  .pp-mock-note { font-size: 13px; color: var(--text-dim); line-height: 1.5; }
  .pp-mock-row { display: flex; align-items: center; gap: 12px; padding: 13px 0; border-bottom: 1px solid #eef2e8; font-size: 13.5px; }
  .pp-pill { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; min-width: 62px; text-align: center; }
  .pp-pill.high { background: #fbd9d4; color: #8e1f0b; }
  .pp-pill.med { background: #ffe9c2; color: #7a4f00; }
  .pp-pill.low { background: #e4e8e0; color: #45503f; }
  .pp-mock-btn { margin-top: 18px; background: var(--green); color: #fff; border-radius: 6px; padding: 12px; text-align: center; font-size: 14px; font-weight: 700; }

  /* Sections */
  .pp-section { padding: 92px 0; }
  .pp-section.tint { background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .pp-section h2 { font-size: 36px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.12; }
  .pp-lead { margin: 14px 0 0; font-size: 17.5px; line-height: 1.6; color: var(--text-dim); max-width: 580px; }

  /* Steps */
  .pp-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; margin-top: 52px; }
  .pp-step { position: relative; }
  .pp-step:not(:last-child)::after {
    content: ""; position: absolute; top: 25px; left: 74px; right: -24px;
    border-top: 2px dashed #c9d6bd;
  }
  .pp-step-num {
    width: 52px; height: 52px; border-radius: 50%; background: var(--green); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-family: "Sora", sans-serif; font-weight: 700; font-size: 20px; margin-bottom: 20px;
  }
  .pp-step h3 { font-size: 20px; font-weight: 650; margin-bottom: 8px; }
  .pp-step p { margin: 0; font-size: 15.5px; line-height: 1.6; color: var(--text-dim); max-width: 300px; }

  /* Features */
  .pp-feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 52px; }
  .pp-feature-card { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 26px; }
  .pp-feature-icon { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; }
  .pp-feature-icon.green { background: var(--green-tint); color: var(--green); }
  .pp-feature-icon.gold { background: var(--saffron-tint); color: var(--saffron-ink); }
  .pp-feature-card h3 { font-size: 16.5px; font-weight: 650; margin-bottom: 8px; }
  .pp-feature-card p { margin: 0; font-size: 14.5px; line-height: 1.6; color: var(--text-dim); }

  /* Pricing */
  .pp-plans { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 52px; align-items: start; }
  .pp-plan { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 30px; }
  .pp-plan.featured { border: 2px solid var(--green); padding: 29px; }
  .pp-plan-name { font-size: 15px; font-weight: 700; color: var(--green); text-transform: uppercase; letter-spacing: 0.07em; }
  .pp-plan-price { margin-top: 12px; font-family: "Sora", sans-serif; font-size: 42px; font-weight: 700; letter-spacing: -0.02em; }
  .pp-plan-price span { font-family: "Plus Jakarta Sans", sans-serif; font-size: 15px; font-weight: 500; color: var(--text-faint); letter-spacing: 0; }
  .pp-plan-inr { margin-top: 4px; font-size: 13.5px; color: var(--text-faint); }
  .pp-plan ul { list-style: none; margin: 24px 0 0; padding: 22px 0 0; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
  .pp-plan li { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 1.45; color: var(--text-dim); }
  .pp-plan li svg { color: var(--green); flex-shrink: 0; margin-top: 2px; }
  .pp-plans-note { margin-top: 26px; font-size: 14.5px; color: var(--text-dim); }

  /* Closing call to action */
  .pp-closing { text-align: center; }
  .pp-closing .pp-lead { margin-left: auto; margin-right: auto; }
  .pp-closing .pp-cta-row { justify-content: center; }

  /* Legal / long-form pages */
  .pp-doc { padding-top: 52px; }
  .pp-doc h1 { font-size: 32px; font-weight: 700; letter-spacing: -0.015em; }
  .pp-doc .pp-updated { color: var(--text-faint); font-size: 13px; margin-top: 8px; }
  .pp-doc section { max-width: 720px; margin-top: 40px; }
  .pp-doc section h2 { font-size: 17px; font-weight: 650; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .pp-doc p { font-size: 14.5px; line-height: 1.65; color: var(--text-dim); margin: 0 0 12px; max-width: 65ch; }
  .pp-doc p:last-child { margin-bottom: 0; }
  .pp-doc strong { color: var(--text); font-weight: 600; }
  .pp-doc a { color: var(--green); }
  .pp-doc ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
  .pp-doc li { font-size: 14.5px; line-height: 1.6; color: var(--text-dim); }

  @media (max-width: 1100px) { .pp-plans { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 900px) {
    .pp-hero { grid-template-columns: 1fr; gap: 48px; padding-top: 56px; padding-bottom: 64px; }
    .pp-hero h1 { font-size: 40px; }
    .pp-steps, .pp-feature-grid, .pp-plans { grid-template-columns: 1fr; }
    .pp-step:not(:last-child)::after { display: none; }
    .pp-section { padding: 64px 0; }
    .pp-section h2 { font-size: 29px; }
  }
  @media (max-width: 640px) {
    .pp-nav .pp-nav-cta { display: none; }
    .pp-doc h1 { font-size: 25px; }
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
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12l7-9 4 5 7-8v10l-7 8-4-5-7 9z" />
              </svg>
            </span>
            <span className="pp-logo-word">SEO Pilot</span>
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
          <span>© 2026 SEO Pilot</span>
          <span>
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
