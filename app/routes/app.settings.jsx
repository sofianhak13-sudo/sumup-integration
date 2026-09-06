import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  getMerchantSettings,
  saveMerchantSettings,
} from "../lib/merchant-settings.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { settings: await getMerchantSettings(session.shop) };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  await saveMerchantSettings(session.shop, {
    cartPaymentsEnabled: form.get("cartPaymentsEnabled") === "on",
    cartDrawerEnabled: form.get("cartDrawerEnabled") === "on",
    hideShopifyCheckout: form.get("hideShopifyCheckout") === "on",
  });
  return { saved: true };
};

const TOGGLES = [
  {
    id: "cartPaymentsEnabled",
    label: "Paiement du panier avec SumUp",
    help: "Autorise le bouton « Payer avec SumUp » du panier (page panier et tiroir). Désactivé, la demande de paiement panier est refusée proprement.",
  },
  {
    id: "cartDrawerEnabled",
    label: "Bouton SumUp dans le tiroir de panier",
    help: "Affiche le bouton SumUp dans le cart drawer Horizon. Nécessite l'app embed « SumUp — Storefront » activée dans l'éditeur de thème.",
  },
  {
    id: "hideShopifyCheckout",
    label: "Masquer le bouton « Passer à la caisse » de Shopify",
    help: "Fait de SumUp le parcours principal : masque le CTA checkout natif sur le panier et le tiroir. Réversible à tout moment. Les boutons de paiement accéléré (Shop Pay…) se règlent dans Paramètres du thème → Panier.",
  },
];

export default function Settings() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const [values, setValues] = useState(settings);

  const saving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.saved && typeof shopify !== "undefined") {
      shopify.toast.show("Réglages enregistrés");
    }
  }, [fetcher.data]);

  const save = () => {
    const fd = new FormData();
    for (const t of TOGGLES) if (values[t.id]) fd.set(t.id, "on");
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <s-page heading="Réglages SumUp">
      <s-section heading="Parcours de paiement du panier">
        <s-paragraph>
          {`Ces réglages contrôlent le comportement global. La présentation du bouton (texte, couleur, position) se règle dans l'éditeur de thème.`}
        </s-paragraph>

        {TOGGLES.map((t) => (
          <s-box
            key={t.id}
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-checkbox
              name={t.id}
              checked={values[t.id] ? true : undefined}
              onChange={(e) =>
                setValues((v) => ({ ...v, [t.id]: e.currentTarget.checked }))
              }
            >
              {t.label}
            </s-checkbox>
            <s-paragraph>
              <s-text tone="subdued">{t.help}</s-text>
            </s-paragraph>
          </s-box>
        ))}

        <s-button
          variant="primary"
          onClick={save}
          {...(saving ? { loading: true } : {})}
        >
          Enregistrer
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
