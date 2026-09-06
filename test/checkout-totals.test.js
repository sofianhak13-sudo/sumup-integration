import { test } from "node:test";
import assert from "node:assert/strict";

import {
  breakdownFromCart,
  reconcileOrder,
  totalsDiverge,
  toCents,
} from "../app/lib/checkout-totals.js";

const cart = (over = {}) => ({
  cost: {
    subtotalAmount: { amount: "59.80", currencyCode: "EUR" },
    totalAmount: { amount: "49.80", currencyCode: "EUR" },
    totalTaxAmount: { amount: "0.00", currencyCode: "EUR" },
    ...over.cost,
  },
  ...over,
});

test("breakdownFromCart: discount inferred from catalog vs total (no shipping)", () => {
  const b = breakdownFromCart(cart(), toCents(59.8));
  assert.equal(b.currencyCode, "EUR");
  assert.equal(b.catalogSubtotalCents, 5980);
  assert.equal(b.discountCents, 1000);
  assert.equal(b.shippingCents, 0);
  assert.equal(b.totalCents, 4980);
});

test("breakdownFromCart: selected delivery option adds shipping", () => {
  const c = cart({
    cost: {
      subtotalAmount: { amount: "59.80", currencyCode: "EUR" },
      totalAmount: { amount: "54.80", currencyCode: "EUR" },
    },
    deliveryGroups: {
      nodes: [
        { selectedDeliveryOption: { estimatedCost: { amount: "5.00", currencyCode: "EUR" } } },
      ],
    },
  });
  const b = breakdownFromCart(c, toCents(59.8));
  assert.equal(b.shippingCents, 500);
  assert.equal(b.totalCents, 5480);
  // goods after discount = 5480 - 500 = 4980  => discount 1000
  assert.equal(b.discountCents, 1000);
});

test("reconcileOrder: equality by construction (discount, no shipping)", () => {
  const b = breakdownFromCart(cart(), toCents(59.8));
  const r = reconcileOrder(b);
  assert.equal(r.ok, true);
  assert.equal(r.orderDiscountCents, 1000);
  assert.equal(r.shippingCents, 0);
  assert.equal(r.amountChargedCents, 4980);
  assert.equal(
    b.catalogSubtotalCents - r.orderDiscountCents + r.shippingCents,
    r.amountChargedCents,
  );
});

test("reconcileOrder: with shipping", () => {
  const b = {
    currencyCode: "EUR",
    catalogSubtotalCents: 5980,
    shippingCents: 500,
    totalCents: 5480,
  };
  const r = reconcileOrder(b);
  assert.equal(r.ok, true);
  assert.equal(r.orderDiscountCents, 1000);
  assert.equal(r.shippingCents, 500);
  assert.equal(r.amountChargedCents, 5480);
});

test("reconcileOrder: fail closed when goods exceed catalogue (surcharge)", () => {
  const b = { currencyCode: "EUR", catalogSubtotalCents: 5980, shippingCents: 0, totalCents: 6500 };
  const r = reconcileOrder(b);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "total_above_catalog");
});

test("reconcileOrder: fail closed on non-positive total", () => {
  const r = reconcileOrder({ currencyCode: "EUR", catalogSubtotalCents: 100, shippingCents: 0, totalCents: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "total_invalid");
});

test("totalsDiverge: tolerance + NaN", () => {
  assert.equal(totalsDiverge(4980, 4980), false);
  assert.equal(totalsDiverge(4980, 4981), false);
  assert.equal(totalsDiverge(4980, 5100), true);
  assert.equal(totalsDiverge(4980, NaN), false);
});
