import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  sumUpCartPayment: {
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

const { action } = await import("../../routes/api.sumup-cart-webhook");

// Two line items standing in for a "Classique" and a "Premium" item, to
// prove multi-line/multi-quantity carts survive into the Shopify order
// intact — this repo has no real CLASSIQUE/PREMIUM identifiers of its own
// (see the product-mapping Skill docs), so the ids here are arbitrary.
const basePayment = {
  checkoutId: "co_cart_1",
  checkoutReference: "cart-1000",
  shop: "test.myshopify.com",
  customerEmail: "buyer@example.com",
  items: [
    {
      variantId: "gid://shopify/ProductVariant/111",
      productId: "gid://shopify/Product/11",
      title: "Classique",
      quantity: 2,
      unitAmount: 9.99,
    },
    {
      variantId: "gid://shopify/ProductVariant/222",
      productId: "gid://shopify/Product/22",
      title: "Premium",
      quantity: 1,
      unitAmount: 39.99,
    },
  ],
  amount: 59.97,
  currency: "EUR",
  status: "PENDING",
  orderId: null,
  processing: false,
};

function jsonRequest(body) {
  return new Request("https://example.com/api/sumup-cart-webhook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function mockSumUpCheckout(overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      id: "co_cart_1",
      status: "PAID",
      checkout_reference: "cart-1000",
      amount: 59.97,
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

describe("api.sumup-cart-webhook action", () => {
  it("creates one Shopify order carrying every cart line item (multi-line / multi-quantity)", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpCartPayment.findUnique.mockResolvedValue({
      ...basePayment,
    });
    prismaMock.sumUpCartPayment.update.mockResolvedValue({});
    prismaMock.sumUpCartPayment.updateMany.mockResolvedValue({ count: 1 });
    adminMock.graphql.mockResolvedValue({
      json: async () => ({
        data: {
          orderCreate: {
            order: {
              id: "gid://shopify/Order/2",
              name: "#1002",
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
        id: "co_cart_1",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).toHaveBeenCalledTimes(1);

    const [, callArgs] = adminMock.graphql.mock.calls[0];
    expect(callArgs.variables.order.lineItems).toEqual([
      { variantId: "gid://shopify/ProductVariant/111", quantity: 2 },
      { variantId: "gid://shopify/ProductVariant/222", quantity: 1 },
    ]);
    expect(callArgs.variables.order.email).toBe("buyer@example.com");
  });

  it("rejects an empty stored cart without creating an order", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpCartPayment.findUnique.mockResolvedValue({
      ...basePayment,
      items: [],
    });
    prismaMock.sumUpCartPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_cart_1",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("rejects malformed stored items (not a real Shopify variant gid)", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpCartPayment.findUnique.mockResolvedValue({
      ...basePayment,
      items: [{ variantId: "not-a-gid", quantity: 1 }],
    });
    prismaMock.sumUpCartPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_cart_1",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("creates no order when merchant_code does not match (new hardening)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockSumUpCheckout({ merchant_code: "SOMEONE_ELSE" }));
    prismaMock.sumUpCartPayment.findUnique.mockResolvedValue({
      ...basePayment,
    });
    prismaMock.sumUpCartPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_cart_1",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("does not create a duplicate order on webhook retry", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpCartPayment.findUnique.mockResolvedValue({
      ...basePayment,
      orderId: "gid://shopify/Order/2",
    });
    prismaMock.sumUpCartPayment.update.mockResolvedValue({});

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_cart_1",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });

  it("does not create an order when the compare-and-swap lock is already held (concurrent processing)", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockSumUpCheckout());
    prismaMock.sumUpCartPayment.findUnique.mockResolvedValue({
      ...basePayment,
    });
    prismaMock.sumUpCartPayment.update.mockResolvedValue({});
    prismaMock.sumUpCartPayment.updateMany.mockResolvedValue({ count: 0 });

    const response = await action({
      request: jsonRequest({
        event_type: "CHECKOUT_STATUS_CHANGED",
        id: "co_cart_1",
      }),
    });

    expect(response.status).toBe(204);
    expect(adminMock.graphql).not.toHaveBeenCalled();
  });
});
