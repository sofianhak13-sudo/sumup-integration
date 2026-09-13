import { test } from "node:test";
import assert from "node:assert/strict";

import { selectRequestedVariant, toVariantGid } from "../app/lib/variants.server.js";

// Stand-ins for two variants/offers of the same product — this app has no
// concept of "Classique"/"Premium" itself (no such mapping exists in this
// codebase); these only prove the mechanism picks whichever variant is
// actually requested, faithfully, rather than silently substituting one.
const classiqueVariant = { id: "gid://shopify/ProductVariant/111", price: "9.99", availableForSale: true };
const premiumVariant = { id: "gid://shopify/ProductVariant/222", price: "39.99", availableForSale: true };
const soldOutVariant = { id: "gid://shopify/ProductVariant/333", price: "19.99", availableForSale: false };

test("selectRequestedVariant: no request -> first available-for-sale variant (backward compatible default)", () => {
  const r = selectRequestedVariant([soldOutVariant, classiqueVariant, premiumVariant], null);
  assert.equal(r.ok, true);
  assert.equal(r.variant.id, classiqueVariant.id);
});

test("selectRequestedVariant: no request, nothing available for sale -> falls back to the first variant", () => {
  const r = selectRequestedVariant([soldOutVariant], undefined);
  assert.equal(r.ok, true);
  assert.equal(r.variant.id, soldOutVariant.id);
});

test("selectRequestedVariant: no request, empty product -> no_variants", () => {
  const r = selectRequestedVariant([], "");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no_variants");
});

test("selectRequestedVariant: explicit request for a real variant of this product -> that exact variant (bare numeric id)", () => {
  const r = selectRequestedVariant([classiqueVariant, premiumVariant], "222");
  assert.equal(r.ok, true);
  assert.equal(r.variant.id, premiumVariant.id);
});

test("selectRequestedVariant: explicit request accepts a full gid:// id too", () => {
  const r = selectRequestedVariant([classiqueVariant, premiumVariant], premiumVariant.id);
  assert.equal(r.ok, true);
  assert.equal(r.variant.id, premiumVariant.id);
});

test("selectRequestedVariant: unknown variant id -> rejected, never falls back silently", () => {
  const r = selectRequestedVariant([classiqueVariant, premiumVariant], "999999");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unknown_variant");
});

test("selectRequestedVariant: a variant id that belongs to a different product -> rejected the same way", () => {
  // From this product's point of view, a foreign variant id is
  // indistinguishable from an unknown one: it's simply not in `variantNodes`
  // (variantNodes here only ever lists ONE product's own variants, per the
  // GraphQL query in apps.sumup-pay.jsx).
  const r = selectRequestedVariant([classiqueVariant], premiumVariant.id);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unknown_variant");
});

test("selectRequestedVariant: never picks a different variant than the one explicitly requested", () => {
  const r = selectRequestedVariant([classiqueVariant, premiumVariant, soldOutVariant], classiqueVariant.id);
  assert.equal(r.ok, true);
  assert.equal(r.variant.id, classiqueVariant.id);
  assert.notEqual(r.variant.id, premiumVariant.id);
});

test("toVariantGid: passes a full gid through unchanged, prefixes a bare id", () => {
  assert.equal(toVariantGid("123"), "gid://shopify/ProductVariant/123");
  assert.equal(toVariantGid("gid://shopify/ProductVariant/123"), "gid://shopify/ProductVariant/123");
});
