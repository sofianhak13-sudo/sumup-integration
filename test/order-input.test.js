import { test } from "node:test";
import assert from "node:assert/strict";

import { buildOrderInput, toMailingAddress } from "../app/lib/order-input.js";

const baseLines = [{ variantId: "gid://shopify/ProductVariant/1", quantity: 2 }];

// No `order.customer` key may ever be a flat { email, firstName, ... } — the
// schema only accepts { toUpsert: {...} } or { toAssociate: {...} }.
function assertCustomerShape(order) {
  if (!("customer" in order)) return;
  const keys = Object.keys(order.customer);
  assert.deepEqual(keys, ["toUpsert"], `order.customer must be { toUpsert }, got ${keys}`);
}

test("fast flow (email only): order.email set, no order.customer block", () => {
  const { order, options } = buildOrderInput({
    email: "a@b.co",
    currency: "EUR",
    lineItems: baseLines,
    amountChargedCents: 5980,
    taxesIncluded: true,
  });
  assert.equal(order.email, "a@b.co");
  assert.equal(order.taxesIncluded, true);
  assert.equal(order.transactions[0].amountSet.shopMoney.amount, "59.80");
  assert.equal(order.transactions[0].gateway, "SumUp");
  assert.ok(!order.shippingAddress);
  assert.ok(!order.shippingLines);
  assert.ok(!order.discountCode);
  assert.ok(!("customer" in order), "email-only must not send order.customer");
  assert.deepEqual(options, { sendReceipt: true });
});

test("advanced flow (email + name): customer.toUpsert with only present fields", () => {
  const { order } = buildOrderInput({
    email: "jean@example.com",
    firstName: "Jean",
    lastName: "Dupont",
    currency: "EUR",
    lineItems: baseLines,
    amountChargedCents: 5980,
  });
  assertCustomerShape(order);
  assert.deepEqual(order.customer.toUpsert, {
    email: "jean@example.com",
    firstName: "Jean",
    lastName: "Dupont",
  });
  assert.equal(order.email, "jean@example.com"); // order.email still used
});

test("advanced flow (phone only, no name): phone lands in toUpsert", () => {
  const { order } = buildOrderInput({
    email: "a@b.co",
    phone: "+33612345678",
    currency: "EUR",
    lineItems: baseLines,
    amountChargedCents: 1000,
  });
  assertCustomerShape(order);
  assert.deepEqual(order.customer.toUpsert, { email: "a@b.co", phone: "+33612345678" });
  assert.equal(order.phone, "+33612345678");
});

test("advanced flow: discount + shipping + addresses + customer together", () => {
  const { order } = buildOrderInput({
    email: "jean@example.com",
    phone: "+33612345678",
    firstName: "Jean",
    lastName: "Dupont",
    currency: "EUR",
    lineItems: baseLines,
    amountChargedCents: 5480,
    orderDiscountCents: 1000,
    shippingCents: 500,
    shippingMethod: { title: "Colissimo", code: "colissimo" },
    shippingAddress: {
      firstName: "Jean",
      lastName: "Dupont",
      address1: "10 rue de Paris",
      zip: "75001",
      city: "Paris",
      countryCode: "fr",
    },
    discountCodes: ["PROMO10"],
    taxesIncluded: true,
  });

  assertCustomerShape(order);
  assert.equal(order.customer.toUpsert.firstName, "Jean");
  assert.equal(order.customer.toUpsert.phone, "+33612345678");
  assert.equal(order.shippingAddress.countryCode, "FR");
  assert.equal(order.shippingAddress.address1, "10 rue de Paris");
  assert.equal(order.billingAddress.zip, "75001"); // billing falls back to shipping
  assert.equal(order.discountCode.itemFixedDiscountCode.code, "PROMO10");
  assert.equal(order.discountCode.itemFixedDiscountCode.amountSet.shopMoney.amount, "10.00");
  assert.equal(order.shippingLines[0].title, "Colissimo");
  assert.equal(order.shippingLines[0].priceSet.shopMoney.amount, "5.00");
});

test("no optional fields => no undefined/null leaks in order", () => {
  const { order } = buildOrderInput({
    email: "a@b.co",
    currency: "EUR",
    lineItems: baseLines,
    amountChargedCents: 5980,
  });
  for (const [k, v] of Object.entries(order)) {
    assert.ok(v !== undefined && v !== null, `order.${k} is ${v}`);
  }
  assert.ok(!("phone" in order));
  assert.ok(!("customer" in order));
  assert.ok(!("shippingAddress" in order));
  assert.ok(!("shippingLines" in order));
  assert.ok(!("discountCode" in order));
});

test("distinct billing address is kept", () => {
  const { order } = buildOrderInput({
    email: "a@b.co",
    currency: "EUR",
    lineItems: baseLines,
    amountChargedCents: 1000,
    shippingAddress: { firstName: "A", lastName: "B", address1: "1", zip: "1", city: "X", countryCode: "FR" },
    billingAddress: { firstName: "C", lastName: "D", address1: "2", zip: "2", city: "Y", countryCode: "DE" },
  });
  assert.equal(order.shippingAddress.countryCode, "FR");
  assert.equal(order.billingAddress.countryCode, "DE");
});

test("no discount => no discountCode block; total/amount unchanged", () => {
  const { order } = buildOrderInput({
    email: "a@b.co",
    currency: "EUR",
    lineItems: baseLines,
    amountChargedCents: 5980,
    orderDiscountCents: 0,
  });
  assert.ok(!order.discountCode);
  assert.equal(order.transactions[0].amountSet.shopMoney.amount, "59.80");
});

test("toMailingAddress: drops empties, needs a 2-letter country", () => {
  assert.equal(toMailingAddress(null), null);
  assert.equal(toMailingAddress({ address1: "", city: "" }), null);
  const a = toMailingAddress({ address1: "x", city: "Paris", countryCode: "FRA", province: "IDF" });
  assert.equal(a.countryCode, undefined); // "FRA" rejected
  assert.equal(a.provinceCode, "IDF");
});
