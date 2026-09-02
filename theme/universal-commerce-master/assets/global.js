/* Universal Commerce Master — global site behavior.
   No framework, no bundler: plain progressive-enhancement JS, loaded once,
   scoped by data-attributes so it costs nothing on pages without the
   corresponding markup. */
(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function closeDialogOnBackdrop(dialog) {
    dialog.addEventListener('click', function (event) {
      var rect = dialog.getBoundingClientRect();
      var inside =
        rect.top <= event.clientY && event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
      if (!inside) dialog.close();
    });
  }

  onReady(function () {
    /* ---- Mobile menu ---- */
    var mobileMenu = document.getElementById('MobileMenu');
    var menuToggle = document.querySelector('[data-mobile-menu-toggle]');
    if (mobileMenu && menuToggle) {
      closeDialogOnBackdrop(mobileMenu);
      menuToggle.addEventListener('click', function () {
        mobileMenu.showModal();
        menuToggle.setAttribute('aria-expanded', 'true');
      });
      mobileMenu.addEventListener('close', function () {
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.focus();
      });
      var menuClose = mobileMenu.querySelector('[data-mobile-menu-close]');
      if (menuClose) menuClose.addEventListener('click', function () { mobileMenu.close(); });
    }

    /* ---- Predictive search ---- */
    var searchDialog = document.getElementById('PredictiveSearch');
    var searchToggles = document.querySelectorAll('[data-search-toggle]');
    if (searchDialog) {
      closeDialogOnBackdrop(searchDialog);
      searchToggles.forEach(function (btn) {
        btn.addEventListener('click', function () {
          searchDialog.showModal();
          var input = searchDialog.querySelector('[data-predictive-search-input]');
          if (input) input.focus();
        });
      });
      var searchClose = searchDialog.querySelector('[data-search-close]');
      if (searchClose) searchClose.addEventListener('click', function () { searchDialog.close(); });

      var input = searchDialog.querySelector('[data-predictive-search-input]');
      var resultsEl = searchDialog.querySelector('[data-predictive-search-results]');
      var debounceTimer;
      var currentController;

      function renderResults(data) {
        if (!resultsEl) return;
        var products = (data.resources && data.resources.results && data.resources.results.products) || [];
        if (products.length === 0) {
          resultsEl.innerHTML = '<p class="predictive-search__empty">' + window.themeStrings.searchNoResultsSuggestion + '</p>';
          return;
        }
        var html = '<ul>';
        products.forEach(function (product) {
          html +=
            '<li><a class="predictive-search__result" href="' + product.url + '">' +
            (product.image ? '<img src="' + product.image + '&width=96" alt="" loading="lazy">' : '') +
            '<span>' + product.title + '</span>' +
            '</a></li>';
        });
        html += '</ul>';
        resultsEl.innerHTML = html;
      }

      if (input) {
        input.addEventListener('input', function () {
          var term = input.value.trim();
          clearTimeout(debounceTimer);
          if (term.length < 2) {
            resultsEl.innerHTML = '';
            return;
          }
          debounceTimer = setTimeout(function () {
            if (currentController) currentController.abort();
            currentController = new AbortController();
            fetch(
              '/search/suggest.json?q=' + encodeURIComponent(term) + '&resources[type]=product&resources[limit]=6',
              { signal: currentController.signal }
            )
              .then(function (res) { return res.json(); })
              .then(renderResults)
              .catch(function (err) {
                if (err.name !== 'AbortError') resultsEl.innerHTML = '';
              });
          }, 220);
        });
      }
    }

    /* ---- Sticky header shadow-on-scroll (visual only, no layout dependency) ---- */
    var header = document.querySelector('[data-site-header]');
    if (header && header.classList.contains('site-header--sticky')) {
      var lastScroll = 0;
      window.addEventListener(
        'scroll',
        function () {
          var y = window.scrollY;
          header.classList.toggle('site-header--scrolled', y > 4);
          lastScroll = y;
        },
        { passive: true }
      );
    }

    /* ---- Countdown: real merchant-set date only, never a fabricated deadline ---- */
    document.querySelectorAll('[data-countdown]').forEach(function (root) {
      var target = new Date(root.dataset.target);
      if (isNaN(target.getTime())) return;
      var grid = root.querySelector('.countdown-timer__grid');
      var expiredEl = root.querySelector('[data-countdown-expired]');

      function pad(n) { return String(n).padStart(2, '0'); }

      function tick() {
        var diff = target.getTime() - Date.now();
        if (diff <= 0) {
          clearInterval(interval);
          if (grid) grid.hidden = true;
          if (expiredEl) {
            expiredEl.textContent = root.dataset.expiredMessage;
            expiredEl.hidden = false;
          }
          return;
        }
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff / 3600000) % 24);
        var minutes = Math.floor((diff / 60000) % 60);
        var seconds = Math.floor((diff / 1000) % 60);
        var daysEl = root.querySelector('[data-days]');
        var hoursEl = root.querySelector('[data-hours]');
        var minutesEl = root.querySelector('[data-minutes]');
        var secondsEl = root.querySelector('[data-seconds]');
        if (daysEl) daysEl.textContent = pad(days);
        if (hoursEl) hoursEl.textContent = pad(hours);
        if (minutesEl) minutesEl.textContent = pad(minutes);
        if (secondsEl) secondsEl.textContent = pad(seconds);
      }

      tick();
      var interval = setInterval(tick, 1000);
    });

    /* ---- Generic: any [data-dialog-open] opens the dialog named in its value ---- */
    document.querySelectorAll('[data-dialog-open]').forEach(function (trigger) {
      var target = document.getElementById(trigger.getAttribute('data-dialog-open'));
      if (!target) return;
      trigger.addEventListener('click', function () { target.showModal(); });
    });
  });

  window.themeStrings = window.themeStrings || {
    searchNoResultsSuggestion: 'Try a different search term.'
  };
})();
