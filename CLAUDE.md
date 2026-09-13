@AGENTS.md

# sumup-integration

This app implements the Shopify storefront → SumUp Hosted Checkout →
Shopify order half of a cross-repo payment flow for LE BON PLAN. The
other half (Purchase / OTP / claim / Entitlement / access) lives in the
`le-bon-plan-telegram-mini-app` monorepo and is out of scope here.

- **Code is the source of truth.** Verify claims about this payment flow
  against `app/routes/apps.sumup-pay*.jsx` and
  `app/routes/api.sumup-*-webhook.jsx` before repeating them.
- **This is a real payment path.** Never touch production Shopify data,
  SumUp data, webhooks, secrets, Render config, or deploys without
  explicit authorization for that specific action.
- **Idempotency is load-bearing** (`processing`/`orderId` compare-and-swap
  in `prisma/schema.prisma`). Don't change the webhook routes without
  reading `.claude/skills/le-bon-plan-sumup-integration/references/idempotency.md` first.
- **Never invent a webhook signature scheme.** SumUp's Checkout webhooks
  are unsigned by design (confirmed against SumUp's own docs) — the
  correct hardening is deepening the re-fetch-and-compare checks already
  in `app/sumup.server.js`, not adding a fake HMAC.
- A Vitest suite exists (`npm test`, plus `npm run lint`/`typecheck`/
  `build`) covering the webhook and checkout-creation routes. Run all four
  after any change here; there is still no CI wiring them in automatically.
- Full architecture map: `.claude/skills/le-bon-plan-sumup-integration/SKILL.md`.
