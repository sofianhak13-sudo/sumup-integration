/**
 * Storefront Cart API helpers for the advanced checkout.
 *
 * The Storefront cart is Shopify's re-price: it applies discount codes,
 * automatic discounts, cart-attribute discount functions and — when a
 * delivery address is attached — real shipping rates and tax. Its
 * `cart.cost.totalAmount` is the amount SumUp charges.
 *
 * RUNTIME-VALIDATION NOTE: the delivery-address / deliveryGroups path
 * (advanced checkout with shipping ON) has been built to the 2026-07
 * Storefront schema but not yet exercised against a live shop. See
 * CHECKOUT_V2.md § "Livraison — à valider".
 */

const CART_COST_FIELDS = `
  cost {
    subtotalAmount { amount currencyCode }
    totalAmount { amount currencyCode }
    totalTaxAmount { amount currencyCode }
    totalDutyAmount { amount currencyCode }
  }
  discountCodes { code applicable }
  discountAllocations { discountedAmount { amount currencyCode } }
  deliveryGroups(first: 10) {
    nodes {
      id
      selectedDeliveryOption { handle title estimatedCost { amount currencyCode } }
      deliveryOptions { handle title code estimatedCost { amount currencyCode } }
    }
  }
  lines(first: 250) {
    nodes {
      quantity
      discountAllocations { discountedAmount { amount currencyCode } }
    }
  }
`;

const CART_CREATE = `#graphql
  mutation SumUpCheckoutCartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart { id ${CART_COST_FIELDS} }
      userErrors { field message code }
      warnings { code target message }
    }
  }
`;

const CART_SELECT_DELIVERY = `#graphql
  mutation SumUpSelectDelivery($cartId: ID!, $selected: [CartSelectedDeliveryOptionInput!]!) {
    cartSelectedDeliveryOptionsUpdate(cartId: $cartId, selectedDeliveryOptions: $selected) {
      cart { id ${CART_COST_FIELDS} }
      userErrors { field message code }
      warnings { code target message }
    }
  }
`;

function deliveryAddressInput(address) {
  if (!address) return null;
  const out = {};
  for (const k of ["address1", "address2", "city", "company", "firstName", "lastName", "phone", "zip"]) {
    if (address[k]) out[k] = String(address[k]);
  }
  if (address.countryCode && /^[A-Za-z]{2}$/.test(address.countryCode)) {
    out.countryCode = address.countryCode.toUpperCase();
  }
  const pc = address.provinceCode || address.province;
  if (pc) out.provinceCode = String(pc);
  return Object.keys(out).length ? out : null;
}

/**
 * Recalculate a cart. When `deliveryAddress` is given, shipping rates and tax
 * for that destination are included and the cheapest option per group is
 * auto-selected; pass `selectedOptionHandle` to force a specific one.
 *
 * @returns {Promise<{ ok: boolean, cart?: object, reason?: string,
 *   userErrors?: any[], deliveryOptions?: Array }>}
 */
export async function recalcCart(storefront, {
  storefrontLines,
  discountCodes = [],
  attributes = [],
  email,
  countryCode,
  deliveryAddress = null,
  selectedOptionHandle = null,
}) {
  const input = {
    lines: storefrontLines,
    discountCodes,
    attributes,
    buyerIdentity: {
      ...(email ? { email } : {}),
      ...(countryCode ? { countryCode } : {}),
    },
  };

  const addr = deliveryAddressInput(deliveryAddress);
  if (addr) {
    input.delivery = {
      addresses: [
        {
          address: { deliveryAddress: addr },
          selected: true,
          oneTimeUse: true,
          validationStrategy: "COUNTRY_CODE_ONLY",
        },
      ],
    };
  }

  let res;
  try {
    res = await storefront.graphql(CART_CREATE, { variables: { input } });
  } catch (error) {
    return { ok: false, reason: "storefront_threw", message: String(error?.message || error) };
  }

  const json = await res.json();
  const created = json.data?.cartCreate;
  const userErrors = created?.userErrors || [];
  let cart = created?.cart;

  if (!cart || userErrors.length > 0) {
    return { ok: false, reason: "cartcreate_failed", userErrors, graphQLErrors: json.errors };
  }

  const groups = cart.deliveryGroups?.nodes || [];
  const firstGroupOptions = (groups[0]?.deliveryOptions || []).map((o) => ({
    handle: o.handle,
    title: o.title,
    code: o.code || null,
    amountCents: Math.round(Number(o.estimatedCost?.amount || 0) * 100),
    currencyCode: o.estimatedCost?.currencyCode || cart.cost?.totalAmount?.currencyCode || "EUR",
  }));

  // Force the buyer's chosen option when it differs from the auto-selection.
  if (
    addr &&
    selectedOptionHandle &&
    groups.length > 0 &&
    groups[0].selectedDeliveryOption?.handle !== selectedOptionHandle
  ) {
    const selected = groups
      .map((g) => ({
        deliveryGroupId: g.id,
        deliveryOptionHandle:
          (g.deliveryOptions || []).some((o) => o.handle === selectedOptionHandle)
            ? selectedOptionHandle
            : g.selectedDeliveryOption?.handle,
      }))
      .filter((s) => s.deliveryOptionHandle);

    if (selected.length) {
      const upd = await storefront.graphql(CART_SELECT_DELIVERY, {
        variables: { cartId: cart.id, selected },
      });
      const updJson = await upd.json();
      const updated = updJson.data?.cartSelectedDeliveryOptionsUpdate;
      if (updated?.cart && !(updated.userErrors || []).length) {
        cart = updated.cart;
      }
    }
  }

  return { ok: true, cart, deliveryOptions: firstGroupOptions };
}

export { deliveryAddressInput };
