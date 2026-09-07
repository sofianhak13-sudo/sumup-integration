import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { buildOrderInput } from "../lib/order-input.js";
import { createShopifyOrder, findOrderByReference } from "../lib/sumup-order.server";

const LP = "[SUMUP_CART_WEBHOOK]";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const noStore = { "Cache-Control": "no-store" };

/**
 * SumUp `return_url` callback for the cart / Checkout V2 flow.
 *
 * Idempotency: `payment.orderId` guard + atomic `processing` lock (released in
 * a finally block on every failure path) + `sumup-ref-<reference>` order tag
 * (adopts an order created by a prior attempt whose DB write failed).
 * Shopify's native order-confirmation email is triggered via
 * `options.sendReceipt = true`; no custom mail is ever sent.
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

    // Confirm the payment directly with SumUp — never trust a status relayed
    // by the browser.
    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(event.id)}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
    );
    if (!checkoutResponse.ok) {
      console.error(`${LP} vérification checkout SumUp échouée :`, checkoutResponse.status);
      return new Response(null, { status: 500, headers: noStore });
    }
    const checkout = await checkoutResponse.json();

    const payment = await prisma.sumUpCartPayment.findUnique({
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

    await prisma.sumUpCartPayment.update({
      where: { checkoutId: checkout.id },
      data: { status: checkout.status },
    });

    if (checkout.status !== "PAID") {
      console.log(`${LP} paiement non final :`, checkout.status);
      return new Response(null, { status: 204, headers: noStore });
    }

    if (payment.orderId) {
      console.log(`${LP} commande déjà créée :`, payment.orderId);
      return new Response(null, { status: 204, headers: noStore });
    }

    // Amount / currency / reference cross-check against what we persisted.
    if (
      checkout.checkout_reference !== payment.checkoutReference ||
      Math.abs(Number(checkout.amount) - Number(payment.amount)) > 0.001 ||
      checkout.currency !== payment.currency
    ) {
      console.error(`${LP} données paiement SumUp incohérentes`, {
        ref: [checkout.checkout_reference, payment.checkoutReference],
        amount: [checkout.amount, payment.amount],
        currency: [checkout.currency, payment.currency],
      });
      return new Response(null, { status: 204, headers: noStore });
    }

    const items = Array.isArray(payment.items) ? payment.items : [];
    const validItems =
      items.length > 0 &&
      items.every(
        (item) =>
          typeof item?.variantId === "string" &&
          item.variantId.startsWith("gid://shopify/ProductVariant/") &&
          Number.isInteger(Number(item.quantity)) &&
          Number(item.quantity) > 0,
      );
    if (!validItems) {
      console.error(`${LP} articles enregistrés invalides :`, checkout.id);
      return new Response(null, { status: 204, headers: noStore });
    }

    // --- atomic lock ---
    const lock = await prisma.sumUpCartPayment.updateMany({
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

      // Layer 3: an order may already exist from a prior attempt whose DB
      // write failed. Adopt it instead of creating a duplicate.
      const existing = await findOrderByReference(admin, payment.checkoutReference);
      if (existing?.id) {
        await prisma.sumUpCartPayment.update({
          where: { checkoutId: checkout.id },
          data: { orderId: existing.id, statusPageUrl: existing.statusPageUrl, processing: false },
        });
        orderWritten = true;
        console.log(`${LP}[ORDER_FINALIZED] commande adoptée :`, existing.id, existing.name);
        return new Response(null, { status: 204, headers: noStore });
      }

      const discountCodes = Array.isArray(payment.discountCodes)
        ? payment.discountCodes.filter(Boolean)
        : [];

      const { order: orderInput, options } = buildOrderInput({
        email: customerEmail,
        phone: payment.phone || undefined,
        firstName: payment.firstName || undefined,
        lastName: payment.lastName || undefined,
        currency: payment.currency,
        lineItems: items.map((i) => ({ variantId: i.variantId, quantity: Number(i.quantity) })),
        amountChargedCents: Math.round(Number(payment.amount) * 100),
        orderDiscountCents: Math.round((Number(payment.discountAmount) || 0) * 100),
        shippingCents: Math.round((Number(payment.shippingAmount) || 0) * 100),
        shippingMethod: payment.shippingMethod || null,
        shippingAddress: payment.shippingAddress || null,
        billingAddress: payment.billingAddress || null,
        discountCodes,
        reference: payment.checkoutReference,
        // taxesIncluded left unset -> Shopify uses the shop's own setting.
      });

      const result = await createShopifyOrder(admin, orderInput, options);
      if (!result.ok) {
        console.error(`${LP}[SHOPIFY_ORDER_CREATE] échec :`, {
          userErrors: result.userErrors,
          graphQLErrors: result.graphQLErrors,
        });
        return new Response(null, { status: 500, headers: noStore });
      }

      await prisma.sumUpCartPayment.update({
        where: { checkoutId: checkout.id },
        data: {
          orderId: result.order.id,
          statusPageUrl: result.order.statusPageUrl,
          processing: false,
        },
      });
      orderWritten = true;

      console.log(`${LP}[ORDER_FINALIZED]`, {
        order: result.order.name,
        orderId: result.order.id,
        confirmation: result.order.confirmationNumber,
        financialStatus: result.order.displayFinancialStatus,
        amount: checkout.amount,
        currency: checkout.currency,
        mode: payment.checkoutMode,
      });

      return new Response(null, { status: 204, headers: noStore });
    } finally {
      // Release the lock on every failure path so a retry can pick it up —
      // no more manual `processing = false` in production. Only skip when the
      // orderId was actually written.
      if (!orderWritten) {
        await prisma.sumUpCartPayment
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
