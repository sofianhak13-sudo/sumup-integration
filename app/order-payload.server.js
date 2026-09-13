/**
 * Builds the `orderCreate` GraphQL variables shared by both the
 * single-product and cart SumUp webhook routes. Kept as a pure function so
 * the cross-repo data contract (what a Shopify order produced by this repo
 * actually contains) can be asserted directly in tests without mocking
 * Prisma/Shopify/SumUp.
 */
export function buildSumUpOrderInput({ email, currency, amount, lineItems }) {
  return {
    order: {
      email,
      currency,
      lineItems,
      transactions: [
        {
          kind: "SALE",
          status: "SUCCESS",
          gateway: "SumUp",
          amountSet: {
            shopMoney: {
              amount: Number(amount),
              currencyCode: currency,
            },
          },
        },
      ],
    },
    options: {
      sendReceipt: true,
    },
  };
}
