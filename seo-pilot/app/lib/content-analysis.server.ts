// Plain-language content checks for a page's text. No AI and no guessing at
// Google's algorithm: these are common, widely-given guidelines (enough words
// to describe the thing, the name of the thing appears in the text, headings
// and short paragraphs so it's easy to read, a link to a related page).

import { extractInternalLinks } from "./links.server";
import type { LinkNode } from "./internal-links.server";
import { stripHtml, wordCount } from "./suggestions";

export interface ContentReport {
  id: string;
  kind: LinkNode["kind"];
  title: string;
  handle: string;
  words: number;
  target: number;
  score: number;
  tips: string[];
}

// Words to aim for, by page type. Guidance, not a rule.
const TARGET: Record<LinkNode["kind"], number> = { PRODUCT: 150, COLLECTION: 120, PAGE: 300 };

export function analyzeContent(n: LinkNode): ContentReport {
  const text = stripHtml(n.html);
  const words = wordCount(text);
  const target = TARGET[n.kind];
  const tips: string[] = [];
  let score = 100;

  if (words === 0) {
    score -= 60;
    tips.push(`No text yet. Write about ${target} words about this ${n.kind.toLowerCase()} so Google knows what it is.`);
  } else if (words < target) {
    const gap = target - words;
    score -= Math.min(45, Math.round((gap / target) * 45));
    tips.push(`Add about ${gap} more words. Describe who it's for, what it's made of or how to use it.`);
  }

  if (words > 0) {
    const lower = text.toLowerCase();
    const sig = n.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const missing = sig.length > 0 && !lower.includes(n.title.toLowerCase()) && !sig.some((w) => lower.includes(w));
    if (missing) {
      score -= 15;
      tips.push(`The text never mentions “${n.title}”. Use the name once or twice, naturally.`);
    }

    if (words > 250 && !/<h[2-4][\s>]/i.test(n.html)) {
      score -= 10;
      tips.push("Long text with no subheadings. Break it up with a few short headings.");
    }

    const longPara = (n.html.match(/<p[\s>][\s\S]*?<\/p>/gi) ?? []).some((p) => wordCount(stripHtml(p)) > 120);
    if (longPara) {
      score -= 8;
      tips.push("One paragraph is very long. Split it into shorter ones.");
    }

    const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
    if (sentences.length >= 3 && words / sentences.length > 26) {
      score -= 7;
      tips.push("Sentences are long on average. Shorter ones are easier to read.");
    }

    if (words >= 60 && extractInternalLinks(n.html).length === 0) {
      score -= 5;
      tips.push("No link to another page of your store. See Internal links.");
    }
  }

  return { id: n.id, kind: n.kind, title: n.title, handle: n.handle, words, target, score: Math.max(0, score), tips };
}

export function analyzeAll(nodes: LinkNode[], limit = 60): ContentReport[] {
  return nodes
    .map(analyzeContent)
    .filter((r) => r.tips.length > 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}
