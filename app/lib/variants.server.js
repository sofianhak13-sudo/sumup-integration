/**
 * Verify the requested cart line variants against the Admin API: existence,
 * availability, catalogue price, product title/image for the order snapshot.
 * Shared by the fast cart route pattern and the advanced checkout.
 */

const VARIANTS_QUERY = `#graphql
  query SumUpCartVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        price
        availableForSale
        image { url altText }
        product { id title featuredImage { url altText } }
      }
    }
    shop { currencyCode }
  }
`;

const toVariantGid = (id) =>
  String(id).startsWith("gid://")
    ? String(id)
    : `gid://shopify/ProductVariant/${id}`;

/**
 * @returns {Promise<{
 *   ok: boolean, reason?: string, unavailableTitle?: string,
 *   currencyCode?: string,
 *   verifiedItems?: Array, storefrontLines?: Array
 * }>}
 */
export async function verifyCartVariants(admin, items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return { ok: false, reason: "empty" };

  const ids = list.map((i) => toVariantGid(i.variant_id ?? i.variantId));
  const res = await admin.graphql(VARIANTS_QUERY, { variables: { ids } });
  const data = await res.json();

  const map = new Map(
    (data.data?.nodes || []).filter(Boolean).map((v) => [v.id, v]),
  );
  const currencyCode = data.data?.shop?.currencyCode || "EUR";

  const verifiedItems = [];
  const storefrontLines = [];

  for (const item of list) {
    const quantity = Number(item.quantity);
    const gid = toVariantGid(item.variant_id ?? item.variantId);
    const variant = map.get(gid);

    if (!variant || !Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, reason: "unknown_variant" };
    }
    if (variant.availableForSale === false) {
      return { ok: false, reason: "unavailable", unavailableTitle: variant.product?.title };
    }

    verifiedItems.push({
      variantId: variant.id,
      productId: variant.product?.id || null,
      title: variant.product?.title || variant.title,
      variantTitle: variant.title,
      image: variant.image?.url || variant.product?.featuredImage?.url || null,
      quantity,
      catalogUnitAmount: Number(variant.price) || 0,
    });
    storefrontLines.push({ merchandiseId: variant.id, quantity });
  }

  return { ok: true, currencyCode, verifiedItems, storefrontLines };
}

/**
 * Pick which variant the "fast" single-product flow (apps.sumup-pay.jsx)
 * should sell, given the product's own variants and an optional caller-
 * requested variant id.
 *
 * If a variant id is explicitly requested, it MUST be one of this
 * product's own variants — an id that's unknown, or that belongs to a
 * different product, is rejected rather than silently substituted. Without
 * an explicit request, defaults to the first variant available for sale
 * (or the product's first variant), preserving prior behaviour.
 *
 * @param {Array<{id: string, [key: string]: any}>} variantNodes
 * @param {string|null|undefined} requestedVariantId
 * @returns {{ ok: true, variant: object } | { ok: false, reason: "unknown_variant" | "no_variants" }}
 */
export function selectRequestedVariant(variantNodes, requestedVariantId) {
  const nodes = Array.isArray(variantNodes) ? variantNodes : [];

  if (typeof requestedVariantId === "string" && requestedVariantId) {
    const requestedGid = toVariantGid(requestedVariantId);
    const variant = nodes.find((node) => node.id === requestedGid);
    if (!variant) return { ok: false, reason: "unknown_variant" };
    return { ok: true, variant };
  }

  const variant = nodes.find((node) => node.availableForSale) || nodes[0] || null;
  if (!variant) return { ok: false, reason: "no_variants" };
  return { ok: true, variant };
}

export { toVariantGid };
