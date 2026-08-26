import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session, liquid } =
    await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Session Shopify introuvable.", {
      status: 401,
    });
  }

  const url = new URL(request.url);
  const reference = url.searchParams.get("reference");

  if (!reference) {
    return new Response("Référence de paiement manquante.", {
      status: 400,
    });
  }

  const payment = await prisma.sumUpCartPayment.findUnique({
    where: {
      checkoutReference: reference,
    },
  });

  if (!payment || payment.shop !== session.shop) {
    return new Response("Paiement panier introuvable.", {
      status: 404,
    });
  }

  if (!payment.statusPageUrl) {
    return liquid(
      `
      <div style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;">
        <h2>Finalisation de votre commande...</h2>
        <p>Votre paiement a bien été reçu.</p>
        <p>Nous préparons votre commande.</p>
      </div>

      <script>
        const attempts = Number(
          sessionStorage.getItem("sumupCartReturnAttempts") || "0"
        );

        if (attempts < 30) {
          sessionStorage.setItem(
            "sumupCartReturnAttempts",
            String(attempts + 1)
          );

          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          sessionStorage.removeItem("sumupCartReturnAttempts");

          document.body.innerHTML =
            '<div style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;">' +
            '<h2>Paiement reçu</h2>' +
            '<p>Votre commande est en cours de finalisation.</p>' +
            '<p>Vous recevrez également votre confirmation par e-mail.</p>' +
            '</div>';
        }
      </script>
      `,
      { layout: false },
    );
  }

  const statusPageUrl = JSON.stringify(payment.statusPageUrl);

  return liquid(
    `
    <div style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;">
      <h2>Commande confirmée ✓</h2>
      <p>Redirection vers votre commande...</p>
    </div>

    <script>
      (async () => {
        sessionStorage.removeItem("sumupCartReturnAttempts");

        try {
          await fetch("/cart/clear.js", {
            method: "POST",
            credentials: "same-origin"
          });
        } catch (error) {
          console.error("Impossible de vider le panier :", error);
        }

        window.location.replace(${statusPageUrl});
      })();
    </script>
    `,
    { layout: false },
  );
};