import {
  apiKeyLast4,
  buildCheckoutBody,
  maskApiKey,
  parseMerchantProfile,
} from "./sumup.js";

export { maskApiKey, apiKeyLast4 };

const SUMUP_BASE = "https://api.sumup.com/v0.1";

/** Read SumUp credentials from the environment (server only). */
export function sumupCredentials() {
  return {
    apiKey: process.env.SUMUP_API_KEY || "",
    merchantCode: process.env.SUMUP_MERCHANT_CODE || "",
  };
}

/** @returns {boolean} whether the app is configured to talk to SumUp. */
export function sumupConfigured() {
  const { apiKey, merchantCode } = sumupCredentials();
  return Boolean(apiKey && merchantCode);
}

/**
 * Create a hosted SumUp checkout.
 * @returns {{ ok: boolean, status: number, data: object }}
 */
export async function createSumUpCheckout({
  amountCents,
  currency,
  reference,
  description,
  returnUrl,
  redirectUrl,
}) {
  const { apiKey, merchantCode } = sumupCredentials();
  if (!apiKey || !merchantCode) {
    return { ok: false, status: 0, data: { error: "sumup_not_configured" } };
  }

  const res = await fetch(`${SUMUP_BASE}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(
      buildCheckoutBody({
        amountCents,
        currency,
        reference,
        merchantCode,
        description,
        returnUrl,
        redirectUrl,
      }),
    ),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && Boolean(data.id), status: res.status, data };
}

/** Fetch a checkout straight from SumUp (used by the webhook to confirm PAID). */
export async function getSumUpCheckout(id) {
  const { apiKey } = sumupCredentials();
  if (!apiKey) return { ok: false, status: 0, data: {} };
  const res = await fetch(`${SUMUP_BASE}/checkouts/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Verify the SumUp account server-side and return its identity.
 * Never returns the API key. Used by the admin "Vérifier le compte SumUp".
 */
export async function verifySumUpAccount() {
  const { apiKey, merchantCode } = sumupCredentials();
  if (!apiKey) {
    return { status: "error", reason: "no_api_key", apiKeyLast4: null };
  }

  let res;
  try {
    res = await fetch(`${SUMUP_BASE}/me`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
  } catch {
    return { status: "error", reason: "network", apiKeyLast4: apiKeyLast4(apiKey) };
  }

  if (!res.ok) {
    return {
      status: "error",
      reason: `http_${res.status}`,
      apiKeyLast4: apiKeyLast4(apiKey),
    };
  }

  const me = await res.json().catch(() => ({}));
  const identity = parseMerchantProfile(me);

  return {
    status: "ok",
    apiKeyLast4: apiKeyLast4(apiKey),
    merchantName: identity.merchantName,
    merchantEmail: identity.merchantEmail,
    merchantCode: identity.merchantCode,
    // Flag a mismatch so the admin can catch a wrong env var.
    merchantCodeMatchesEnv:
      !merchantCode || !identity.merchantCode
        ? null
        : identity.merchantCode === merchantCode,
    country: identity.country,
  };
}
