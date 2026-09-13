# Shopify order creation — VERIFIED IN CODE

Both webhook routes call the same mutation via `unauthenticated.admin(payment.shop)`
(an offline Admin API session for that shop, not the customer's session).

```graphql
mutation orderCreate(
  $order: OrderCreateOrderInput!
  $options: OrderCreateOptionsInput
) {
  orderCreate(order: $order, options: $options) {
    order {
      id
      name
      displayFinancialStatus
      statusPageUrl
    }
    userErrors {
      field
      message
    }
  }
}
```

API version: `ApiVersion.July26` (`"2026-07"`, set in
`app/shopify.server.js` and `shopify.app.toml`'s `[webhooks] api_version`).
No separate/older API version is pinned specifically for this mutation.

## Payload — single product (`api.sumup-webhook.jsx`)

```json
{
  "order": {
    "email": "<payment.customerEmail>",
    "currency": "<payment.currency>",
    "lineItems": [{ "variantId": "<payment.variantId>", "quantity": 1 }],
    "transactions": [{
      "kind": "SALE",
      "status": "SUCCESS",
      "gateway": "SumUp",
      "amountSet": {
        "shopMoney": { "amount": "<payment.amount>", "currencyCode": "<payment.currency>" }
      }
    }]
  },
  "options": { "sendReceipt": true }
}
```

Quantity is hardcoded to `1` — **VERIFIED IN CODE**: the single-product
flow has no concept of quantity > 1 anywhere (checkout creation doesn't
collect one either).

## Payload — cart (`api.sumup-cart-webhook.jsx`)

```json
{
  "order": {
    "email": "<customerEmail, re-validated>",
    "currency": "<payment.currency>",
    "lineItems": [
      { "variantId": "<item.variantId>", "quantity": "<item.quantity>" },
      "... one entry per stored cart item ..."
    ],
    "transactions": [{
      "kind": "SALE",
      "status": "SUCCESS",
      "gateway": "SumUp",
      "amountSet": {
        "shopMoney": { "amount": "<payment.amount>", "currencyCode": "<payment.currency>" }
      }
    }]
  },
  "options": { "sendReceipt": true }
}
```

## Fields **not** set — VERIFIED IN CODE (absent, not just undocumented)

Neither mutation call sets: `tags`, `note`, `customAttributes` /
`attributes`, `sourceName`/`source`, `financialStatus` (it's implied by
the `transactions` block instead), explicit `taxLines`, or shipping
line items. If any of these are needed downstream, they are not currently
being passed — this is a gap to flag, not silently assume.

## `sendReceipt: true`

Shopify sends its own order confirmation email using the `email` field
above. This is the only outbound customer email this repo triggers.

## Error handling

`orderErrors` (GraphQL `userErrors`) or a missing `order.id` is treated as
failure: the lock (`processing`) is released and the route returns `500`.
No retry is scheduled by this code — a retry only happens if SumUp itself
re-delivers the webhook (see `idempotency.md` and `testing.md` for what
happens then). There is no dead-letter queue, alerting, or manual-replay
tooling in this repo for a permanently-failing `orderCreate`.

## Historical claim: "Order tags is invalid"

Per the mission brief, a historical incident referenced setting `tags` on
`orderCreate` and hitting a Shopify validation error ("Order tags is
invalid"), with an unclear fix/removal.

**HISTORICAL CLAIM — NOT VERIFIED IN CURRENT TREE.**

- Both current `orderCreate` calls (checked above) pass **no `tags` field
  at all**.
- `git log --all -p` across the full repo history (40 commits) shows no
  commit ever adding, referencing, or removing a `tags` field in an
  `orderCreate`/order mutation payload (the only "tags" hits in the full
  history are unrelated npm package names: `common-tags`, `language-tags`).
- The dedicated commit history for both webhook files (`git log --oneline
  -- app/routes/api.sumup-webhook.jsx app/routes/api.sumup-cart-webhook.jsx`)
  shows an incremental build-up (add webhook → ignore unpaid → block
  unpaid → add transaction → fix transaction syntax → add customer email →
  add anti-duplicate lock → order status return flow → cart isolation →
  cart orders) with nothing matching a tags-related fix.

Conclusion: if this incident happened, it left no trace in this
repository's current code or history. Treat it as unconfirmed until
someone can point to where it actually occurred (possibly a different
repo, a reverted/squashed commit not in this history, or a
misremembering).
