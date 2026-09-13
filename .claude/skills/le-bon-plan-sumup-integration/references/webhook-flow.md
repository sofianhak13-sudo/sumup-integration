# Webhook handling and customer return — VERIFIED IN CODE

## Webhook routes

`app/routes/api.sumup-webhook.jsx` (single-product) and
`app/routes/api.sumup-cart-webhook.jsx` (cart) are structurally identical.
Both are the URL passed as SumUp's `return_url` at checkout-creation time
(i.e. SumUp's server-to-server callback, called "return_url" in SumUp's
own API — not to be confused with the customer-facing `/return` routes
below).

Method: `action` only (POST). No `loader` — these are not readable via GET.

### Step by step

1. `event = await request.json()`. If `event.event_type !==
   "CHECKOUT_STATUS_CHANGED"` or `!event.id`, ignore with `204`.
   **The webhook body's own `status` field, if any, is never trusted or
   read** — only `event.id` is used, purely as a lookup key.
2. Re-fetches the checkout directly from SumUp via `sumupFetch()`
   (`app/sumup.server.js`): `GET https://api.sumup.com/v0.1/checkouts/:id`
   with `Authorization: Bearer <SUMUP_API_KEY>` and a 10s request timeout.
   Non-OK response, or the request throwing (network error/timeout) →
   `500` (no order created either way).
3. Looks up the matching `SumUpPayment`/`SumUpCartPayment` row by
   `checkoutId: checkout.id`. Not found → log + `204` (no error, no retry
   signal to SumUp — see `security.md`/`testing.md` for the implication).
4. Re-validates the stored `customerEmail` against the same email regex.
   Invalid/missing → log + `204`, no order created.
5. Unconditionally updates the stored `status` to the freshly-fetched
   `checkout.status`.
6. If `checkout.status !== "PAID"` → log + `204`. **No order is ever
   created for PENDING, FAILED, or EXPIRED.**
7. If `payment.orderId` is already set → log + `204` (order already
   exists; see `idempotency.md`).
8. Cross-checks `checkout.checkout_reference`, `checkout.amount` (within
   `0.001`), `checkout.currency`, and (since Phase 2C)
   `checkout.merchant_code` against, respectively, the values stored in
   the DB at checkout-creation time and the current `SUMUP_MERCHANT_CODE`
   env var (`checkoutMatchesMerchant()` in `app/sumup.server.js`). Any
   mismatch → log + `204`, no order.
9. Cart flow only: validates every stored `item.variantId` starts with
   `gid://shopify/ProductVariant/` and has a positive integer quantity;
   empty/invalid items list → log + `204`.
10. Acquires the anti-duplicate lock (see `idempotency.md`) via a
    conditional `updateMany`. Lock not acquired → log + `204`.
11. Calls `unauthenticated.admin(payment.shop)` to get an Admin API client
    for that shop (offline token, not the customer's session), then runs
    `orderCreate` (see `shopify-order.md`).
12. On GraphQL `userErrors` or missing `order.id`: logs the errors, flips
    `processing` back to `false` (releasing the lock so a future retry can
    try again), returns `500`.
13. On success: stores `orderId` and `statusPageUrl` on the payment row,
    sets `processing: false`, logs the order id/name, returns `204`.

Any uncaught exception anywhere in the handler is caught by a top-level
`try/catch`, logged, and answered with `500`.

## Trust model — what is and isn't verified before creating an order

- **VERIFIED IN CODE:** the webhook payload itself is never trusted for
  payment status — status always comes from a live re-fetch to SumUp's
  API using only the checkout ID taken from the payload.
- **VERIFIED IN CODE:** reference, amount, currency, and (since Phase 2C)
  merchant code are all cross-checked between the live SumUp checkout and
  the DB record created at checkout time, before any order is created.
- **VERIFIED IN CODE:** there is **no signature/HMAC verification of the
  incoming POST body itself** — and per SumUp's own developer
  documentation, none is offered for this webhook (Checkout product,
  `CHECKOUT_STATUS_CHANGED`): see `security.md` for the citation and the
  reasoning for not inventing one. The re-fetch-and-compare chain above is
  SumUp's own documented substitute, not a workaround.
- Full trust chain as actually implemented:
  `untrusted POST → event.id only → sumupFetch() (authenticated re-fetch,
  timeout-guarded) → status === PAID → reference/amount/currency/merchant
  match DB → orderId not already set → compare-and-swap lock acquired →
  orderCreate`.

## Customer return routes — pure UX, do not create orders

`app/routes/apps.sumup-pay.return.jsx` and
`app/routes/apps.sumup-pay.cart.return.jsx` are what the customer's
browser lands on (SumUp's `redirect_url`) after paying. **VERIFIED IN
CODE:** neither route calls the SumUp API, and neither creates a Shopify
order — they only:

1. Read `?reference=` from the URL, look up the payment row by
   `checkoutReference`, 404 if not found or shop mismatch.
2. If `statusPageUrl` is not yet set (webhook hasn't run/finished yet):
   render a "finalizing" page that client-side polls by reloading itself
   every 1.5s, up to 30 attempts (`sessionStorage` attempt counter), then
   gives up with a static "check your email" message.
3. If `statusPageUrl` is set: render a page that (cart flow only) POSTs
   to the storefront's own `/cart/clear.js` to empty the Shopify cart,
   then `window.location.replace(statusPageUrl)` to send the customer to
   the real Shopify order status page.

**Conclusion: the return route is exclusively a UX polling shim.** Order
creation is driven entirely by the webhook route; if the webhook never
fires (or fails), the customer sees the "we're preparing your order,
check your email" fallback and no order exists.
