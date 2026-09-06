import prisma from "../db.server";
import {
  DEFAULT_SETTINGS,
  pickSettings,
  withDefaults,
  publicStorefrontConfig,
} from "./merchant-settings.js";

export { DEFAULT_SETTINGS, pickSettings, publicStorefrontConfig };

/** Read a shop's settings, falling back to defaults when no row exists. */
export const getMerchantSettings = async (shop) => {
  if (!shop) return { ...DEFAULT_SETTINGS };
  const row = await prisma.merchantSettings.findUnique({ where: { shop } });
  return withDefaults(row);
};

/** Upsert a shop's settings (partial — only the keys in `input` are written). */
export const saveMerchantSettings = async (shop, input) => {
  const data = pickSettings(input);
  return prisma.merchantSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
};

/**
 * Persist the result of a server-side SumUp account check. Never receives or
 * stores the API key itself — only a masked last-4 and the resolved identity.
 */
export const saveSumUpIdentity = async (shop, identity) => {
  const data = {
    sumupMerchantName: identity.merchantName ?? null,
    sumupMerchantEmail: identity.merchantEmail ?? null,
    sumupApiKeyLast4: identity.apiKeyLast4 ?? null,
    sumupAccountStatus: identity.status === "ok" ? "ok" : "error",
    sumupAccountCheckedAt: new Date(),
  };
  return prisma.merchantSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
};
