// Blue header strip shown at the top of every app page. Plain HTML + CSS,
// so it looks the same everywhere and never depends on Polaris internals.
const ICONS: Record<string, string> = {
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z",
  doc: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h6",
  link: "M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1 1M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1-1",
  redirect: "M5 12h14M13 6l6 6-6 6",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01",
  book: "M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4zM4 16a4 4 0 014-4h12",
  card: "M2 6h20v12H2zM2 10h20",
  search: "M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z",
};

const CSS = `
.ps-strip{display:flex;align-items:center;gap:14px;padding:16px 18px;margin-bottom:12px;border-radius:14px;color:#fff;
  background:linear-gradient(120deg,#1e40af 0%,#2563eb 55%,#3b82f6 100%);box-shadow:0 8px 24px -14px rgba(30,64,175,.55)}
.ps-mark{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);display:grid;place-items:center;flex:none}
.ps-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.ps-text b{font-size:15px;font-weight:650}
.ps-text span{font-size:13px;opacity:.92;line-height:1.35}
`;

export function PageStrip({ icon, title, text }: { icon: keyof typeof ICONS; title: string; text: string }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="ps-strip">
        <span className="ps-mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICONS[icon]} />
          </svg>
        </span>
        <div className="ps-text">
          <b>{title}</b>
          <span>{text}</span>
        </div>
      </div>
    </>
  );
}
