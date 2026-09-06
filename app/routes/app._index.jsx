/* eslint-disable react/prop-types -- internal admin view, not a public component API */
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getMerchantSettings } from "../lib/merchant-settings.server";
import { resolveCheckoutConfig } from "../lib/checkout-config.js";
import { sumupConfigured, maskApiKey } from "../lib/sumup.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getMerchantSettings(session.shop);
  const cfg = resolveCheckoutConfig(settings);
  return {
    cartPaymentsEnabled: settings.cartPaymentsEnabled,
    cartDrawerEnabled: settings.cartDrawerEnabled,
    hideShopifyCheckout: settings.hideShopifyCheckout,
    advancedCheckoutEnabled: cfg.advancedCheckoutEnabled,
    shippingEnabled: cfg.shipping,
    preset: cfg.preset,
    sumupConfigured: sumupConfigured(),
    sumupKeyMasked: maskApiKey(process.env.SUMUP_API_KEY),
    sumupMerchantName: settings.sumupMerchantName,
  };
};

function Row({ label, value, tone }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-paragraph>
        <s-text tone="subdued">{label} : </s-text>
        <s-text tone={tone}>{value}</s-text>
      </s-paragraph>
    </s-box>
  );
}

export default function Dashboard() {
  const d = useLoaderData();
  const onOff = (b) => (b ? "Activé" : "Désactivé");

  return (
    <s-page heading="SumUp — Tableau de bord">
      <s-section heading="État de l'intégration">
        <Row
          label="Compte SumUp"
          tone={d.sumupConfigured ? "success" : "critical"}
          value={
            d.sumupConfigured
              ? d.sumupMerchantName || `Configuré (${d.sumupKeyMasked || "clé OK"})`
              : "Non configuré"
          }
        />
        <Row label="Paiement panier" value={onOff(d.cartPaymentsEnabled)} tone={d.cartPaymentsEnabled ? "success" : "subdued"} />
        <Row label="Bouton tiroir" value={onOff(d.cartDrawerEnabled)} tone={d.cartDrawerEnabled ? "success" : "subdued"} />
        <Row label="Masquage checkout Shopify" value={onOff(d.hideShopifyCheckout)} tone={d.hideShopifyCheckout ? "warning" : "subdued"} />
        <Row
          label="Checkout avancé"
          value={d.advancedCheckoutEnabled ? `Activé (preset ${d.preset})` : "Désactivé — parcours rapide"}
          tone={d.advancedCheckoutEnabled ? "success" : "subdued"}
        />
        <Row label="Livraison" value={onOff(d.shippingEnabled)} tone={d.shippingEnabled ? "warning" : "subdued"} />
      </s-section>

      <s-section heading="Configuration">
        <s-paragraph>
          <s-link href="/app/settings">Paiement panier</s-link> — bouton SumUp sur la
          page panier et le tiroir.
        </s-paragraph>
        <s-paragraph>
          <s-link href="/app/checkout">Checkout avancé</s-link> — page intermédiaire
          (contact, adresse, livraison, récapitulatif) avant SumUp. Désactivé par défaut.
        </s-paragraph>
        <s-paragraph>
          <s-link href="/app/sumup">Compte SumUp</s-link> — identité du compte marchand.
        </s-paragraph>
        <s-paragraph>
          <s-link href="/app/diagnostics">Diagnostic</s-link> — teste Shopify, SumUp,
          Storefront et la configuration.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Parcours actif">
        <s-paragraph>
          {d.advancedCheckoutEnabled
            ? "Panier / produit → page checkout de l'app → SumUp → commande Shopify."
            : "Panier / produit → e-mail → SumUp → commande Shopify."}
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
