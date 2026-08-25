export const action = async ({ request }) => {
  try {
    const event = await request.json();

    // Ignorer proprement les événements inconnus
    if (
      event?.event_type !== "CHECKOUT_STATUS_CHANGED" ||
      !event?.id
    ) {
      return new Response(null, { status: 204 });
    }

    const apiKey = process.env.SUMUP_API_KEY;

    if (!apiKey) {
      console.error("SUMUP_API_KEY manquante");
      return new Response(null, { status: 500 });
    }

    // Vérification directe auprès de SumUp
    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(event.id)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!checkoutResponse.ok) {
      console.error(
        "Impossible de vérifier le checkout SumUp :",
        checkoutResponse.status
      );

      return new Response(null, { status: 500 });
    }

    const checkout = await checkoutResponse.json();

    console.log("PAIEMENT SUMUP VERIFIE :", {
      id: checkout.id,
      reference: checkout.checkout_reference,
      status: checkout.status,
      amount: checkout.amount,
      currency: checkout.currency,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("ERREUR WEBHOOK SUMUP :", error);
    return new Response(null, { status: 500 });
  }
};