import { test } from "node:test";
import assert from "node:assert/strict";

import { createSumUpCheckout, getSumUpCheckout, sumupConfigured } from "../app/lib/sumup.server.js";

/** Save/restore ambient state a test stubs (env vars, global.fetch). */
function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

function withFetch(fakeFetch, fn) {
  const original = global.fetch;
  global.fetch = fakeFetch;
  return Promise.resolve(fn()).finally(() => {
    global.fetch = original;
  });
}

test("sumupConfigured: true only when both apiKey and merchantCode are set", () =>
  withEnv({ SUMUP_API_KEY: "", SUMUP_MERCHANT_CODE: "" }, () => {
    assert.equal(sumupConfigured(), false);
  }));

test("createSumUpCheckout: not configured -> ok:false without any fetch", () =>
  withEnv({ SUMUP_API_KEY: "", SUMUP_MERCHANT_CODE: "" }, () =>
    withFetch(
      () => {
        throw new Error("must not fetch when unconfigured");
      },
      async () => {
        const r = await createSumUpCheckout({ amountCents: 1000, currency: "EUR", reference: "r1" });
        assert.equal(r.ok, false);
        assert.equal(r.data.error, "sumup_not_configured");
      },
    ),
  ));

test("createSumUpCheckout: posts to /checkouts and reports ok on a real id", () =>
  withEnv({ SUMUP_API_KEY: "key123", SUMUP_MERCHANT_CODE: "MFN4SZZG" }, () =>
    withFetch(
      async (url, options) => {
        assert.equal(url, "https://api.sumup.com/v0.1/checkouts");
        assert.equal(options.method, "POST");
        assert.equal(options.headers.Authorization, "Bearer key123");
        const body = JSON.parse(options.body);
        assert.equal(body.merchant_code, "MFN4SZZG");
        return new Response(JSON.stringify({ id: "co_1", status: "PENDING", hosted_checkout_url: "https://x" }), { status: 201 });
      },
      async () => {
        const r = await createSumUpCheckout({
          amountCents: 6990,
          currency: "EUR",
          reference: "co-1",
          description: "Panier",
          returnUrl: "https://app/hook",
          redirectUrl: "https://shop/return",
        });
        assert.equal(r.ok, true);
        assert.equal(r.data.id, "co_1");
      },
    ),
  ));

test("createSumUpCheckout: SumUp error response (no id) -> ok:false, status kept", () =>
  withEnv({ SUMUP_API_KEY: "key123", SUMUP_MERCHANT_CODE: "MFN4SZZG" }, () =>
    withFetch(
      async () => new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 }),
      async () => {
        const r = await createSumUpCheckout({ amountCents: 100, currency: "EUR", reference: "r" });
        assert.equal(r.ok, false);
        assert.equal(r.status, 400);
      },
    ),
  ));

test("createSumUpCheckout: SumUp unreachable (fetch throws) -> ok:false, network_error, no throw", () =>
  withEnv({ SUMUP_API_KEY: "key123", SUMUP_MERCHANT_CODE: "MFN4SZZG" }, () =>
    withFetch(
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => {
        const r = await createSumUpCheckout({ amountCents: 100, currency: "EUR", reference: "r" });
        assert.equal(r.ok, false);
        assert.equal(r.status, 0);
        assert.equal(r.data.error, "network_error");
      },
    ),
  ));

test("createSumUpCheckout: SumUp never responds -> aborts after the timeout instead of hanging (ok:false, error:timeout)", async (t) => {
  // Fake the *real* internal setTimeout(..., 10_000) so this test doesn't
  // wait 10s and doesn't need the timeout to be parameterized: it advances
  // node:test's own mocked clock past the real threshold, which fires the
  // real AbortController inside sumup.server.js exactly as production would.
  t.mock.timers.enable({ apis: ["setTimeout"] });

  await withEnv({ SUMUP_API_KEY: "key123", SUMUP_MERCHANT_CODE: "MFN4SZZG" }, async () => {
    const originalFetch = global.fetch;
    global.fetch = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });

    try {
      const pending = createSumUpCheckout({ amountCents: 100, currency: "EUR", reference: "r" });
      t.mock.timers.tick(10_000);
      const r = await pending;
      assert.equal(r.ok, false);
      assert.equal(r.data.error, "timeout");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("getSumUpCheckout: no api key -> ok:false without fetching", () =>
  withEnv({ SUMUP_API_KEY: "" }, () =>
    withFetch(
      () => {
        throw new Error("must not fetch without an api key");
      },
      async () => {
        const r = await getSumUpCheckout("co_1");
        assert.equal(r.ok, false);
      },
    ),
  ));

test("getSumUpCheckout: fetches the checkout by id with Bearer auth", () =>
  withEnv({ SUMUP_API_KEY: "key123" }, () =>
    withFetch(
      async (url, options) => {
        assert.equal(url, "https://api.sumup.com/v0.1/checkouts/co_1");
        assert.equal(options.headers.Authorization, "Bearer key123");
        return new Response(JSON.stringify({ id: "co_1", status: "PAID", merchant_code: "MFN4SZZG" }), { status: 200 });
      },
      async () => {
        const r = await getSumUpCheckout("co_1");
        assert.equal(r.ok, true);
        assert.equal(r.data.status, "PAID");
      },
    ),
  ));

test("getSumUpCheckout: SumUp unreachable -> ok:false, no throw (webhook can safely 500)", () =>
  withEnv({ SUMUP_API_KEY: "key123" }, () =>
    withFetch(
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => {
        const r = await getSumUpCheckout("co_1");
        assert.equal(r.ok, false);
        assert.equal(r.status, 0);
      },
    ),
  ));
