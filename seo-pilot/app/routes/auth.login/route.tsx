import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page heading="Log in to Metaglow SEO">
        <Form method="post">
          <s-section>
            <s-stack direction="block" gap="base">
              <s-text-field
                name="shop"
                label="Shop domain"
                placeholder="example.myshopify.com"
                error={errors.shop}
              />
              <s-button type="submit" variant="primary">
                Log in
              </s-button>
            </s-stack>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
