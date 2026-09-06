import { test } from "node:test";
import assert from "node:assert/strict";

import {
  maskApiKey,
  apiKeyLast4,
  buildCheckoutBody,
  parseMerchantProfile,
} from "../app/lib/sumup.js";

test("maskApiKey: never reveals more than the last 4", () => {
  assert.equal(maskApiKey("sup_sk_De3E5wzXybC0M1u72RzovskFbgUkDF89a"), "••••••••F89a");
  assert.equal(maskApiKey("short"), null);
  assert.equal(maskApiKey(undefined), null);
});

test("apiKeyLast4", () => {
  assert.equal(apiKeyLast4("sup_sk_abcdEFGH"), "EFGH");
  assert.equal(apiKeyLast4("x"), null);
});

test("buildCheckoutBody: cents -> major units, hosted checkout on", () => {
  const body = buildCheckoutBody({
    amountCents: 6990,
    currency: "EUR",
    reference: "cart-1",
    merchantCode: "MFN4SZZG",
    description: "Panier",
    returnUrl: "https://app/api/hook",
    redirectUrl: "https://shop/return",
  });
  assert.equal(body.amount, 69.9);
  assert.equal(body.currency, "EUR");
  assert.equal(body.merchant_code, "MFN4SZZG");
  assert.deepEqual(body.hosted_checkout, { enabled: true });
  assert.equal(body.checkout_reference, "cart-1");
});

test("parseMerchantProfile: pulls identity, tolerates gaps", () => {
  const id = parseMerchantProfile({
    account: { username: "merchant@example.com" },
    merchant_profile: { merchant_code: "MFN4SZZG", company_name: "Le Bon Plan", country: "FR" },
  });
  assert.deepEqual(id, {
    merchantCode: "MFN4SZZG",
    merchantName: "Le Bon Plan",
    merchantEmail: "merchant@example.com",
    country: "FR",
  });
  assert.deepEqual(parseMerchantProfile({}), {
    merchantCode: null,
    merchantName: null,
    merchantEmail: null,
    country: null,
  });
});
