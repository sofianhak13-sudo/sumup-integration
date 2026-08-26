import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Boutique non autorisée.", {
      status: 401,
    });
  }

  return new Response("Connexion panier SumUp OK", {
    status: 200,
  });
};