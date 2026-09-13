# Security posture — VERIFIED IN CODE unless noted

## Webhook authentication / raw body / HMAC

- **No signature or HMAC verification exists on either SumUp webhook
  route.** Both simply do `const event = await request.json()` with no
  header check (no custom `X-SumUp-Signature`-style header read anywhere
  in `app/`), no raw-body capture, no secret comparison. Grepping the
  whole `app/` tree for `hmac|signature|verify` returns nothing relevant.
- Practical exposure is reduced (but not eliminated) by what happens
  *after* parsing: the handler never trusts the payload's own status —
  it re-fetches the checkout from SumUp by `event.id` and only acts on
  that live response, then cross-checks reference/amount/currency against
  the DB row created at checkout time (see `idempotency.md`). So an
  attacker who cannot obtain a real `checkout.id` cannot force an order;
  an attacker who *can* observe a real, already-PAID `checkout.id`
  (e.g. from a customer's SumUp email/receipt) could POST an early/replay
  webhook trigger, but idempotency plus the live re-fetch means the worst
  case is redundant work, not a duplicate or fraudulent order.
- This is flagged as a real gap (webhook authenticity is not
  cryptographically established) but is **not fixed here**, per the
  documentation-only, no-functional-change scope of this audit.
- Shopify's own webhooks (`app/uninstalled`, `app/scopes_update`) go
  through `authenticate.webhook(request)` from
  `@shopify/shopify-app-react-router`, which does perform Shopify's HMAC
  verification internally — that machinery is library-provided, not
  hand-rolled, and is unrelated to the SumUp webhook routes above.

## Content-Type

Both SumUp webhook handlers call `request.json()` directly with no
explicit `Content-Type` check beforehand. Whether SumUp always sends
`application/json` (and what happens on a `undefined`/`text/plain` mismatch)
is **NOT VERIFIED HERE** — this repo has no test exercising that path.

## Secrets — names only, values never

Environment variables referenced in this repo (names are safe to
document; a `.env` file, if present locally, is git-ignored and was not
read or displayed in this audit):

| Variable | Used in | Purpose |
|---|---|---|
| `SUMUP_API_KEY` | both checkout-creation routes, both webhook routes | Bearer token for all SumUp API calls. |
| `SUMUP_MERCHANT_CODE` | both checkout-creation routes | SumUp merchant identifier sent when creating a checkout. |
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
