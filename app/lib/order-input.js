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
/** The tag that ties a Shopify order back to its SumUp checkout reference —
 *  the cross-process idempotency key (survives a DB write failure). */
export const referenceTag = (reference) => `sumup-ref-${reference}`;

// Shopify's documented per-tag character limit. Tags are purely informational
// here (search/filter + the reconciliation tag above) — they must NEVER be
// able to block the creation of an already-charged order.
const MAX_TAG_LENGTH = 255;
const MAX_TAGS = 10; // generous ceiling; this app only ever proposes 2

/**
 * Turn a list of candidate tag strings into a deterministic, Shopify-safe
 * list: strips commas (the legacy comma-joined tag separator — a comma
 * *inside* one tag corrupts that representation), collapses whitespace,
 * trims, length-caps, drops blanks, de-duplicates (case-insensitive) and
 * count-caps. Never throws. An input that yields nothing usable simply
 * returns `[]` — the caller then omits `tags` entirely rather than risk
 * failing a paid order over a cosmetic field.
 */
export function sanitizeOrderTags(rawTags) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(rawTags) ? rawTags : []) {
    if (typeof raw !== "string") continue;
    const cleaned = raw
      .replace(/,/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TAG_LENGTH);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

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
  reference,
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

  const ref = str(reference);
  if (ref) {
    const tags = sanitizeOrderTags(["SumUp", referenceTag(ref)]);
    if (tags.length) order.tags = tags;
    order.note = `Paiement SumUp — réf. ${ref}`;
  }

  if (typeof taxesIncluded === "boolean") order.taxesIncluded = taxesIncluded;

  const ph = str(phone);
  if (ph) order.phone = ph;

  // Customer: `order.email` alone already creates/links a customer (this is
  // the fast flow's proven behaviour). Only attach an explicit
  // `OrderCreateCustomerInput` when the advanced checkout collected a name or
  // phone — and it must be wrapped in `toUpsert`
  // (OrderCreateUpsertCustomerAttributesInput); a flat { email, firstName }
  // is rejected by the schema before userErrors.
  const fn = str(firstName);
  const ln = str(lastName);
  if (fn || ln || ph) {
    const toUpsert = {};
    if (str(email)) toUpsert.email = str(email);
    if (fn) toUpsert.firstName = fn;
    if (ln) toUpsert.lastName = ln;
    if (ph) toUpsert.phone = ph;
    order.customer = { toUpsert };
  }

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
