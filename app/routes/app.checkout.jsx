/* eslint-disable react/prop-types -- internal admin view, not a public component API */
import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getMerchantSettings, saveMerchantSettings } from "../lib/merchant-settings.server";
import {
  resolveCheckoutConfig,
  DEFAULT_APPEARANCE,
  PRESETS,
} from "../lib/checkout-config.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getMerchantSettings(session.shop);
  const cfg = resolveCheckoutConfig(settings);
  const overrides =
    settings.checkoutFieldConfig && typeof settings.checkoutFieldConfig === "object"
      ? settings.checkoutFieldConfig
      : {};
  return {
    advancedCheckoutEnabled: settings.advancedCheckoutEnabled,
    shippingEnabled: settings.shippingEnabled,
    checkoutPreset: settings.checkoutPreset || "digital",
    fieldOverrides: overrides.fields || {},
    shippingAddressOverride: overrides.shippingAddress || "",
    billingAddressOverride: overrides.billingAddress || "",
    effective: cfg,
    appearance: { ...DEFAULT_APPEARANCE, ...(settings.checkoutAppearance || {}) },
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const f = await request.formData();

  const fields = {};
  for (const key of ["email", "firstName", "lastName", "phone", "company"]) {
    fields[key] = String(f.get(`field_${key}`) || "");
  }

  await saveMerchantSettings(session.shop, {
    advancedCheckoutEnabled: f.get("advancedCheckoutEnabled") === "on",
    shippingEnabled: f.get("shippingEnabled") === "on",
    checkoutPreset: String(f.get("checkoutPreset") || "digital"),
    checkoutFieldConfig: {
      fields,
      shippingAddress: String(f.get("shippingAddress") || ""),
      billingAddress: String(f.get("billingAddress") || ""),
    },
    checkoutAppearance: {
      title: String(f.get("ap_title") || "").slice(0, 120),
      subtitle: String(f.get("ap_subtitle") || "").slice(0, 200),
      ctaLabel: String(f.get("ap_cta") || "").slice(0, 60),
      trustText: String(f.get("ap_trust") || "").slice(0, 200),
      accent: String(f.get("ap_accent") || "#1a1a1a").slice(0, 9),
      showTrust: f.get("ap_showtrust") === "on",
    },
  });

  return { saved: true };
};

const LEVELS = [
  { v: "", l: "(défaut du preset)" },
  { v: "disabled", l: "Désactivé" },
  { v: "optional", l: "Optionnel" },
  { v: "required", l: "Obligatoire" },
];
const BILLING = [
  { v: "", l: "(défaut du preset)" },
  { v: "disabled", l: "Aucune" },
  { v: "same_only", l: "Identique à la livraison uniquement" },
  { v: "optional", l: "Distincte, facultative" },
  { v: "required", l: "Distincte, obligatoire" },
];
const FIELD_LABELS = {
  email: "E-mail (toujours obligatoire)",
  firstName: "Prénom",
  lastName: "Nom",
  phone: "Téléphone",
  company: "Entreprise",
};

function Select({ name, defaultValue, options, label }) {
  return (
    <s-box padding="tight">
      <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{label}</label>
      <select name={name} defaultValue={defaultValue} style={{ padding: "6px 8px", minWidth: 240 }}>
        {options.map((o) => (
          <option key={o.v} value={o.v}>{o.l}</option>
        ))}
      </select>
    </s-box>
  );
}

function Text({ name, defaultValue, label, placeholder }) {
  return (
    <s-box padding="tight">
      <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder || ""}
        style={{ padding: "6px 8px", width: "100%", maxWidth: 420 }}
      />
    </s-box>
  );
}

