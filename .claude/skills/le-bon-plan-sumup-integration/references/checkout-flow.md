# Storefront → SumUp checkout creation — VERIFIED IN CODE

Two independent, near-duplicate flows exist: single-product and cart.
Both are Shopify **app-proxy** actions (`authenticate.public.appProxy`),
meaning they are called by the storefront (theme/JS) through
`/apps/sumup-pay/...`, and Shopify signs/verifies the proxy request before
`admin`/`session` are made available.

## Single product — `app/routes/apps.sumup-pay.jsx` (action)

Input (`request.formData()`):
- `productId` — Shopify product ID (numeric or full `gid://...`).
- `email` — customer email, trimmed, validated against
  `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Empty/invalid → 400.

Steps:
1. Looks up the product's **first variant** via Admin GraphQL
   (`variants(first: 1)`) to read the live Shopify price — the storefront
   does not get to dictate the price.
2. Reads `SUMUP_API_KEY` / `SUMUP_MERCHANT_CODE` from env; 500 if missing.
3. Builds `checkoutReference = \`shopify-${productId}-${Date.now()}\`` (NOT
   a cryptographically unique value — see `idempotency.md` limits).
4. `POST https://api.sumup.com/v0.1/checkouts` with body:
   ```json
   {
     "checkout_reference": "shopify-<productId>-<ts>",
     "amount": <Number(price)>,
     "currency": "EUR",
     "merchant_code": "<SUMUP_MERCHANT_CODE>",
     "description": "<product.title>",
     "return_url": "https://sumup-integration-dwm1.onrender.com/api/sumup-webhook",
     "redirect_url": "https://lebonplan-ebook.com/apps/sumup-pay/return?reference=<checkoutReference>",
     "hosted_checkout": { "enabled": true }
   }
   ```
   **Currency is hardcoded to `"EUR"`** in this flow (not read from the
   shop), unlike the cart flow below.
5. On success, persists a `SumUpPayment` row (`checkoutId`,
   `checkoutReference`, `shop`, `productId`, `variantId`, `amount`,
   `currency`, `status: sumupData.status || "PENDING"`,
   `customerEmail: email`).
6. Responds `303` redirecting the browser to `sumupData.hosted_checkout_url`.

Note the SumUp API's own naming: `return_url` is the **server-to-server
webhook callback**, `redirect_url` is the **browser redirect** after
payment. This repo's code follows that naming; do not confuse the two.

## Cart — `app/routes/apps.sumup-pay.cart.jsx` (action)

Input (`request.formData()`):
- `cart` — JSON string, expected shape `{ items: [{ variant_id, quantity }, ...] }`.
- `email` — same validation as above.

Steps:
1. Parses `cart`; 400 if missing/invalid/empty `items`.
2. Batch-fetches **all** variants in one GraphQL `nodes(ids: ...)` query,
   plus `shop { currencyCode }` in the same query.
3. For every cart item, re-derives price/quantity **from the Shopify
   response**, not from client input: rejects (400) any item whose
   variant isn't found, whose quantity isn't a positive integer, or
   whose Shopify price isn't a finite non-negative number. Total is
   computed server-side in integer cents (`unitCents * quantity`),
   avoiding float drift.
4. `currency = variantsData.data?.shop?.currencyCode || "EUR"` — this flow
   **does** read the shop's real currency (unlike the single-product
   flow, which hardcodes `"EUR"`). This asymmetry is a real inconsistency
   between the two flows — **VERIFIED IN CODE**, not fixed here per the
   documentation-only scope of this audit.
5. `checkoutReference = \`cart-${Date.now()}\`` (same non-cryptographic
   uniqueness caveat as the single-product flow).
6. `POST https://api.sumup.com/v0.1/checkouts` with:
   ```json
   {
     "checkout_reference": "cart-<ts>",
     "amount": <totalCents/100>,
     "currency": "<shop currency or EUR>",
     "merchant_code": "<SUMUP_MERCHANT_CODE>",
     "description": "Panier Shopify - <n> article(s)",
     "return_url": "https://sumup-integration-dwm1.onrender.com/api/sumup-cart-webhook",
     "redirect_url": "https://lebonplan-ebook.com/apps/sumup-pay/cart/return?reference=<checkoutReference>",
     "hosted_checkout": { "enabled": true }
   }
   ```
7. Persists a `SumUpCartPayment` row with `items` as a JSON array of
   `{ variantId, productId, title, quantity, unitAmount }` (server-verified
   values, not raw client input).
8. `303` redirect to `hosted_checkout_url`.

## What is NOT in this repo

Whatever UI (button/block/theme snippet) builds the `cart` JSON and POSTs
to `/apps/sumup-pay/cart` is not part of this repository (`extensions/`
is empty). The exact payload shape the storefront sends for `cart.items`
is inferred here from what the server code reads (`variant_id`,
`quantity`) — the storefront-side code itself is NOT VERIFIED HERE.
