import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getSumUpCredentials, sumupFetch } from "../sumup.server";

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
            }
          }
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
  const variants = product?.variants?.nodes || [];

  // La plupart des produits n'ont qu'une seule variante ; si le storefront
  // précise une variante (ex : un produit à plusieurs offres/niveaux), on
  // l'utilise et on vérifie qu'elle appartient bien à ce produit — on ne
  // se rabat sur la première variante que si aucune n'est demandée.
  let variant;

  if (typeof requestedVariantId === "string" && requestedVariantId.trim()) {
    const requestedGid = requestedVariantId.startsWith("gid://")
      ? requestedVariantId
      : `gid://shopify/ProductVariant/${requestedVariantId}`;

    variant = variants.find((node) => node.id === requestedGid);

    if (!variant) {
      return new Response(
        "Variante Shopify invalide pour ce produit.",
        {
          status: 400,
          headers: noStoreHeaders,
        },
      );
    }
  } else {
    variant = variants[0];
  }

  const price = variant?.price;

  if (!product || !price) {
    return new Response(
      "Impossible de récupérer le prix du produit Shopify.",
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  const { apiKey, merchantCode } = getSumUpCredentials();

  if (!apiKey || !merchantCode) {
    return new Response("Configuration SumUp manquante.", {
      status: 500,
      headers: noStoreHeaders,
    });
  }

  const checkoutReference = `shopify-${productId}-${Date.now()}`;

  console.log("CHECKOUT REFERENCE :", checkoutReference);

  let sumupResponse;

  try {
    sumupResponse = await sumupFetch("/checkouts", {
      method: "POST",
      body: {
        checkout_reference: checkoutReference,
        amount: Number(price),
        currency: "EUR",
        merchant_code: merchantCode,
        description: product.title,
        return_url:
          "https://sumup-integration-dwm1.onrender.com/api/sumup-webhook",
        redirect_url: `https://lebonplan-ebook.com/apps/sumup-pay/return?reference=${encodeURIComponent(
          checkoutReference,
        )}`,
        hosted_checkout: {
          enabled: true,
        },
      },
    });
  } catch (fetchError) {
    console.error("Impossible de contacter SumUp :", fetchError);
    return new Response("Impossible de contacter SumUp.", {
      status: 500,
      headers: noStoreHeaders,
    });
  }

  const sumupData = await sumupResponse.json();

  console.log("CHECKOUT SUMUP ID :", sumupData.id);
  console.log("CHECKOUT SUMUP STATUS :", sumupData.status);

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
      amount: Number(price),
      currency: "EUR",
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