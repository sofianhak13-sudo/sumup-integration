import { describe, expect, it } from "vitest";
import { buildSumUpOrderInput } from "./order-payload.server";

describe("buildSumUpOrderInput — cross-repo contract", () => {
  it("includes every field the LE BON PLAN backend needs to identify the purchase", () => {
    const input = buildSumUpOrderInput({
      email: "buyer@example.com",
      currency: "EUR",
      amount: 19.99,
      lineItems: [
        { variantId: "gid://shopify/ProductVariant/111", quantity: 1 },
      ],
    });

    expect(input.order.email).toBe("buyer@example.com");
    expect(input.order.currency).toBe("EUR");
    expect(input.order.lineItems).toEqual([
      { variantId: "gid://shopify/ProductVariant/111", quantity: 1 },
    ]);
    expect(input.order.transactions[0]).toMatchObject({
      kind: "SALE",
      status: "SUCCESS",
      gateway: "SumUp",
      amountSet: {
        shopMoney: { amount: 19.99, currencyCode: "EUR" },
      },
    });
    expect(input.options).toEqual({ sendReceipt: true });
  });

  it("supports multiple line items (cart flow, multi-quantity)", () => {
    const input = buildSumUpOrderInput({
      email: "buyer@example.com",
      currency: "EUR",
      amount: 59.97,
      lineItems: [
        { variantId: "gid://shopify/ProductVariant/111", quantity: 2 },
        { variantId: "gid://shopify/ProductVariant/222", quantity: 1 },
      ],
    });

    expect(input.order.lineItems).toHaveLength(2);
    expect(input.order.lineItems[0].quantity).toBe(2);
  });

  it("coerces amount to a number for the transaction, even if given as a string", () => {
    const input = buildSumUpOrderInput({
      email: "buyer@example.com",
      currency: "EUR",
      amount: "19.99",
      lineItems: [],
    });

    expect(input.order.transactions[0].amountSet.shopMoney.amount).toBe(
      19.99,
    );
  });

  it("never includes tags/notes/attributes (historical 'Order tags is invalid' incident)", () => {
    const input = buildSumUpOrderInput({
      email: "buyer@example.com",
      currency: "EUR",
      amount: 10,
      lineItems: [],
    });

    expect(input.order).not.toHaveProperty("tags");
    expect(input.order).not.toHaveProperty("note");
    expect(input.order).not.toHaveProperty("customAttributes");
    expect(input.order).not.toHaveProperty("attributes");
  });
});
