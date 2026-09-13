const SUMUP_API_BASE_URL = "https://api.sumup.com/v0.1";
const DEFAULT_TIMEOUT_MS = 10000;

export function getSumUpCredentials() {
  return {
    apiKey: process.env.SUMUP_API_KEY,
    merchantCode: process.env.SUMUP_MERCHANT_CODE,
  };
}

/**
 * Thin wrapper around the SumUp REST API: adds the Bearer auth header and
 * aborts the request after `timeoutMs` so a slow/hanging SumUp response
 * cannot block a webhook or checkout-creation request indefinitely.
 * Throws if SUMUP_API_KEY is not configured; callers already treat that as
 * a hard failure (500, no order/checkout created).
 */
export async function sumupFetch(
  path,
  { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const { apiKey } = getSumUpCredentials();

  if (!apiKey) {
    throw new Error("SUMUP_API_KEY manquante");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${SUMUP_API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * SumUp's Checkout webhook (`CHECKOUT_STATUS_CHANGED`) carries no signature
 * (confirmed against SumUp's own developer docs: the Checkout product's
 * webhooks are unsigned by design — the documented mitigation is to
 * re-fetch the checkout from the API and trust only that response). This
 * merchant check is one more field cross-checked on that re-fetched,
 * authenticated response, alongside checkout_reference/amount/currency.
 */
export function checkoutMatchesMerchant(checkout, expectedMerchantCode) {
  return (
    Boolean(expectedMerchantCode) &&
    checkout?.merchant_code === expectedMerchantCode
  );
}
