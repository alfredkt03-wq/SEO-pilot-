// Public rating page a customer reaches from a review-request email.
// No Shopify login: the random token in the link identifies the request.
import { Fragment } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import db from "../db.server";
import { shopLabel } from "../lib/reviews.server";
import { CustomerPage } from "../components/customer-page";

export const meta = () => [{ title: "Rate your order" }, { name: "robots", content: "noindex, nofollow" }];

async function findRequest(token: string | undefined) {
  if (!token || token.length < 10 || token.length > 64) return null;
  return db.reviewRequest.findUnique({ where: { token } });
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const req = await findRequest(params.token);
  if (!req || req.status !== "sent") throw new Response("Not found", { status: 404 });
  const settings = await db.shopSettings.findUnique({ where: { shop: req.shop } });
  if (!req.clickedAt) {
    await db.reviewRequest.update({ where: { id: req.id }, data: { clickedAt: new Date() } });
  }
  const preset = Number(new URL(request.url).searchParams.get("s"));
  return {
    preset: Number.isInteger(preset) && preset >= 1 && preset <= 5 ? preset : null,
    store: shopLabel(req.shop, settings?.brandName),
    name: req.name ? req.name.split(" ")[0] : null,
    rated: req.rating !== null,
    rating: req.rating,
    reviewLink: settings?.reviewLink ?? null,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const req = await findRequest(params.token);
  if (!req || req.status !== "sent") throw new Response("Not found", { status: 404 });
  if (req.rating !== null) return { ok: true as const };
  const form = await request.formData();
  const rating = Number(form.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false as const, error: "Please choose a rating from 1 to 5." };
  }
  const comment = String(form.get("comment") ?? "").trim().slice(0, 1000);
  await db.reviewRequest.update({
    where: { id: req.id },
    data: { rating, comment: comment || null, ratedAt: new Date() },
  });
  return { ok: true as const };
};

export default function Rate() {
  const d = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const done = d.rated || (result && result.ok);

  if (done) {
    return (
      <CustomerPage>
        <h1>Thank you{d.name ? `, ${d.name}` : ""}</h1>
        <p>Your feedback has been sent to {d.store}.</p>
        {d.reviewLink && (
          <>
            <p>If you'd like to share your experience with other shoppers, you can also leave a public review.</p>
            <a className="cp-btn" href={d.reviewLink} rel="noopener noreferrer">Leave a public review</a>
          </>
        )}
      </CustomerPage>
    );
  }

  return (
    <CustomerPage>
      <h1>How was your order from {d.store}?</h1>
      <p>{d.name ? `${d.name}, it` : "It"} takes about half a minute.</p>
      <Form method="post">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="cp-label">Your rating</legend>
          <div className="cp-stars">
            {[5, 4, 3, 2, 1].map((n) => (
              <Fragment key={n}>
                <input type="radio" id={`r${n}`} name="rating" value={n} defaultChecked={d.preset === n} required />
                <label htmlFor={`r${n}`} aria-label={`${n} out of 5`} title={`${n} out of 5`}>★</label>
              </Fragment>
            ))}
          </div>
          <div className="cp-scale"><span>Poor</span><span>Excellent</span></div>
        </fieldset>
        <label className="cp-label" htmlFor="comment">Anything you'd like to add? (optional)</label>
        <textarea id="comment" name="comment" maxLength={1000} />
        {result && !result.ok && <p className="cp-error">{result.error}</p>}
        <button className="cp-btn" type="submit">Send rating</button>
      </Form>
      <div className="cp-foot">Sent on behalf of {d.store}.</div>
    </CustomerPage>
  );
}
