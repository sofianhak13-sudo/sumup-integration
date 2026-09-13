# Test coverage — VERIFIED IN CODE

**Phase 2B** found no test suite in this repo at all. **Phase 2C added
one** (Vitest, `npm test`) to cover the webhook-security and product/
variant-mapping changes made in that phase, plus the pre-existing
idempotency mechanism as non-regression coverage. There is still no CI
configuration (`.github/` remains absent) to run these tests
automatically — `npm test` must be run manually or wired into CI
separately.

## Test files

| File | Subject |
|---|---|
| `app/sumup.server.test.js` | `sumupFetch` (auth header, JSON body, timeout/abort), `checkoutMatchesMerchant`, `getSumUpCredentials`. |
| `app/order-payload.server.test.js` | `buildSumUpOrderInput` — the cross-repo contract (email, lineItems, transactions/amountSet, no tags/note/attributes), with no Prisma/Shopify/SumUp mocking needed. |
| `app/test/routes/api.sumup-webhook.test.js` | Single-product webhook action, fully mocked (Prisma, `unauthenticated.admin`, `global.fetch`). |
| `app/test/routes/api.sumup-cart-webhook.test.js` | Cart webhook action, same mocking approach. |
| `app/test/routes/apps.sumup-pay.test.js` | Single-product checkout-creation action — variant selection. |

These live outside `app/routes/` (except the route files under test
themselves) because `@react-router/fs-routes` treats every file inside
`app/routes/` as a route candidate by filename convention; a `*.test.js`
there gets bundled as if it were a route, and its top-level `await
import(...)` breaks the production build (`npm run build` failed with
"Top-level await is not available in the configured target environment"
until the test files were moved to `app/test/routes/`). Keep any future
route tests there too, not inside `app/routes/`.

## Scenario matrix

| Scenario | Covered | Test file |
|---|---|---|
| Checkout created (single product, default variant) | Yes | `apps.sumup-pay.test.js` |
| Checkout created (single product, explicit variant) | Yes | `apps.sumup-pay.test.js` |
| Checkout created (cart) | Partial — cart checkout-creation route itself (`apps.sumup-pay.cart.jsx`) has no dedicated test; only its `sumupFetch` dependency and the cart *webhook* are tested | `sumup.server.test.js`, `api.sumup-cart-webhook.test.js` |
| Webhook: PAID → order created (single product) | Yes | `api.sumup-webhook.test.js` |
| Webhook: PAID → order created (cart, multi-line/multi-quantity) | Yes | `api.sumup-cart-webhook.test.js` |
| Webhook: PENDING → no order | Yes | `api.sumup-webhook.test.js` |
| Webhook: FAILED/EXPIRED → no order | Not covered directly, but same code path as PENDING (`checkout.status !== "PAID"`) | — |
| Duplicate webhook delivery (idempotency: `orderId` already set) | Yes | both webhook test files |
| Duplicate/concurrent webhook (compare-and-swap lock already held) | Yes | both webhook test files |
| Shopify `orderCreate` userErrors | Yes (single product) | `api.sumup-webhook.test.js` |
| Shopify GraphQL network error/timeout | Not covered (Shopify Admin client itself isn't wrapped/mocked at that layer) | — |
| SumUp API error (non-OK re-fetch response) | Yes | `api.sumup-webhook.test.js` |
| SumUp API network error/timeout (re-fetch throws) | Yes | `api.sumup-webhook.test.js` |
| SumUp API timeout mechanism itself (generic) | Yes | `sumup.server.test.js` |
| Reference/amount/currency mismatch | Yes | `api.sumup-webhook.test.js` |
| Merchant code mismatch (Phase 2C hardening) | Yes | both webhook test files |
| Malformed webhook body | Yes | `api.sumup-webhook.test.js` |
| Unknown checkout id (no matching DB row) | Yes | `api.sumup-webhook.test.js` |
| Cart: empty stored items | Yes | `api.sumup-cart-webhook.test.js` |
| Cart: malformed stored items (not a real variant gid) | Yes | `api.sumup-cart-webhook.test.js` |
| Unknown/invalid variant for a product (CLASSIQUE/PREMIUM-equivalent "UNKNOWN" case) | Yes — rejected with 400, no checkout created | `apps.sumup-pay.test.js` |
| Invalid/missing email | Yes | `apps.sumup-pay.test.js` |
| Cross-repo contract fixture (email/lineItems/amount/currency shape; no tags) | Yes | `order-payload.server.test.js` |

## Running the suite

```
npm test            # vitest run — all tests, single pass
npm run lint         # eslint — clean except one pre-existing, unrelated
                     # `process is not defined` error in app/routes/app._index.jsx
npm run typecheck    # react-router typegen && tsc --noEmit — passes
                     # (tsconfig.json only type-checks .ts/.tsx; the .jsx
                     # route files, old and new, are not covered by it)
npm run build        # react-router build (client + SSR) — passes
```

As of Phase 2C: 39 tests, all passing.
