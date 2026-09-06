import prisma from "../db.server";

/** Defaults — "built ≠ enabled": nothing changes the storefront until the
 *  merchant opts in. Cart payments default on so the page-cart block works
 *  once it is added in the theme editor; the drawer and checkout hiding are
 *  opt-in. */
export const DEFAULT_SETTINGS = {
  cartPaymentsEnabled: true,
  cartDrawerEnabled: false,
  hideShopifyCheckout: false,
};

const FIELDS = Object.keys(DEFAULT_SETTINGS);

/** Read a shop's settings, falling back to defaults when no row exists. */
export const getMerchantSettings = async (shop) => {
  if (!shop) return { ...DEFAULT_SETTINGS };
  const row = await prisma.merchantSettings.findUnique({ where: { shop } });
  return {
    ...DEFAULT_SETTINGS,
    ...(row
      ? {
          cartPaymentsEnabled: row.cartPaymentsEnabled,
          cartDrawerEnabled: row.cartDrawerEnabled,
          hideShopifyCheckout: row.hideShopifyCheckout,
        }
      : {}),
  };
};

/** Coerce an arbitrary object to the known boolean settings only. */
export const pickSettings = (input) => {
  const out = {};
  for (const key of FIELDS) out[key] = Boolean(input?.[key]);
  return out;
};

/** Upsert a shop's settings. */
export const saveMerchantSettings = async (shop, input) => {
  const data = pickSettings(input);
  return prisma.merchantSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
};
