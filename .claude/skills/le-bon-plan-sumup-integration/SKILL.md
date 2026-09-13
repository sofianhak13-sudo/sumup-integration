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
- There is no automated test suite in this repo (verified: no `*test*`
  files, no `.github/` CI). If you change behavior, say explicitly that
  it was validated by manual code tracing, not by tests.

## Map of references

- `references/architecture.md` — repo map: entrypoints, routes, models.
- `references/checkout-flow.md` — Shopify storefront → SumUp checkout creation (single-product and cart flows).
- `references/webhook-flow.md` — SumUp webhook handling, re-verification, return routes.
- `references/shopify-order.md` — the `orderCreate` mutation and its payload.
- `references/idempotency.md` — the anti-duplicate-order mechanism and its proof.
- `references/security.md` — signature/HMAC posture, secrets, logging.
- `references/testing.md` — actual test coverage (currently none) and the scenario matrix.
- `references/cross-repo-contract.md` — the data contract with the LE BON PLAN monorepo, and what this repo does NOT own.

## What this repo does NOT own

- Purchase / OTP / claim / Entitlement / accessLevel / UI unlock — all of
  that is LE BON PLAN monorepo territory, not verified or documented here.
- Product mapping for "Classique" vs "Premium" tiers is **not implemented
  in this repo**: the checkout routes accept whatever `productId` /
  `variant_id` the caller (Shopify theme / storefront) sends, with no
  tier-specific branching found in `app/routes/`. If a Classique/Premium
  distinction exists, it lives in the Shopify theme (this repo's
  `extensions/` directory is empty — only a `.gitkeep`) or in the monorepo.
  Treat any claim otherwise as HISTORICAL CLAIM — NEEDS CONFIRMATION.
