/** Pure merchant-settings helpers (no DB) — safe to import anywhere. */

/** Defaults — "built ≠ enabled": nothing changes the storefront until the
 *  merchant opts in. Cart payments default on so the page-cart block works
 *  once it is added in the theme editor; the drawer and checkout hiding are
 *  opt-in. */
export const DEFAULT_SETTINGS = {
  cartPaymentsEnabled: true,
  cartDrawerEnabled: false,
  hideShopifyCheckout: false,
};

export const SETTING_FIELDS = Object.keys(DEFAULT_SETTINGS);

/** Coerce an arbitrary object to the known boolean settings only. */
export const pickSettings = (input) => {
  const out = {};
  for (const key of SETTING_FIELDS) out[key] = Boolean(input?.[key]);
  return out;
};

/** Merge a stored row (or null) over the defaults. */
export const withDefaults = (row) => ({
  ...DEFAULT_SETTINGS,
  ...(row
    ? {
        cartPaymentsEnabled: row.cartPaymentsEnabled,
        cartDrawerEnabled: row.cartDrawerEnabled,
        hideShopifyCheckout: row.hideShopifyCheckout,
      }
    : {}),
});
