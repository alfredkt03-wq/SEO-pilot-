import { authenticate } from "../shopify.server";
import { withRetry } from "./db-retry.server";

// authenticate.webhook checks the signature AND looks the shop's session up in
// the database. If the database is asleep, that lookup throws before any handler
// code runs, so the whole delivery fails. Retrying it (on a fresh copy of the
// request, since a body can only be read once) keeps webhooks from failing on a
// cold database. A bad signature still answers 401 straight away.
export function authenticateWebhook(request: Request) {
  return withRetry(() => authenticate.webhook(request.clone()), "webhook-auth");
}
