import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pickSettings,
  DEFAULT_SETTINGS,
  withDefaults,
} from "../app/lib/merchant-settings.js";

test("DEFAULT_SETTINGS: built != enabled", () => {
  assert.equal(DEFAULT_SETTINGS.cartPaymentsEnabled, true);
  assert.equal(DEFAULT_SETTINGS.cartDrawerEnabled, false);
  assert.equal(DEFAULT_SETTINGS.hideShopifyCheckout, false);
});

test("pickSettings: coerces to known booleans only", () => {
  assert.deepEqual(
    pickSettings({
      cartPaymentsEnabled: "on",
      cartDrawerEnabled: 1,
      hideShopifyCheckout: 0,
      somethingElse: "ignored",
    }),
    {
      cartPaymentsEnabled: true,
      cartDrawerEnabled: true,
      hideShopifyCheckout: false,
    },
  );
});

test("pickSettings: missing input -> all false", () => {
  assert.deepEqual(pickSettings(undefined), {
    cartPaymentsEnabled: false,
    cartDrawerEnabled: false,
    hideShopifyCheckout: false,
  });
});

test("withDefaults: null row -> defaults", () => {
  assert.deepEqual(withDefaults(null), DEFAULT_SETTINGS);
});

test("withDefaults: row overrides defaults", () => {
  assert.deepEqual(
    withDefaults({
      cartPaymentsEnabled: false,
      cartDrawerEnabled: true,
      hideShopifyCheckout: true,
      updatedAt: "x",
    }),
    {
      cartPaymentsEnabled: false,
      cartDrawerEnabled: true,
      hideShopifyCheckout: true,
    },
  );
});
