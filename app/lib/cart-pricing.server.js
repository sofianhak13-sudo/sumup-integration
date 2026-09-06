/**
 * Pure helpers for the SumUp cart payment flow.
 *
 * The browser never sets a price: the Storefront Cart API (Shopify) recomputes
 * the cart with every discount applied, and these helpers turn that response
 * into the exact amount SumUp must charge — plus an audit trail.
 */

export const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const toCents = (value) => Math.round(money(value) * 100);

/**
 * Catalog subtotal, in cents: the sum the Shopify order line items will add up
 * to (each priced at `catalogUnitAmount`). The order's fixed discount is then
 * `catalogSubtotalCents - amountChargedCents`, which guarantees
 * order total == amount charged by SumUp.
 *
 * @param {Array<{catalogUnitAmount: number|string, quantity: number}>} items
 */
export const catalogSubtotalCents = (items) =>
  (items || []).reduce(
    (sum, item) => sum + toCents(item.catalogUnitAmount) * Number(item.quantity),
    0,
  );

/**
 * Total discount, in cents, applied to a Storefront cart — cart/order-level
 * allocations plus every line-level allocation. Falls back to
 * (subtotal - total) when Shopify returns no explicit allocations.
 *
 * @param {object} cart - the `cartCreate.cart` payload
 * @returns {number} discount amount in cents (>= 0)
 */
export const discountCentsFromCart = (cart) => {
  if (!cart || !cart.cost) return 0;

  let cents = 0;
  for (const alloc of cart.discountAllocations || []) {
    cents += toCents(alloc?.discountedAmount?.amount);
  }
  for (const line of cart.lines?.nodes || []) {
    for (const alloc of line.discountAllocations || []) {
      cents += toCents(alloc?.discountedAmount?.amount);
    }
  }

  if (cents === 0) {
    const subtotal = money(cart.cost.subtotalAmount?.amount);
    const total = money(cart.cost.totalAmount?.amount);
    if (subtotal > total) cents = toCents(subtotal - total);
  }

  return Math.max(0, cents);
};

/**
 * True when the browser's *indicative* cart total disagrees with the
 * server-computed total by more than one cent (rounding tolerance).
 * When true, the flow must stop instead of charging a surprising amount.
 *
 * @param {number} serverCents
 * @param {number} indicativeCents - may be NaN when the browser sent nothing
 */
export const totalsDiverge = (serverCents, indicativeCents) => {
  if (!Number.isFinite(indicativeCents)) return false;
  return Math.abs(serverCents - indicativeCents) > 1;
};

/**
 * Every submitted discount code must come back from Shopify as applicable.
 * Returns the first code Shopify rejected, or null when all are fine.
 *
 * @param {string[]} submittedCodes
 * @param {Array<{code?: string, applicable?: boolean}>} returnedCodes
 */
export const firstRejectedCode = (submittedCodes, returnedCodes) => {
  const returned = returnedCodes || [];
  for (const code of submittedCodes || []) {
    const match = returned.find(
      (c) => c?.code?.toLowerCase() === String(code).toLowerCase(),
    );
    if (!match || match.applicable === false) return code;
  }
  return null;
};

/**
 * Parse the browser's discount-code hint (a JSON array string) defensively.
 * @returns {string[]} at most 10 trimmed, non-empty codes
 */
export const parseDiscountCodesHint = (raw) => {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => typeof c === "string" && c.trim())
      .map((c) => c.trim())
      .slice(0, 10);
  } catch {
    return [];
  }
};

/**
 * Parse the browser's cart-attributes hint (a JSON array of {key,value}).
 * Passed straight to Shopify's cartCreate so discount functions that key off
 * cart attributes (affiliate / referral apps) behave as they do at checkout.
 * @returns {Array<{key: string, value: string}>} at most 25 entries
 */
export const parseCartAttributes = (raw) => {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a) =>
          a &&
          typeof a.key === "string" &&
          a.key.length > 0 &&
          a.key.length <= 100,
      )
      .map((a) => ({ key: a.key, value: String(a.value ?? "").slice(0, 5000) }))
      .slice(0, 25);
  } catch {
    return [];
  }
};
