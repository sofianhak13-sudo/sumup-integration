import { test } from "node:test";
import assert from "node:assert/strict";

import { createShopifyOrder, findOrderByReference, formatUserErrors } from "../app/lib/sumup-order.server.js";

const fakeAdmin = (payload) => ({
  graphql: async () => new Response(JSON.stringify(payload)),
});

/** Returns a different canned response on each successive `graphql()` call —
 *  used to exercise the tags-rejected -> retry-without-tags fallback. */
const sequencedAdmin = (payloads) => {
  let i = 0;
  return {
    calls: [],
    graphql: async function (_query, opts) {
      this.calls.push(opts?.variables);
      const p = payloads[Math.min(i, payloads.length - 1)];
      i += 1;
      return new Response(JSON.stringify(p));
    },
  };
};

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

test("createShopifyOrder: tags userError -> retries ONCE without tags -> succeeds", async () => {
  const admin = sequencedAdmin([
    { data: { orderCreate: { order: null, userErrors: [{ field: ["order", "tags"], message: "Tags is invalid" }] } } },
    { data: { orderCreate: { order: { id: "gid://shopify/Order/2", name: "#2" }, userErrors: [] } } },
  ]);
  const order = { email: "a@b.co", tags: ["SumUp", "sumup-ref-x"], note: "n", lineItems: [] };
  const r = await createShopifyOrder(admin, order, {});
  assert.equal(r.ok, true);
  assert.equal(r.order.id, "gid://shopify/Order/2");
  assert.equal(admin.calls.length, 2);
  assert.ok(!("tags" in admin.calls[1].order), "retry must not carry tags");
  assert.equal(admin.calls[1].order.note, "n", "retry keeps the rest of the order unchanged");
  assert.equal(admin.calls[1].order.email, "a@b.co");
});

test("createShopifyOrder: tags userError but input had no tags -> no retry, failure surfaced", async () => {
  const admin = sequencedAdmin([
    { data: { orderCreate: { order: null, userErrors: [{ field: ["order", "tags"], message: "Tags is invalid" }] } } },
    { data: { orderCreate: { order: { id: "gid://shopify/Order/should-not-be-reached" }, userErrors: [] } } },
  ]);
  const r = await createShopifyOrder(admin, { email: "a@b.co", lineItems: [] }, {});
  assert.equal(r.ok, false);
  assert.equal(admin.calls.length, 1, "no retry when the input never had a tags field");
});

test("createShopifyOrder: non-tags userError -> no retry (single call)", async () => {
  const admin = sequencedAdmin([
    { data: { orderCreate: { order: null, userErrors: [{ field: ["order", "email"], message: "is invalid" }] } } },
  ]);
  const order = { email: "bad", tags: ["SumUp"], lineItems: [] };
  const r = await createShopifyOrder(admin, order, {});
  assert.equal(r.ok, false);
  assert.equal(r.userErrors[0].field.join("."), "order.email");
  assert.equal(admin.calls.length, 1);
});

test("createShopifyOrder: still failing without tags -> surfaces the second failure", async () => {
  const admin = sequencedAdmin([
    { data: { orderCreate: { order: null, userErrors: [{ field: ["order", "tags"], message: "Tags is invalid" }] } } },
    { data: { orderCreate: { order: null, userErrors: [{ field: ["order", "email"], message: "is invalid" }] } } },
  ]);
  const order = { email: "a@b.co", tags: ["SumUp"], lineItems: [] };
  const r = await createShopifyOrder(admin, order, {});
  assert.equal(r.ok, false);
  assert.equal(admin.calls.length, 2);
  assert.equal(r.userErrors[0].field.join("."), "order.email");
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

test("formatUserErrors: flattens field path + message, never leaves a nested array to log as [Array]", () => {
  const flat = formatUserErrors([
    { field: ["order", "tags"], message: "Tags is invalid" },
    { field: ["order", "email"], message: "is invalid" },
  ]);
  assert.deepEqual(flat, ["order.tags: Tags is invalid", "order.email: is invalid"]);
  // Each entry is a plain string, so console.error(..., flat) can never
  // truncate a nested field array to "[Array]".
  for (const line of flat) assert.equal(typeof line, "string");
});

test("formatUserErrors: handles missing field/message and empty/non-array input", () => {
  assert.deepEqual(formatUserErrors([{ message: "boom" }]), ["(no field): boom"]);
  assert.deepEqual(formatUserErrors([]), []);
  assert.deepEqual(formatUserErrors(null), []);
  assert.deepEqual(formatUserErrors(undefined), []);
});
