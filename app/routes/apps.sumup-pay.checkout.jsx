import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMerchantSettings } from "../lib/merchant-settings.server";
import { resolveCheckoutConfig, validateContact, validateAddress } from "../lib/checkout-config.js";
import { checkoutPage } from "../lib/checkout-screens.server";
import { verifyCartVariants } from "../lib/variants.server";
import { recalcCart } from "../lib/storefront-cart.server";
import {
  catalogSubtotalCents,
  firstRejectedCode,
  parseDiscountCodesHint,
  parseCartAttributes,
} from "../lib/cart-pricing.server";
import { breakdownFromCart, reconcileOrder, totalsDiverge } from "../lib/checkout-totals.js";
import { createSumUpCheckout, sumupConfigured } from "../lib/sumup.server";
import { appUrl, storefrontUrl } from "../lib/urls.server";

const ACTION_PATH = "/apps/sumup-pay/checkout";
const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", Expires: "0" };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...noStore },
  });

/* -------------------------------------------------------------------------- */
/* GET — render the checkout page                                              */
/* -------------------------------------------------------------------------- */

export const loader = async ({ request }) => {
  const { session, liquid } = await authenticate.public.appProxy(request);
  if (!session) {
    return new Response("Session Shopify introuvable.", { status: 401, headers: noStore });
  }

  const settings = await getMerchantSettings(session.shop);
  const config = resolveCheckoutConfig(settings);

  if (!config.advancedCheckoutEnabled) {
    // The advanced checkout is off — nothing to show here.
    return new Response(null, { status: 302, headers: { ...noStore, Location: "/cart" } });
  }

  const url = new URL(request.url);
  const customerEmail = url.searchParams.get("email") || "";

  return liquid(
    checkoutPage({ config, cartUrl: "/cart", actionPath: ACTION_PATH, customerEmail }),
    { layout: false, headers: noStore },
  );
};

/* -------------------------------------------------------------------------- */
/* POST — intent = quote | shipping | pay                                      */
/* -------------------------------------------------------------------------- */

