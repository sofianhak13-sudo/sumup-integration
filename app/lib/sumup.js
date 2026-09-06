/** Pure SumUp helpers (no network). */

/**
 * Mask an API key for display. Never returns enough to reconstruct the key.
 * @returns {string|null} e.g. "••••••••A7F2"
 */
export function maskApiKey(key) {
  if (typeof key !== "string" || key.length < 8) return null;
  return "••••••••" + key.slice(-4);
}

/** Last 4 chars of the API key, for storage (safe — not the secret). */
export function apiKeyLast4(key) {
  if (typeof key !== "string" || key.length < 8) return null;
  return key.slice(-4);
}

/**
 * Build the body for POST https://api.sumup.com/v0.1/checkouts.
 * `amountCents` is the integer the finance engine produced; SumUp wants a
 * decimal major-unit amount.
 */
export function buildCheckoutBody({
  amountCents,
  currency,
  reference,
  merchantCode,
  description,
  returnUrl,
  redirectUrl,
}) {
  return {
    checkout_reference: reference,
    amount: Math.round(amountCents) / 100,
    currency,
    merchant_code: merchantCode,
    description,
    return_url: returnUrl,
    redirect_url: redirectUrl,
    hosted_checkout: { enabled: true },
  };
}

/** Extract a normalized identity from a SumUp /v0.1/me payload. */
export function parseMerchantProfile(me) {
  const profile = me?.merchant_profile || {};
  const account = me?.account || {};
  return {
    merchantCode: profile.merchant_code || null,
    merchantName: profile.company_name || profile.doing_business_as?.business_name || null,
    merchantEmail: account.username || me?.email || null,
    country: profile.country || null,
  };
}
