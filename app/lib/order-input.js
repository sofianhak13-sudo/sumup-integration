/**
 * Pure builder for the `orderCreate` input, shared by the fast and advanced
 * flows and both webhooks. Every money value comes from the server-side
 * finance engine (checkout-totals.js); nothing here trusts the browser.
 *
 * Order math (so order total == amount charged == amount PAID):
 *   line items billed at catalogue price
 *   − one order-wide fixed discount (`orderDiscountCents`)
 *   + one shipping line (`shippingCents`, 0 when there is none)
 */

const money = (cents, currency) => ({
  shopMoney: { amount: (Math.round(cents) / 100).toFixed(2), currencyCode: currency },
});

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Turn a stored/validated address object into a Shopify MailingAddressInput. */
export function toMailingAddress(a) {
  if (!a || typeof a !== "object") return null;
  const out = {};
  const map = {
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    address1: a.address1,
    address2: a.address2,
    city: a.city,
    zip: a.zip,
    phone: a.phone,
  };
  for (const [k, v] of Object.entries(map)) {
    const s = str(v);
    if (s) out[k] = s;
  }
  const cc = str(a.countryCode);
  if (cc && /^[A-Za-z]{2}$/.test(cc)) out.countryCode = cc.toUpperCase();
  const pc = str(a.provinceCode) || str(a.province);
  if (pc) out.provinceCode = pc;
  return Object.keys(out).length ? out : null;
}

/**
 * @returns {{ order: object, options: object }}
 */
export function buildOrderInput({
  email,
  phone,
  firstName,
  lastName,
  currency,
  lineItems,
  amountChargedCents,
  orderDiscountCents = 0,
  shippingCents = 0,
  shippingMethod = null,
  shippingAddress = null,
  billingAddress = null,
  discountCodes = [],
  taxesIncluded,
  sendReceipt = true,
}) {
  const cur = currency || "EUR";

  const order = {
    email: str(email) || undefined,
    currency: cur,
    lineItems: (lineItems || []).map((li) => ({
      variantId: li.variantId,
      quantity: Number(li.quantity),
    })),
    transactions: [
      {
        kind: "SALE",
        status: "SUCCESS",
        gateway: "SumUp",
        amountSet: money(amountChargedCents, cur),
      },
    ],
  };

  if (typeof taxesIncluded === "boolean") order.taxesIncluded = taxesIncluded;

  const ph = str(phone);
  if (ph) order.phone = ph;

  // `OrderCreateCustomerInput` upserts a customer (Shopify de-dupes on email).
  // Only attach it when we actually collected identifying data.
  const fn = str(firstName);
  const ln = str(lastName);
  const customer = {};
  if (str(email)) customer.email = str(email);
  if (fn) customer.firstName = fn;
  if (ln) customer.lastName = ln;
  if (ph) customer.phone = ph;
  if (Object.keys(customer).length) order.customer = customer;

  const ship = toMailingAddress(shippingAddress);
  if (ship) order.shippingAddress = ship;
  const bill = toMailingAddress(billingAddress) || ship;
  if (bill) order.billingAddress = bill;

  if (Math.round(orderDiscountCents) > 0) {
    const codes = (discountCodes || []).filter(Boolean);
    order.discountCode = {
      itemFixedDiscountCode: {
        code: codes.length ? codes.join(" + ") : "Remise",
        amountSet: money(orderDiscountCents, cur),
      },
    };
  }

  if (Math.round(shippingCents) > 0 || shippingMethod) {
    order.shippingLines = [
      {
        title: str(shippingMethod?.title) || "Livraison",
        code: str(shippingMethod?.code) || str(shippingMethod?.handle) || "sumup-checkout",
        priceSet: money(Math.max(0, Math.round(shippingCents)), cur),
      },
    ];
  }

  return { order, options: { sendReceipt: Boolean(sendReceipt) } };
}
