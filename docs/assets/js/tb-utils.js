/* ============================================================
   DevOps Toolbox - Utilities category
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TB = window.TB;
  var ND = window.NepaliDate;
  if (!TB) return;

  TB.wireOutputButtons();
  TB.wireAccordions();



  /* ============================================================
     1. AD <-> BS converter
     ============================================================ */
  (function () {
    if (!$('ab-ad')) return;

  if (ND) {
    var ySel = $('ab-bs-y'), mSel = $('ab-bs-m'), dSel = $('ab-bs-d');
    var yi;
    for (yi = ND.LAST_YEAR; yi >= ND.FIRST_YEAR; yi--) {
      var opt = document.createElement('option');
      opt.value = yi; opt.textContent = yi + ' BS';
      ySel.appendChild(opt);
    }
    ND.ROMAN_MONTHS.forEach(function (m, i) {
      var o = document.createElement('option');
      o.value = i + 1; o.textContent = ND.MONTH_NAMES[i];
      mSel.appendChild(o);
    });
    /* default: today's date in BS if within range, else mid-range */
    try {
      var todayBs = ND.adToBs(new Date());
      ySel.value = todayBs.year; mSel.value = todayBs.month;
    } catch (e) { ySel.value = 2082; }
    fillDays();
    function fillDays() {
      var dim = ND.daysInBsMonth(parseInt(ySel.value, 10), parseInt(mSel.value, 10));
      var cur = parseInt(dSel.value, 10) || 1;
      dSel.innerHTML = '';
      for (var i = 1; i <= dim; i++) {
        var d = document.createElement('option');
        d.value = i; d.textContent = i + ' ' + ND.toDevanagari(i);
        dSel.appendChild(d);
      }
      if (cur <= dim) dSel.value = cur;
    }
    [ySel, mSel].forEach(function (el) { el.addEventListener('change', function () { fillDays(); }); });

    /* AD -> BS */
    $('ab-to-bs').addEventListener('click', function () {
      var v = $('ab-ad').value;
      var outEl = $('ab-bs-out');
      if (!v) { outEl.textContent = '\u2014'; return; }
      try {
        var adDate = new Date(v + 'T12:00:00');   /* noon avoids TZ edge cases */
        var bs = ND.adToBs(adDate);
        if (!bs) { outEl.textContent = 'outside supported range'; return; }
        outEl.textContent = ND.formatBsFull(adDate) +
          ' (' + bs.year + ' ' + ND.ROMAN_MONTHS[bs.month - 1] + ' ' + bs.day + ' BS)';
      } catch (e) {
        outEl.textContent = 'outside supported range (' + e.message + ')';
      }
    });
    /* prefill with today */
    (function () {
      var now = new Date();
      $('ab-ad').value = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');
      $('ab-to-bs').click();
    })();

    /* BS -> AD */
    $('ab-to-ad').addEventListener('click', function () {
      var outEl = $('ab-ad-out');
      try {
        var ad = ND.bsToAd(parseInt(ySel.value, 10),
                           parseInt(mSel.value, 10),
                           parseInt(dSel.value, 10));
        outEl.textContent = ND.formatAd(ad) + ' (' + ad.toDateString() + ')';
      } catch (e) {
        outEl.textContent = 'invalid BS date (' + e.message + ')';
      }
    });
    dSel.value = Math.min(15, parseInt(dSel.value, 10) || 15);
    $('ab-to-ad').click();
  }
  })();


  /* ============================================================
     2. Timestamp converter
     ============================================================ */
  (function () {
    if (!$('ts-in')) return;

  function parseStamp(raw) {
    raw = raw.trim();
    if (/^-?\d{9,13}$/.test(raw)) {
      var n = parseInt(raw, 10);
      if (Math.abs(n) > 1e11) n = n;            /* already ms */
      else if (Math.abs(n) > 1e8) {}            /* seconds */
      return new Date(n < 1e11 ? n * 1000 : n);
    }
    if (/^-?\d+$/.test(raw)) return new Date(parseInt(raw, 10));
    var d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d;
  }
  function relTime(d) {
    var diff = (d.getTime() - Date.now()) / 1000;
    var abs = Math.abs(diff);
    var unit = abs < 90 ? ['second', 1] : abs < 5400 ? ['minute', 60] :
               abs < 129600 ? ['hour', 3600] : abs < 31104000 ? ['day', 86400] :
               ['day', 86400];
    var val = Math.round(abs / unit[1]);
    return diff >= 0 ? 'in ' + val + ' ' + unit[0] + 's' : val + ' ' + unit[0] + 's ago';
  }
  $('ts-in').addEventListener('input', function () {
    var errEl = $('ts-error'), kvEl = $('ts-kv');
    errEl.hidden = true; kvEl.hidden = true;
    var raw = $('ts-in').value;
    if (!raw.trim()) return;
    var d = parseStamp(raw);
    if (!d || isNaN(d.getTime())) {
      errEl.textContent = 'not a recognizable timestamp or ISO string';
      errEl.hidden = false; return;
    }
    function p(n) { return String(n).padStart(2, '0'); }
    kvEl.hidden = false;
    TB.fillKv(kvEl, [
      ['local time', d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())],
      ['UTC / ISO', d.toISOString()],
      ['unix seconds', Math.floor(d.getTime() / 1000)],
      ['unix millis', d.getTime()],
      ['relative', relTime(d)]
    ]);
  });
  $('ts-now').addEventListener('click', function () {
    var el = $('ts-now-out');
    el.hidden = false;
    el.textContent = 'seconds: ' + Math.floor(Date.now() / 1000) +
      '\nmillis:  ' + Date.now() +
      '\nISO:     ' + new Date().toISOString();
  });
  })();


  /* ============================================================
     3. UUID generator (v4)
     ============================================================ */
  (function () {
    if (!$('uu-go')) return;

  function uuidV4() {
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;   /* version 4 */
    b[8] = (b[8] & 0x3f) | 0x80;   /* variant 10 */
    var hex = Array.prototype.map.call(b, function (x) {
      return x.toString(16).padStart(2, '0');
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) +
           '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  function genUuids() {
    var n = Math.min(100, Math.max(1, parseInt($('uu-count').value, 10) || 3));
    $('uu-out').textContent =
      Array.from({ length: n }, uuidV4).join('\n');
  }
  $('uu-go').addEventListener('click', genUuids);
  genUuids();
  $('uu-copy').addEventListener('click', function () { TB.copy($('uu-out').textContent); });
  })();


  /* ============================================================
     4. JSON formatter
     ============================================================ */
  (function () {
    if (!$('jf-in')) return;

  function sortKeysDeep(v) {
    if (Array.isArray(v)) return v.map(sortKeysDeep);
    if (v && typeof v === 'object') {
      var out = {};
      Object.keys(v).sort().forEach(function (k) { out[k] = sortKeysDeep(v[k]); });
      return out;
    }
    return v;
  }
  function jfRun(mode) {
    var errEl = $('jf-error'), outEl = $('jf-out');
    errEl.hidden = true;
    try {
      var obj = JSON.parse($('jf-in').value);
      if (mode === 'sort') obj = sortKeysDeep(obj);
      var text = mode === 'minify'
        ? JSON.stringify(obj)
        : JSON.stringify(obj, null, 2);
      outEl.innerHTML = mode === 'minify' ? TB.esc(text)
        : TB.highlight(text, 'json');
    } catch (e) {
      var pos = /position (\d+)/.exec(e.message);
      var extra = '';
      if (pos) {
        var idx = parseInt(pos[1], 10);
        extra = '\n\ncontext: ...' + $('jf-in').value.slice(Math.max(0, idx - 25), idx + 25) + '...';
      }
      errEl.textContent = 'JSON error: ' + e.message + extra;
      errEl.hidden = false;
    }
  }
  $('jf-pretty').addEventListener('click', function () { jfRun('pretty'); });
  $('jf-minify').addEventListener('click', function () { jfRun('minify'); });
  $('jf-sort').addEventListener('click', function () { jfRun('sort'); });
  })();


  /* ============================================================
     5. Regex tester
     ============================================================ */
  (function () {
    if (!$('re-pattern')) return;

  var reFlags = { g: true, m: true, i: true };

  function renderRe() {
    var pat = $('re-pattern').value;
    var text = $('re-text').value;
    var errEl = $('re-error'), outEl = $('re-out');
    errEl.hidden = true;
    var flags = Object.keys(reFlags).filter(function (f) { return reFlags[f]; }).join('');
    var rx;
    try { rx = new RegExp(pat, flags); }
    catch (e) { errEl.textContent = 'invalid pattern: ' + e.message; errEl.hidden = false; return; }

    var matches = [], m, guard = 0;
    while ((m = rx.exec(text)) !== null && guard++ < 500) {
      matches.push({ index: m.index, text: m[0], groups: m.slice(1) });
      if (!rx.global) break;
    }
    if (!matches.length) {
      outEl.textContent = '// no matches';
      return;
    }
    outEl.textContent = matches.map(function (mm) {
      var lineNo = text.slice(0, mm.index).split('\n').length;
      var grp = mm.groups && mm.groups.some(function (g) { return g != null; })
        ? '  groups: [' + mm.groups.map(function (g) { return g == null ? '-' : '"' + g + '"'; }).join(', ') + ']'
        : '';
      return 'line ' + lineNo + ' @' + mm.index + ': "' + mm.text + '"' + grp;
    }).join('\n') + '\n\n' + matches.length + ' match(es)';
  }
  $('re-pattern').addEventListener('input', renderRe);
  $('re-text').addEventListener('input', renderRe);
  document.querySelectorAll('[data-flag]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      chip.classList.toggle('on');
      reFlags[chip.getAttribute('data-flag')] = chip.classList.contains('on');
      renderRe();
    });
  });
  renderRe();
  })();


  /* ============================================================
     6. Base64 / URL encoders
     ============================================================ */
  (function () {
    if (!$('en-in')) return;
function b64encode(str) {
      var bytes = new TextEncoder().encode(str);
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }

    function b64decode(str) {
      var bin = atob(str.replace(/\s+/g, ''));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }

    function ok(outText) {
      $('en-error').hidden = true;
      $('en-out').textContent = outText;
    }

    function fail(msg) {
      var e = $('en-error');
      e.textContent = msg;
      e.hidden = false;
      $('en-out').textContent = '// output appears here';
    }

    $('en-b64enc').addEventListener('click', function () {
      var raw = $('en-in').value;
      if (!raw) return;
      try { ok(b64encode(raw)); } catch (e) { fail('encode failed: ' + e.message); }
    });

    $('en-b64dec').addEventListener('click', function () {
      var raw = $('en-in').value;
      if (!raw) return;
      try { ok(b64decode(raw)); } catch (e) { fail('invalid base64 input'); }
    });

    $('en-urlenc').addEventListener('click', function () {
      var raw = $('en-in').value;
      if (!raw) return;
      try { ok(encodeURIComponent(raw)); } catch (e) { fail('encode failed: ' + e.message); }
    });

    $('en-urldec').addEventListener('click', function () {
      var raw = $('en-in').value;
      if (!raw) return;
      try { ok(decodeURIComponent(raw.replace(/\+/g, ' '))); }
      catch (e) { fail('invalid URL encoding'); }
    });
  })();


  /* ============================================================
     7. YAML formatter
     ============================================================ */
  (function () {
    if (!$('yf-in')) return;
function sortDeep(v) {
      if (Array.isArray(v)) return v.map(sortDeep);
      if (v && typeof v === 'object') {
        var o = {};
        Object.keys(v).sort().forEach(function (k) { o[k] = sortDeep(v[k]); });
        return o;
      }
      return v;
    }

    var SAMPLE = [
      'services:',
      '  api:',
      '    image: ghcr.io/acme/api:1.4.0',
      '    replicas: 3',
      '    env:',
      '      NODE_ENV: production',
      '      LOG_LEVEL: info',
      '    ports: ["8080:80", "443:443"]',
      '  db:',
      '    image: postgres:16',
      'volumes:',
      '  - data',
      '  - logs'
    ].join('\n');

    function renderYf() {
      var errEl = $('yf-error'), outEl = $('yf-out');
      errEl.hidden = true;
      var raw = $('yf-in').value;
      if (!raw.trim()) { outEl.innerHTML = TB.highlight('// output appears here', 'yaml'); return; }
      try {
        var data = TB.parseYaml(raw);
        if ($('yf-sort').classList.contains('on')) data = sortDeep(data);
        outEl.innerHTML = TB.highlight(TB.toYaml(data), 'yaml');
      } catch (e) {
        errEl.textContent = e.message;
        errEl.hidden = false;
      }
    }
    $('yf-in').addEventListener('input', renderYf);
    $('yf-sort').addEventListener('click', function () {
      $('yf-sort').classList.toggle('on'); renderYf();
    });
    $('yf-sample').addEventListener('click', function () {
      $('yf-in').value = SAMPLE; renderYf();
    });
    renderYf();
  })();

})();
