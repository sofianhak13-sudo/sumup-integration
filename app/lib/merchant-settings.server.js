import prisma from "../db.server";
import {
  DEFAULT_SETTINGS,
  pickSettings,
  withDefaults,
} from "./merchant-settings";

export { DEFAULT_SETTINGS, pickSettings };

/** Read a shop's settings, falling back to defaults when no row exists. */
export const getMerchantSettings = async (shop) => {
  if (!shop) return { ...DEFAULT_SETTINGS };
  const row = await prisma.merchantSettings.findUnique({ where: { shop } });
  return withDefaults(row);
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
