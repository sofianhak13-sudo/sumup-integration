/* Commerce Engine — variant resolution + AJAX add-to-cart.
   Never lets a customer submit a variant combination that doesn't exist:
   if the selected options don't match a real variant, the Add to Cart
   button is disabled rather than silently falling back to the wrong one. */
(function () {
  'use strict';

  class ProductForm extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.sectionId;
      this.form = this.querySelector('[data-product-form-error]')
        ? this.querySelector('form')
        : this.querySelector('form');
      this.variantIdInput = this.querySelector('[data-product-form-variant-id]');
      this.submitButton = this.querySelector('[data-add-to-cart]');
      this.submitText = this.querySelector('[data-add-to-cart-text]');
      this.errorEl = this.querySelector('[data-product-form-error]');
      this.stockMessageEl = this.querySelector('[data-stock-message]');

      var variantsJson = document.getElementById('ProductVariants-' + this.sectionId);
      this.variants = variantsJson ? JSON.parse(variantsJson.textContent) : [];

      this.optionInputs = Array.from(this.querySelectorAll('[data-option-input]'));
      this.optionInputs.forEach(
        function (input) {
          input.addEventListener('change', this.onOptionChange.bind(this));
        }.bind(this)
      );

      var qtyInput = this.querySelector('.quantity-stepper__input');
      var decrease = this.querySelector('[data-quantity-decrease]');
      var increase = this.querySelector('[data-quantity-increase]');
      if (qtyInput && decrease && increase) {
        decrease.addEventListener('click', function () {
          qtyInput.value = Math.max(1, parseInt(qtyInput.value || '1', 10) - 1);
        });
        increase.addEventListener('click', function () {
          qtyInput.value = parseInt(qtyInput.value || '1', 10) + 1;
        });
      }

      if (this.form) this.form.addEventListener('submit', this.onSubmit.bind(this));
    }

    getSelectedOptions() {
      var byPosition = {};
      this.optionInputs.forEach(function (input) {
        if (input.checked) {
          var fieldset = input.closest('[data-option-position]');
          byPosition[fieldset.dataset.optionPosition] = input.value;
        }
      });
      return byPosition;
    }

    findMatchingVariant() {
      var selected = this.getSelectedOptions();
      var positions = Object.keys(selected);
      if (positions.length === 0) return this.variants[0];
      return this.variants.find(function (variant) {
        return positions.every(function (pos) {
          return variant['option' + pos] === selected[pos];
        });
      });
    }

    onOptionChange() {
      this.optionInputs.forEach(function (input) {
        input.closest('.product-option-value').classList.toggle('is-selected', input.checked);
      });

      var variant = this.findMatchingVariant();
      this.updateForVariant(variant);
    }

    updateForVariant(variant) {
      if (variant) {
        this.variantIdInput.value = variant.id;
        this.submitButton.disabled = !variant.available;
        this.submitButton.toggleAttribute('aria-disabled', !variant.available);
        if (this.submitText) {
          this.submitText.textContent = variant.available
            ? window.themeStrings.addToCart
            : window.themeStrings.soldOut;
        }
      } else {
        // No real variant matches this combination: never guess, disable instead.
        this.variantIdInput.value = '';
        this.submitButton.disabled = true;
        this.submitButton.setAttribute('aria-disabled', 'true');
        if (this.submitText) this.submitText.textContent = window.themeStrings.unavailable;
      }

      var priceEl = document.getElementById('ProductPrice-' + this.sectionId);
      if (priceEl && variant) {
        var priceHtml = variant.compare_at_price && variant.compare_at_price !== variant.price
          ? '<span class="price price--sale">' + variant.price + '</span><span class="price--compare">' + variant.compare_at_price + '</span>'
          : '<span class="price">' + variant.price + '</span>';
        priceEl.innerHTML = priceHtml;
      }

      if (this.stockMessageEl) {
        this.stockMessageEl.dataset.variantAvailable = variant ? String(variant.available) : 'false';
      }

      this.dispatchEvent(new CustomEvent('variant:changed', { detail: { variant: variant }, bubbles: true }));
    }

    onSubmit(event) {
      event.preventDefault();
      if (this.submitButton.disabled) return;

      if (this.errorEl) this.errorEl.hidden = true;
      this.submitButton.classList.add('btn--loading');
      this.submitButton.disabled = true;

      var formData = new FormData(this.form);

      fetch('/cart/add.js', {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' }
      })
        .then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok) throw data;
            return data;
          });
        })
        .then(
          function () {
            document.dispatchEvent(new CustomEvent('cart:updated'));
          }.bind(this)
        )
        .catch(
          function (error) {
            var message = (error && error.description) || window.themeStrings.cartError;
            if (this.errorEl) {
              this.errorEl.textContent = message;
              this.errorEl.hidden = false;
            } else {
              window.alert(message);
            }
          }.bind(this)
        )
        .finally(
          function () {
            this.submitButton.classList.remove('btn--loading');
            this.submitButton.disabled = false;
          }.bind(this)
        );
    }
  }

  if (!customElements.get('product-form')) {
    customElements.define('product-form', ProductForm);
  }
})();
