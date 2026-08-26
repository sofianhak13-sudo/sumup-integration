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

    // Vérifier directement le paiement auprès de SumUp
    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(event.id)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
    );

    if (!checkoutResponse.ok) {
      console.error(
        "Impossible de vérifier le checkout panier SumUp :",
        checkoutResponse.status,
      );

      return new Response(null, { status: 500 });
    }

    const checkout = await checkoutResponse.json();

    const payment = await prisma.sumUpCartPayment.findUnique({
      where: {
        checkoutId: checkout.id,
      },
    });

    if (!payment) {
      console.error("PAIEMENT PANIER INTROUVABLE EN BASE :", checkout.id);
      return new Response(null, { status: 204 });
    }

    const customerEmail =
      typeof payment.customerEmail === "string"
        ? payment.customerEmail.trim()
        : "";

    if (
      !customerEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
      console.error("EMAIL CLIENT PANIER INVALIDE :", checkout.id);
      return new Response(null, { status: 204 });
    }

    await prisma.sumUpCartPayment.update({
      where: {
        checkoutId: checkout.id,
      },
      data: {
        status: checkout.status,
      },
    });

    // Aucun ordre Shopify tant que SumUp n'indique pas PAID
    if (checkout.status !== "PAID") {
      console.log("PAIEMENT PANIER NON FINAL :", checkout.status);
      return new Response(null, { status: 204 });
    }

    // Empêcher la création d'une deuxième commande
    if (payment.orderId) {
      console.log(
        "COMMANDE SHOPIFY PANIER DEJA CREEE :",
        payment.orderId,
      );

      return new Response(null, { status: 204 });
    }

    // Vérifier référence + montant + devise
    if (
      checkout.checkout_reference !== payment.checkoutReference ||
      Math.abs(Number(checkout.amount) - Number(payment.amount)) > 0.001 ||
      checkout.currency !== payment.currency
    ) {
      console.error("DONNEES PAIEMENT PANIER SUMUP INCOHERENTES");
      return new Response(null, { status: 204 });
    }

    const items = Array.isArray(payment.items)
      ? payment.items
      : [];

    if (items.length === 0) {
      console.error("PANIER ENREGISTRE VIDE :", checkout.id);
      return new Response(null, { status: 204 });
    }

    // Vérifier les articles enregistrés
    const validItems = items.every(
      (item) =>
        typeof item?.variantId === "string" &&
        item.variantId.startsWith("gid://shopify/ProductVariant/") &&
        Number.isInteger(Number(item.quantity)) &&
        Number(item.quantity) > 0,
    );

    if (!validItems) {
      console.error("ARTICLES PANIER INVALIDES :", checkout.id);
      return new Response(null, { status: 204 });
    }

    // Verrou anti-double webhook
    const lock = await prisma.sumUpCartPayment.updateMany({
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
      console.log(
        "PAIEMENT PANIER DEJA EN COURS OU COMMANDE DEJA CREEE",
      );

      return new Response(null, { status: 204 });
    }

    const { admin } = await unauthenticated.admin(payment.shop);

    const lineItems = items.map((item) => ({
      variantId: item.variantId,
      quantity: Number(item.quantity),
    }));

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
        variables: {
          order: {
            email: customerEmail,
            currency: payment.currency,
            lineItems,
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

    const orderErrors =
      orderData.data?.orderCreate?.userErrors || [];

    const order =
      orderData.data?.orderCreate?.order;

    if (orderErrors.length > 0 || !order?.id) {
      console.error(
        "ERREUR CREATION COMMANDE SHOPIFY PANIER :",
        orderErrors,
      );

      await prisma.sumUpCartPayment.update({
        where: {
          checkoutId: checkout.id,
        },
        data: {
          processing: false,
        },
      });

      return new Response(null, { status: 500 });
    }

    await prisma.sumUpCartPayment.update({
      where: {
        checkoutId: checkout.id,
      },
      data: {
        orderId: order.id,
        statusPageUrl: order.statusPageUrl,
        processing: false,
      },
    });

    console.log(
      "COMMANDE SHOPIFY PANIER CREEE :",
      order.id,
      order.name,
    );

    console.log("PAIEMENT PANIER SUMUP VERIFIE :", {
      id: checkout.id,
      reference: checkout.checkout_reference,
      status: checkout.status,
      amount: checkout.amount,
      currency: checkout.currency,
      articles: items.length,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("ERREUR WEBHOOK PANIER SUMUP :", error);
    return new Response(null, { status: 500 });
  }
};