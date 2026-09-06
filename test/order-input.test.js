import { test } from "node:test";
import assert from "node:assert/strict";

import { buildOrderInput, toMailingAddress } from "../app/lib/order-input.js";

const baseLines = [{ variantId: "gid://shopify/ProductVariant/1", quantity: 2 }];

test("fast flow: email + lines + transaction only", () => {
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
  assert.equal(order.customer.email, "a@b.co");
  assert.deepEqual(options, { sendReceipt: true });
});

test("advanced flow: discount + shipping + addresses + customer", () => {
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

  assert.equal(order.customer.firstName, "Jean");
  assert.equal(order.customer.phone, "+33612345678");
  assert.equal(order.shippingAddress.countryCode, "FR");
  assert.equal(order.shippingAddress.address1, "10 rue de Paris");
  // billing falls back to shipping
  assert.equal(order.billingAddress.zip, "75001");
  assert.equal(order.discountCode.itemFixedDiscountCode.code, "PROMO10");
  assert.equal(order.discountCode.itemFixedDiscountCode.amountSet.shopMoney.amount, "10.00");
  assert.equal(order.shippingLines[0].title, "Colissimo");
  assert.equal(order.shippingLines[0].priceSet.shopMoney.amount, "5.00");
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

test("no discount => no discountCode block", () => {
  const { order } = buildOrderInput({
    email: "a@b.co",
    currency: "EUR",
    lineItems: baseLines,
    amountChargedCents: 5980,
    orderDiscountCents: 0,
  });
  assert.ok(!order.discountCode);
});

test("toMailingAddress: drops empties, needs a 2-letter country", () => {
  assert.equal(toMailingAddress(null), null);
  assert.equal(toMailingAddress({ address1: "", city: "" }), null);
  const a = toMailingAddress({ address1: "x", city: "Paris", countryCode: "FRA", province: "IDF" });
  assert.equal(a.countryCode, undefined); // "FRA" rejected
  assert.equal(a.provinceCode, "IDF");
});
