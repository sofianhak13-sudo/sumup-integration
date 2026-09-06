/*
 * SumUp storefront app embed.
 *
 *  - Injects the SumUp payment button into the Horizon cart drawer (which does
 *    not accept app blocks), re-injecting after every Section Rendering API
 *    re-render, with no duplicate CTA and no per-instance listeners.
 *  - Optionally hides the native Shopify checkout button — but only once a
 *    SumUp CTA is confirmed present, so a script failure can never leave the
 *    buyer with no way to pay.
 *
 * The cart is always re-fetched from /cart.js right before submit. The server
 * (/apps/sumup-pay/cart) stays the single source of truth for the amount.
 * Behaviour is driven by the master switches in the app admin, read from
 * /apps/sumup-pay/config.
 */
(function () {
  "use strict";

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var DRAWER_SELECTOR = ".cart-drawer__summary";
  var HIDE_CLASS = "sumup-hide-native-checkout";

  var cfg = {};
  var labels = {};
  var style = {};
  var settings = null; // { cartPaymentsEnabled, cartDrawerEnabled, hideShopifyCheckout }

  function readConfig() {
    var el = document.querySelector("script[data-sumup-embed-config]");
    if (el) {
      try {
        cfg = JSON.parse(el.textContent) || {};
      } catch (e) {
        cfg = {};
      }
    }
    labels = cfg.labels || {};
    style = cfg.style || {};
  }

  function loadSettings() {
    return fetch("/apps/sumup-pay/config", { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.ok ? r.json() : {};
      })
      .then(function (s) {
        settings = s || {};
        return settings;
      })
      .catch(function () {
        settings = {};
        return settings;
      });
  }

  /* --- helpers ------------------------------------------------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function fetchCart() {
    return fetch("/cart.js", { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return null;
      });
  }

  function cartPayload(cart) {
    var items = (cart && Array.isArray(cart.items) ? cart.items : []).map(
      function (i) {
        return { variant_id: i.variant_id, quantity: i.quantity };
      },
    );
    var codes = [];
    if (cart && Array.isArray(cart.discount_codes)) {
      cart.discount_codes.forEach(function (d) {
        if (d && d.code && d.applicable !== false) codes.push(d.code);
      });
    }
    var attrs = [];
    var raw = (cart && cart.attributes) || {};
    Object.keys(raw).forEach(function (k) {
      attrs.push({ key: k, value: String(raw[k]) });
    });
    return {
      items: JSON.stringify({ items: items }),
      discountCodes: JSON.stringify(codes),
      cartAttributes: JSON.stringify(attrs),
      cartTotal:
        cart && typeof cart.total_price === "number"
          ? String(cart.total_price)
          : "",
      cartToken: (cart && cart.token) || "",
      empty: items.length === 0,
    };
  }

  function syncForm(form, payload) {
    if (!form) return;
    var set = function (name, value) {
      var el = form.querySelector('[data-f="' + name + '"]');
      if (el) el.value = value;
    };
    set("items", payload.items);
    set("discountCodes", payload.discountCodes);
    set("cartAttributes", payload.cartAttributes);
    set("cartTotal", payload.cartTotal);
    set("cartToken", payload.cartToken);
    var btn = form.querySelector("[data-sumup-submit]");
    if (btn) btn.disabled = payload.empty;
  }

  function buildBlock() {
    var wrap = document.createElement("div");
    wrap.className = "sumup-drawer";
    wrap.setAttribute("data-sumup-drawer-block", "");
    wrap.style.setProperty("--sumup-accent", style.accent || "#1a1a1a");
    wrap.style.setProperty("--sumup-on-accent", style.onAccent || "#ffffff");

    var emailKnown = cfg.customerEmail && EMAIL_RE.test(cfg.customerEmail);
    var emailInput = emailKnown
      ? '<input type="hidden" name="email" value="' + esc(cfg.customerEmail) + '">'
      : '<input class="sumup-drawer__input" type="email" name="email" required ' +
        'inputmode="email" autocomplete="email" placeholder="' +
        esc(labels.email || "E-mail") +
        '">';

    wrap.innerHTML =
      '<form class="sumup-drawer__form" method="post" action="/apps/sumup-pay/cart" data-sumup-drawer-form novalidate>' +
      '<input type="hidden" name="cart" data-f="items">' +
      '<input type="hidden" name="discountCodes" data-f="discountCodes">' +
      '<input type="hidden" name="cartAttributes" data-f="cartAttributes">' +
      '<input type="hidden" name="cartTotal" data-f="cartTotal">' +
      '<input type="hidden" name="cartToken" data-f="cartToken">' +
      emailInput +
      '<p class="sumup-drawer__error" data-sumup-error hidden></p>' +
      '<button type="submit" class="sumup-drawer__button" data-sumup-submit>' +
      esc(labels.button || "Payer avec SumUp") +
      "</button>" +
      (labels.trust
        ? '<p class="sumup-drawer__trust">🔒 ' +
          esc(labels.trustText || "Paiement sécurisé par SumUp") +
          "</p>"
        : "") +
      "</form>";
    return wrap;
  }

  /* --- drawer injection ------------------------------------------- */

  function injectDrawer() {
    if (!settings || !settings.cartPaymentsEnabled || !settings.cartDrawerEnabled) {
      return;
    }
    var summary = document.querySelector(DRAWER_SELECTOR);
    if (!summary) return;
    if (summary.querySelector("[data-sumup-drawer-block]")) return;

    var host = buildBlock();
    var ctas = summary.querySelector(".cart__ctas");
    if (ctas) summary.insertBefore(host, ctas);
    else summary.insertBefore(host, summary.firstChild);

    fetchCart().then(function (cart) {
      syncForm(host.querySelector("form"), cartPayload(cart));
    });
  }

  function applyHiding() {
    var wanted = !!(settings && settings.hideShopifyCheckout);
    var hasSumupCta =
      document.querySelector(
        '[data-sumup-block="cart"] form[data-sumup-form="cart"]',
      ) || document.querySelector("[data-sumup-drawer-block] form");
    document.documentElement.classList.toggle(HIDE_CLASS, wanted && !!hasSumupCta);
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var run = function () {
      scheduled = false;
      injectDrawer();
      applyHiding();
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  function observe() {
    var target = document.getElementById("cart-drawer") || document.body;
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
          schedule();
          return;
        }
      }
    });
    mo.observe(target, { childList: true, subtree: true });
  }

  /* --- submit (delegated, bound once) --------------------------- */

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches("form[data-sumup-drawer-form]")) {
      return;
    }
    event.preventDefault();
    if (form.dataset.sumupBusy) return;

    var errBox = form.querySelector("[data-sumup-error]");
    var showErr = function (m) {
      if (errBox) {
        errBox.textContent = m || "";
        errBox.hidden = !m;
      }
    };
    var emailField = form.querySelector('[name="email"]');
    var email = emailField ? String(emailField.value || "").trim() : "";

    showErr("");
    if (!EMAIL_RE.test(email)) {
      showErr("Merci d'indiquer une adresse e-mail valide.");
      return;
    }

    form.dataset.sumupBusy = "1";
    var btn = form.querySelector("[data-sumup-submit]");
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    }

    fetchCart().then(function (cart) {
      var payload = cartPayload(cart);
      if (payload.empty) {
        form.dataset.sumupBusy = "";
        if (btn) {
          btn.disabled = false;
          btn.setAttribute("aria-busy", "false");
        }
        showErr("Votre panier est vide.");
        return;
      }
      syncForm(form, payload);
      // Native full-page POST -> 303 -> hosted SumUp checkout.
      HTMLFormElement.prototype.submit.call(form);
    });
  });

  /* --- cart change events -> resync existing form --------------- */

  ["cart:updated", "cart:refresh", "cart:change", "on:cart:updated"].forEach(
    function (name) {
      document.addEventListener(name, function () {
        var form = document.querySelector("[data-sumup-drawer-block] form");
        if (form && !form.dataset.sumupBusy) {
          fetchCart().then(function (cart) {
            syncForm(form, cartPayload(cart));
          });
        }
        schedule();
      });
    },
  );

  document.addEventListener("shopify:section:load", schedule);
  window.addEventListener("pageshow", function () {
    readConfig();
    loadSettings().then(schedule);
  });

  /* --- boot ----------------------------------------------------- */

  function boot() {
    // Nothing to do on pages without a cart drawer or a cart-page SumUp block.
    if (
      !document.getElementById("cart-drawer") &&
      !document.querySelector('[data-sumup-block="cart"]')
    ) {
      return;
    }
    readConfig();
    loadSettings().then(function () {
      schedule();
      observe();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
