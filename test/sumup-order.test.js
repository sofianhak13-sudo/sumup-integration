import { test } from "node:test";
import assert from "node:assert/strict";

import { createShopifyOrder, findOrderByReference } from "../app/lib/sumup-order.server.js";

const fakeAdmin = (payload) => ({
  graphql: async () => new Response(JSON.stringify(payload)),
});

test("createShopifyOrder: ok when order.id present and no userErrors", async () => {
  const admin = fakeAdmin({
    data: { orderCreate: { order: { id: "gid://shopify/Order/1", name: "#1" }, userErrors: [] } },
  });
  const r = await createShopifyOrder(admin, {}, {});
  assert.equal(r.ok, true);
  assert.equal(r.order.id, "gid://shopify/Order/1");
});

test("createShopifyOrder: surfaces GraphQL top-level errors (not []) ", async () => {
  const admin = fakeAdmin({
    errors: [{ message: "Field 'email' is not defined on OrderCreateCustomerInput" }],
    data: null,
  });
  const r = await createShopifyOrder(admin, {}, {});
  assert.equal(r.ok, false);
  assert.deepEqual(r.userErrors, []);
  assert.equal(r.graphQLErrors[0].message, "Field 'email' is not defined on OrderCreateCustomerInput");
});

test("createShopifyOrder: surfaces userErrors", async () => {
  const admin = fakeAdmin({
    data: { orderCreate: { order: null, userErrors: [{ field: ["email"], message: "bad" }] } },
  });
  const r = await createShopifyOrder(admin, {}, {});
  assert.equal(r.ok, false);
  assert.equal(r.userErrors[0].message, "bad");
});

test("findOrderByReference: returns the tagged order, null on miss / no reference", async () => {
  const hit = fakeAdmin({
    data: { orders: { nodes: [{ id: "gid://shopify/Order/9", name: "#9", statusPageUrl: "https://x" }] } },
  });
  assert.equal((await findOrderByReference(hit, "co-1")).id, "gid://shopify/Order/9");

  const miss = fakeAdmin({ data: { orders: { nodes: [] } } });
  assert.equal(await findOrderByReference(miss, "co-1"), null);
  assert.equal(await findOrderByReference(hit, ""), null);
});

test("findOrderByReference: swallows a query failure (returns null)", async () => {
  const boom = { graphql: async () => { throw new Error("network"); } };
  assert.equal(await findOrderByReference(boom, "co-1"), null);
});
