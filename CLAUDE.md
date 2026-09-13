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
- **No automated tests exist in this repo.** Validate changes by manual
  code tracing and say so explicitly.
- Full architecture map: `.claude/skills/le-bon-plan-sumup-integration/SKILL.md`.
