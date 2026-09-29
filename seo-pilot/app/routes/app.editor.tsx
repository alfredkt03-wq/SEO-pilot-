import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { isEditorType, searchEditorResources, type EditorResourceType } from "../lib/editor";
import { SEO_TITLE_MAX, META_DESC_MAX } from "../lib/suggestions";

const TYPES: { value: EditorResourceType; label: string; plural: string }[] = [
  { value: "product", label: "Product", plural: "Products" },
  { value: "page", label: "Page", plural: "Pages" },
  { value: "collection", label: "Collection", plural: "Collections" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const type: EditorResourceType = isEditorType(url.searchParams.get("type"))
    ? (url.searchParams.get("type") as EditorResourceType)
    : "product";
  const q = url.searchParams.get("q")?.trim() ?? "";

  const items = await searchEditorResources(admin, type, q);

  return { type, q, items };
};

export default function Editor() {
  const { type, q, items } = useLoaderData<typeof loader>();
  const noun = TYPES.find((t) => t.value === type)?.label.toLowerCase() ?? type;

  return (
    <s-page heading="Editor">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            {TYPES.map((t, i) => (
              <s-stack key={t.value} direction="inline" gap="base" alignItems="center">
                {i > 0 && <s-text color="subdued">·</s-text>}
                {t.value === type ? (
                  <s-text type="strong">{t.plural}</s-text>
                ) : (
                  <Link to={`/app/editor?type=${t.value}`}>{t.plural}</Link>
                )}
              </s-stack>
            ))}
          </s-stack>

          <Form method="get">
            <input type="hidden" name="type" value={type} />
            <s-stack direction="inline" gap="base" alignItems="end">
              <s-text-field
                name="q"
                label={`Search ${noun}s by title`}
                labelAccessibilityVisibility="exclusive"
                placeholder={`Search ${noun}s by title…`}
                defaultValue={q}
              />
              <s-button type="submit">Search</s-button>
              {q && (
                <s-button variant="tertiary" href={`/app/editor?type=${type}`}>
                  Clear
                </s-button>
              )}
            </s-stack>
          </Form>

          {items.length === 0 ? (
            <s-paragraph>
              {q
                ? `No ${noun}s match "${q}".`
                : `No ${noun}s found yet — add some in Shopify admin, then come back here to edit their SEO.`}
            </s-paragraph>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header>Title</s-table-header>
                <s-table-header>SEO title</s-table-header>
                <s-table-header>Meta description</s-table-header>
                <s-table-header>Edit</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {items.map((item) => {
                  const titleOk = item.seoTitle.trim().length > 0 && item.seoTitle.length <= SEO_TITLE_MAX;
                  const descOk =
                    item.seoDescription.trim().length > 0 && item.seoDescription.length <= META_DESC_MAX;
                  return (
                    <s-table-row key={item.id}>
                      <s-table-cell>{item.title}</s-table-cell>
                      <s-table-cell>
                        {item.seoTitle.trim() ? (
                          item.seoTitle
                        ) : (
                          <s-badge tone="warning">Not set</s-badge>
                        )}
                        {item.seoTitle.trim() && !titleOk && (
                          <>
                            {" "}
                            <s-badge tone="warning">Check length</s-badge>
                          </>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        {item.seoDescription.trim() ? (
                          <s-text color="subdued">
                            {item.seoDescription.length > 90
                              ? `${item.seoDescription.slice(0, 90)}…`
                              : item.seoDescription}
                          </s-text>
                        ) : (
                          <s-badge tone="warning">Not set</s-badge>
                        )}
                        {item.seoDescription.trim() && !descOk && (
                          <>
                            {" "}
                            <s-badge tone="warning">Check length</s-badge>
                          </>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        <s-button variant="tertiary" href={`/app/editor/${type}/${item.numericId}`}>
                          Edit
                        </s-button>
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="About the editor">
        <s-paragraph>
          Search any product, collection or page and hand-edit its SEO title and meta description,
          with a live preview of how it looks in Google search results.
        </s-paragraph>
        <s-paragraph>
          Prefer automatic suggestions? Head to{" "}
          <s-link href="/app/fixes">Fixes</s-link> instead.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
