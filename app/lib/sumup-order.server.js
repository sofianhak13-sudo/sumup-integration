/**
 * Shared order-finalisation helpers for both SumUp webhooks
 * (api.sumup-webhook.jsx = product, api.sumup-cart-webhook.jsx = cart / V2).
 *
 * Idempotency has three layers:
 *   1. `payment.orderId` set        -> never create again (checked by callers)
 *   2. atomic `processing` lock     -> at most one concurrent create
 *   3. the `sumup-ref-<reference>` order TAG -> if a create succeeded but the
 *      DB write of `orderId` failed, the next attempt finds the order by tag
 *      and adopts it instead of creating a second one.
 */

import { referenceTag } from "./order-input.js";

const ORDER_CREATE = `#graphql
  mutation SumUpOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        name
        displayFinancialStatus
        statusPageUrl
        confirmationNumber
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

const EXISTING_ORDER = `#graphql
  query SumUpExistingOrder($q: String!) {
    orders(first: 1, query: $q) {
      nodes { id name statusPageUrl }
    }
  }
`;

/** Look for an order already created for this SumUp reference (tag match). */
export async function findOrderByReference(admin, reference) {
  if (!reference) return null;
  try {
    const res = await admin.graphql(EXISTING_ORDER, {
      variables: { q: `tag:'${referenceTag(reference)}'` },
    });
    const data = await res.json();
    return data.data?.orders?.nodes?.[0] || null;
  } catch {
    return null;
  }
}

async function runOrderCreate(admin, orderInput, options) {
  const res = await admin.graphql(ORDER_CREATE, {
    variables: { order: orderInput, options },
  });
  const data = await res.json();
  const payload = data.data?.orderCreate;
  const order = payload?.order;
  const userErrors = payload?.userErrors || [];

  if (order?.id && userErrors.length === 0) {
    return { ok: true, order };
  }
  return { ok: false, userErrors, graphQLErrors: data.errors || [] };
}

/** True if a userError points at the (purely informational) `tags` field. */
function isTagsUserError(err) {
  const field = Array.isArray(err?.field) ? err.field.join(".").toLowerCase() : "";
  const message = String(err?.message || "").toLowerCase();
  return field.includes("tags") || message.includes("tags");
}

/**
 * Flatten Shopify userErrors into plain "<field.path>: <message>" strings —
 * `console.error({ userErrors })` truncates the nested `field` array to the
 * opaque "[Array]" past Node's default inspection depth (3+ levels deep:
 * object -> array -> object -> array). Always log THIS, not the raw objects.
 */
export function formatUserErrors(userErrors) {
  if (!Array.isArray(userErrors) || userErrors.length === 0) return [];
  return userErrors.map((e) => {
    const field = Array.isArray(e?.field) ? e.field.join(".") : String(e?.field ?? "");
    return `${field || "(no field)"}: ${e?.message ?? "(no message)"}`;
  });
}

/**
 * Create the Shopify order, distinguishing GraphQL top-level errors from
 * userErrors. Never returns `[]` as the only error signal.
 *
 * Tags are purely informational (search/filter + the `sumup-ref-*`
 * reconciliation tag) and must NEVER be able to block an already-charged
 * sale: Shopify's `orderCreate` occasionally rejects an otherwise-valid
 * `tags: [String!]` value with a "Tags is invalid" userError that even
 * Shopify support cannot always explain (undiagnosed platform-side
 * validation quirk — not a shape/type bug in this app: `tags` IS
 * `[String!]` on `OrderCreateOrderInput`, and the values here are short,
 * comma-free, deduplicated strings via `sanitizeOrderTags`). When that
 * specific field is rejected, retry ONCE with `tags` stripped — everything
 * else (email, line items, transaction amount, `note`) is unchanged, so the
 * order still carries the SumUp reference for manual reconciliation.
 *
 * @returns {{ ok: true, order: object } | { ok: false, userErrors: any[], graphQLErrors: any[] }}
 */
export async function createShopifyOrder(admin, orderInput, options) {
  const attempt = await runOrderCreate(admin, orderInput, options);
  if (attempt.ok) return attempt;

  const tagsRejected = "tags" in orderInput && attempt.userErrors.some(isTagsUserError);
  if (!tagsRejected) return attempt;

  console.warn("[SHOPIFY_ORDER_CREATE_TAGS_FALLBACK] retry sans tags :", formatUserErrors(attempt.userErrors));
  const orderWithoutTags = { ...orderInput };
  delete orderWithoutTags.tags;
  return runOrderCreate(admin, orderWithoutTags, options);
}
