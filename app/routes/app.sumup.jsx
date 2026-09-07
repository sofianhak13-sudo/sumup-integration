import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getMerchantSettings, saveSumUpIdentity } from "../lib/merchant-settings.server";
import { verifySumUpAccount, maskApiKey, sumupConfigured } from "../lib/sumup.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getMerchantSettings(session.shop);
  return {
    configured: sumupConfigured(),
    keyMasked: maskApiKey(process.env.SUMUP_API_KEY),
    merchantCodeEnv: process.env.SUMUP_MERCHANT_CODE || null,
    identity: {
      name: settings.sumupMerchantName,
      email: settings.sumupMerchantEmail,
      last4: settings.sumupApiKeyLast4,
      status: settings.sumupAccountStatus,
      checkedAt: settings.sumupAccountCheckedAt,
    },
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const result = await verifySumUpAccount();

  await saveSumUpIdentity(session.shop, {
    merchantName: result.merchantName || null,
    merchantEmail: result.merchantEmail || null,
    apiKeyLast4: result.apiKeyLast4 || null,
    status: result.status,
  });

  return { result };
};

export default function SumUpAccount() {
  const d = useLoaderData();
  const fetcher = useFetcher();
  const checking = fetcher.state !== "idle";
  const res = fetcher.data?.result;

  useEffect(() => {
    if (res && typeof shopify !== "undefined") {
      shopify.toast.show(res.status === "ok" ? "Compte SumUp vérifié" : "Échec de la vérification SumUp");
    }
  }, [res]);

  return (
    <s-page heading="Compte SumUp">
      <s-section heading="Identité du compte marchand">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-paragraph>
            <s-text tone="subdued">Clé API : </s-text>
            <s-text tone={d.configured ? "success" : "critical"}>
              {d.configured ? `Configurée (${d.keyMasked || "••••"})` : "Absente de l'environnement"}
            </s-text>
          </s-paragraph>
          <s-paragraph>
            <s-text tone="subdued">Merchant code (env) : </s-text>
            <s-text>{d.merchantCodeEnv || "—"}</s-text>
          </s-paragraph>
          <s-paragraph>
            <s-text tone="subdued">Nom marchand : </s-text>
            <s-text>{d.identity.name || "Non vérifié"}</s-text>
          </s-paragraph>
          <s-paragraph>
            <s-text tone="subdued">E-mail du compte : </s-text>
            <s-text>{d.identity.email || "—"}</s-text>
          </s-paragraph>
          <s-paragraph>
            <s-text tone="subdued">Dernière vérification : </s-text>
            <s-text>{d.identity.checkedAt ? new Date(d.identity.checkedAt).toLocaleString("fr-FR") : "jamais"}</s-text>
          </s-paragraph>
        </s-box>

        <s-button
          variant="primary"
          onClick={() => fetcher.submit(new FormData(), { method: "POST" })}
          {...(checking ? { loading: true } : {})}
        >
          Vérifier le compte SumUp
        </s-button>

        {res ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            {res.status === "ok" ? (
              <>
                <s-paragraph><s-text tone="success">Compte vérifié.</s-text></s-paragraph>
                <s-paragraph>{res.merchantName} · {res.merchantCode}</s-paragraph>
                {res.merchantCodeMatchesEnv === false ? (
                  <s-paragraph>
                    <s-text tone="critical">
                      ⚠️ Le merchant_code renvoyé par SumUp ({res.merchantCode}) ne correspond
                      pas à SUMUP_MERCHANT_CODE ({d.merchantCodeEnv}).
                    </s-text>
                  </s-paragraph>
                ) : null}
              </>
            ) : (
              <s-paragraph><s-text tone="critical">Échec : {res.reason}</s-text></s-paragraph>
            )}
          </s-box>
        ) : null}
      </s-section>

      <s-section slot="aside" heading="Sécurité">
        <s-paragraph>
          <s-text tone="subdued">
            La clé API SumUp n&apos;est jamais renvoyée au navigateur, jamais affichée en
            clair et jamais journalisée. Seuls les 4 derniers caractères sont conservés.
          </s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
