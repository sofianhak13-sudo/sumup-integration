# Security posture — VERIFIED IN CODE unless noted

## Webhook authentication / raw body / HMAC

**Phase 2C resolved this as a provider limitation, not an in-repo bug.**
Checked directly against SumUp's own developer documentation
(`developer.sumup.com/docs/online-payments/introduction/webhooks/`,
`developer.sumup.com/webhook-docs/introduction/getting-started`) during
this audit: **SumUp's Checkout product webhooks (`CHECKOUT_STATUS_CHANGED`,
the exact callback this repo receives) are unsigned by design** — no HMAC,
no signing secret, no `X-Signature`-style header exists for this API.
SumUp's own documented mitigation is exactly what this repo already did
before Phase 2C and still does: never trust the callback body, re-fetch
the checkout from the Checkouts API, and act only on that authenticated
response. (SumUp does sign webhooks for its unrelated Open Banking /
Payment Initiation product, using a different, RSA/EC-based scheme — not
applicable to the Checkout API this repo integrates with.)

Because no signature exists to check, this Skill previously flagged the
absence as an open gap. Per the mission's own rule — never invent a
signature scheme a provider doesn't offer — no HMAC was added. Instead,
Phase 2C deepened the one verification mechanism the provider does support
(re-fetch + compare):

- **VERIFIED IN CODE:** `checkout.merchant_code` (from the re-fetched,
  authenticated SumUp response) is now cross-checked against
  `SUMUP_MERCHANT_CODE` in both webhook routes
  (`checkoutMatchesMerchant()` in `app/sumup.server.js`), alongside the
  pre-existing checkout_reference/amount/currency checks. A mismatch is
  treated identically to those: logged, `204`, no order created.
- **VERIFIED IN CODE:** the outbound SumUp API calls (checkout re-fetch in
  both webhook routes, checkout creation in both `apps.sumup-pay*`
  routes) now go through `sumupFetch()` (`app/sumup.server.js`), which
  applies a 10s `AbortController` timeout. A hung/slow SumUp response now
  fails fast (caught, `500`, no order) instead of holding the request
  open indefinitely.
- Shopify's own webhooks (`app/uninstalled`, `app/scopes_update`) go
  through `authenticate.webhook(request)` from
  `@shopify/shopify-app-react-router`, which performs Shopify's official
  HMAC verification internally — library-provided, not hand-rolled, and
  unrelated to (and unaffected by) the SumUp changes above. This repo does
  not subscribe to Shopify `orders/*` webhooks (see `architecture.md`), so
  there is no second Shopify-webhook surface to secure here.

**Residual, accepted exposure (not a bug, a property of the provider's
design):** anyone who can reach `/api/sumup-webhook[-cart]` and knows (or
observes, e.g. from a customer's own SumUp receipt) a real, already-PAID
`checkout.id` can trigger an early re-check. Because the handler always
re-verifies status/reference/amount/currency/merchant against SumUp's own
API and the DB row created at checkout time, and idempotency prevents a
second order, the worst case is redundant work — never a duplicate,
mismatched, or fraudulent order. This is the standard, provider-documented
posture for this API, not a residual defect.

## Content-Type

Both SumUp webhook handlers call `request.json()` directly with no
explicit `Content-Type` check beforehand. A malformed body (wrong
content-type or invalid JSON) throws inside the route's own top-level
`try/catch`, producing a safe `500` with no order created — **VERIFIED IN
CODE** and covered by
`app/test/routes/api.sumup-webhook.test.js` ("rejects a malformed JSON
body safely"). Whether SumUp always sends `application/json` in practice
is **NOT VERIFIED HERE** (no access to SumUp's live traffic), but the
failure mode either way is already safe.

## Secrets — names only, values never

Environment variables referenced in this repo (names are safe to
document; a `.env` file, if present locally, is git-ignored and was not
read or displayed in this audit):

| Variable | Used in | Purpose |
|---|---|---|
| `SUMUP_API_KEY` | `app/sumup.server.js` (`sumupFetch`), used by both checkout-creation routes and both webhook routes | Bearer token for all SumUp API calls. |
| `SUMUP_MERCHANT_CODE` | both checkout-creation routes (sent when creating a checkout) and, since Phase 2C, both webhook routes (cross-checked against the re-fetched checkout's `merchant_code`) | SumUp merchant identifier. No new env var was introduced — this reuses the existing one. |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | `app/shopify.server.js` | Shopify app credentials (OAuth). |
| `SCOPES` | `app/shopify.server.js` | Comma-separated Shopify access scopes. |
| `SHOPIFY_APP_URL` | `app/shopify.server.js` | App's public URL for OAuth callbacks. |
| `SHOP_CUSTOM_DOMAIN` | `app/shopify.server.js` | Optional custom shop domain support. |
| `DATABASE_URL` | `prisma/schema.prisma` | PostgreSQL connection string (Prisma). |

Shopify Admin access tokens are not a separate env var in this repo's own
code — they are stored per-shop in the `Session.accessToken` column
(Prisma-backed session storage), obtained via normal Shopify OAuth. Never
print rows from the `Session` table.

## Logging — what is actually logged

**VERIFIED IN CODE**, both webhook routes log only: the SumUp checkout id
(`checkout.id`), `checkout.checkout_reference`, `checkout.status`,
`checkout.amount`, `checkout.currency`, the resulting Shopify `order.id`
and `order.name`, and (on failure) the GraphQL `userErrors` array or the
caught `error` object. None of these log lines include the API key,
merchant code, access token, or `DATABASE_URL`. If extending logging,
keep that boundary: log identifiers (checkout id / reference / order id),
never credentials.

## Things this audit did **not** do (by design)

- No production API call was made to SumUp or Shopify beyond what the
  existing codebase already does at runtime (this audit only *read*
  files).
- No `.env` file was read or displayed.
- No secret value appears anywhere in this Skill's files.
