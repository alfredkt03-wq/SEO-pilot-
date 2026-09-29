// Search/list helpers for the manual SEO editor (/app/editor). Separate from
// seo-audit.server.ts on purpose: the audit engine does an exhaustive,
// paginated scan of the whole catalog for issue detection, while this is a
// lightweight, single-page search used to find one resource to hand-edit —
// different access pattern, different query shape.

export type EditorResourceType = "product" | "page" | "collection";

export function isEditorType(value: string | null | undefined): value is EditorResourceType {
  return value === "product" || value === "page" || value === "collection";
}

export interface EditorListItem {
  id: string; // full GID, e.g. gid://shopify/Product/123
  numericId: string;
  title: string;
  handle: string;
  seoTitle: string;
  seoDescription: string;
}

const RESULTS_PER_PAGE = 25;

export async function searchEditorResources(
  admin: any,
  type: EditorResourceType,
  rawQuery: string,
): Promise<EditorListItem[]> {
  const term = sanitizeSearchTerm(rawQuery);
  // Shopify's Admin search syntax only supports a *trailing* wildcard
  // (`title:shirt*`), not a leading or surrounding one (`title:*shirt*` is
  // rejected as an invalid query) — see shopify.dev's search syntax docs.
  const searchQuery = term ? `title:${term}*` : undefined;

  if (type === "product") {
    const res = await admin.graphql(
      `#graphql
      query SeoPilotEditorProducts($query: String, $first: Int!) {
        products(first: $first, query: $query, sortKey: TITLE) {
          edges {
            node {
              id
              title
              handle
              seo { title description }
            }
          }
        }
      }`,
      { variables: { query: searchQuery, first: RESULTS_PER_PAGE } },
    );
    const json = await res.json();
    return (json.data?.products?.edges ?? []).map((e: any) =>
      toItem(e.node, e.node.seo?.title, e.node.seo?.description),
    );
  }

  if (type === "collection") {
    const res = await admin.graphql(
      `#graphql
      query SeoPilotEditorCollections($query: String, $first: Int!) {
        collections(first: $first, query: $query, sortKey: TITLE) {
          edges {
            node {
              id
              title
              handle
              seo { title description }
            }
          }
        }
      }`,
      { variables: { query: searchQuery, first: RESULTS_PER_PAGE } },
    );
    const json = await res.json();
    return (json.data?.collections?.edges ?? []).map((e: any) =>
      toItem(e.node, e.node.seo?.title, e.node.seo?.description),
    );
  }

  // Pages have no first-class `seo` field — title/description live in the
  // `global.title_tag` / `global.description_tag` metafields (same ones the
  // admin's own "Search engine listing preview" panel reads and writes).
  const res = await admin.graphql(
    `#graphql
    query SeoPilotEditorPages($query: String, $first: Int!) {
      pages(first: $first, query: $query, sortKey: TITLE) {
        edges {
          node {
            id
            title
            handle
            titleTag: metafield(namespace: "global", key: "title_tag") { value }
            descriptionTag: metafield(namespace: "global", key: "description_tag") { value }
          }
        }
      }
    }`,
    { variables: { query: searchQuery, first: RESULTS_PER_PAGE } },
  );
  const json = await res.json();
  return (json.data?.pages?.edges ?? []).map((e: any) =>
    toItem(e.node, e.node.titleTag?.value, e.node.descriptionTag?.value),
  );
}

function toItem(node: any, seoTitle?: string | null, seoDescription?: string | null): EditorListItem {
  return {
    id: node.id,
    numericId: String(node.id).split("/").pop() ?? node.id,
    title: node.title,
    handle: node.handle,
    seoTitle: seoTitle ?? "",
    seoDescription: seoDescription ?? "",
  };
}

// Strips characters that have special meaning in Shopify's search syntax
// (quotes, backslashes, colons, wildcards) so free-text merchant input can
// never be interpreted as query operators or break the request.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/["\\*:]/g, " ").trim();
}

export const RESOURCE_GID_TYPE: Record<EditorResourceType, string> = {
  product: "Product",
  page: "Page",
  collection: "Collection",
};

export function toGid(type: EditorResourceType, numericId: string): string {
  return `gid://shopify/${RESOURCE_GID_TYPE[type]}/${numericId}`;
}

export function storefrontPath(type: EditorResourceType, handle: string): string {
  if (type === "product") return `/products/${handle}`;
  if (type === "collection") return `/collections/${handle}`;
  return `/pages/${handle}`;
}
