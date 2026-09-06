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
  const appearance = { ...DEFAULT_APPEARANCE, ...(settings.checkoutAppearance || {}) };
  return {
    values: {
      advancedCheckoutEnabled: Boolean(settings.advancedCheckoutEnabled),
      shippingEnabled: Boolean(settings.shippingEnabled),
      checkoutPreset: settings.checkoutPreset || "digital",
      field_email: "",
      field_firstName: overrides.fields?.firstName || "",
      field_lastName: overrides.fields?.lastName || "",
      field_phone: overrides.fields?.phone || "",
      field_company: overrides.fields?.company || "",
      shippingAddress: overrides.shippingAddress || "",
      billingAddress: overrides.billingAddress || "",
      ap_title: appearance.title || "",
      ap_subtitle: appearance.subtitle || "",
      ap_cta: appearance.ctaLabel || "",
      ap_trust: appearance.trustText || "",
      ap_accent: appearance.accent || "#1a1a1a",
      ap_showtrust: Boolean(appearance.showTrust),
    },
    effective: cfg,
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
  firstName: "Prénom",
  lastName: "Nom",
  phone: "Téléphone",
  company: "Entreprise",
};

// Controlled native form elements. Kept in React state so `save()` never
// depends on the DOM / shadow-DOM boundaries (same reason app.settings.jsx
// builds its FormData from state). Defined at module scope so typing does not
// remount them.
function Select({ name, options, label, value, onChange }) {
  return (
    <s-box padding="tight">
      <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(name, e.currentTarget.value)}
        style={{ padding: "6px 8px", minWidth: 240 }}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>{o.l}</option>
        ))}
      </select>
    </s-box>
  );
}

function Text({ name, label, value, onChange }) {
  return (
    <s-box padding="tight">
      <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(name, e.currentTarget.value)}
        style={{ padding: "6px 8px", width: "100%", maxWidth: 420 }}
      />
    </s-box>
  );
}

export default function CheckoutSettings() {
  const d = useLoaderData();
  const fetcher = useFetcher();
  const saving = fetcher.state !== "idle";
  const [values, setValues] = useState(d.values);

  useEffect(() => {
    if (fetcher.data?.saved && typeof shopify !== "undefined") {
      shopify.toast.show("Réglages checkout enregistrés");
    }
  }, [fetcher.data]);

  const set = (key, v) => setValues((s) => ({ ...s, [key]: v }));

  const save = () => {
    const fd = new FormData();
    for (const [key, v] of Object.entries(values)) {
      if (typeof v === "boolean") {
        if (v) fd.set(key, "on");
      } else {
        fd.set(key, v);
      }
    }
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <s-page heading="Checkout avancé">
      <s-section heading="Activation">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-checkbox
            checked={values.advancedCheckoutEnabled ? true : undefined}
            onChange={(e) => set("advancedCheckoutEnabled", e.currentTarget.checked)}
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
          value={values.checkoutPreset}
          onChange={set}
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
            value={values[`field_${key}`]}
            onChange={set}
            options={LEVELS}
          />
        ))}
      </s-section>

      <s-section heading="Adresses">
        <Select
          name="shippingAddress"
          label="Adresse de livraison"
          value={values.shippingAddress}
          onChange={set}
          options={LEVELS}
        />
        <Select
          name="billingAddress"
          label="Adresse de facturation"
          value={values.billingAddress}
          onChange={set}
          options={BILLING}
        />
      </s-section>

      <s-section heading="Livraison">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-checkbox
            checked={values.shippingEnabled ? true : undefined}
            onChange={(e) => set("shippingEnabled", e.currentTarget.checked)}
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
        <Text name="ap_title" label="Titre" value={values.ap_title} onChange={set} />
        <Text name="ap_subtitle" label="Sous-titre" value={values.ap_subtitle} onChange={set} />
        <Text name="ap_cta" label="Texte du bouton" value={values.ap_cta} onChange={set} />
        <Text name="ap_trust" label="Texte de réassurance" value={values.ap_trust} onChange={set} />
        <Text name="ap_accent" label="Couleur d'accent (hex)" value={values.ap_accent} onChange={set} />
        <s-box padding="tight">
          <s-checkbox
            checked={values.ap_showtrust ? true : undefined}
            onChange={(e) => set("ap_showtrust", e.currentTarget.checked)}
          >
            Afficher la mention de réassurance
          </s-checkbox>
        </s-box>
      </s-section>

      <s-section>
        <s-button variant="primary" onClick={save} {...(saving ? { loading: true } : {})}>
          Enregistrer
        </s-button>
      </s-section>

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
