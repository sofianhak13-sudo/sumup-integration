import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pickSettings,
  DEFAULT_SETTINGS,
  withDefaults,
  publicStorefrontConfig,
} from "../app/lib/merchant-settings.js";

test("DEFAULT_SETTINGS: built != enabled", () => {
  assert.equal(DEFAULT_SETTINGS.cartPaymentsEnabled, true);
  assert.equal(DEFAULT_SETTINGS.cartDrawerEnabled, false);
  assert.equal(DEFAULT_SETTINGS.hideShopifyCheckout, false);
  assert.equal(DEFAULT_SETTINGS.advancedCheckoutEnabled, false);
  assert.equal(DEFAULT_SETTINGS.shippingEnabled, false);
  assert.equal(DEFAULT_SETTINGS.checkoutPreset, "digital");
});

test("pickSettings: partial — only keys present in input are returned", () => {
  assert.deepEqual(
    pickSettings({ cartPaymentsEnabled: "on", somethingElse: "ignored" }),
    { cartPaymentsEnabled: true },
  );
});

test("pickSettings: coerces booleans, validates preset, keeps JSON objects", () => {
  assert.deepEqual(
    pickSettings({
      cartDrawerEnabled: 1,
      hideShopifyCheckout: 0,
      advancedCheckoutEnabled: true,
      checkoutPreset: "ecommerce",
      checkoutFieldConfig: { fields: { phone: "required" } },
      checkoutAppearance: "not-an-object",
    }),
    {
      cartDrawerEnabled: true,
      hideShopifyCheckout: false,
      advancedCheckoutEnabled: true,
      checkoutPreset: "ecommerce",
      checkoutFieldConfig: { fields: { phone: "required" } },
      checkoutAppearance: null,
    },
  );
});

test("pickSettings: unknown preset falls back to digital", () => {
  assert.deepEqual(pickSettings({ checkoutPreset: "weird" }), {
    checkoutPreset: "digital",
  });
});

test("pickSettings: missing input -> {}", () => {
  assert.deepEqual(pickSettings(undefined), {});
});

test("withDefaults: null row -> defaults", () => {
  assert.deepEqual(withDefaults(null), DEFAULT_SETTINGS);
});

test("withDefaults: row overrides defaults, ignores extra keys", () => {
  const merged = withDefaults({
    cartPaymentsEnabled: false,
    cartDrawerEnabled: true,
    advancedCheckoutEnabled: true,
    sumupMerchantName: "Le Bon Plan",
    updatedAt: "x",
  });
  assert.equal(merged.cartPaymentsEnabled, false);
  assert.equal(merged.cartDrawerEnabled, true);
  assert.equal(merged.advancedCheckoutEnabled, true);
  assert.equal(merged.hideShopifyCheckout, false);
  assert.equal(merged.sumupMerchantName, "Le Bon Plan");
  assert.equal(merged.updatedAt, undefined);
});

test("publicStorefrontConfig: never leaks SumUp identity", () => {
  const pub = publicStorefrontConfig({
    cartPaymentsEnabled: true,
    advancedCheckoutEnabled: true,
    sumupMerchantName: "SECRET NAME",
    sumupMerchantEmail: "secret@example.com",
    sumupApiKeyLast4: "A7F2",
  });
  assert.equal(pub.advancedCheckoutEnabled, true);
  assert.equal(pub.cartPaymentsEnabled, true);
  assert.ok(!("sumupMerchantName" in pub));
  assert.ok(!("sumupMerchantEmail" in pub));
  assert.ok(!("sumupApiKeyLast4" in pub));
  assert.ok(!JSON.stringify(pub).includes("SECRET"));
  assert.equal(typeof pub.button.label, "string");
});
