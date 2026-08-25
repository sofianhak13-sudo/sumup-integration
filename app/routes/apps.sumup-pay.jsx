import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.public.appProxy(request);

  return new Response("Connexion App Proxy OK", {
    headers: {
      "Content-Type": "text/plain",
    },
  });
};