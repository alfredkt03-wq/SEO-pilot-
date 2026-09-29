// Signs and verifies the `state` value passed through Google's OAuth flow.
//
// Google's callback has no built-in way to prove which Shopify shop started
// the request — it just echoes back whatever `state` string we sent. Without
// a signature, anyone could start their own Google consent flow, set
// state=some-other-shop.myshopify.com by hand, and have our callback save
// their Google tokens onto that shop's record. Signing `state` with the same
// secret Shopify already trusts (apiSecretKey) means the callback can tell
// "we issued this" from "someone made this up".
import crypto from "node:crypto";

function secret(): string {
  const key = process.env.SHOPIFY_API_SECRET;
  if (!key) throw new Error("SHOPIFY_API_SECRET is required to sign OAuth state");
  return key;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

// state = "<shop>.<issuedAtMs>.<hmac>" — the timestamp lets an old, possibly
// leaked link expire rather than working forever.
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — plenty for a consent screen

export function buildSignedState(shop: string): string {
  const issuedAt = Date.now().toString();
  const payload = `${shop}.${issuedAt}`;
  return `${payload}.${sign(payload)}`;
}

// Returns the shop domain if the signature is valid and fresh, otherwise null.
export function verifySignedState(state: string | null): string | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [shop, issuedAt, mac] = parts;
  const payload = `${shop}.${issuedAt}`;
  const expected = sign(payload);
  // Constant-time compare so this can't be brute-forced via timing.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null;
  return shop;
}
