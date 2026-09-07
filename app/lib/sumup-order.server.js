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

/**
 * Create the Shopify order, distinguishing GraphQL top-level errors from
 * userErrors. Never returns `[]` as the only error signal.
 *
 * @returns {{ ok: true, order: object } | { ok: false, userErrors: any[], graphQLErrors: any[] }}
 */
export async function createShopifyOrder(admin, orderInput, options) {
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