export default function CheckoutSettings() {
  const d = useLoaderData();
  const fetcher = useFetcher();
  const saving = fetcher.state !== "idle";
  const [advanced, setAdvanced] = useState(d.advancedCheckoutEnabled);
  const [shipping, setShipping] = useState(d.shippingEnabled);

  useEffect(() => {
    if (fetcher.data?.saved && typeof shopify !== "undefined") {
      shopify.toast.show("Réglages checkout enregistrés");
    }
  }, [fetcher.data]);

  const submit = (e) => {
    e.preventDefault();
    fetcher.submit(new FormData(e.currentTarget), { method: "POST" });
  };

  return (
    <s-page heading="Checkout avancé">
      <form onSubmit={submit}>
        <s-section heading="Activation">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-checkbox
              name="advancedCheckoutEnabled"
              checked={advanced ? true : undefined}
              onChange={(e) => setAdvanced(e.currentTarget.checked)}
            >
              Activer le checkout avancé
            </s-checkbox>
            <s-paragraph>
              <s-text tone="subdued">
                Désactivé : le parcours rapide actuel (panier → e-mail → SumUp) est
                conservé à l&apos;identique. Activé : panier / produit → page checkout de
                l&apos;app → SumUp.
              </s-text>
            </s-paragraph>
          </s-box>
        </s-section>

        <s-section heading="Preset">
          <Select
            name="checkoutPreset"
            label="Modèle de départ"
            defaultValue={d.checkoutPreset}
            options={Object.entries(PRESETS).map(([v, p]) => ({ v, l: p.label }))}
          />
          <s-paragraph>
            <s-text tone="subdued">
              Numérique : e-mail seul. E-commerce : nom + adresse + livraison.
              Personnalisé : réglez chaque champ ci-dessous.
            </s-text>
          </s-paragraph>
        </s-section>

        <s-section heading="Données client">
          {Object.keys(FIELD_LABELS).map((key) => (
            <Select
              key={key}
              name={`field_${key}`}
              label={FIELD_LABELS[key]}
              defaultValue={key === "email" ? "" : d.fieldOverrides[key] || ""}
              options={LEVELS}
            />
          ))}
        </s-section>

        <s-section heading="Adresses">
          <Select
            name="shippingAddress"
            label="Adresse de livraison"
            defaultValue={d.shippingAddressOverride}
            options={LEVELS}
          />
          <Select
            name="billingAddress"
            label="Adresse de facturation"
            defaultValue={d.billingAddressOverride}
            options={BILLING}
          />
        </s-section>

        <s-section heading="Livraison">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-checkbox
              name="shippingEnabled"
              checked={shipping ? true : undefined}
              onChange={(e) => setShipping(e.currentTarget.checked)}
            >
              Activer le calcul de livraison Shopify
            </s-checkbox>
            <s-paragraph>
              <s-text tone="subdued">
                Utilise les tarifs de livraison réels de la boutique (Storefront Cart
                API). Nécessite une adresse de livraison. À valider en conditions réelles
                — voir CHECKOUT_V2.md.
              </s-text>
            </s-paragraph>
          </s-box>
        </s-section>

        <s-section heading="Apparence de la page">
          <Text name="ap_title" label="Titre" defaultValue={d.appearance.title} />
          <Text name="ap_subtitle" label="Sous-titre" defaultValue={d.appearance.subtitle} />
          <Text name="ap_cta" label="Texte du bouton" defaultValue={d.appearance.ctaLabel} />
          <Text name="ap_trust" label="Texte de réassurance" defaultValue={d.appearance.trustText} />
          <Text name="ap_accent" label="Couleur d'accent (hex)" defaultValue={d.appearance.accent} />
          <s-box padding="tight">
            <s-checkbox name="ap_showtrust" checked={d.appearance.showTrust ? true : undefined}>
              Afficher la mention de réassurance
            </s-checkbox>
          </s-box>
        </s-section>

        <s-section>
          <s-button variant="primary" type="submit" {...(saving ? { loading: true } : {})}>
            Enregistrer
          </s-button>
        </s-section>
      </form>

      <s-section slot="aside" heading="Configuration effective">
        <s-paragraph><s-text tone="subdued">Ce que le serveur applique aujourd&apos;hui :</s-text></s-paragraph>
        <s-paragraph>Preset : {d.effective.preset}</s-paragraph>
        <s-paragraph>Champs : {JSON.stringify(d.effective.fields)}</s-paragraph>
        <s-paragraph>Livraison adresse : {d.effective.shippingAddress}</s-paragraph>
        <s-paragraph>Facturation : {d.effective.billingAddress}</s-paragraph>
        <s-paragraph>Module livraison : {d.effective.shipping ? "on" : "off"}</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
