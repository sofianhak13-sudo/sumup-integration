import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMerchantSettings } from "../lib/merchant-settings.server";
import { createSumUpCheckout, sumupConfigured } from "../lib/sumup.server";
import { selectRequestedVariant } from "../lib/variants.server";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

export const loader = async ({ request }) => {
  await authenticate.public.appProxy(request);

  return new Response("Connexion App Proxy OK", {
    headers: {
      ...noStoreHeaders,
      "Content-Type": "text/plain",
    },
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.public.appProxy(request);

  if (!admin) {
    return new Response("Boutique non autorisée.", {
      status: 401,
      headers: noStoreHeaders,
    });
  }

  const formData = await request.formData();

  const productId = formData.get("productId");
  const requestedVariantId = formData.get("variantId");
  const quantity = Math.max(
    1,
    Math.min(99, Number.parseInt(formData.get("quantity"), 10) || 1),
  );

  // Advanced checkout on → hand off to the checkout page. The variant is
  // passed along so the page adds it to the cart before rendering.
  const settings = session ? await getMerchantSettings(session.shop) : null;
  if (settings?.advancedCheckoutEnabled) {
    const params = new URLSearchParams();
    if (typeof requestedVariantId === "string" && requestedVariantId) {
      params.set("add", requestedVariantId);
    }
    params.set("qty", String(quantity));
    return new Response(null, {
      status: 303,
      headers: {
        ...noStoreHeaders,
        Location: `/apps/sumup-pay/checkout?${params.toString()}`,
      },
    });
  }
  const emailRaw = formData.get("email");
  const email = typeof emailRaw === "string" ? emailRaw.trim() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response("Adresse e-mail invalide.", {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  if (!productId) {
    return new Response("Produit Shopify manquant.", {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  const gid = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const productResponse = await admin.graphql(
    `#graphql
      query GetProductForSumUp($id: ID!) {
        product(id: $id) {
          id
          title
          variants(first: 100) {
            nodes {
              id
              price
              availableForSale
            }
          }
        }
        shop {
          currencyCode
        }
      }
    `,
    {
      variables: {
        id: gid,
      },
    },
  );

  const productData = await productResponse.json();
  const product = productData.data?.product;
  const variantNodes = product?.variants?.nodes ?? [];

  if (!product) {
    return new Response(
      "Impossible de récupérer le prix du produit Shopify.",
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  // The browser only *suggests* a variant. The server stays the source of
  // truth: an explicit request for a variant that isn't one of this
  // product's own variants is rejected outright — it must never silently
  // fall back to a different variant, which could charge the wrong price
  // for the wrong offer.
  const selection = selectRequestedVariant(variantNodes, requestedVariantId);
  if (!selection.ok) {
    const message =
      selection.reason === "unknown_variant"
        ? "Variante Shopify invalide pour ce produit."
        : "Impossible de récupérer le prix du produit Shopify.";
    return new Response(message, {
      status: 400,
      headers: noStoreHeaders,
    });
  }
  const variant = selection.variant;

  const unitPrice = Number(variant?.price);

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return new Response(
      "Impossible de récupérer le prix du produit Shopify.",
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  const currency = productData.data?.shop?.currencyCode || "EUR";
  const amount = Math.round(unitPrice * 100 * quantity) / 100;

  if (!sumupConfigured()) {
    return new Response("Configuration SumUp manquante.", {
      status: 500,
      headers: noStoreHeaders,
    });
  }

  const checkoutReference = `shopify-${productId}-${Date.now()}`;

  const sumup = await createSumUpCheckout({
    amountCents: Math.round(amount * 100),
    currency,
    reference: checkoutReference,
    description:
      quantity > 1 ? `${product.title} × ${quantity}` : product.title,
    returnUrl: "https://sumup-integration-dwm1.onrender.com/api/sumup-webhook",
    redirectUrl: `https://lebonplan-ebook.com/apps/sumup-pay/return?reference=${encodeURIComponent(
      checkoutReference,
    )}`,
  });

  if (!sumup.ok) {
    return new Response(
      `Erreur SumUp ${sumup.status}: ${JSON.stringify(sumup.data)}`,
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }

  if (!sumup.data.hosted_checkout_url) {
    return new Response(
      "SumUp n'a pas renvoyé d'URL de paiement.",
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }

  await prisma.sumUpPayment.create({
    data: {
      checkoutId: sumup.data.id,
      checkoutReference: checkoutReference,
      shop: session.shop,
      productId: product.id,
      variantId: variant.id,
      quantity,
      amount,
      currency,
      status: sumup.data.status || "PENDING",
      customerEmail: email,
    },
  });

  console.log("[SUMUP_CHECKOUT_CREATED]", {
    checkoutId: sumup.data.id,
    reference: checkoutReference,
    amount,
    currency,
  });

  return new Response(null, {
    status: 303,
    headers: {
      ...noStoreHeaders,
      Location: sumup.data.hosted_checkout_url,
    },
  });
};