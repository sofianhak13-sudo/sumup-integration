# Cross-repo contract: sumup-integration → LE BON PLAN

This audit had access only to `sumup-integration`. Nothing below about
the `le-bon-plan-telegram-mini-app` monorepo's internals is verified by
this audit — it is marked **NOT VERIFIED HERE** throughout, and should
only be upgraded to "VERIFIED IN OTHER REPOSITORY" by someone who has
actually read that repo's code and can cite it.

## Responsibility split (as evidenced by this repo alone)

**`sumup-integration` owns, VERIFIED IN CODE:**
- Creating the SumUp Hosted Checkout (single-product and cart flows).
- Verifying a checkout is genuinely `PAID` (by re-fetching from SumUp,
  never trusting the webhook body).
- Creating the Shopify order (`orderCreate`) once, with idempotency.
- Storing the mapping of `checkoutId → orderId` and the original
  customer-submitted email, in its own Postgres DB
  (`SumUpPayment`/`SumUpCartPayment`).
- Triggering Shopify's own order-confirmation email (`sendReceipt: true`).

**`sumup-integration` does NOT own, VERIFIED IN CODE (absent here):**
- Any Purchase/Entitlement/OTP/claim/accessLevel logic — no such code
  exists in this repo.
- Receiving Shopify `orders/*` webhooks — this repo only subscribes to
  `app/uninstalled` and `app/scopes_update` (see `architecture.md`). If
  the monorepo needs to know about a new order, it must get it some other
  way (its own Shopify webhook subscription, polling the Shopify Admin
  API, or something else) — **NOT VERIFIED HERE**.
- Product tier mapping (Classique/Premium) — no such branching exists in
  this repo's routes.
- The Shopify theme / storefront UI that calls these app-proxy routes —
  `extensions/` in this repo is empty.

## What this repo actually hands off, and how

The only thing this repo produces that could reach the LE BON PLAN
monorepo is **whatever the Shopify order itself carries**, since this
repo does not call any LE BON PLAN API, queue, or webhook directly —
**VERIFIED IN CODE**: there is no outbound HTTP call anywhere in
`app/routes/` other than to `api.sumup.com` and the Shopify Admin GraphQL
API. There is no reference to any `lebonplan`/`le-bon-plan` backend
endpoint, only to `https://lebonplan-ebook.com` as the **customer-facing
redirect domain** (the storefront itself), not an API.

This means the cross-repo handoff is **implicit**: it happens through the
Shopify order Shopify creates, which the monorepo must independently pick
up. What that order actually contains, field by field:

| Field | Produced by | Format | Required for order creation? | Notes |
|---|---|---|---|---|
| `email` | Customer-submitted at checkout-initiation (`email` form field), re-validated at webhook time | trimmed string, regex-validated | Yes — `orderCreate` always sets it | **Never taken from SumUp.** SumUp's checkout API is not given an email in this integration (see `checkout-flow.md` — no `customer` field in the SumUp payload). The email that ends up on the Shopify order is exactly what the browser submitted to this app's proxy route, unchanged except for `.trim()`. No casing normalization (`toLowerCase()`) is applied anywhere — **VERIFIED IN CODE**: neither webhook route lowercases the stored email before using it as `order.email`. |
| Shopify `order.id` / `order.name` | `orderCreate` response | Shopify GID / order name string | Produced, not input | Stored back on the payment row (`orderId`, not `orderName`). |
| `variantId` (single product) | `productId` submitted by caller, resolved to its first variant server-side | Shopify GID | Yes | Single-product flow always uses `variants(first: 1)` — multi-variant products are not disambiguated by this route. |
| `variantId` (cart) | Cart items submitted by caller, resolved/priced server-side | Shopify GID per item | Yes | |
| `quantity` | Submitted (cart) or hardcoded `1` (single product) | integer | Yes | |
| `amount` / `currency` | Shopify's own live price (product) or computed cart total (cart flow, in the shop's real currency) | number / ISO currency code | Yes, via `transactions[].amountSet` | Single-product flow **hardcodes `EUR`** regardless of shop currency (see `checkout-flow.md`); cart flow reads `shop.currencyCode`. |
| `checkout.status === "PAID"` | SumUp, re-verified live | string enum | Gates whether an order is created at all | Never bypassed. |
| `tags`, `note`, custom attributes | — | — | Not produced | Absent from both `orderCreate` calls; if the monorepo expects to find product-tier info or a purchase reference in order tags/attributes, that expectation does not match this repo's current code. |

## For the monorepo to turn a Shopify order into Purchase/Entitlement

Based purely on what this repo actually creates, the minimum identifying
data available on the resulting Shopify order is: the order's own
Shopify ID/name, the line items (variant IDs + quantities), the order
`email`, and the transaction/amount/currency. There is no purchase
reference, product-tier tag, or app-specific metadata attached by this
repo. Whatever mechanism the monorepo uses to fetch/claim that order
(webhook subscription, polling, admin API query) and however it maps
variant IDs to Classique/Premium tiers is **NOT VERIFIED HERE** — confirm
directly in that repo before documenting it as fact.

## Sending updates back to the central Skill

See the "CENTRAL SKILL UPDATE RECOMMENDATION" section of the Phase 2B
final report (delivered in-conversation, not duplicated as a file here)
for the specific, verified facts that should be considered for inclusion
in `le-bon-plan-telegram-mini-app/.claude/skills/le-bon-plan-shopify-sumup/`
in a future PR against that repo. This repo's Skill is the source of
truth for the `sumup-integration` side; do not fork a second copy of this
same content into the monorepo — link/summarize instead.
