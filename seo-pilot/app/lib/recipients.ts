// Parses the "customers to ask" box. Pure and shared, so the page can show a
// live count while the merchant types and the server re-checks the same text.
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export interface Recipient {
  email: string;
  name: string | null;
}

// Splits one CSV line, keeping commas inside "quoted, values" together.
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

// Accepts: "email", "email, Name", "Name <email>", tab/semicolon separated
// lines, and a Shopify customer export pasted as-is (a header row with
// "Email" and "First Name" columns, then one customer per row).
export function parseRecipients(text: string): { valid: Recipient[]; invalid: string[] } {
  const valid: Recipient[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);

  // A header row (several columns, one named Email) switches to column mode.
  let emailCol = -1;
  let nameCol = -1;
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  if (headerIdx >= 0) {
    const cols = splitCsv(lines[headerIdx]).map((c) => c.toLowerCase());
    const e = cols.findIndex((c) => c === "email" || c === "e-mail" || c === "email address");
    if (cols.length > 1 && e >= 0) {
      emailCol = e;
      nameCol = cols.findIndex((c) => c === "first name" || c === "firstname" || c === "name");
      lines.splice(headerIdx, 1);
    }
  }

  for (const rawLine of lines) {
    for (const raw of emailCol >= 0 ? [rawLine] : rawLine.split(";")) {
      const line = raw.trim();
      if (!line) continue;
      let email = "";
      let name = "";
      if (emailCol >= 0) {
        const cells = splitCsv(line);
        email = cells[emailCol] ?? "";
        name = nameCol >= 0 ? (cells[nameCol] ?? "") : "";
      } else {
        const angle = line.match(/^(.*)<([^>]+)>\s*$/);
        if (angle) {
          name = angle[1].trim().replace(/^"|"$/g, "");
          email = angle[2].trim();
        } else {
          const parts = line.split(/[,\t]/).map((p) => p.trim());
          email = parts[0];
          name = parts.slice(1).join(" ").trim();
        }
      }
      email = email.toLowerCase();
      if (!email && emailCol >= 0) continue; // customer with no email in an export
      if (!EMAIL_RE.test(email) || email.length > 200) {
        invalid.push(line.slice(0, 80));
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      valid.push({ email, name: name ? name.slice(0, 60) : null });
    }
  }
  return { valid, invalid };
}
