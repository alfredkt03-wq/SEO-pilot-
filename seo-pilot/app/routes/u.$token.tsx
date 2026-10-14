// Public unsubscribe page for review-request emails. The email link opens a
// confirmation (so a mail scanner that opens links can't unsubscribe anyone);
// pressing the button records the address as opted out for every store.
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import db from "../db.server";
import { shopLabel } from "../lib/reviews.server";
import { CustomerPage } from "../components/customer-page";

export const meta = () => [{ title: "Unsubscribe" }, { name: "robots", content: "noindex, nofollow" }];

async function findRequest(token: string | undefined) {
  if (!token || token.length < 10 || token.length > 64) return null;
  return db.reviewRequest.findUnique({ where: { token } });
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const req = await findRequest(params.token);
  if (!req) throw new Response("Not found", { status: 404 });
  const settings = await db.shopSettings.findUnique({ where: { shop: req.shop } });
  const already = Boolean(await db.emailOptOut.findUnique({ where: { email: req.email } }));
  return { store: shopLabel(req.shop, settings?.brandName), already };
};

export const action = async ({ params }: ActionFunctionArgs) => {
  const req = await findRequest(params.token);
  if (!req) throw new Response("Not found", { status: 404 });
  await db.emailOptOut.upsert({ where: { email: req.email }, update: {}, create: { email: req.email } });
  return { ok: true as const };
};

export default function Unsubscribe() {
  const d = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  if (d.already || (result && result.ok)) {
    return (
      <CustomerPage>
        <h1>You're unsubscribed</h1>
        <p>You won't receive review requests from {d.store} or other stores using this service.</p>
      </CustomerPage>
    );
  }
  return (
    <CustomerPage>
      <h1>Stop review requests?</h1>
      <p>Confirm and you won't receive review requests from {d.store} or other stores using this service.</p>
      <Form method="post">
        <button className="cp-btn" type="submit">Unsubscribe</button>
      </Form>
    </CustomerPage>
  );
}
