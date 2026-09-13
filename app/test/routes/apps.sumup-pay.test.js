import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = { sumUpPayment: { create: vi.fn() } };
const adminGraphqlMock = vi.fn();

vi.mock("../../db.server", () => ({ default: prismaMock }));
vi.mock("../../shopify.server", () => ({
  authenticate: {
    public: {
      appProxy: vi.fn(async () => ({
        admin: { graphql: adminGraphqlMock },
        session: { shop: "test.myshopify.com" },
      })),
    },
  },
}));

const { action } = await import("../../routes/apps.sumup-pay");

function formRequest(fields) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  return new Request("https://shop.example.com/apps/sumup-pay", {
    method: "POST",
    body: formData,
  });
}

function mockProductGraphqlResponse(variants) {
  return {
    json: async () => ({
      data: {
        product: {
          id: "gid://shopify/Product/1",
          title: "Ebook",
          variants: { nodes: variants },
        },
      },
    }),
  };
}

// Stand-ins for two tiers of the same product — this repo does not know
// these are "Classique"/"Premium" (no such concept exists in its code, see
// the product-mapping Skill docs); it only needs to faithfully use
// whichever variant is actually requested instead of always defaulting to
// the first one.
const classiqueVariant = { id: "gid://shopify/ProductVariant/111", price: "9.99" };
const premiumVariant = { id: "gid://shopify/ProductVariant/222", price: "39.99" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUMUP_API_KEY = "test-key";
  process.env.SUMUP_MERCHANT_CODE = "TEST_MERCHANT";
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "co_1",
      status: "PENDING",
      hosted_checkout_url: "https://pay.sumup.com/x",
    }),
  });
});

describe("apps.sumup-pay action — product/variant selection", () => {
  it("rejects an invalid email before ever calling Shopify or SumUp", async () => {
    const response = await action({
      request: formRequest({ productId: "1", email: "not-an-email" }),
    });

    expect(response.status).toBe(400);
    expect(adminGraphqlMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("CLASSIQUE-equivalent: defaults to the product's first variant when no variantId is requested (backward compatible)", async () => {
    adminGraphqlMock.mockResolvedValue(
      mockProductGraphqlResponse([classiqueVariant, premiumVariant]),
    );

    const response = await action({
      request: formRequest({ productId: "1", email: "buyer@example.com" }),
    });

    expect(response.status).toBe(303);
    expect(prismaMock.sumUpPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          variantId: classiqueVariant.id,
          amount: 9.99,
        }),
      }),
    );
  });

  it("PREMIUM-equivalent: honors an explicitly requested variantId belonging to the product", async () => {
    adminGraphqlMock.mockResolvedValue(
      mockProductGraphqlResponse([classiqueVariant, premiumVariant]),
    );

    const response = await action({
      request: formRequest({
        productId: "1",
        variantId: "222",
        email: "buyer@example.com",
      }),
    });

    expect(response.status).toBe(303);
    expect(prismaMock.sumUpPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          variantId: premiumVariant.id,
          amount: 39.99,
        }),
      }),
    );
  });

  it("UNKNOWN: rejects a variantId that does not belong to the requested product — no checkout, no order", async () => {
    adminGraphqlMock.mockResolvedValue(
      mockProductGraphqlResponse([classiqueVariant, premiumVariant]),
    );

    const response = await action({
      request: formRequest({
        productId: "1",
        variantId: "999999",
        email: "buyer@example.com",
      }),
    });

    expect(response.status).toBe(400);
    expect(prismaMock.sumUpPayment.create).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("accepts a full gid:// variantId, not just a bare numeric id", async () => {
    adminGraphqlMock.mockResolvedValue(
      mockProductGraphqlResponse([classiqueVariant, premiumVariant]),
    );

    const response = await action({
      request: formRequest({
        productId: "1",
        variantId: premiumVariant.id,
        email: "buyer@example.com",
      }),
    });

    expect(response.status).toBe(303);
    expect(prismaMock.sumUpPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ variantId: premiumVariant.id }),
      }),
    );
  });
});
