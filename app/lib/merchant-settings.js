/** Pure merchant-settings helpers (no DB) — safe to import anywhere. */

import { DEFAULT_BUTTON_APPEARANCE, resolveCheckoutConfig } from "./checkout-config.js";

/** Boolean master switches. Defaults follow "built ≠ enabled": adding the app
 *  or shipping code changes nothing on the storefront until the merchant opts
 *  in. Cart payments default on so the page-cart block works once added. */
export const BOOLEAN_FIELDS = [
  "cartPaymentsEnabled",
  "cartDrawerEnabled",
  "hideShopifyCheckout",
  "advancedCheckoutEnabled",
  "shippingEnabled",
];

/** JSON config blobs (validated shape lives in checkout-config.js). */
export const JSON_FIELDS = ["checkoutFieldConfig", "checkoutAppearance", "buttonAppearance"];

/** SumUp merchant identity — written only by the server-side account check,
 *  never by a form post. Read-only from the admin's point of view. */
export const SUMUP_IDENTITY_FIELDS = [
  "sumupMerchantName",
  "sumupMerchantEmail",
  "sumupApiKeyLast4",
  "sumupAccountStatus",
  "sumupAccountCheckedAt",
];

export const PRESET_VALUES = new Set(["digital", "ecommerce", "custom"]);

export const DEFAULT_SETTINGS = {
  cartPaymentsEnabled: true,
  cartDrawerEnabled: false,
  hideShopifyCheckout: false,
  advancedCheckoutEnabled: false,
  shippingEnabled: false,
  checkoutPreset: "digital",
  checkoutFieldConfig: null,
  checkoutAppearance: null,
  buttonAppearance: null,
  sumupMerchantName: null,
  sumupMerchantEmail: null,
  sumupApiKeyLast4: null,
  sumupAccountStatus: "unknown",
  sumupAccountCheckedAt: null,
};

/** Kept for backward compatibility with earlier imports. */
export const SETTING_FIELDS = BOOLEAN_FIELDS;

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

/**
 * Coerce an arbitrary object to known settings — PARTIAL: only keys actually
 * present in `input` are returned, so one admin page saving its own fields
 * never clobbers another page's fields.
 */
export const pickSettings = (input) => {
  const out = {};
  if (!isPlainObject(input)) return out;

  for (const key of BOOLEAN_FIELDS) {
    if (key in input) out[key] = Boolean(input[key]);
  }
  if ("checkoutPreset" in input) {
    out.checkoutPreset = PRESET_VALUES.has(input.checkoutPreset)
      ? input.checkoutPreset
      : "digital";
  }
  for (const key of JSON_FIELDS) {
    if (key in input) out[key] = isPlainObject(input[key]) ? input[key] : null;
  }
  return out;
};

/** Merge a stored row (or null) over the defaults. */
export const withDefaults = (row) => {
  const out = { ...DEFAULT_SETTINGS };
  if (!row) return out;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  for (const key of SUMUP_IDENTITY_FIELDS) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
};

/**
 * The whitelist the PUBLIC storefront config endpoint (`/apps/sumup-pay/config`)
 * is allowed to expose. Never leak SumUp identity or raw JSON blobs beyond the
 * few presentation values the buttons need.
 */
export const publicStorefrontConfig = (settings) => {
  const s = withDefaults(settings);
  const checkout = resolveCheckoutConfig(s);
  const btn = { ...DEFAULT_BUTTON_APPEARANCE, ...(isPlainObject(s.buttonAppearance) ? s.buttonAppearance : {}) };
  return {
    cartPaymentsEnabled: s.cartPaymentsEnabled,
    cartDrawerEnabled: s.cartDrawerEnabled,
    hideShopifyCheckout: s.hideShopifyCheckout,
    advancedCheckoutEnabled: checkout.advancedCheckoutEnabled,
    button: {
      label: btn.label,
      loadingLabel: btn.loadingLabel,
      fullWidth: Boolean(btn.fullWidth),
      accent: btn.accent,
      onAccent: btn.onAccent,
      radius: Number(btn.radius) || 0,
      showTrust: Boolean(btn.showTrust),
      trustText: btn.trustText,
    },
  };
};
