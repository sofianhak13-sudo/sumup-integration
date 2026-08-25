import { useEffect } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return { product: null };
  }

  const gid = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const response = await admin.graphql(
    `#graphql
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          variants(first: 1) {
            nodes {
              id
              price
            }
          }
        }
      }
    `,
    {
      variables: {
        id: gid,
      },
    },
  );

  const data = await response.json();

  return {
    product: data.data.product,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
const formData = await request.formData();
const productId = formData.get("productId");
if (!productId) {
  return {
    success: false,
    message: "Produit Shopify manquant.",
  };
}
const gid = productId.startsWith("gid://")
  ? productId
  : `gid://shopify/Product/${productId}`;

const productResponse = await admin.graphql(
  `#graphql
    query GetProductForPayment($id: ID!) {
      product(id: $id) {
        id
        title
        variants(first: 1) {
          nodes {
            id
            price
          }
        }
      }
    }
  `,
  {
    variables: {
      id: gid,
    },
  },
);

const productData = await productResponse.json();
console.log("SHOPIFY PRODUCT RESPONSE:", JSON.stringify(productData, null, 2));
const product = productData.data?.product;
const price = product?.variants?.nodes?.[0]?.price;

if (!product || !price) {
  return {
    success: false,
    message: "Impossible de récupérer le prix du produit Shopify.",
  };
}

  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!apiKey || !merchantCode) {
    return {
      success: false,
      message: "Clé API SumUp ou Merchant Code manquant dans .env",
    };
  }

  try {
    const checkoutReference = `shopify-${Date.now()}`;

    const response = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        checkout_reference: checkoutReference,
        amount: Number(price),
        currency: "EUR",
        merchant_code: merchantCode,
        description: "Commande e-book Shopify",
        hosted_checkout: {
          enabled: true,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: `Erreur SumUp ${response.status}: ${JSON.stringify(data)}`,
      };
    }

    if (!data.hosted_checkout_url) {
      return {
        success: false,
        message: "SumUp n'a pas renvoyé d'URL de paiement.",
      };
    }

    return {
      success: true,
      checkoutId: data.id,
      checkoutReference: data.checkout_reference,
      paymentUrl: data.hosted_checkout_url,
    };
  } catch (error) {
    return {
      success: false,
      message: `Erreur : ${error.message}`,
    };
  }
};

export default function Index() {
  const [searchParams] = useSearchParams();
const productId = searchParams.get("productId");
  const fetcher = useFetcher();

  const isLoading =
    fetcher.state === "submitting" || fetcher.state === "loading";

  const createPayment = () => {
    fetcher.submit(
  { productId },
  { method: "POST" }
);
  };

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.paymentUrl) {
      window.open(fetcher.data.paymentUrl, "_top")
    }
  }, [fetcher.data]);

  return (
    <s-page heading="SumUp Integration">
      <s-section heading="Paiement SumUp">
        <s-paragraph>
          Créer un paiement sécurisé SumUp de 29,90 €.
        </s-paragraph>

        <s-button
          onClick={createPayment}
          {...(isLoading ? { loading: true } : {})}
        >
          Payer
        </s-button>

        {fetcher.data?.message && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-paragraph>{fetcher.data.message}</s-paragraph>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};