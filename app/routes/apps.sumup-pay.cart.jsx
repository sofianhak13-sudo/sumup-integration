import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, session } =
    await authenticate.public.appProxy(request);

  if (!admin || !session) {
    return new Response("Boutique non autorisée.", {
      status: 401,
    });
  }

  const formData = await request.formData();
  const cartRaw = formData.get("cart");
  const emailRaw = formData.get("email");
const email =
  typeof emailRaw === "string"
    ? emailRaw.trim()
    : "";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return new Response("Adresse e-mail invalide.", {
    status: 400,
  });
}

  if (!cartRaw || typeof cartRaw !== "string") {
    return new Response("Panier manquant.", {
      status: 400,
    });
  }

  let cart;

  try {
    cart = JSON.parse(cartRaw);
  } catch {
    return new Response("Panier invalide.", {
      status: 400,
    });
  }

  if (!Array.isArray(cart.items) || cart.items.length === 0) {
    return new Response("Le panier est vide.", {
      status: 400,
    });
  }

  const variantGids = cart.items.map(
  (item) => `gid://shopify/ProductVariant/${item.variant_id}`,
);

const variantsResponse = await admin.graphql(
  `#graphql
  query CartVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        price
        product {
          id
          title
        }
      }
    }
    shop {
      currencyCode
    }
  }`,
  {
    variables: {
      ids: variantGids,
    },
  },
);

const variantsData = await variantsResponse.json();
const variants = variantsData.data?.nodes || [];

const variantMap = new Map(
  variants
    .filter(Boolean)
    .map((variant) => [variant.id, variant]),
);

const verifiedItems = [];
let totalCents = 0;

for (const item of cart.items) {
  const quantity = Number(item.quantity);
  const variantId = `gid://shopify/ProductVariant/${item.variant_id}`;
  const variant = variantMap.get(variantId);

  if (!variant || !Number.isInteger(quantity) || quantity <= 0) {
    return new Response("Article du panier invalide.", {
      status: 400,
    });
  }

  const unitPrice = Number(variant.price);

  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return new Response("Prix Shopify invalide.", {
      status: 500,
    });
  }

  const unitCents = Math.round(unitPrice * 100);

  totalCents += unitCents * quantity;

  verifiedItems.push({
    variantId: variant.id,
    productId: variant.product.id,
    title: variant.product.title,
    quantity,
    unitAmount: unitCents / 100,
  });
}

const currency = variantsData.data?.shop?.currencyCode || "EUR";
const checkoutReference = `cart-${Date.now()}`;
const apiKey = process.env.SUMUP_API_KEY;
const merchantCode = process.env.SUMUP_MERCHANT_CODE;

if (!apiKey || !merchantCode) {
  return new Response("Configuration SumUp manquante.", {
    status: 500,
  });
}
if (totalCents <= 0) {
  return new Response("Montant du panier invalide.", {
    status: 400,
  });
}

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
      amount: totalCents / 100,
      currency,
      merchant_code: merchantCode,
      description: `Panier Shopify - ${verifiedItems.length} article(s)`,
      return_url:
        "https://sumup-integration-dwm1.onrender.com/api/sumup-cart-webhook",
      hosted_checkout: {
        enabled: true,
      },
    }),
  },
);

const sumupData = await sumupResponse.json();

if (!sumupResponse.ok || !sumupData.id) {
  console.error("ERREUR CREATION CHECKOUT PANIER SUMUP :", sumupData);

  return new Response("Impossible de créer le paiement SumUp.", {
    status: 500,
  });
}
await prisma.sumUpCartPayment.create({
  data: {
    checkoutId: sumupData.id,
    checkoutReference,
    shop: session.shop,
    customerEmail: email,
    items: verifiedItems,
    amount: totalCents / 100,
    currency,
    status: sumupData.status || "PENDING",
  },
});

if (!sumupData.hosted_checkout_url) {
  return new Response(
    "SumUp n'a pas renvoyé d'URL de paiement.",
    { status: 500 },
  );
}

return new Response(null, {
  status: 302,
  headers: {
    Location: sumupData.hosted_checkout_url,
  },
});
};