export const action = async ({ request }) => {
  const { admin, session, storefront } = await authenticate.public.appProxy(request);
  if (!admin || !session || !storefront) {
    return json({ ok: false, message: "Boutique non autorisée." }, 401);
  }

  const settings = await getMerchantSettings(session.shop);
  const config = resolveCheckoutConfig(settings);
  if (!config.advancedCheckoutEnabled) {
    return json({ ok: false, message: "Le paiement avancé est désactivé." }, 403);
  }

  const form = await request.formData();
  const intent = String(form.get("intent") || "quote");

  // --- parse cart payload ---
  let cart;
  try {
    cart = JSON.parse(String(form.get("cart") || "null"));
  } catch {
    return json({ ok: false, message: "Panier invalide." }, 400);
  }
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return json({ ok: false, blocked: true, message: "Votre panier est vide." }, 200);
  }

  // --- contact + addresses (server is authoritative) ---
  const contactInput = {
    email: form.get("email"),
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    phone: form.get("phone"),
    company: form.get("company"),
  };
  const contact = validateContact(contactInput, config);

  const readAddr = (prefix) => ({
    firstName: form.get(`${prefix}.firstName`),
    lastName: form.get(`${prefix}.lastName`),
    company: form.get(`${prefix}.company`),
    address1: form.get(`${prefix}.address1`),
    address2: form.get(`${prefix}.address2`),
    zip: form.get(`${prefix}.zip`),
    city: form.get(`${prefix}.city`),
    province: form.get(`${prefix}.province`),
    provinceCode: form.get(`${prefix}.province`),
    countryCode: form.get(`${prefix}.countryCode`),
  });

  const shippingRes = validateAddress(readAddr("shipping"), config.shippingAddress, "shipping");
  const billingSame = form.get("billingSame") === "1" || form.get("billingSame") === "on";
  const billingLevel =
    config.billingAddress === "disabled" || billingSame ? "disabled" : "required";
  const billingRes = validateAddress(readAddr("billing"), billingLevel, "billing");

  const email = contact.values.email;
  // Every intent needs a valid email for the Storefront buyerIdentity.
  if (!email) {
    return json({ ok: false, errors: contact.errors, message: "Adresse e-mail invalide." }, 200);
  }

  if (intent === "pay") {
    const errors = { ...contact.errors, ...shippingRes.errors, ...billingRes.errors };
    if (Object.keys(errors).length) {
      return json({ ok: false, errors, message: "Merci de corriger les champs en rouge." }, 200);
    }
  }

  // --- verify variants against the Admin API ---
  const verified = await verifyCartVariants(admin, cart.items);
  if (!verified.ok) {
    const msg =
      verified.reason === "unavailable"
        ? `« ${verified.unavailableTitle} » n'est plus disponible à la vente.`
        : "Un article de votre panier n'est plus disponible. Vérifiez votre panier.";
    return json({ ok: false, blocked: true, message: msg }, 200);
  }
  const { verifiedItems, storefrontLines, currencyCode: shopCurrency } = verified;
  const catalogCents = catalogSubtotalCents(
    verifiedItems.map((i) => ({ catalogUnitAmount: i.catalogUnitAmount, quantity: i.quantity })),
  );

  // --- Storefront re-price (discounts + — with an address — shipping/tax) ---
  const submittedCodes = parseDiscountCodesHint(form.get("discountCodes"));
  const attributes = parseCartAttributes(form.get("cartAttributes"));
  const shippingAddress = shippingRes.values; // null when disabled/blank
  const useDelivery = config.shipping && Boolean(shippingAddress);
  const selectedOptionHandle = String(form.get("shippingOptionHandle") || "") || null;

  const recalc = await recalcCart(storefront, {
    storefrontLines,
    discountCodes: submittedCodes,
    attributes,
    email,
    countryCode: shippingAddress?.countryCode || undefined,
    deliveryAddress: useDelivery ? shippingAddress : null,
    selectedOptionHandle: intent === "shipping" ? null : selectedOptionHandle,
  });

  if (!recalc.ok) {
    return json(
      { ok: false, blocked: true, message: "Nous n'avons pas pu recalculer votre panier. Actualisez votre panier avant de continuer." },
      200,
    );
  }
  const calcCart = recalc.cart;

  // Stale discount code that Shopify no longer accepts -> stop (never a silent
  // full-price charge).
  const returnedCodes = calcCart.discountCodes || [];
  if (firstRejectedCode(submittedCodes, returnedCodes)) {
    return json(
      { ok: false, blocked: true, message: "Cette réduction n'est plus applicable. Actualisez votre panier avant de continuer." },
      200,
    );
  }

  const breakdown = breakdownFromCart(calcCart, catalogCents);
  const applicableCodes = returnedCodes.filter((c) => c.applicable !== false && c.code).map((c) => c.code);

  // --- intent: shipping (list options) ---
  if (intent === "shipping") {
    return json({
      ok: true,
      options: recalc.deliveryOptions || [],
      message: (recalc.deliveryOptions || []).length ? undefined : "Aucun mode de livraison pour cette adresse.",
    });
  }

  // --- intent: quote (authoritative totals for the summary) ---
  if (intent === "quote") {
    return json({ ok: true, breakdown });
  }

  // --- intent: pay ---
  if (config.shipping && !selectedOptionHandle) {
    return json({ ok: false, message: "Sélectionnez un mode de livraison." }, 200);
  }

  const indicativeTotalCents = Number.parseInt(form.get("cartTotal"), 10);
  if (totalsDiverge(breakdown.totalCents, indicativeTotalCents)) {
    return json(
      { ok: false, blocked: true, message: "Le montant de votre panier a changé. Actualisez votre panier avant de continuer." },
      200,
    );
  }

  const reconcile = reconcileOrder(breakdown);
  if (!reconcile.ok) {
    const msg =
      reconcile.reason === "total_above_catalog"
        ? "Le montant de votre panier est incohérent. Actualisez votre panier avant de continuer."
        : "Le montant de votre panier est invalide. Actualisez votre panier avant de continuer.";
    return json({ ok: false, blocked: true, message: msg }, 200);
  }

  if (!sumupConfigured()) {
    return json({ ok: false, message: "Configuration SumUp manquante." }, 500);
  }

  const currency = breakdown.currencyCode || shopCurrency || "EUR";
  const reference = `co-${Date.now()}`;
  const chosenOption =
    (recalc.deliveryOptions || []).find((o) => o.handle === selectedOptionHandle) || null;

  const sumup = await createSumUpCheckout({
    amountCents: reconcile.amountChargedCents,
    currency,
    reference,
    description: `Commande ${verifiedItems.length} article(s)${reconcile.orderDiscountCents > 0 ? " (remise incluse)" : ""}`,
    returnUrl: `${appUrl()}/api/sumup-cart-webhook`,
    // Reuses the cart return page: it polls SumUpCartPayment (which the
    // advanced checkout also writes to), clears the cart and forwards to the
    // Shopify order status page.
    redirectUrl: `${storefrontUrl(session.shop)}/apps/sumup-pay/cart/return?reference=${encodeURIComponent(reference)}`,
  });

  if (!sumup.ok) {
    return json({ ok: false, message: "Impossible de créer le paiement SumUp." }, 502);
  }

  const shippingMethod = chosenOption
    ? {
        handle: chosenOption.handle,
        title: chosenOption.title,
        code: chosenOption.code,
        amount: chosenOption.amountCents / 100,
        currencyCode: chosenOption.currencyCode,
      }
    : null;

  await prisma.sumUpCartPayment.create({
    data: {
      checkoutId: sumup.data.id,
      checkoutReference: reference,
      shop: session.shop,
      customerEmail: email,
      items: verifiedItems,
      amount: reconcile.amountChargedCents / 100,
      currency,
      subtotalAmount: catalogCents / 100,
      discountAmount: reconcile.orderDiscountCents / 100,
      discountCodes: applicableCodes,
      cartToken: typeof form.get("cartToken") === "string" ? form.get("cartToken") : null,
      status: sumup.data.status || "PENDING",
      checkoutMode: "advanced",
      firstName: contact.values.firstName || null,
      lastName: contact.values.lastName || null,
      phone: contact.values.phone || null,
      company: contact.values.company || null,
      shippingAddress: shippingAddress || null,
      billingAddress: billingSame ? shippingAddress || null : billingRes.values || null,
      shippingMethod,
      shippingAmount: reconcile.shippingCents / 100,
      taxAmount: breakdown.taxCents / 100,
      snapshot: {
        source: "advanced-checkout",
        cartId: calcCart.id,
        currency,
        breakdown,
        catalogSubtotal: catalogCents / 100,
        discountCodes: applicableCodes,
        items: verifiedItems,
      },
      checkoutSnapshot: {
        contact: contact.values,
        shippingAddress: shippingAddress || null,
        billingAddress: billingSame ? "same" : billingRes.values || null,
        shippingMethod,
        deliveryOptions: recalc.deliveryOptions || [],
        breakdown,
        reconcile,
      },
    },
  });

  console.log("[SUMUP_CHECKOUT_CREATED]", {
    checkoutId: sumup.data.id,
    reference,
    amount: reconcile.amountChargedCents / 100,
    currency,
  });

  if (!sumup.data.hosted_checkout_url) {
    return json({ ok: false, message: "SumUp n'a pas renvoyé d'URL de paiement." }, 502);
  }

  // The checkout page calls this with fetch(); a bare 303 becomes an
  // unreadable opaque-redirect response. Hand the URL back as JSON — the
  // client does `location.assign(j.redirect)`.
  return json({ ok: true, redirect: sumup.data.hosted_checkout_url });
};
