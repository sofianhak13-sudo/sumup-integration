import { authenticate } from "../shopify.server";
import prisma from "../db.server";
export const loader = async ({ request }) => {
  await authenticate.public.appProxy(request);

  return new Response("Connexion App Proxy OK", {
    headers: {
      "Content-Type": "text/plain",
    },
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.public.appProxy(request);

  if (!admin) {
    return new Response("Boutique non autorisée.", { status: 401 });
  }

  const formData = await request.formData();
  const productId = formData.get("productId");
const emailRaw = formData.get("email");
const email = typeof emailRaw === "string" ? emailRaw.trim() : "";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return new Response("Adresse e-mail invalide.", { status: 400 });
}
  if (!productId) {
    return new Response("Produit Shopify manquant.", { status: 400 });
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
          variants(first: 1) {
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
  const variant = product?.variants?.nodes?.[0];
const price = variant?.price;

  if (!product || !price) {
    return new Response(
      "Impossible de récupérer le prix du produit Shopify.",
      { status: 400 },
    );
  }

  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!apiKey || !merchantCode) {
    return new Response("Configuration SumUp manquante.", { status: 500 });
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
        amount: Number(price),
        currency: "EUR",
        merchant_code: merchantCode,
        description: product.title,
        return_url: "https://sumup-integration-dwm1.onrender.com/api/sumup-webhook",
        redirect_url: "https://lebonplan-ebook.com",
        hosted_checkout: {
          enabled: true,
        },
      }),
    },
  );

  const sumupData = await sumupResponse.json();
console.log("CHECKOUT SUMUP ID :", sumupData.id);
console.log("CHECKOUT SUMUP STATUS :", sumupData.status);
  if (!sumupResponse.ok) {
    return new Response(
      `Erreur SumUp ${sumupResponse.status}: ${JSON.stringify(sumupData)}`,
      { status: 500 },
    );
  }

  if (!sumupData.hosted_checkout_url) {
    return new Response(
      "SumUp n'a pas renvoyé d'URL de paiement.",
      { status: 500 },
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
    status: 302,
    headers: {
      Location: sumupData.hosted_checkout_url,
    },
  });
};