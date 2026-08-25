import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
export const action = async ({ request }) => {
  try {
    const event = await request.json();

    // Ignorer proprement les événements inconnus
    if (
      event?.event_type !== "CHECKOUT_STATUS_CHANGED" ||
      !event?.id
    ) {
      return new Response(null, { status: 204 });
    }

    const apiKey = process.env.SUMUP_API_KEY;

    if (!apiKey) {
      console.error("SUMUP_API_KEY manquante");
      return new Response(null, { status: 500 });
    }

    // Vérification directe auprès de SumUp
    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(event.id)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!checkoutResponse.ok) {
      console.error(
        "Impossible de vérifier le checkout SumUp :",
        checkoutResponse.status
      );

      return new Response(null, { status: 500 });
    }

    const checkout = await checkoutResponse.json();
    const payment = await prisma.sumUpPayment.findUnique({
  where: {
    checkoutId: checkout.id,
  },
});

if (!payment) {
  console.error("PAIEMENT INTROUVABLE EN BASE :", checkout.id);
  return new Response(null, { status: 204 });
}
await prisma.sumUpPayment.update({
  where: {
    checkoutId: checkout.id,
  },
  data: {
    status: checkout.status,
  },
});

if (checkout.status !== "PAID") {
  console.log("PAIEMENT NON FINAL :", checkout.status);
  return new Response(null, { status: 204 });
}
if (payment.orderId) {
  console.log("COMMANDE SHOPIFY DEJA CREEE :", payment.orderId);
  return new Response(null, { status: 204 });
}
if (
  checkout.checkout_reference !== payment.checkoutReference ||
  Math.abs(Number(checkout.amount) - Number(payment.amount)) > 0.001 ||
  checkout.currency !== payment.currency
) {
  console.error("DONNEES PAIEMENT SUMUP INCOHERENTES");
  return new Response(null, { status: 204 });
}

const { admin } = await unauthenticated.admin(payment.shop);

const orderResponse = await admin.graphql(
  `#graphql
  mutation orderCreate(
  $order: OrderCreateOrderInput!
  $options: OrderCreateOptionsInput
) {
  orderCreate(order: $order, options: $options) {
      order {
        id
        name
        displayFinancialStatus
      }
      userErrors {
        field
        message
      }
    }
  }`,
  {
    variables: {
      order: {
        email: payment.customerEmail,
  currency: payment.currency,
  lineItems: [
    {
      variantId: payment.variantId,
      quantity: 1,
    },
  ],
  transactions: [
    {
      kind: "SALE",
      status: "SUCCESS",
      gateway: "SumUp",
      amountSet: {
        shopMoney: {
          amount: Number(payment.amount),
          currencyCode: payment.currency,
        },
      },
    },
  ],
},
options: {
      sendReceipt: true,
    },
    },
  },
);
const orderData = await orderResponse.json();
const orderErrors = orderData.data?.orderCreate?.userErrors || [];
const order = orderData.data?.orderCreate?.order;

if (orderErrors.length > 0 || !order?.id) {
  console.error("ERREUR CREATION COMMANDE SHOPIFY :", orderErrors);
  return new Response(null, { status: 500 });
}

await prisma.sumUpPayment.update({
  where: {
    checkoutId: checkout.id,
  },
  data: {
    orderId: order.id,
  },
});

console.log("COMMANDE SHOPIFY CREEE :", order.id, order.name);
await prisma.sumUpPayment.update({
  where: {
    checkoutId: checkout.id,
  },
  data: {
    status: checkout.status,
  },
});
if (checkout.status !== "PAID") {
  console.log("PAIEMENT NON FINAL :", checkout.status);
  return new Response(null, { status: 204 });
}
    console.log("PAIEMENT SUMUP VERIFIE :", {
      id: checkout.id,
      reference: checkout.checkout_reference,
      status: checkout.status,
      amount: checkout.amount,
      currency: checkout.currency,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("ERREUR WEBHOOK SUMUP :", error);
    return new Response(null, { status: 500 });
  }
};