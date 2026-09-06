import { authenticate } from "../shopify.server";
import { getMerchantSettings, DEFAULT_SETTINGS } from "../lib/merchant-settings.server";

/**
 * Public storefront config for the SumUp theme app extension.
 * Read by the cart app embed to decide whether to show the drawer CTA and
 * whether to hide the native Shopify checkout button. Short cache so toggles
 * in the app admin propagate quickly without hammering the app proxy.
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

  return new Response(JSON.stringify(settings), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
    },
  });
};
