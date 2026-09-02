/* Optional SumUp payment adapter.
   Only wired up when a .sumup-product-adapter or .sumup-cart-adapter
   element actually exists on the page (i.e. the merchant both enabled
   the setting AND added the block/section) — a store that doesn't use
   SumUp loads this file but it does nothing and binds zero listeners.

   Both adapters submit a real top-level form POST (not fetch) because
   the backend responds with an HTTP redirect straight to the SumUp
   hosted checkout page; that only works cleanly as a browser navigation. */
(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function showError(container, message) {
    var errorEl = container.querySelector('[data-sumup-error]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
  }

  function setLoading(button, isLoading) {
    button.disabled = isLoading;
    button.classList.toggle('btn--loading', isLoading);
  }

  function submitForm(action, fields) {
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    form.style.display = 'none';
    Object.keys(fields).forEach(function (name) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = fields[name];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  function initProductAdapter(container) {
    var button = container.querySelector('[data-sumup-pay-button]');
    var emailInput = container.querySelector('[data-sumup-email]');
    if (!button || !emailInput) return;

    button.addEventListener('click', function () {
      var email = emailInput.value.trim();
      if (!EMAIL_RE.test(email)) {
        showError(container, window.themeStrings.sumupErrorEmail);
        emailInput.focus();
        return;
      }
      setLoading(button, true);
      submitForm(container.dataset.endpoint, {
        email: email,
        productId: container.dataset.productId
      });
    });
  }

  function initCartAdapter(container) {
    var button = container.querySelector('[data-sumup-pay-button]');
    var emailInput = container.querySelector('[data-sumup-email]');
    if (!button || !emailInput) return;

    button.addEventListener('click', function () {
      var email = emailInput.value.trim();
      if (!EMAIL_RE.test(email)) {
        showError(container, window.themeStrings.sumupErrorEmail);
        emailInput.focus();
        return;
      }

      setLoading(button, true);

      fetch('/cart.js')
        .then(function (res) { return res.json(); })
        .then(function (cart) {
          if (!cart.items || cart.items.length === 0) {
            showError(container, window.themeStrings.sumupErrorCartEmpty);
            setLoading(button, false);
            return;
          }
          submitForm(container.dataset.endpoint, {
            email: email,
            cart: JSON.stringify(cart)
          });
        })
        .catch(function () {
          showError(container, window.themeStrings.sumupErrorGeneric);
          setLoading(button, false);
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-sumup-product-adapter]').forEach(initProductAdapter);
    document.querySelectorAll('[data-sumup-cart-adapter]').forEach(initCartAdapter);
  });
})();
