/*
 * SumUp payment blocks - storefront glue for Horizon / Online Store 2.0 themes.
 *
 * Design goals:
 *  - No dependency on any theme's internal DOM, class names or JS modules.
 *  - The variant id and quantity are read from the theme's OWN add-to-cart
 *    form (the <input name="id"> / <input name="quantity"> that every OS 2.0
 *    theme keeps in sync), so dynamic variant changes are picked up without a
 *    page reload and without fragile selectors.
 *  - The cart is always re-fetched from /cart.js, never trusted from the DOM.
 *  - The server (/apps/sumup-pay*) stays the single source of truth for price
 *    and currency; this script only forwards intent.
 */
(function () {
  "use strict";

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function section(el) {
    return el.closest(".shopify-section") || document;
  }

  /* --- theme add-to-cart form lookup ------------------------------------- */

  function cartAddForm(scope) {
    var selectors = [
      'form[action$="/cart/add"]',
      'form[action*="/cart/add"]',
      'product-form form',
      'form[id^="product-form"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var local = scope && scope.querySelector && scope.querySelector(selectors[i]);
      if (local) return local;
    }
    for (var j = 0; j < selectors.length; j++) {
      var any = document.querySelector(selectors[j]);
      if (any) return any;
    }
    return null;
  }

  function readVariantId(block) {
    var form = cartAddForm(section(block));
    var input = form && form.querySelector('[name="id"]');
    if (input && input.value) return String(input.value);

    var params = new URLSearchParams(window.location.search);
    if (params.get("variant")) return params.get("variant");

    return block.getAttribute("data-default-variant") || "";
  }

  function readQuantity(block) {
    var form = cartAddForm(section(block));
    var input = form && form.querySelector('[name="quantity"]');
    var n = input ? parseInt(input.value, 10) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /* --- shared UI helpers ----------------------------------------------- */

  function showError(form, message) {
    var box = form.querySelector("[data-sumup-error]");
    if (!box) return;
    box.textContent = message;
    box.hidden = !message;
  }

  function setLoading(form, loading) {
    var btn = form.querySelector("[data-sumup-submit]");
    var spinner = form.querySelector("[data-sumup-spinner]");
    if (btn) {
      btn.disabled = loading;
      btn.setAttribute("aria-busy", loading ? "true" : "false");
    }
    if (spinner) spinner.hidden = !loading;
  }

  function validEmail(form) {
    var field = form.querySelector("[data-sumup-email]");
    var value = field ? field.value.trim() : "";
    return EMAIL_RE.test(value);
  }

  /* --- product block -------------------------------------------------- */

  function initProduct(block) {
    if (block.dataset.sumupBound) return;
    block.dataset.sumupBound = "1";

    var form = block.querySelector('form[data-sumup-form="product"]');
    if (!form) return;

    var variantField = form.querySelector("[data-sumup-variant]");
    var qtyField = form.querySelector("[data-sumup-quantity]");

    function sync() {
      if (variantField) variantField.value = readVariantId(block);
      if (qtyField) qtyField.value = readQuantity(block);
    }

    sync();

    // Any input/select the theme uses for options, variant or quantity.
    document.addEventListener("change", function (event) {
      var t = event.target;
      if (!t) return;
      var name = t.getAttribute && t.getAttribute("name");
      if (name === "id" || name === "quantity" || name === "options[]") sync();
    });
    document.addEventListener("input", function (event) {
      var t = event.target;
      if (t && t.getAttribute && t.getAttribute("name") === "quantity") sync();
    });

    // Variant-change events emitted by common OS 2.0 themes (best effort).
    [
      "variant:change",
      "variantChange",
      "on:variant:change",
      "product:variant-change",
      "cart:updated",
    ].forEach(function (name) {
      document.addEventListener(name, sync);
    });
    window.addEventListener("popstate", sync);
    window.addEventListener("pageshow", sync);

    form.addEventListener("submit", function (event) {
      sync();
      showError(form, "");

      if (!validEmail(form)) {
        event.preventDefault();
        showError(form, "Merci d'indiquer une adresse e-mail valide.");
        return;
      }
      if (!variantField || !variantField.value) {
        event.preventDefault();
        showError(form, "Veuillez sélectionner une option du produit.");
        return;
      }

      setLoading(form, true);
      // Native full-page POST -> 303 redirect to the hosted SumUp checkout.
    });
  }

  /* --- cart block ---------------------------------------------------- */

  function initCart(block) {
    if (block.dataset.sumupBound) return;
    block.dataset.sumupBound = "1";

    var form = block.querySelector('form[data-sumup-form="cart"]');
    if (!form) return;

    var cartField = form.querySelector("[data-sumup-cart]");
    var codesField = form.querySelector("[data-sumup-discount-codes]");
    var attrsField = form.querySelector("[data-sumup-cart-attributes]");
    var totalField = form.querySelector("[data-sumup-cart-total]");
    var tokenField = form.querySelector("[data-sumup-cart-token]");
    var emptyNote = form.querySelector("[data-sumup-cart-empty]");
    var submitBtn = form.querySelector("[data-sumup-submit]");

    function readDiscountCodes(cart) {
      // The server re-validates every code with Shopify; this is only a hint.
      var codes = [];
      if (Array.isArray(cart.discount_codes)) {
        cart.discount_codes.forEach(function (d) {
          if (d && d.code && d.applicable !== false) codes.push(d.code);
        });
      }
      if (!codes.length && Array.isArray(cart.cart_level_discount_applications)) {
        cart.cart_level_discount_applications.forEach(function (a) {
          if (a && a.type === "discount_code" && a.title) codes.push(a.title);
        });
      }
      return codes;
    }

    function applyCart(cart) {
      cart = cart || {};
      var items = (Array.isArray(cart.items) ? cart.items : []).map(function (
        item,
      ) {
        return { variant_id: item.variant_id, quantity: item.quantity };
      });
      if (cartField) cartField.value = JSON.stringify({ items: items });
      if (codesField)
        codesField.value = JSON.stringify(readDiscountCodes(cart));
      if (attrsField) {
        // Pass cart attributes through so Shopify discount functions
        // (e.g. affiliate/referral apps) apply in the server-side re-price.
        var attrs = [];
        var raw = cart.attributes || {};
        Object.keys(raw).forEach(function (k) {
          attrs.push({ key: k, value: String(raw[k]) });
        });
        attrsField.value = JSON.stringify(attrs);
      }
      if (totalField)
        totalField.value =
          typeof cart.total_price === "number" ? String(cart.total_price) : "";
      if (tokenField) tokenField.value = cart.token || "";
      var empty = items.length === 0;
      if (emptyNote) emptyNote.hidden = !empty;
      if (submitBtn) submitBtn.disabled = empty;
      return items;
    }

    function refresh() {
      return fetch("/cart.js", { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json();
        })
        .then(applyCart)
        .catch(function () {
          return [];
        });
    }

    refresh();

    // Re-read the cart whenever the theme signals a change (any of these).
    [
      "cart:updated",
      "cart:refresh",
      "cart:change",
      "on:cart:updated",
      "cart-drawer:open",
    ].forEach(function (name) {
      document.addEventListener(name, refresh);
    });
    window.addEventListener("pageshow", refresh);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      showError(form, "");

      if (!validEmail(form)) {
        showError(form, "Merci d'indiquer une adresse e-mail valide.");
        return;
      }

      setLoading(form, true);

      refresh().then(function (items) {
        if (!items.length) {
          setLoading(form, false);
          showError(form, "Votre panier est vide.");
          return;
        }
        // Submit for real now that the cart payload is fresh.
        HTMLFormElement.prototype.submit.call(form);
      });
    });
  }

  /* --- boot -------------------------------------------------------- */

  function init(root) {
    (root || document)
      .querySelectorAll('[data-sumup-block="product"]')
      .forEach(initProduct);
    (root || document)
      .querySelectorAll('[data-sumup-block="cart"]')
      .forEach(initCart);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init(document);
    });
  } else {
    init(document);
  }

  // Re-init blocks injected by the theme editor without a full reload.
  document.addEventListener("shopify:section:load", function (event) {
    init(event.target);
  });
})();
