import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  money,
  toCents,
  catalogSubtotalCents,
  discountCentsFromCart,
  totalsDiverge,
  firstRejectedCode,
  parseDiscountCodesHint,
  parseCartAttributes,
} from "../lib/cart-pricing.server";
import { getMerchantSettings } from "../lib/merchant-settings.server";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Expires: "0",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Small user-facing page shown when we must stop the buyer *before* SumUp
// (stale discount, amount changed, cart needs a refresh). Never charges.
const blockPage = (liquid, message) =>
  liquid(
    `<div style="font-family:inherit;max-width:520px;margin:40px auto;padding:0 20px;text-align:center;">
      <h2 style="margin:0 0 12px;">Votre panier a besoin d'être actualisé</h2>
      <p style="margin:0 0 20px;color:#444;">${message}</p>
      <a href="/cart" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1a1a1a;color:#fff;text-decoration:none;font-weight:600;">Retour au panier</a>
    </div>`,
    { layout: false, status: 409, headers: noStoreHeaders },
  );

export const action = async ({ request }) => {
  const { admin, session, storefront, liquid } =
    await authenticate.public.appProxy(request);

  if (!admin || !session || !storefront) {
    return new Response("Boutique non autorisée.", {
      status: 401,
      headers: noStoreHeaders,
    });
  }

  const settings = await getMerchantSettings(session.shop);
  if (!settings.cartPaymentsEnabled) {
    return blockPage(
      liquid,
      "Le paiement SumUp du panier est actuellement indisponible.",
    );
  }

  const formData = await request.formData();
  const cartRaw = formData.get("cart");
  const emailRaw = formData.get("email");
  const discountCodesRaw = formData.get("discountCodes");
  const cartAttributes = parseCartAttributes(formData.get("cartAttributes"));
  const cartToken =
    typeof formData.get("cartToken") === "string"
      ? formData.get("cartToken")
      : null;
  const indicativeTotalCents = Number.parseInt(
    formData.get("cartTotal"),
    10,
  );

  const email =
    typeof emailRaw === "string" ? emailRaw.trim() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return new Response("Adresse e-mail invalide.", {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  if (!cartRaw || typeof cartRaw !== "string") {
    return new Response("Panier manquant.", {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  let cart;
  try {
    cart = JSON.parse(cartRaw);
  } catch {
    return new Response("Panier invalide.", {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  if (!Array.isArray(cart.items) || cart.items.length === 0) {
    return new Response("Le panier est vide.", {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  // Discount codes are only a *hint* from the browser. Shopify re-validates
  // them below; the browser can never set a price.
  const submittedCodes = parseDiscountCodesHint(discountCodesRaw);

  // ---------------------------------------------------------------------------
  // 1. Validate the requested variants against the Admin API (existence,
  //    availability, product title for the audit snapshot / order description).
  // ---------------------------------------------------------------------------
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
            availableForSale
            product { id title }
          }
        }
      }
    `,
    { variables: { ids: variantGids } },
  );

  const variantsData = await variantsResponse.json();
  const variantMap = new Map(
    (variantsData.data?.nodes || [])
      .filter(Boolean)
      .map((variant) => [variant.id, variant]),
  );

  const verifiedItems = [];
  const storefrontLines = [];

  for (const item of cart.items) {
    const quantity = Number(item.quantity);
    const variantId = `gid://shopify/ProductVariant/${item.variant_id}`;
    const variant = variantMap.get(variantId);

    if (!variant || !Number.isInteger(quantity) || quantity <= 0) {
      return blockPage(
        liquid,
        "Un article de votre panier n'est plus disponible. Vérifiez votre panier avant de continuer.",
      );
    }

    if (variant.availableForSale === false) {
      return blockPage(
        liquid,
        `« ${variant.product.title} » n'est plus disponible à la vente.`,
      );
    }

    verifiedItems.push({
      variantId: variant.id,
      productId: variant.product.id,
      title: variant.product.title,
      quantity,
      catalogUnitAmount: money(variant.price),
    });
    storefrontLines.push({ merchandiseId: variant.id, quantity });
  }

  // ---------------------------------------------------------------------------
  // 2. Let Shopify recompute the cart (line/cart discounts, discount codes and
  //    automatic discounts) via the Storefront Cart API. This is the source of
  //    truth for the amount SumUp will charge.
  // ---------------------------------------------------------------------------
  const cartResponse = await storefront.graphql(
    `#graphql
      mutation SumUpCartCalculate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            cost {
              subtotalAmount { amount currencyCode }
              totalAmount { amount currencyCode }
            }
            discountCodes { code applicable }
            discountAllocations { discountedAmount { amount currencyCode } }
            lines(first: 250) {
              nodes {
                quantity
                discountAllocations { discountedAmount { amount currencyCode } }
                merchandise { ... on ProductVariant { id } }
              }
            }
          }
          userErrors { field message code }
          warnings { code target message }
        }
      }
    `,
    {
      variables: {
        input: {
          lines: storefrontLines,
          discountCodes: submittedCodes,
          attributes: cartAttributes,
          buyerIdentity: { email },
        },
      },
    },
  );

  const cartJson = await cartResponse.json();
  const created = cartJson.data?.cartCreate;
  const calcCart = created?.cart;
  const userErrors = created?.userErrors || [];

  if (userErrors.length > 0 || !calcCart) {
    console.error("CARTCREATE STOREFRONT ERREUR :", {
      userErrors,
      graphQLErrors: cartJson.errors,
    });
    return blockPage(
      liquid,
      "Nous n'avons pas pu recalculer votre panier. Actualisez votre panier avant de continuer.",
    );
  }

  // Option B — a code that was applied in the cart but is no longer accepted
  // by Shopify must stop the flow. No silent full-price charge.
  const returnedCodes = calcCart.discountCodes || [];
  if (firstRejectedCode(submittedCodes, returnedCodes)) {
    return blockPage(
      liquid,
      "Cette réduction n'est plus applicable. Actualisez votre panier avant de continuer.",
    );
  }

  const currency = calcCart.cost?.totalAmount?.currencyCode || "EUR";
  const shopifyTotalCents = toCents(calcCart.cost?.totalAmount?.amount);
  const storefrontSubtotal = money(calcCart.cost?.subtotalAmount?.amount);

  // The Shopify order lines are billed at catalog price; the order's fixed
  // discount is (catalog subtotal - amount charged). Charging exactly
  // `catalog - discount` guarantees, by construction:
  //   order total == SumUp checkout == PAID amount == catalog - discount.
  const catalogCents = catalogSubtotalCents(verifiedItems);
  if (shopifyTotalCents - catalogCents > 1) {
    // Shopify's total is above the catalog sum by more than a rounding cent
    // (surcharge / market pricing) — can't be modelled as an order discount.
    console.warn("PANIER INCOHERENT (total > catalogue) :", {
      catalogCents,
      shopifyTotalCents,
    });
    return blockPage(
      liquid,
      "Le montant de votre panier est incohérent. Actualisez votre panier avant de continuer.",
    );
  }
  const totalCents = Math.min(shopifyTotalCents, catalogCents);
  const discountCents = catalogCents - totalCents;
  // Kept only for the audit trail — the order uses `discountCents` above.
  const allocatedDiscountCents = discountCentsFromCart(calcCart);

  // Cross-check against what the buyer's cart displayed (indicative only).
  if (totalsDiverge(shopifyTotalCents, indicativeTotalCents)) {
    console.warn("ECART PANIER AFFICHE vs SERVEUR :", {
      indicativeTotalCents,
      shopifyTotalCents,
      cartToken,
    });
    return blockPage(
      liquid,
      "Le montant de votre panier a changé. Actualisez votre panier avant de continuer.",
    );
  }

  if (totalCents <= 0) {
    return blockPage(
      liquid,
      "Le montant de votre panier est invalide. Actualisez votre panier avant de continuer.",
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Create the SumUp checkout for exactly the Shopify-validated total.
  // ---------------------------------------------------------------------------
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!apiKey || !merchantCode) {
    return new Response("Configuration SumUp manquante.", {
      status: 500,
      headers: noStoreHeaders,
    });
  }

  const applicableCodes = returnedCodes
    .filter((c) => c.applicable !== false && c.code)
    .map((c) => c.code);

  const checkoutReference = `cart-${Date.now()}`;
  const description =
    discountCents > 0
      ? `Panier Shopify - ${verifiedItems.length} article(s) (remise incluse)`
      : `Panier Shopify - ${verifiedItems.length} article(s)`;

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
        description,
        return_url:
          "https://sumup-integration-dwm1.onrender.com/api/sumup-cart-webhook",
        redirect_url: `https://lebonplan-ebook.com/apps/sumup-pay/cart/return?reference=${encodeURIComponent(
          checkoutReference,
        )}`,
        hosted_checkout: { enabled: true },
      }),
    },
  );

  const sumupData = await sumupResponse.json();

  if (!sumupResponse.ok || !sumupData.id) {
    console.error("ERREUR CREATION CHECKOUT PANIER SUMUP :", sumupData);
    return new Response("Impossible de créer le paiement SumUp.", {
      status: 500,
      headers: noStoreHeaders,
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
      subtotalAmount: catalogCents / 100,
      discountAmount: discountCents / 100,
      discountCodes: applicableCodes,
      cartToken,
      snapshot: {
        source: "storefront-cart",
        cartId: calcCart.id,
        currency,
        catalogSubtotal: catalogCents / 100,
        storefrontSubtotal,
        shopifyTotal: shopifyTotalCents / 100,
        amountCharged: totalCents / 100,
        discountAmount: discountCents / 100,
        allocatedDiscount: allocatedDiscountCents / 100,
        discountCodes: applicableCodes,
        indicativeTotalCents: Number.isFinite(indicativeTotalCents)
          ? indicativeTotalCents
          : null,
        items: verifiedItems,
        discountAllocations: calcCart.discountAllocations || [],
      },
      status: sumupData.status || "PENDING",
    },
  });

  if (!sumupData.hosted_checkout_url) {
    return new Response("SumUp n'a pas renvoyé d'URL de paiement.", {
      status: 500,
      headers: noStoreHeaders,
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      ...noStoreHeaders,
      Location: sumupData.hosted_checkout_url,
    },
  });
};
