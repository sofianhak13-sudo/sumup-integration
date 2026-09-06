/** Absolute-URL helpers for redirect_url / return_url. Server only. */

const strip = (u) => String(u || "").replace(/\/+$/, "");

/** Our own public origin (Render). */
export const appUrl = () =>
  strip(process.env.SHOPIFY_APP_URL || "https://sumup-integration-dwm1.onrender.com");

/**
 * The buyer-facing storefront origin. Prefers SHOP_CUSTOM_DOMAIN (set for Le
 * Bon Plan), falls back to the myshopify domain — the app proxy answers on
 * both.
 */
export const storefrontUrl = (shop) => {
  const custom = process.env.SHOP_CUSTOM_DOMAIN;
  if (custom) return "https://" + strip(custom.replace(/^https?:\/\//, ""));
  return "https://" + strip(String(shop || "").replace(/^https?:\/\//, ""));
};
