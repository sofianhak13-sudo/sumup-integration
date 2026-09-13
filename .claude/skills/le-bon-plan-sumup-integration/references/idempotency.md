# Idempotency — VERIFIED IN CODE (priority section)

Both webhook routes (`api.sumup-webhook.jsx`, `api.sumup-cart-webhook.jsx`)
use the identical mechanism, on `SumUpPayment` / `SumUpCartPayment`
respectively.

## The mechanism

1. **Primary key on the natural external ID.** `checkoutId` (the SumUp
   checkout ID) is the Prisma `@id` on both models — a second row for the
   same checkout cannot be inserted; `checkoutReference` is separately
   `@unique`.
2. **Early short-circuit.** Before doing any work, the handler checks
   `if (payment.orderId) return 204` — if an order already exists for this
   checkout, stop immediately.
3. **Reference/amount/currency cross-check.** The freshly-fetched SumUp
   checkout's `checkout_reference`, `amount` (within `0.001`), and
   `currency` must match what was stored in the DB when the checkout was
   created. Mismatch → no order, `204`.
4. **Compare-and-swap lock**, the actual concurrency-safe guard:
   ```js
   const lock = await prisma.sumUpPayment.updateMany({
     where: { checkoutId: checkout.id, processing: false, orderId: null },
     data: { processing: true },
   });
   if (lock.count === 0) { /* already being processed or already has an order */ return 204; }
   ```
   This is a single atomic `UPDATE ... WHERE ...` statement. Two
   concurrent webhook deliveries for the same `checkoutId` race on this
   `UPDATE`; only one can match `processing: false AND orderId: null` and
   flip it — the loser sees `count === 0` and exits without calling
   `orderCreate`. This is what actually prevents a double `orderCreate`
   under concurrent/duplicate webhook delivery, not the earlier
   `if (payment.orderId)` check alone (that check has a race window; the
   `updateMany` does not, because the WHERE + SET happen in one statement
   the database evaluates atomically per row).
5. **Failure releases the lock.** If `orderCreate` returns `userErrors` or
   no `order.id`, `processing` is set back to `false` (but `orderId` stays
   `null`) — so a **subsequent** webhook delivery for the same checkout
   (e.g. SumUp's own retry) can attempt `orderCreate` again. This is the
   only retry path that exists; there is no in-app scheduled retry.
6. **Success records the order id**, which then satisfies both the
   early-exit check (step 2) and the lock's `orderId: null` precondition
   (step 4) for all future deliveries of the same checkout.

## What this protects against — VERIFIED IN CODE

- Duplicate Shopify order from SumUp re-delivering the same webhook
  (retry, or the customer's browser + the async webhook both landing).
- Duplicate order from two near-simultaneous webhook requests for the
  same checkout.
- Re-processing after a permanently-answered checkout (`orderId` already
  set short-circuits immediately).

## Limits — VERIFIED IN CODE, not fixed in this pass

- **`checkoutReference` is not cryptographically unique.** It is
  `` `shopify-${productId}-${Date.now()}` `` or `` `cart-${Date.now()}` ``.
  Millisecond-timestamp collisions are unlikely but not impossible under
  rapid double-submission from the same browser session; a collision
  would violate the Prisma `@unique` constraint on `checkoutReference` and
  throw at insert time (caught by the outer try/catch → the original
  request-time route, not the webhook, would 500 — this is at
  checkout-*creation* time, not at webhook time, so it cannot itself cause
  a duplicate *order*, but it can cause a checkout-creation failure for
  the second click).
- **No idempotency key is sent to SumUp's checkout-creation API itself**
  (only `checkout_reference`, which SumUp treats as a merchant reference,
  not a documented dedup key in this integration). If the *browser*
  double-submits the initial "Pay" action before a checkout is created,
  two distinct SumUp checkouts (and two DB rows) could exist for the same
  cart. Idempotency here is per-`checkoutId`, not per-cart/per-customer.
- **No signature verification on the webhook request itself** (see
  `security.md`). Idempotency does not depend on trusting the webhook
  body's authenticity — it depends on the DB row + the live SumUp
  re-fetch — so this is a separate (lower-severity) concern, not a hole in
  the dedup logic.

## If asked "is idempotence complete?"

Answer: complete for the case this app is actually exposed to (duplicate
webhook delivery for one checkout), via the atomic `updateMany`
compare-and-swap. Not complete for client-side double-submission before a
checkout exists, and not backed by a SumUp-side idempotency key at
checkout-creation time. These limits were re-confirmed, not fixed, during
Phase 2C's security/mapping pass — the mission scoped that phase to
webhook authentication and product/tier mapping specifically, and the
mechanism above already works for the exposure that matters (duplicate/
concurrent webhook delivery), so it was left as-is per the "don't rewrite
working idempotency" instruction.

## Phase 2C non-regression proof

`app/test/routes/api.sumup-webhook.test.js` and
`app/test/routes/api.sumup-cart-webhook.test.js` each assert, with the
lock mocked to simulate both outcomes: a payment that already has
`orderId` set short-circuits before calling `orderCreate` (early-exit
case), and a `updateMany` result of `{ count: 0 }` (lock already held —
the duplicate/concurrent-webhook case) also prevents `orderCreate` from
being called. Both webhook hardening changes made in Phase 2C (the
merchant-code check, the `sumupFetch` timeout) sit *before* this lock in
the request flow and do not alter it — the tests confirm the lock
behavior is unchanged.
