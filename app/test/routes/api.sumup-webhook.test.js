import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  sumUpPayment: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

const adminMock = { graphql: vi.fn() };

vi.mock("../../db.server", () => ({ default: prismaMock }));
vi.mock("../../shopify.server", () => ({
  unauthenticated: {
    admin: vi.fn(async () => ({ admin: adminMock })),
  },
}));

const { action } = await import("../../routes/api.sumup-webhook");

const basePayment = {
  checkoutId: "co_123",
  checkoutReference: "shopify-1-1000",
  shop: "test.myshopify.com",
  productId: "gid://shopify/Product/1",
  variantId: "gid://shopify/ProductVariant/1",
  amount: 19.99,
  currency: "EUR",
  status: "PENDING",
  orderId: null,
  processing: false,
  customerEmail: "buyer@example.com",
};

function jsonRequest(body) {
  return new Request("https://example.com/api/sumup-webhook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function mockSumUpCheckout(overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      id: "co_123",
      status: "PAID",
      checkout_reference: "shopify-1-1000",
      amount: 19.99,
      currency: "EUR",
      merchant_code: "TEST_MERCHANT",
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUMUP_API_KEY = "test-key";
  process.env.SUMUP_MERCHANT_CODE = "TEST_MERCHANT";
});

describe("api.sumup-webhook action", () => {
  it("ignores unknown event types without touching the DB", async () => {
    const response = await action({
      request: jsonRequest({ event_type: "OTHER", id: "co_123" }),
    });

    expect(response.status).toBe(204);
    expect(prismaMock.sumUpPayment.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a malformed JSON body safely (no crash, no order)", async () => {
    const badRequest = new Request("https://example.com/api/sumup-webhook", {
      method: "POST",
      body: "{not json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await action({ request: badRequest });

    expect(response.status).toBe(500);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("returns 500 and creates no order when the SumUp API call fails (provider error)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(500);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("returns 500 and creates no order when the SumUp API call throws (network error/timeout)", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(500);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("creates no order when the checkout is unknown in our DB", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpPayment.findUnique.mockResolvedValue(null);

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("creates no order while status is not PAID", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockSumUpCheckout({ status: "PENDING" }));
    prismaMock.sumUpPayment.findUnique.mockResolvedValue({ ...basePayment });
    prismaMock.sumUpPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("creates no order when the amount does not match", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout({ amount: 999 }));
    prismaMock.sumUpPayment.findUnique.mockResolvedValue({ ...basePayment });
    prismaMock.sumUpPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("creates no order when the currency does not match", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockSumUpCheckout({ currency: "USD" }));
    prismaMock.sumUpPayment.findUnique.mockResolvedValue({ ...basePayment });
    prismaMock.sumUpPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("creates no order when the checkout_reference does not match", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockSumUpCheckout({ checkout_reference: "other-ref" }));
    prismaMock.sumUpPayment.findUnique.mockResolvedValue({ ...basePayment });
    prismaMock.sumUpPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("creates no order when merchant_code does not match (new hardening)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockSumUpCheckout({ merchant_code: "SOMEONE_ELSE" }));
    prismaMock.sumUpPayment.findUnique.mockResolvedValue({ ...basePayment });
    prismaMock.sumUpPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("creates exactly one Shopify order for a valid PAID checkout", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpPayment.findUnique.mockResolvedValue({ ...basePayment });
    prismaMock.sumUpPayment.update.mockResolvedValue({});
    prismaMock.sumUpPayment.updateMany.mockResolvedValue({ count: 1 });
    adminMock.graphql.mockResolvedValue({
      json: async () => ({
        data: {
          orderCreate: {
            order: {
              id: "gid://shopify/Order/1",
              name: "#1001",
              statusPageUrl: "https://x",
            },
            userErrors: [],
          },
        },
      }),
    });

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).toHaveBeenCalledTimes(1);

    const [, callArgs] = adminMock.graphql.mock.calls[0];
    expect(callArgs.variables.order.email).toBe("buyer@example.com");
    expect(callArgs.variables.order.lineItems).toEqual([
      { variantId: "gid://shopify/ProductVariant/1", quantity: 1 },
    ]);
  });

  it("does not create a second order when one already exists (idempotency: early exit)", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpPayment.findUnique.mockResolvedValue({
      ...basePayment,
      orderId: "gid://shopify/Order/1",
    });
    prismaMock.sumUpPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("does not create a second order for a duplicate/concurrent webhook (compare-and-swap lock lost)", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpPayment.findUnique.mockResolvedValue({ ...basePayment });
    prismaMock.sumUpPayment.update.mockResolvedValue({});
    prismaMock.sumUpPayment.updateMany.mockResolvedValue({ count: 0 });

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("releases the lock and returns 500 when orderCreate returns userErrors", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpPayment.findUnique.mockResolvedValue({ ...basePayment });
    prismaMock.sumUpPayment.update.mockResolvedValue({});
    prismaMock.sumUpPayment.updateMany.mockResolvedValue({ count: 1 });
    adminMock.graphql.mockResolvedValue({
      json: async () => ({
        data: {
          orderCreate: {
            order: null,
            userErrors: [{ field: ["email"], message: "invalid" }],
          },
        },
      }),
    });

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_123",
      }),
    });

    expect(response.status).toBe(500);
    expect(prismaMock.sumUpPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processing: false }),
      }),
    );
  });
});
