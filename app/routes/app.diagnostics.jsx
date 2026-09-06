import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { unauthenticated } from "../shopify.server";
import { runDiagnostics } from "../lib/diagnostics.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  // A Storefront client for the diagnostic Storefront check.
  let storefront = null;
  try {
    ({ storefront } = await unauthenticated.storefront(session.shop));
  } catch {
    storefront = null;
  }

  const checks = await runDiagnostics({ admin, storefront, shop: session.shop });
  return { checks, ranAt: new Date().toISOString() };
};

const TONE = { ok: "success", warn: "warning", error: "critical", off: "subdued" };
const ICON = { ok: "✅", warn: "⚠️", error: "❌", off: "◻️" };

export default function Diagnostics() {
  const { checks, ranAt } = useLoaderData();
  return (
    <s-page heading="Diagnostic">
      <s-section heading="Résultats">
        {checks.map((c) => (
          <s-box key={c.key} padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>
              <s-text tone={TONE[c.status] || "subdued"}>
                {ICON[c.status] || "•"} {c.label}
              </s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text tone="subdued">{c.detail}</s-text>
            </s-paragraph>
          </s-box>
        ))}
        <s-paragraph>
          <s-text tone="subdued">Exécuté le {new Date(ranAt).toLocaleString("fr-FR")}. Rechargez la page pour relancer.</s-text>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="À propos">
        <s-paragraph>
          <s-text tone="subdued">
            Chaque test est indépendant. Aucun secret n&apos;est affiché. Le test SumUp
            interroge /v0.1/me côté serveur.
          </s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
