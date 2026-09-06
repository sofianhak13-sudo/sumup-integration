# SumUp storefront integration — Horizon

## Why this document exists

The SumUp buttons disappeared from the storefront when the shop switched its
published theme from **Streamline** to **Horizon**.

### Root cause

The storefront half of the integration (the `<form>` that posts the product /
cart to the `/apps/sumup-pay` app proxy) **was never in this repository**. It
was pasted directly into the **Streamline** theme through the Shopify theme
code editor. Git history confirms it: the only "storefront" commit
(`adaa2d8 — Connect storefront to SumUp`) added the *server* route
`app/routes/apps.sumup-pay.jsx` and nothing else. No `.liquid`, no theme app
extension, no snippet has ever been committed.

When the published theme changed to Horizon, that hand-added Liquid stayed
behind in the now-unpublished Streamline theme. Horizon has none of it, so the
button is gone. The backend (OAuth, DB, webhooks, order creation, price
verification) was never affected.

## The fix

A **theme app extension** (`extensions/sumup-payments/`) now ships the
storefront layer *from the app*, so it is version-controlled and installs on
any Online Store 2.0 theme (Horizon included) from the theme editor — no theme
code editing, nothing to lose on the next theme swap.

| File | Purpose |
| --- | --- |
| `blocks/product-button.liquid` | App block for the **product** template |
| `blocks/cart-button.liquid` | App block for the **cart** template |
| `assets/sumup-pay.js` | Theme-agnostic glue (variant/qty sync, cart fetch, states) |
| `assets/sumup-pay.css` | Styles scoped to `.sumup-pay-block` only |
| `shopify.extension.toml` | Extension manifest |
| `locales/*.json` | Editor strings (EN/FR) |

### How the storefront talks to the backend (unchanged contract)

* **Product:** `POST /apps/sumup-pay` with `productId`, `variantId`,
  `quantity`, `email`.
* **Cart:** `POST /apps/sumup-pay/cart` with `cart` (JSON `{items:[{variant_id,
  quantity}]}` from `/cart.js`) and `email`.

Both are native full-page form POSTs. The proxy replies `303` → hosted SumUp
checkout. The **server re-reads price and currency from Shopify** — the browser
cannot influence the amount charged.

### Theme-agnostic variant / quantity handling

`sumup-pay.js` does **not** rely on any Streamline/Horizon selector. It reads
the theme's own add-to-cart form (`form[action*="/cart/add"]`) and its native
`input[name="id"]` / `input[name="quantity"]` at submit time, and re-syncs on
`change`, on `variant:*` / `cart:*` events, and on `popstate`. Dynamic variant
switches are picked up with no page reload.

## Small backend change (required, justified)

The product proxy route previously hard-coded `variants(first: 1)` and
`quantity: 1`, so the selected variant and quantity **could not** be honoured
(a hard requirement of this mission). Minimal, storefront-facing changes:

* `app/routes/apps.sumup-pay.jsx` — resolve the posted `variantId` against the
  product's real variant list (fallback: first available), multiply by a
  clamped `quantity` (1–99), use the shop's `currencyCode` instead of a
  hard-coded `"EUR"` (same pattern the cart route already uses).
* `app/routes/api.sumup-webhook.jsx` — the Shopify order line item now uses the
  stored `quantity` instead of a literal `1`.
* `prisma/schema.prisma` — new `SumUpPayment.quantity Int @default(1)`
  (additive, backward compatible; see migration
  `20260906000000_add_product_payment_quantity`).

**Untouched:** SumUp OAuth, token storage/refresh, the SumUp client, webhook
verification / `PAID` check, idempotency & processing locks, Shopify order
creation logic, the cart route's pricing, the admin dashboard, Render/Postgres
setup.

## Deploy & install — see `EXTERNAL_ACTIONS_REQUIRED.md`
