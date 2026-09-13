---
name: le-bon-plan-sumup-integration
description: Architecture reference for this repo's Shopify storefront → SumUp Hosted Checkout → Shopify order flow. Use before touching any file under app/routes/apps.sumup-pay* or app/routes/api.sumup-*-webhook.jsx, before answering questions about checkout/webhook/idempotency/email/order-creation behavior in this repo, or before proposing changes to what this repo sends to the LE BON PLAN monorepo.
---

# LE BON PLAN × SumUp integration (this repo)

This repo (`sumup-integration`) is a Shopify app whose only job is to move
money and produce a Shopify order. It is one half of a cross-repo payment
flow; the other half (Purchase / OTP / Entitlement / access) lives in the
`le-bon-plan-telegram-mini-app` monorepo and is **out of scope for this
repo and this Skill**.

## Ground rule: code is the source of truth

Every claim in `references/` below is tagged:

- **VERIFIED IN CODE** — traced to a specific file/line in this tree.
- **NOT VERIFIED** — plausible but not confirmed here.
- **HISTORICAL CLAIM — NEEDS CONFIRMATION** — something referenced from
  outside this session (prior conversation, ticket, memory) that has no
  corresponding evidence in this tree as of the last audit.

Do not upgrade a NOT VERIFIED / HISTORICAL claim to VERIFIED without
re-reading the actual file. Do not repeat historical claims as fact.

## Payment safety rules

- This is a real payment path (real SumUp checkouts, real Shopify orders).
  Never modify payment behavior, Shopify data, SumUp data, webhooks,
  secrets, Render config, or deploy anything without explicit user
  authorization for that specific action.
- Never print `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE`,
  `SHOPIFY_ADMIN_ACCESS_TOKEN` (session `accessToken` in Prisma),
  `SHOPIFY_API_SECRET`, `DATABASE_URL`, or the contents of any `.env`
  file. Variable *names* are fine to document; values are not.
- Any change near `app/routes/api.sumup-webhook.jsx` or
  `app/routes/api.sumup-cart-webhook.jsx` must preserve the
  `processing` / `orderId` compare-and-swap described in
  `references/idempotency.md`. Read that file first.
- **Never invent a webhook signature scheme.** SumUp's Checkout product
  webhooks are unsigned by design (confirmed against SumUp's own developer
  docs in Phase 2C — see `references/security.md`); the only legitimate
  hardening is deepening the re-fetch-and-compare checks already in
  `app/sumup.server.js`, not adding an HMAC that doesn't exist.
- A Vitest suite exists since Phase 2C (`npm test`) covering the webhook
  routes, the checkout-creation routes' variant selection, and the shared
  `app/sumup.server.js`/`app/order-payload.server.js` helpers — there is
  still no `.github/` CI wiring it in automatically. Run `npm test`,
  `npm run lint`, `npm run typecheck`, and `npm run build` after any
  change in this area; see `references/testing.md`.

## Map of references

- `references/architecture.md` — repo map: entrypoints, routes, models.
- `references/checkout-flow.md` — Shopify storefront → SumUp checkout creation (single-product and cart flows).
- `references/webhook-flow.md` — SumUp webhook handling, re-verification, return routes.
- `references/shopify-order.md` — the `orderCreate` mutation and its payload.
- `references/idempotency.md` — the anti-duplicate-order mechanism and its proof.
- `references/security.md` — signature/HMAC posture, secrets, logging.
- `references/testing.md` — the Vitest suite added in Phase 2C and the scenario matrix.
- `references/cross-repo-contract.md` — the data contract with the LE BON PLAN monorepo, and what this repo does NOT own.

## What this repo does NOT own

- Purchase / OTP / claim / Entitlement / accessLevel / UI unlock — all of
  that is LE BON PLAN monorepo territory, not verified or documented here.
- **Semantic** product mapping for "Classique" vs "Premium" tiers is
  **not implemented in this repo** and Phase 2C did not add one: no real
  Shopify product/variant IDs for either tier are known here, and
  inventing them would violate the "don't invent values" rule. What
  Phase 2C did fix is narrower and mechanical — the single-product
  checkout route used to always take the product's *first* variant no
  matter what was requested; it now honors an explicit `variantId` when
  one is given (see `references/checkout-flow.md`). This guarantees
  whichever variant a caller actually asks for is the one that reaches
  the Shopify order — it does not mean this repo knows or decides which
  variant "is" CLASSIQUE or PREMIUM. If a Classique/Premium distinction
  exists, it lives in the Shopify theme (this repo's `extensions/`
  directory is empty — only a `.gitkeep`) or in the monorepo — attempted
  read-only access to `le-bon-plan-telegram-mini-app` and
  `le-bon-plan-member-backend` in Phase 2C was not possible in that
  session (see `references/cross-repo-contract.md`), so this is still
  **NOT VERIFIED HERE**, not HISTORICAL CLAIM — NEEDS CONFIRMATION (that
  tag applies to claims sourced from outside this session; this one is
  simply unconfirmed due to a tooling limit).
