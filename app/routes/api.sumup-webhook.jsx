import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { buildOrderInput } from "../lib/order-input.js";
import { createShopifyOrder, findOrderByReference, formatUserErrors } from "../lib/sumup-order.server";

const LP = "[SUMUP_WEBHOOK]";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const noStore = { "Cache-Control": "no-store" };

/**
 * SumUp `return_url` callback for the product fast flow. Same idempotency
 * model as api.sumup-cart-webhook.jsx (orderId guard + processing lock
 * released in `finally` + sumup-ref order tag). Shopify's native
 * confirmation email fires via options.sendReceipt = true.
 */
export const action = async ({ request }) => {
  try {
    const event = await request.json().catch(() => null);

    if (event?.event_type !== "CHECKOUT_STATUS_CHANGED" || !event?.id) {
      return new Response(null, { status: 204, headers: noStore });
    }

    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) {
      console.error(`${LP} SUMUP_API_KEY manquante`);
      return new Response(null, { status: 500, headers: noStore });
    }

    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(event.id)}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
    );
    if (!checkoutResponse.ok) {
      console.error(`${LP} vérification checkout SumUp échouée :`, checkoutResponse.status);
      return new Response(null, { status: 500, headers: noStore });
    }
    const checkout = await checkoutResponse.json();

    const payment = await prisma.sumUpPayment.findUnique({
      where: { checkoutId: checkout.id },
    });
    if (!payment) {
      console.error(`${LP} paiement introuvable en base :`, checkout.id);
      return new Response(null, { status: 204, headers: noStore });
    }

    const customerEmail =
      typeof payment.customerEmail === "string" ? payment.customerEmail.trim() : "";
    if (!customerEmail || !EMAIL_RE.test(customerEmail)) {
      console.error(`${LP} e-mail client invalide :`, checkout.id);
      return new Response(null, { status: 204, headers: noStore });
    }

    await prisma.sumUpPayment.update({
      where: { checkoutId: checkout.id },
      data: { status: checkout.status },
    });

    if (checkout.status !== "PAID") {
      console.log(`${LP} paiement non final :`, checkout.status);
      return new Response(null, { status: 204, headers: noStore });
    }
    console.log(`${LP}[SUMUP_PAYMENT_PAID]`, { checkoutId: checkout.id, reference: payment.checkoutReference });

    if (payment.orderId) {
      console.log(`${LP} commande déjà créée :`, payment.orderId);
      return new Response(null, { status: 204, headers: noStore });
    }

    if (
      checkout.checkout_reference !== payment.checkoutReference ||
      Math.abs(Number(checkout.amount) - Number(payment.amount)) > 0.001 ||
      checkout.currency !== payment.currency
    ) {
      console.error(`${LP} données paiement SumUp incohérentes`);
      return new Response(null, { status: 204, headers: noStore });
    }

    const lock = await prisma.sumUpPayment.updateMany({
      where: { checkoutId: checkout.id, processing: false, orderId: null },
      data: { processing: true },
    });
    if (lock.count === 0) {
      console.log(`${LP} déjà en cours ou déjà finalisé`);
      return new Response(null, { status: 204, headers: noStore });
    }

    let orderWritten = false;
    try {
      const { admin } = await unauthenticated.admin(payment.shop);

      const existing = await findOrderByReference(admin, payment.checkoutReference);
      if (existing?.id) {
        await prisma.sumUpPayment.update({
          where: { checkoutId: checkout.id },
          data: { orderId: existing.id, statusPageUrl: existing.statusPageUrl, processing: false },
        });
        orderWritten = true;
        console.log(`${LP}[SHOPIFY_ORDER_ALREADY_EXISTS][ORDER_FINALIZED] commande adoptée :`, existing.id, existing.name);
        return new Response(null, { status: 204, headers: noStore });
      }

      console.log(`${LP}[SHOPIFY_ORDER_CREATE_START]`, { reference: payment.checkoutReference });
      const { order: orderInput, options } = buildOrderInput({
        email: customerEmail,
        currency: payment.currency,
        lineItems: [{ variantId: payment.variantId, quantity: payment.quantity ?? 1 }],
        amountChargedCents: Math.round(Number(payment.amount) * 100),
        reference: payment.checkoutReference,
      });

      const result = await createShopifyOrder(admin, orderInput, options);
      if (!result.ok) {
        console.error(`${LP}[SHOPIFY_ORDER_CREATE][SHOPIFY_ORDER_CREATE_FAILED] échec :`, {
          userErrors: formatUserErrors(result.userErrors),
          graphQLErrors: (result.graphQLErrors || []).map((e) => e?.message || String(e)),
        });
        return new Response(null, { status: 500, headers: noStore });
      }

      await prisma.sumUpPayment.update({
        where: { checkoutId: checkout.id },
        data: {
          orderId: result.order.id,
          statusPageUrl: result.order.statusPageUrl,
          processing: false,
        },
      });
      orderWritten = true;

      console.log(`${LP}[SHOPIFY_ORDER_CREATED][ORDER_FINALIZED][PAYMENT_FINALISED]`, {
        order: result.order.name,
        orderId: result.order.id,
        confirmation: result.order.confirmationNumber,
        financialStatus: result.order.displayFinancialStatus,
        amount: checkout.amount,
        currency: checkout.currency,
      });

      return new Response(null, { status: 204, headers: noStore });
    } finally {
      if (!orderWritten) {
        await prisma.sumUpPayment
          .updateMany({
            where: { checkoutId: checkout.id, orderId: null },
            data: { processing: false },
          })
          .catch((e) => console.error(`${LP} libération du verrou échouée :`, e?.message || e));
      }
    }
  } catch (error) {
    console.error(`${LP} exception :`, error?.message || error);
    return new Response(null, { status: 500, headers: noStore });
  }
};
