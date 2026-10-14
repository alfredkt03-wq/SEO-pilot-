// Minimal page frame for the pages a store's customers see (rating page,
// unsubscribe). It deliberately carries no Metaglow SEO marketing: the
// customer is dealing with the store, not with the app.
import type { ReactNode } from "react";

const CSS = `
  body { margin: 0; }
  .cp-root { min-height: 100vh; background: #f6f6f7; color: #202223; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; display: flex; justify-content: center; padding: 32px 16px; box-sizing: border-box; }
  .cp-card { width: 100%; max-width: 480px; align-self: flex-start; background: #fff; border: 1px solid #e1e3e5; border-radius: 8px; padding: 28px; box-sizing: border-box; }
  .cp-card h1 { font-size: 21px; line-height: 1.3; margin: 0 0 10px; text-wrap: balance; }
  .cp-card p { font-size: 15px; line-height: 1.6; margin: 0 0 16px; color: #3d4247; }
  .cp-stars { display: flex; flex-direction: row-reverse; justify-content: flex-end; gap: 4px; margin: 14px 0 6px; }
  .cp-stars input { position: absolute; opacity: 0; pointer-events: none; }
  .cp-stars label { font-size: 44px; line-height: 1; cursor: pointer; color: #d5d8db; padding: 0 2px; }
  .cp-stars label:hover, .cp-stars label:hover ~ label, .cp-stars input:checked ~ label, .cp-stars input:checked + label { color: #f5a623; }
  .cp-stars input:focus-visible + label { outline: 2px solid #0f6b57; outline-offset: 2px; border-radius: 4px; }
  .cp-scale { display: flex; justify-content: space-between; font-size: 12px; color: #616a75; margin: 0 0 18px; max-width: 288px; }
  .cp-card textarea { width: 100%; box-sizing: border-box; min-height: 96px; border: 1px solid #c9cccf; border-radius: 8px; padding: 10px 12px; font: inherit; font-size: 15px; resize: vertical; margin: 6px 0 16px; }
  .cp-card label.cp-label { font-size: 14px; font-weight: 600; }
  .cp-btn { display: inline-block; background: #0f6b57; color: #fff; border: 0; border-radius: 8px; padding: 12px 22px; font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; text-decoration: none; }
  .cp-btn:hover { background: #0c5846; }
  .cp-btn.light { background: #fff; color: #0f6b57; border: 1px solid #0f6b57; }
  .cp-error { color: #b42318; font-size: 14px; margin: 0 0 12px; }
  .cp-foot { font-size: 12px; color: #8c9196; margin-top: 20px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

export function CustomerPage({ children }: { children: ReactNode }) {
  return (
    <div className="cp-root">
      <style>{CSS}</style>
      <div className="cp-card">{children}</div>
    </div>
  );
}
