import { test } from "node:test";
import assert from "node:assert/strict";

import { checkoutPage } from "../app/lib/checkout-screens.server.js";
import { resolveCheckoutConfig } from "../app/lib/checkout-config.js";
import { deliveryAddressInput } from "../app/lib/storefront-cart.server.js";

const page = (settings) =>
  checkoutPage({
    config: resolveCheckoutConfig({ advancedCheckoutEnabled: true, ...settings }),
    actionPath: "/apps/sumup-pay/checkout",
    cartUrl: "/cart",
    customerEmail: "known@buyer.co",
  });

test("digital preset page: email only, no address / delivery cards", () => {
  const html = page({ checkoutPreset: "digital" });
  assert.ok(html.includes('name="email"'));
  assert.ok(!html.includes('name="firstName"'));
  assert.ok(!html.includes("Adresse de livraison"));
  assert.ok(!html.includes("<h2>Livraison</h2>"));
  assert.ok(html.includes("known@buyer.co"));
});

test("ecommerce + shipping page: address + billing + delivery cards", () => {
  const html = page({ checkoutPreset: "ecommerce", shippingEnabled: true });
  assert.ok(html.includes('name="firstName"'));
  assert.ok(html.includes('name="shipping.address1"'));
  assert.ok(html.includes("Adresse de facturation"));
  assert.ok(html.includes('name="billingSame"'));
  assert.ok(html.includes("<h2>Livraison</h2>"));
  assert.ok(html.includes('name="shippingOptionHandle"'));
});

test("page never emits Liquid tags (survives the app-proxy Liquid pass)", () => {
  const html = page({ checkoutPreset: "ecommerce", shippingEnabled: true });
  assert.ok(!html.includes("{{"));
  assert.ok(!html.includes("{%"));
});

test("page has no bare form action attribute (JS drives submission)", () => {
  const html = page({ checkoutPreset: "digital" });
  assert.ok(!/<form[^>]*\saction=/.test(html));
});

test("pay flow uses a JSON redirect, never a manual/opaque fetch redirect", () => {
  const html = page({ checkoutPreset: "ecommerce", shippingEnabled: true });
  // The opaque-redirect bug fix: no manual redirect handling anywhere.
  assert.ok(!html.includes('redirect:"manual"'));
  assert.ok(!html.includes("redirect: \"manual\""));
  assert.ok(!html.includes("status===303"));
  assert.ok(!html.includes("status===302"));
  // The client acts on { ok:true, redirect } from the server.
  assert.ok(html.includes("j.ok && j.redirect"));
  assert.ok(html.includes("location.assign(j.redirect)"));
});

test("deliveryAddressInput: normalizes, drops empties, enforces country code", () => {
  assert.equal(deliveryAddressInput(null), null);
  const a = deliveryAddressInput({
    address1: "10 rue",
    city: "Paris",
    zip: "75001",
    countryCode: "fr",
    province: "IDF",
    address2: "",
  });
  assert.equal(a.countryCode, "FR");
  assert.equal(a.provinceCode, "IDF");
  assert.equal(a.address1, "10 rue");
  assert.ok(!("address2" in a));
});
