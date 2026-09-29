// Plain domain type mirroring the SeoIssue Prisma model. Kept independent of
// the generated Prisma types so application/UI code doesn't need to re-run
// `prisma generate` just to type-check, and so the shape is explicit at a
// glance.
export interface SeoIssueRow {
  id: string;
  shop: string;
  resourceType: string;
  resourceId: string;
  resourceTitle: string;
  resourceHandle: string;
  imageId: string | null;
  brokenLinkPath: string | null;
  type: string;
  severity: string;
  message: string;
  suggestion: string | null;
  aiGenerated: boolean;
  fixed: boolean;
  createdAt: Date;
}

// SeoIssueRow as sent to the Fixes page UI: `suggestion` is redacted
// (nulled) server-side for shops without an active subscription, so
// `suggestionLength` is included alongside it to keep the table informative
// (roughly how long the fix is) without ever shipping the exact wording to
// a browser that hasn't paid for it.
export interface RedactableSeoIssueRow extends SeoIssueRow {
  suggestionLength: number;
}

export interface RedirectRow {
  id: string;
  path: string;
  target: string;
}
