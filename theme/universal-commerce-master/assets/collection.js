/* Collection / PLP — filter panel toggle + auto-submitting filters and
   sort. Native Shopify storefront filtering (collection.filters,
   ?filter.* params) — no client-side re-implementation of filtering
   logic, only UX around the real query-string-driven filtering. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.querySelector('[data-filters-toggle]');
    var panel = document.querySelector('[data-filters-panel]');
    if (toggle && panel) {
      toggle.addEventListener('click', function () {
        var isHidden = panel.hasAttribute('hidden');
        if (isHidden) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', String(isHidden));
      });
    }

    var filtersForm = document.querySelector('[data-filters-form]');
    var sortSelect = document.querySelector('[data-sort-select]');

    function currentUrl() {
      return new URL(window.location.href);
    }

    if (filtersForm) {
      filtersForm.addEventListener('change', function (event) {
        if (event.target.type !== 'checkbox') return;
        var url = currentUrl();
        if (event.target.checked) url.searchParams.set(event.target.name, event.target.value);
        else url.searchParams.delete(event.target.name);
        window.location.href = url.toString();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        var url = currentUrl();
        url.searchParams.set('sort_by', sortSelect.value);
        window.location.href = url.toString();
      });
    }
  });
})();
