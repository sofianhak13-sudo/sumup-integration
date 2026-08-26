import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, session } =
    await authenticate.public.appProxy(request);

  if (!admin || !session) {
    return new Response("Boutique non autorisée.", {
      status: 401,
    });
  }

  const formData = await request.formData();
  const cartRaw = formData.get("cart");
  const emailRaw = formData.get("email");
const email =
  typeof emailRaw === "string"
    ? emailRaw.trim()
    : "";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return new Response("Adresse e-mail invalide.", {
    status: 400,
  });
}

  if (!cartRaw || typeof cartRaw !== "string") {
    return new Response("Panier manquant.", {
      status: 400,
    });
  }

  let cart;

  try {
    cart = JSON.parse(cartRaw);
  } catch {
    return new Response("Panier invalide.", {
      status: 400,
    });
  }

  if (!Array.isArray(cart.items) || cart.items.length === 0) {
    return new Response("Le panier est vide.", {
      status: 400,
    });
  }

  console.log(
    "PANIER SUMUP RECU :",
    cart.items.map((item) => ({
      variantId: item.variant_id,
      quantity: item.quantity,
    })),
  );

  return new Response("Panier SumUp reçu correctement.", {
    status: 200,
  });
};