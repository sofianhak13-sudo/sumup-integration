import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { pendingScreen, successScreen } from "../lib/return-screens.server";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Expires: "0",
};

// Shared by the cart fast flow and Checkout V2 (both write SumUpCartPayment).
export const loader = async ({ request }) => {
  const { session, liquid } = await authenticate.public.appProxy(request);
  if (!session) {
    return new Response("Session Shopify introuvable.", { status: 401, headers: noStoreHeaders });
  }

  const reference = new URL(request.url).searchParams.get("reference");
  if (!reference) {
    return new Response("Référence de paiement manquante.", { status: 400, headers: noStoreHeaders });
  }

  const payment = await prisma.sumUpCartPayment.findUnique({
    where: { checkoutReference: reference },
  });
  if (!payment || payment.shop !== session.shop) {
    return new Response("Paiement introuvable.", { status: 404, headers: noStoreHeaders });
  }

  if (payment.statusPageUrl) {
    return liquid(
      successScreen({ key: "sumupCartReturnAttempts", statusPageUrl: payment.statusPageUrl }),
      { layout: false, headers: noStoreHeaders },
    );
  }

  return liquid(
    pendingScreen({
      key: "sumupCartReturnAttempts",
      paid: payment.status === "PAID",
      reference,
      shopUrl: "/",
    }),
    { layout: false, headers: noStoreHeaders },
  );
};
