import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkoutMatchesMerchant,
  getSumUpCredentials,
  sumupFetch,
} from "./sumup.server";

describe("getSumUpCredentials", () => {
  it("reads apiKey/merchantCode from env", () => {
    process.env.SUMUP_API_KEY = "key123";
    process.env.SUMUP_MERCHANT_CODE = "MERCH1";

    expect(getSumUpCredentials()).toEqual({
      apiKey: "key123",
      merchantCode: "MERCH1",
    });
  });
});

describe("checkoutMatchesMerchant", () => {
  it("matches when merchant_code equals the expected value", () => {
    expect(checkoutMatchesMerchant({ merchant_code: "M1" }, "M1")).toBe(true);
  });

  it("rejects a mismatched merchant_code", () => {
    expect(checkoutMatchesMerchant({ merchant_code: "OTHER" }, "M1")).toBe(
      false,
    );
  });

  it("rejects when the expected merchant code is missing/empty", () => {
    expect(checkoutMatchesMerchant({ merchant_code: "M1" }, "")).toBe(false);
    expect(checkoutMatchesMerchant({ merchant_code: "M1" }, undefined)).toBe(
      false,
    );
  });

  it("rejects a null/undefined checkout", () => {
    expect(checkoutMatchesMerchant(null, "M1")).toBe(false);
    expect(checkoutMatchesMerchant(undefined, "M1")).toBe(false);
  });
});

describe("sumupFetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SUMUP_API_KEY = "key123";
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws when SUMUP_API_KEY is not configured", async () => {
    delete process.env.SUMUP_API_KEY;

    await expect(sumupFetch("/checkouts/abc")).rejects.toThrow(
      "SUMUP_API_KEY manquante",
    );
  });

  it("calls the SumUp API with Bearer auth and the given path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    await sumupFetch("/checkouts/abc");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.sumup.com/v0.1/checkouts/abc");
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBe("Bearer key123");
    expect(options.headers.Accept).toBe("application/json");
  });

  it("sends a JSON body and Content-Type header when a body is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    await sumupFetch("/checkouts", { method: "POST", body: { amount: 10 } });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ amount: 10 });
  });

  it("does not set Content-Type for a bodyless GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    await sumupFetch("/checkouts/abc");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["Content-Type"]).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  it("aborts instead of hanging forever when SumUp never responds (timeout)", async () => {
    global.fetch = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    await expect(
      sumupFetch("/checkouts/slow", { timeoutMs: 20 }),
    ).rejects.toThrow();
  });
});
