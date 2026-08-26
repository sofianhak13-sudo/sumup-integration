export const action = async ({ request }) => {
  console.log("WEBHOOK PANIER SUMUP RECU");

  return new Response(null, {
    status: 204,
  });
};