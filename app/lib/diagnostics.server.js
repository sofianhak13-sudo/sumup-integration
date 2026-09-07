/**
 * Admin diagnostics — a set of independent checks, each returning
 * { key, label, status: "ok"|"warn"|"error"|"off", detail }.
 * Never returns a secret.
 */

import { getMerchantSettings } from "./merchant-settings.server";
import { resolveCheckoutConfig } from "./checkout-config.js";
import { sumupConfigured, verifySumUpAccount, maskApiKey } from "./sumup.server";

async function checkShopifyAdmin(admin) {
  try {
    const res = await admin.graphql(`#graphql
      query SumUpDiagShop { shop { name myshopifyDomain currencyCode ianaTimezone } }`);
    const data = await res.json();
    const shop = data.data?.shop;
    if (!shop) return { status: "error", detail: "Réponse inattendue de l'API Admin." };
    return { status: "ok", detail: `${shop.name} · ${shop.currencyCode}` };
  } catch (e) {
    return { status: "error", detail: String(e?.message || e).slice(0, 200) };
  }
}

async function checkStorefront(storefront) {
  if (!storefront) return { status: "error", detail: "Client Storefront indisponible dans ce contexte." };
  try {
    const res = await storefront.graphql(`#graphql
      { shop { name paymentSettings { currencyCode } } }`);
    const data = await res.json();
    if (data?.data?.shop) return { status: "ok", detail: "Storefront API joignable." };
    return { status: "error", detail: "Storefront API n'a pas répondu comme attendu." };
  } catch (e) {
    return {
      status: "error",
      detail:
        "Storefront API en échec — vérifiez que les scopes unauthenticated_* sont accordés. " +
        String(e?.message || e).slice(0, 160),
    };
  }
}

async function checkSumUp() {
  if (!sumupConfigured()) {
    return { status: "error", detail: "SUMUP_API_KEY / SUMUP_MERCHANT_CODE absents de l'environnement." };
  }
  const r = await verifySumUpAccount();
  if (r.status === "ok") {
    const parts = [r.merchantName, r.merchantCode].filter(Boolean).join(" · ");
    const warn = r.merchantCodeMatchesEnv === false;
    return {
      status: warn ? "warn" : "ok",
      detail:
        (parts || "compte vérifié") +
        (warn ? " — ⚠️ le merchant_code SumUp ne correspond pas à SUMUP_MERCHANT_CODE" : ""),
    };
  }
  return { status: "error", detail: `Vérification SumUp: ${r.reason}` };
}

/**
 * Run every check. `storefront`/`admin` come from `authenticate.admin` /
 * a public-app-proxy context; pass what you have.
 */
export async function runDiagnostics({ admin, storefront, shop }) {
  const settings = await getMerchantSettings(shop);
  const cfg = resolveCheckoutConfig(settings);

  const [shopify, sf, sumup] = await Promise.all([
    admin ? checkShopifyAdmin(admin) : Promise.resolve({ status: "off", detail: "Non testé ici." }),
    checkStorefront(storefront),
    checkSumUp(),
  ]);

  return [
    { key: "shopifyAdmin", label: "API Admin Shopify", ...shopify },
    { key: "storefront", label: "Storefront Cart API", ...sf },
    { key: "sumup", label: "Compte SumUp", ...sumup },
    {
      key: "apiKey",
      label: "Clé API SumUp",
      status: sumupConfigured() ? "ok" : "error",
      detail: sumupConfigured()
        ? `Configurée (${maskApiKey(process.env.SUMUP_API_KEY)})`
        : "Absente",
    },
    {
      key: "cartPayments",
      label: "Paiement panier",
      status: settings.cartPaymentsEnabled ? "ok" : "off",
      detail: settings.cartPaymentsEnabled ? "Activé" : "Désactivé",
    },
    {
      key: "cartDrawer",
      label: "Bouton tiroir",
      status: settings.cartDrawerEnabled ? "ok" : "off",
      detail: settings.cartDrawerEnabled ? "Activé (nécessite l'app embed)" : "Désactivé",
    },
    {
      key: "advancedCheckout",
      label: "Checkout avancé",
      status: cfg.advancedCheckoutEnabled ? "ok" : "off",
      detail: cfg.advancedCheckoutEnabled ? `Activé · preset ${cfg.preset}` : "Désactivé (parcours rapide)",
    },
    {
      key: "shipping",
      label: "Livraison",
      status: cfg.shipping ? "warn" : "off",
      detail: cfg.shipping
        ? "Activée — à valider en conditions réelles (voir CHECKOUT_V2.md)"
        : "Désactivée",
    },
    {
      key: "hideCheckout",
      label: "Masquage checkout Shopify",
      status: settings.hideShopifyCheckout ? "warn" : "off",
      detail: settings.hideShopifyCheckout
        ? "Actif — le CTA natif est masqué quand un bouton SumUp est présent"
        : "Inactif (CTA Shopify visible)",
    },
    {
      key: "notifications",
      label: "Confirmations de commande",
      status: "ok",
      detail:
        "Envoyées par Shopify (options.sendReceipt) avec le template natif. " +
        "Gérez le contenu dans Paramètres → Notifications → « Confirmation de commande ». " +
        "Aucun e-mail n'est envoyé par l'app ni par SumUp.",
    },
  ];
}
