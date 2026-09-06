/**
 * Pure financial engine for the checkout (fast and advanced).
 *
 * Shopify stays the source of truth: every number below is derived from the
 * Storefront Cart API `cart.cost` (lines + discount codes + automatic
 * discounts + cart attributes + — in advanced mode — a delivery address and a
 * selected delivery option). The browser never sets a price.
 *
 * Invariant enforced by `reconcileOrder`:
 *   server total  ==  SumUp amount  ==  amount PAID  ==  Shopify order total
 * to the cent.
 */

export const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const toCents = (value) => Math.round(money(value) * 100);
export const fromCents = (cents) => Math.round(cents) / 100;

/**
 * Break a Storefront `cart.cost` down into display lines, in cents.
 * @param {object} cart the `cartCreate.cart` (or updated cart) payload
 * @param {number} catalogSubtotalCents Σ catalog price × qty (Admin API)
 */
export function breakdownFromCart(cart, catalogSubtotalCents) {
  const cost = cart?.cost || {};
  const currencyCode =
    cost.totalAmount?.currencyCode ||
    cost.subtotalAmount?.currencyCode ||
    "EUR";

  const storefrontSubtotalCents = toCents(cost.subtotalAmount?.amount);
  const totalCents = toCents(cost.totalAmount?.amount);
  const taxCents = toCents(cost.totalTaxAmount?.amount);
  const dutyCents = toCents(cost.totalDutyAmount?.amount);

  // Delivery: prefer an explicitly selected option; fall back to
  // checkoutChargeAmount − subtotal when Shopify only gives the rolled-up cost.
  let shippingCents = 0;
  const groups = cart?.deliveryGroups?.nodes || cart?.deliveryGroups || [];
  for (const g of groups) {
    const sel = g?.selectedDeliveryOption;
    if (sel?.estimatedCost?.amount != null) {
      shippingCents += toCents(sel.estimatedCost.amount);
    }
  }

  const catalog = Math.max(0, Math.round(catalogSubtotalCents || 0));
  // Discount = what Shopify knocked off the catalogue price of the goods.
  // (catalog − (total − shipping − tax-that-is-not-in-catalog)). For a
  // tax-included shop catalog already contains tax, so:
  //   goodsAfterDiscount = total − shipping
  const goodsAfterDiscountCents = Math.max(0, totalCents - shippingCents);
  const discountCents = Math.max(0, catalog - goodsAfterDiscountCents);

  return {
    currencyCode,
    catalogSubtotalCents: catalog,
    storefrontSubtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    dutyCents,
    totalCents,
  };
}

/**
 * Decide the exact amount SumUp must charge and the order math that makes the
 * Shopify order total identical to it.
 *
 * Strategy (unchanged from V1, extended for shipping): the order bills its
 * line items at catalogue price, adds the real shipping line, then applies a
 * single order-wide fixed discount so that:
 *   catalogSubtotal − orderDiscount + shipping == amountCharged
 *
 * @returns {{
 *   ok: boolean, reason?: string,
 *   amountChargedCents: number, orderDiscountCents: number,
 *   shippingCents: number, currencyCode: string
 * }}
 */
export function reconcileOrder(breakdown, { toleranceCents = 1 } = {}) {
  const {
    catalogSubtotalCents,
    shippingCents,
    totalCents,
    currencyCode,
  } = breakdown;

  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    return { ok: false, reason: "total_invalid", amountChargedCents: 0, orderDiscountCents: 0, shippingCents, currencyCode };
  }

  const goodsAfterDiscountCents = totalCents - shippingCents;

  // Shopify's post-discount goods price is ABOVE the catalogue sum by more
  // than a rounding cent → a surcharge / market price we can't model as an
  // order discount. Fail closed.
  if (goodsAfterDiscountCents - catalogSubtotalCents > toleranceCents) {
    return {
      ok: false,
      reason: "total_above_catalog",
      amountChargedCents: 0,
      orderDiscountCents: 0,
      shippingCents,
      currencyCode,
    };
  }

  const orderDiscountCents = Math.max(0, catalogSubtotalCents - goodsAfterDiscountCents);
  // amountCharged rebuilt from the order math so the equality is by construction.
  const amountChargedCents = catalogSubtotalCents - orderDiscountCents + shippingCents;

  if (Math.abs(amountChargedCents - totalCents) > toleranceCents) {
    return {
      ok: false,
      reason: "reconcile_drift",
      amountChargedCents: 0,
      orderDiscountCents: 0,
      shippingCents,
      currencyCode,
    };
  }

  return {
    ok: true,
    amountChargedCents,
    orderDiscountCents,
    shippingCents,
    currencyCode,
  };
}

/**
 * True when the browser's indicative total disagrees with the server total by
 * more than the tolerance. NaN indicative (nothing sent) never diverges.
 */
export function totalsDiverge(serverCents, indicativeCents, toleranceCents = 1) {
  if (!Number.isFinite(indicativeCents)) return false;
  return Math.abs(serverCents - indicativeCents) > toleranceCents;
}
