import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  checkoutMatchesMerchant,
  getSumUpCredentials,
  sumupFetch,
} from "../sumup.server";
import { buildSumUpOrderInput } from "../order-payload.server";

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

    const { apiKey, merchantCode } = getSumUpCredentials();

    if (!apiKey) {
      console.error("SUMUP_API_KEY manquante");
      return new Response(null, { status: 500 });
    }

    // Vérification directe auprès de SumUp (avec timeout : voir sumup.server.js)
    let checkoutResponse;

    try {
      checkoutResponse = await sumupFetch(
        `/checkouts/${encodeURIComponent(event.id)}`,
      );
    } catch (fetchError) {
      console.error("Impossible de contacter SumUp :", fetchError);
      return new Response(null, { status: 500 });
    }

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
const customerEmail =
  typeof payment.customerEmail === "string"
    ? payment.customerEmail.trim()
    : "";

if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
  console.error("EMAIL CLIENT INVALIDE EN BASE :", checkout.id);
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
  checkout.currency !== payment.currency ||
  !checkoutMatchesMerchant(checkout, merchantCode)
) {
  console.error("DONNEES PAIEMENT SUMUP INCOHERENTES");
  return new Response(null, { status: 204 });
}
const lock = await prisma.sumUpPayment.updateMany({
  where: {
    checkoutId: checkout.id,
    processing: false,
    orderId: null,
  },
  data: {
    processing: true,
  },
});

if (lock.count === 0) {
  console.log("PAIEMENT DEJA EN COURS OU COMMANDE DEJA CREEE");
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
        statusPageUrl
      }
      userErrors {
        field
        message
      }
    }
  }`,
  {
    variables: buildSumUpOrderInput({
      email: payment.customerEmail,
      currency: payment.currency,
      amount: payment.amount,
      lineItems: [
        {
          variantId: payment.variantId,
          quantity: 1,
        },
      ],
    }),
  },
);
const orderData = await orderResponse.json();
const orderErrors = orderData.data?.orderCreate?.userErrors || [];
const order = orderData.data?.orderCreate?.order;

if (orderErrors.length > 0 || !order?.id) {
  console.error("ERREUR CREATION COMMANDE SHOPIFY :", orderErrors);
await prisma.sumUpPayment.update({
  where: {
    checkoutId: checkout.id,
  },
  data: {
    processing: false,
  },
});
  return new Response(null, { status: 500 });
}

await prisma.sumUpPayment.update({
  where: {
    checkoutId: checkout.id,
  },
  data: {
    orderId: order.id,
    statusPageUrl: order.statusPageUrl,
    processing: false,
  },
});

console.log("COMMANDE SHOPIFY CREEE :", order.id, order.name);
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