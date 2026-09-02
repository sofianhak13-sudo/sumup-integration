/* Commerce Engine — cart drawer + cart page interactions.
   Uses Shopify's native Section Rendering API to keep the drawer, the
   cart page, and the header cart-count bubble in sync after every
   change, instead of a hand-rolled cart-state re-implementation. */
(function () {
  'use strict';

  var cartDrawer = document.getElementById('CartDrawer');
  var cartDrawerToggles = document.querySelectorAll('[data-cart-drawer-toggle]');
  var cartCountEls = document.querySelectorAll('[data-cart-count]');

  function updateCartCount(count) {
    cartCountEls.forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });
  }

  function refreshCartCount() {
    fetch('/cart.js')
      .then(function (res) { return res.json(); })
      .then(function (cart) { updateCartCount(cart.item_count); });
  }

  function refreshCartDrawer() {
    if (!cartDrawer) return Promise.resolve();
    return fetch(window.location.pathname + '?sections=cart-drawer')
      .then(function (res) { return res.json(); })
      .then(function (sections) {
        var html = sections['cart-drawer'];
        if (!html) return;
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var newDrawer = doc.getElementById('CartDrawer');
        if (newDrawer) {
          var wasOpen = cartDrawer.open;
          cartDrawer.innerHTML = newDrawer.innerHTML;
          if (wasOpen) cartDrawer.setAttribute('open', '');
          bindDrawerControls();
        }
      });
  }

  function refreshCartPageBody() {
    var pageBody = document.querySelector('[data-cart-page-body]');
    if (!pageBody) return Promise.resolve();
    return fetch(window.location.pathname + '?section_id=main-cart')
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var newBody = doc.querySelector('[data-cart-page-body]');
        if (newBody) {
          pageBody.innerHTML = newBody.innerHTML;
          bindLineItemControls(pageBody);
        }
      });
  }

  function changeLine(variantId, quantity) {
    return fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: quantity })
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (data) { throw data; });
      return res.json();
    });
  }

  function showCartError(root, message) {
    var errorEl = root.querySelector('[data-cart-error]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
  }

  function bindLineItemControls(root) {
    root.querySelectorAll('[data-cart-item]').forEach(function (item) {
      var variantId = item.dataset.variantId;
      var input = item.querySelector('[data-cart-quantity-input]');
      var decrease = item.querySelector('[data-cart-quantity-decrease]');
      var increase = item.querySelector('[data-cart-quantity-increase]');
      var remove = item.querySelector('[data-cart-remove]');

      function apply(quantity) {
        item.setAttribute('aria-busy', 'true');
        changeLine(variantId, quantity)
          .then(function () {
            document.dispatchEvent(new CustomEvent('cart:updated'));
          })
          .catch(function (error) {
            showCartError(root.closest('[data-cart-drawer-body], [data-cart-page-body]') || root, (error && error.description) || window.themeStrings.cartError);
            item.removeAttribute('aria-busy');
          });
      }

      if (decrease) decrease.addEventListener('click', function () { apply(Math.max(0, parseInt(input.value, 10) - 1)); });
      if (increase) increase.addEventListener('click', function () { apply(parseInt(input.value, 10) + 1); });
      if (input) input.addEventListener('change', function () { apply(Math.max(0, parseInt(input.value, 10) || 0)); });
      if (remove) remove.addEventListener('click', function () { apply(0); });
    });
  }

  function bindDrawerControls() {
    var body = cartDrawer.querySelector('[data-cart-drawer-body]');
    if (body) bindLineItemControls(body);
    var closeBtn = cartDrawer.querySelector('[data-cart-drawer-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { cartDrawer.close(); });
  }

  function onCartUpdated() {
    refreshCartCount();
    Promise.all([refreshCartDrawer(), refreshCartPageBody()]).then(function () {
      if (cartDrawer && !cartDrawer.open && document.activeElement && document.activeElement.closest('[data-add-to-cart]')) {
        cartDrawer.showModal();
      }
    });
  }

  document.addEventListener('cart:updated', onCartUpdated);

  document.addEventListener('DOMContentLoaded', function () {
    if (cartDrawer) {
      bindDrawerControls();
      cartDrawer.addEventListener('click', function (event) {
        var rect = cartDrawer.getBoundingClientRect();
        var inside = rect.top <= event.clientY && event.clientY <= rect.top + rect.height &&
                     rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
        if (!inside) cartDrawer.close();
      });
      cartDrawerToggles.forEach(function (toggle) {
        toggle.addEventListener('click', function (event) {
          event.preventDefault();
          cartDrawer.showModal();
        });
      });
    }

    var cartPageBody = document.querySelector('[data-cart-page-body]');
    if (cartPageBody) bindLineItemControls(cartPageBody);
  });
})();
