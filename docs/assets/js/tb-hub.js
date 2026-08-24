/* ============================================================
   DevOps Toolbox - dashboard hub (search + category filters)
   ============================================================ */
(function () {
  'use strict';

  var searchEl = document.getElementById('tb-search');
  if (!searchEl) return;

  var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.cat-section'));
  var chips = Array.prototype.slice.call(document.querySelectorAll('.fchip'));
  var emptyEl = document.getElementById('no-results');
  var activeCat = 'all';

  function apply() {
    var q = searchEl.value.trim().toLowerCase();
    var total = 0;

    sections.forEach(function (sec) {
      var catOk = activeCat === 'all' || sec.getAttribute('data-cat') === activeCat;
      var visibleInSection = 0;
      sec.querySelectorAll('.tool-card').forEach(function (card) {
        var hay = (card.getAttribute('data-search') || '') + ' ' +
                  (card.textContent || '').toLowerCase();
        var show = catOk && (!q || hay.indexOf(q) !== -1);
        card.hidden = !show;
        if (show) visibleInSection++;
      });
      sec.hidden = visibleInSection === 0;
      total += visibleInSection;
    });

    if (emptyEl) emptyEl.hidden = total !== 0;
  }

  function setCat(cat, updateHash) {
    activeCat = cat;
    chips.forEach(function (c) {
      c.classList.toggle('on', c.getAttribute('data-fcat') === cat);
    });
    apply();
    if (updateHash) {
      try {
        history.replaceState(null, '', cat === 'all' ?
          location.pathname : '#' + cat);
      } catch (e) { /* ignore */ }
    }
  }

  searchEl.addEventListener('input', apply);

  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      setCat(c.getAttribute('data-fcat'), true);
    });
  });

  window.addEventListener('hashchange', function () {
    var h = location.hash.replace('#', '');
    if (h && chips.some(function (c) {
          return c.getAttribute('data-fcat') === h;
        })) {
      setCat(h, false);
    }
  });

  /* deep link: /toolbox/#kubernetes opens pre-filtered */
  var initial = location.hash.replace('#', '');
  if (initial && chips.some(function (c) {
        return c.getAttribute('data-fcat') === initial;
      })) {
    setCat(initial, false);
  } else {
    apply();
  }
})();
