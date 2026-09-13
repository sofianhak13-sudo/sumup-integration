# Test coverage — VERIFIED IN CODE: there is none

`find . -iname "*test*"` (excluding `node_modules`/`.git`) and
`find .github -type f` both return nothing. There is no unit, integration,
e2e, or webhook test anywhere in this repository, and no CI configuration
to run any such test even if one existed.

## Scenario matrix

| Scenario | Covered | Test file |
|---|---|---|
| Checkout created (single product) | Not covered | — |
| Checkout created (cart) | Not covered | — |
| Webhook: PAID → order created | Not covered | — |
| Webhook: PENDING → no order | Not covered | — |
| Webhook: FAILED/EXPIRED → no order | Not covered | — |
| Duplicate webhook delivery (idempotency) | Not covered | — |
| Shopify `orderCreate` userErrors | Not covered | — |
| Shopify GraphQL network error/timeout | Not covered | — |
| Retry after a failed `orderCreate` | Not covered | — |
| Unknown/invalid product or variant | Not covered | — |
| Missing/invalid email | Not covered | — |
| Reference/amount/currency mismatch | Not covered | — |
| "Classique" vs "Premium" product mapping | Not covered — no such logic exists in this repo at all (see `SKILL.md`) | — |

## Practical implication for any change in this repo

Every one of the scenarios above is currently verified only by reading the
code, never by an automated run. When you change anything in
`app/routes/apps.sumup-pay*.jsx` or `app/routes/api.sumup-*-webhook.jsx`,
say explicitly in your summary that it was validated by manual tracing
(and ideally by a real Shopify dev-store + SumUp sandbox run if one is
available), not by tests — because none exist to give false confidence.
