# Architecture map — VERIFIED IN CODE

Stack: Shopify app template on React Router 7 (`@shopify/shopify-app-react-router`),
Prisma + PostgreSQL, deployed as a Docker image (see `Dockerfile`) — app
config (`shopify.app.toml`) points `application_url` at
`https://sumup-integration-dwm1.onrender.com`, consistent with a Render
deployment. No `render.yaml` or other Render-specific file exists in this
repo; deployment shape beyond the Dockerfile/app URL is NOT VERIFIED HERE.

Routes are file-based (`@react-router/fs-routes`, wired in `app/routes.js`).

## Entrypoint / framework

| Path | Role |
|---|---|
| `app/shopify.server.js` | Shopify app instance: API key/secret, scopes, session storage (Prisma), `authenticate`/`unauthenticated` helpers used by every route below. |
| `app/db.server.js` | Shared Prisma client singleton. |
| `app/routes.js` | Registers flat file-based routing. |
| `app/sumup.server.js` | **Added in Phase 2C.** `sumupFetch()` (Bearer auth + 10s timeout wrapper around the SumUp REST API), `getSumUpCredentials()`, `checkoutMatchesMerchant()`. Used by both checkout-creation routes and both webhook routes. |
| `app/order-payload.server.js` | **Added in Phase 2C.** `buildSumUpOrderInput()` — the pure function building the `orderCreate` GraphQL variables, shared by both webhook routes; the cross-repo contract test targets this directly. |
| `prisma/schema.prisma` | Data models: `Session` (Shopify OAuth sessions), `SumUpPayment` (single-product flow), `SumUpCartPayment` (cart flow). |

## Payment-chain routes (the actual subject of this Skill)

| Path | Role |
|---|---|
| `app/routes/apps.sumup-pay.jsx` | App-proxy route. `loader`: health check. `action`: creates a SumUp Hosted Checkout for a single product + email, persists a `SumUpPayment` row, 303-redirects the browser to SumUp. |
| `app/routes/apps.sumup-pay.cart.jsx` | App-proxy route. `action`: creates a SumUp Hosted Checkout for a full cart (multiple variants/quantities) + email, persists a `SumUpCartPayment` row, 303-redirects to SumUp. |
| `app/routes/apps.sumup-pay.return.jsx` | App-proxy route the customer's browser lands on after paying (single-product flow). Polls the DB row for `statusPageUrl`; pure UX, does not create orders (see `checkout-flow.md`). |
| `app/routes/apps.sumup-pay.cart.return.jsx` | Same as above, for the cart flow. Also clears the Shopify cart client-side once the order exists. |
| `app/routes/api.sumup-webhook.jsx` | SumUp server-to-server callback (single-product flow). Re-verifies the checkout with SumUp's API, then runs `orderCreate`. See `webhook-flow.md`. |
| `app/routes/api.sumup-cart-webhook.jsx` | Same as above, for the cart flow. |

## Non-payment routes (Shopify app boilerplate, not part of this flow)

| Path | Role |
|---|---|
| `app/routes/_index/route.jsx` | Public landing/login page for the embedded admin app. |
| `app/routes/app.jsx`, `app/routes/app._index.jsx`, `app/routes/app.additional.jsx` | Embedded admin UI shell/pages (Shopify template boilerplate, unmodified). |
| `app/routes/auth.$.jsx`, `app/routes/auth.login/*` | Shopify OAuth flow (template boilerplate). |
| `app/routes/webhooks.app.uninstalled.jsx` | Mandatory Shopify compliance webhook: deletes the shop's `Session` rows. |
| `app/routes/webhooks.app.scopes_update.jsx` | Mandatory Shopify compliance webhook: updates stored scope. |

## Shopify webhook subscriptions actually registered (`shopify.app.toml`)

```
[[webhooks.subscriptions]]
uri = "/webhooks/app/uninstalled"
topics = [ "app/uninstalled" ]

[[webhooks.subscriptions]]
uri = "/webhooks/app/scopes_update"
topics = [ "app/scopes_update" ]
```

**VERIFIED IN CODE:** this repo registers only the two mandatory Shopify
compliance webhooks. It does **not** subscribe to `orders/*` Shopify
topics. It never receives a Shopify order webhook — it only *produces*
orders via the `orderCreate` GraphQL mutation. Whether the LE BON PLAN
monorepo separately subscribes to Shopify `orders/*` webhooks is NOT
VERIFIED HERE (out of this repo's scope, no access to that repo in this
audit).

## `extensions/`

Contains only `.gitkeep` — **VERIFIED IN CODE**: no Shopify theme app
extension or checkout UI extension ships from this repo. Whatever
storefront button/block/theme code calls these app-proxy routes is not
present in this repository.

## Tests / CI

Phase 2B found no test files anywhere in the repo. **Phase 2C added a
Vitest suite** (`vitest.config.js`, `npm test`): `app/sumup.server.test.js`,
`app/order-payload.server.test.js`, and route-level tests under
`app/test/routes/` (kept out of `app/routes/` itself — see `testing.md`
for why). There is still no `.github/` directory or other CI
configuration to run this suite automatically. See `testing.md` for the
full scenario matrix.
