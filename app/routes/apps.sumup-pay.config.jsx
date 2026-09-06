import { authenticate } from "../shopify.server";
import {
  getMerchantSettings,
  publicStorefrontConfig,
} from "../lib/merchant-settings.server";
import { DEFAULT_SETTINGS } from "../lib/merchant-settings.js";

/**
 * Public storefront config for the SumUp theme app extension.
 * Read by the cart app embed / blocks to decide whether to show the drawer
 * CTA, whether to route to the advanced checkout, and whether to hide the
 * native Shopify checkout button. Short cache so admin toggles propagate
 * quickly. Only storefront-safe fields are exposed (never SumUp identity).
 */
export const loader = async ({ request }) => {
  let settings = { ...DEFAULT_SETTINGS };
  try {
    const { session } = await authenticate.public.appProxy(request);
    if (session?.shop) {
      settings = await getMerchantSettings(session.shop);
    }
  } catch {
    // Unauthenticated / proxy signature failure -> safe defaults.
  }

  return new Response(JSON.stringify(publicStorefrontConfig(settings)), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
    },
  });
};
