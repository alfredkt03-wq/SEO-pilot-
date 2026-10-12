// Small SEO score chip: a mini ring with the number, a label and a one-word verdict.
// Plain HTML + SVG so it looks the same everywhere.
const CSS = `
.sc-chip{display:inline-flex;align-items:center;gap:8px;padding:3px 10px 3px 4px;border-radius:999px;border:1px solid var(--sc-line);background:var(--sc-bg);font-size:12px;line-height:1;color:#1f2a44;white-space:nowrap}
.sc-ring{position:relative;width:26px;height:26px;flex:none}
.sc-ring svg{display:block}
.sc-ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:9px;letter-spacing:-.02em;font-weight:700;font-variant-numeric:tabular-nums;color:var(--sc-ink)}
.sc-label{font-weight:600;color:var(--sc-ink)}
.sc-label small{font-weight:500;color:#5b6b85;margin-left:4px;font-size:11px}
.sc-good{--sc-ink:#166534;--sc-line:#bbe5c8;--sc-bg:#f0fbf4;--sc-ring:#16a34a}
.sc-ok{--sc-ink:#92580a;--sc-line:#f3d9a4;--sc-bg:#fff8eb;--sc-ring:#d97706}
.sc-low{--sc-ink:#a32a22;--sc-line:#f1c0bc;--sc-bg:#fff3f2;--sc-ring:#dc2626}
`;

export function ScoreChip({ score, tone }: { score: number; tone: "success" | "warning" | "critical" }) {
  const cls = tone === "success" ? "sc-good" : tone === "warning" ? "sc-ok" : "sc-low";
  const verdict = tone === "success" ? "Good" : tone === "warning" ? "Fair" : "Needs work";
  const R = 11;
  const C = 2 * Math.PI * R;
  return (
    <>
      <style>{CSS}</style>
      <span className={`sc-chip ${cls}`} title={`SEO score ${score} out of 100`}>
        <span className="sc-ring">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r={R} fill="none" stroke="#e3e9f5" strokeWidth="3" />
            <circle
              cx="13" cy="13" r={R} fill="none" stroke="var(--sc-ring)" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} transform="rotate(-90 13 13)"
            />
          </svg>
          <b>{score}</b>
        </span>
        <span className="sc-label">SEO score<small>{verdict}</small></span>
      </span>
    </>
  );
}
