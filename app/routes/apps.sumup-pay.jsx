import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMerchantSettings } from "../lib/merchant-settings.server";

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

  // The browser only *suggests* a variant. The server stays the source of
  // truth: we look the id up in the product's own variant list and fall back
  // to the first available one, so a tampered/stale id can never set a price.
  const requestedGid =
    typeof requestedVariantId === "string" && requestedVariantId
      ? requestedVariantId.startsWith("gid://")
        ? requestedVariantId
        : `gid://shopify/ProductVariant/${requestedVariantId}`
      : null;

  const variant =
    (requestedGid && variantNodes.find((node) => node.id === requestedGid)) ||
    variantNodes.find((node) => node.availableForSale) ||
    variantNodes[0] ||
    null;

  const unitPrice = Number(variant?.price);

  if (!product || !variant || !Number.isFinite(unitPrice) || unitPrice <= 0) {
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

  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!apiKey || !merchantCode) {
    return new Response("Configuration SumUp manquante.", {
      status: 500,
      headers: noStoreHeaders,
    });
  }

  const checkoutReference = `shopify-${productId}-${Date.now()}`;

  const sumupResponse = await fetch(
    "https://api.sumup.com/v0.1/checkouts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        checkout_reference: checkoutReference,
        amount,
        currency,
        merchant_code: merchantCode,
        description:
          quantity > 1 ? `${product.title} × ${quantity}` : product.title,
        return_url:
          "https://sumup-integration-dwm1.onrender.com/api/sumup-webhook",
        redirect_url: `https://lebonplan-ebook.com/apps/sumup-pay/return?reference=${encodeURIComponent(
          checkoutReference,
        )}`,
        hosted_checkout: {
          enabled: true,
        },
      }),
    },
  );

  const sumupData = await sumupResponse.json();

  if (!sumupResponse.ok) {
    return new Response(
      `Erreur SumUp ${sumupResponse.status}: ${JSON.stringify(sumupData)}`,
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }

  if (!sumupData.hosted_checkout_url) {
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
      checkoutId: sumupData.id,
      checkoutReference: checkoutReference,
      shop: session.shop,
      productId: product.id,
      variantId: variant.id,
      quantity,
      amount,
      currency,
      status: sumupData.status || "PENDING",
      customerEmail: email,
    },
  });

  return new Response(null, {
    status: 303,
    headers: {
      ...noStoreHeaders,
      Location: sumupData.hosted_checkout_url,
    },
  });
};