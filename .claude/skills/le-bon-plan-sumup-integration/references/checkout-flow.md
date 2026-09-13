# Storefront → SumUp checkout creation — VERIFIED IN CODE

Two independent, near-duplicate flows exist: single-product and cart.
Both are Shopify **app-proxy** actions (`authenticate.public.appProxy`),
meaning they are called by the storefront (theme/JS) through
`/apps/sumup-pay/...`, and Shopify signs/verifies the proxy request before
`admin`/`session` are made available.

## Single product — `app/routes/apps.sumup-pay.jsx` (action)

Input (`request.formData()`):
- `productId` — Shopify product ID (numeric or full `gid://...`).
- `variantId` — **optional**, added in Phase 2C (numeric or full
  `gid://shopify/ProductVariant/...`). Selects which of the product's
  variants to sell.
- `email` — customer email, trimmed, validated against
  `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Empty/invalid → 400.

Steps:
1. Fetches up to 100 of the product's variants via Admin GraphQL
   (`variants(first: 100)`) to read live Shopify prices — the storefront
   never dictates the price.
   - **Phase 2C fix:** before this phase, the route always used
     `variants(first: 1).nodes[0]` — the product's first variant,
     unconditionally, with no way for the caller to request a different
     one. For any product modeled as *one product, several variants*
     (e.g. two tiers/offers on the same product), that silently sold
     whichever variant Shopify returns first, regardless of what the
     customer actually picked. Now: if `variantId` is present in the
     form data, it must match one of the product's own variants (checked
     by `id`, not by trusting the caller's product/variant pairing
     blindly) — non-matching `variantId` → `400 "Variante Shopify
     invalide pour ce produit."`, no checkout created. If `variantId` is
     absent, behavior is unchanged (first variant), so existing storefront
     callers that never sent one keep working exactly as before. Covered
     by `app/test/routes/apps.sumup-pay.test.js`.
2. Reads `SUMUP_API_KEY` / `SUMUP_MERCHANT_CODE` via
   `getSumUpCredentials()` (`app/sumup.server.js`); 500 if missing.
3. Builds `checkoutReference = \`shopify-${productId}-${Date.now()}\`` (NOT
   a cryptographically unique value — see `idempotency.md` limits).
4. `POST https://api.sumup.com/v0.1/checkouts` (via `sumupFetch()`, which
   adds the Bearer header and a 10s timeout — see `security.md`) with
   body:
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
   **Currency is still hardcoded to `"EUR"`** in this flow (not read from
   the shop), unlike the cart flow below — this asymmetry was identified
   in Phase 2B and is **out of scope for Phase 2C** (that phase's mandate
   was webhook security + product/tier mapping specifically; see
   `testing.md`/final report for this as a remaining gap).
5. On success, persists a `SumUpPayment` row (`checkoutId`,
   `checkoutReference`, `shop`, `productId`, `variantId`, `amount`,
   `currency`, `status: sumupData.status || "PENDING"`,
   `customerEmail: email`) — `variantId` is now whichever variant was
   actually resolved in step 1, not always the first one.
6. Responds `303` redirecting the browser to `sumupData.hosted_checkout_url`.
   A thrown/aborted `sumupFetch()` call (network error or timeout) is now
   caught and answered as a controlled `500`, not an unhandled rejection.

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
6. `POST https://api.sumup.com/v0.1/checkouts` (via `sumupFetch()`, same
   Bearer + 10s timeout as the single-product flow) with:
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
   values, not raw client input). This flow already supported an arbitrary
   `variant_id` per cart line before Phase 2C — the variant-selection fix
   above only applied to the single-product flow, which had no per-item
   input at all.
8. `303` redirect to `hosted_checkout_url`. A thrown/aborted `sumupFetch()`
   call is caught and answered as a controlled `500`.

## What is NOT in this repo

Whatever UI (button/block/theme snippet) builds the `cart` JSON and POSTs
to `/apps/sumup-pay/cart` is not part of this repository (`extensions/`
is empty). The exact payload shape the storefront sends for `cart.items`
is inferred here from what the server code reads (`variant_id`,
`quantity`) — the storefront-side code itself is NOT VERIFIED HERE.
