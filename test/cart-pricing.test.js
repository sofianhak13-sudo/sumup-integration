import { test } from "node:test";
import assert from "node:assert/strict";

import {
  money,
  toCents,
  catalogSubtotalCents,
  discountCentsFromCart,
  totalsDiverge,
  firstRejectedCode,
  parseDiscountCodesHint,
  parseCartAttributes,
} from "../app/lib/cart-pricing.server.js";

test("money / toCents coerce safely", () => {
  assert.equal(money("29.90"), 29.9);
  assert.equal(money(undefined), 0);
  assert.equal(money("abc"), 0);
  assert.equal(toCents("29.90"), 2990);
  assert.equal(toCents(49.8), 4980);
  assert.equal(toCents("0.1") + toCents("0.2"), 30); // no float drift
});

test("catalogSubtotalCents: sums unit price * quantity in cents", () => {
  assert.equal(
    catalogSubtotalCents([
      { catalogUnitAmount: "29.90", quantity: 2 },
      { catalogUnitAmount: 69.9, quantity: 1 },
    ]),
    2 * 2990 + 6990,
  );
  assert.equal(catalogSubtotalCents([]), 0);
  assert.equal(catalogSubtotalCents(undefined), 0);
});

test("order discount = catalog subtotal - amount charged (equality by construction)", () => {
  const items = [{ catalogUnitAmount: "29.90", quantity: 2 }]; // 5980
  const catalog = catalogSubtotalCents(items); // 5980
  const chargedCents = 4980; // Shopify cart.cost.totalAmount after a 10 EUR code
  const discountCents = catalog - chargedCents;
  assert.equal(discountCents, 1000);
  // webhook: order total = catalog - discount == charged
  assert.equal(catalog - discountCents, chargedCents);
});

test("discountCentsFromCart: no discount", () => {
  const cart = {
    cost: {
      subtotalAmount: { amount: "59.80" },
      totalAmount: { amount: "59.80" },
    },
    discountAllocations: [],
    lines: { nodes: [{ discountAllocations: [] }] },
  };
  assert.equal(discountCentsFromCart(cart), 0);
});

test("discountCentsFromCart: cart-level fixed code", () => {
  const cart = {
    cost: {
      subtotalAmount: { amount: "59.80" },
      totalAmount: { amount: "49.80" },
    },
    discountAllocations: [{ discountedAmount: { amount: "10.00" } }],
    lines: { nodes: [] },
  };
  assert.equal(discountCentsFromCart(cart), 1000);
});

test("discountCentsFromCart: line-level allocations are summed", () => {
  const cart = {
    cost: {
      subtotalAmount: { amount: "40.00" },
      totalAmount: { amount: "34.00" },
    },
    discountAllocations: [],
    lines: {
      nodes: [
        { discountAllocations: [{ discountedAmount: { amount: "2.00" } }] },
        { discountAllocations: [{ discountedAmount: { amount: "4.00" } }] },
      ],
    },
  };
  assert.equal(discountCentsFromCart(cart), 600);
});

test("discountCentsFromCart: falls back to subtotal - total", () => {
  const cart = {
    cost: {
      subtotalAmount: { amount: "59.80" },
      totalAmount: { amount: "53.82" },
    },
    discountAllocations: [],
    lines: { nodes: [] },
  };
  assert.equal(discountCentsFromCart(cart), 598);
});

test("discountCentsFromCart: never negative, tolerates missing cost", () => {
  assert.equal(discountCentsFromCart(null), 0);
  assert.equal(discountCentsFromCart({}), 0);
  const weird = {
    cost: {
      subtotalAmount: { amount: "10.00" },
      totalAmount: { amount: "12.00" },
    },
    discountAllocations: [],
    lines: { nodes: [] },
  };
  assert.equal(discountCentsFromCart(weird), 0);
});

test("totalsDiverge: within 1 cent tolerance", () => {
  assert.equal(totalsDiverge(4980, 4980), false);
  assert.equal(totalsDiverge(4980, 4981), false);
  assert.equal(totalsDiverge(4980, 4979), false);
  assert.equal(totalsDiverge(4980, 4982), true);
  assert.equal(totalsDiverge(4980, 5980), true);
});

test("totalsDiverge: no indicative value -> never diverges", () => {
  assert.equal(totalsDiverge(4980, NaN), false);
  assert.equal(totalsDiverge(4980, Number.parseInt("", 10)), false);
});

test("firstRejectedCode: all applicable", () => {
  const returned = [
    { code: "PROMO10", applicable: true },
    { code: "WELCOME", applicable: true },
  ];
  assert.equal(firstRejectedCode(["promo10", "welcome"], returned), null);
});

test("firstRejectedCode: code missing from response is rejected", () => {
  assert.equal(firstRejectedCode(["PROMO10"], []), "PROMO10");
});

test("firstRejectedCode: code returned as not applicable is rejected", () => {
  const returned = [{ code: "PROMO10", applicable: false }];
  assert.equal(firstRejectedCode(["PROMO10"], returned), "PROMO10");
});

test("firstRejectedCode: empty submitted list is fine", () => {
  assert.equal(firstRejectedCode([], []), null);
  assert.equal(firstRejectedCode(undefined, undefined), null);
});

test("parseDiscountCodesHint", () => {
  assert.deepEqual(parseDiscountCodesHint('["A"," B ","",5]'), ["A", "B"]);
  assert.deepEqual(parseDiscountCodesHint("not json"), []);
  assert.deepEqual(parseDiscountCodesHint(""), []);
  assert.deepEqual(parseDiscountCodesHint(null), []);
  assert.deepEqual(parseDiscountCodesHint('{"a":1}'), []);
  assert.equal(
    parseDiscountCodesHint(JSON.stringify(Array(20).fill("X"))).length,
    10,
  );
});

test("parseCartAttributes", () => {
  assert.deepEqual(
    parseCartAttributes('[{"key":"ref","value":"abc"},{"key":"n","value":5}]'),
    [
      { key: "ref", value: "abc" },
      { key: "n", value: "5" },
    ],
  );
  assert.deepEqual(parseCartAttributes('[{"value":"no key"}]'), []);
  assert.deepEqual(parseCartAttributes("garbage"), []);
  assert.deepEqual(parseCartAttributes(null), []);
  assert.deepEqual(parseCartAttributes('{"key":"x"}'), []);
  assert.equal(
    parseCartAttributes(
      JSON.stringify(Array(40).fill({ key: "k", value: "v" })),
    ).length,
    25,
  );
});
