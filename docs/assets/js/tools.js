/* ============================================================
   Interactive tools: AD <-> BS date converter + IP pool calc
   ============================================================ */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  var ND = window.NepaliDate || {};
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var NP_WEEKDAYS = ['आइतबार', 'सोमबार', 'मङ्गलबार', 'बुधबार',
                     'बिहीबार', 'शुक्रबार', 'शनिबार'];

  /* ---------------- AD <-> BS date converter ---------------- */
  (function initConverter() {
    if (!$('bs-year') || !ND.bsToAd) return;

    var ySel = $('bs-year');
    var mSel = $('bs-month');
    var dSel = $('bs-day');

    for (var y = ND.FIRST_YEAR; y <= ND.LAST_YEAR; y++) {
      ySel.add(new Option(y + ' BS', y));
    }
    for (var m = 0; m < 12; m++) {
      mSel.add(new Option(ND.ROMAN_MONTHS[m] + ' / ' + ND.MONTH_NAMES[m], m + 1));
    }

    function fillDays() {
      var dim = ND.daysInBsMonth(+ySel.value, +mSel.value) || 31;
      var keep = Math.min(+dSel.value || 1, dim);
      dSel.innerHTML = '';
      for (var d = 1; d <= dim; d++) dSel.add(new Option(d, d));
      dSel.value = keep;
    }
    fillDays();
    ySel.onchange = fillDays;
    mSel.onchange = fillDays;

    /* default the AD input to today */
    var now = new Date();
    $('ad-input').value =
      now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    $('to-bs-btn').onclick = function () {
      var parts = ($('ad-input').value || '').split('-').map(Number);
      var out = $('bs-output');
      if (parts.length !== 3 || parts.some(isNaN)) {
        out.textContent = 'Pick a valid AD date.';
        return;
      }
      var utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      var bs = ND.adToBs(utc);
      if (!bs) {
        out.textContent = 'Out of supported range (' +
          '14 Apr 1943 AD - 13 Apr 2044 AD).';
        return;
      }
      out.textContent =
        NP_WEEKDAYS[utc.getUTCDay()] + ' — ' +
        ND.MONTH_NAMES[bs.month - 1] + ' ' + ND.toDevanagari(bs.day) +
        ', ' + ND.toDevanagari(bs.year) + ' BS' +
        '   (' + ND.ROMAN_MONTHS[bs.month - 1] + ' ' + bs.day + ', ' + bs.year + ')';
    };

    $('to-ad-btn').onclick = function () {
      var ad = ND.bsToAd(+ySel.value, +mSel.value, +dSel.value);
      var out = $('ad-output');
      if (!ad) { out.textContent = 'Invalid BS date.'; return; }
      out.textContent = ND.formatAd(ad) +
        '   (' + ySel.value + ' ' + ND.ROMAN_MONTHS[mSel.value - 1] +
        ' ' + dSel.value + ' BS)';
    };
  })();

  /* ---------------- IP pool calculator ---------------- */
  (function initIpCalc() {
    if (!$('calc-btn')) return;

    function ipToInt(ip) {
      var o = ip.split('.');
      return ((+o[0] << 24) | (+o[1] << 16) | (+o[2] << 8) | +o[3]) >>> 0;
    }
    function intToIp(n) {
      return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    }
    function maskOf(prefix) {
      return prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
    }

    /* RFC1918 / loopback / CGNAT / link-local */
    function rangeType(net, prefix) {
      function inCidr(cidrPrefix, cidrBits) {
        return (net >>> 0 >> (32 - cidrBits)) ===
               (cidrPrefix >>> 0 >> (32 - cidrBits));
      }
      if (inCidr(ipToInt('10.0.0.0'), 8)) return 'Private (RFC1918)';
      if (inCidr(ipToInt('172.16.0.0'), 12)) return 'Private (RFC1918)';
      if (inCidr(ipToInt('192.168.0.0'), 16)) return 'Private (RFC1918)';
      if (inCidr(ipToInt('127.0.0.0'), 8)) return 'Loopback';
      if (inCidr(ipToInt('100.64.0.0'), 10)) return 'CGNAT (RFC6598)';
      if (inCidr(ipToInt('169.254.0.0'), 16)) return 'Link-local';
      return 'Public';
    }

    function row(k, v) { return '<dt>' + k + '</dt><dd>' + v + '</dd>'; }

    $('calc-btn').onclick = function () {
      var errEl = $('ip-error');
      var sumEl = $('ip-summary');
      var splitWrap = $('ip-split-wrap');
      errEl.hidden = true;

      var m = ($('cidr-input').value || '').trim()
        .match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
      if (!m) {
        errEl.textContent = 'Enter a valid CIDR, e.g. 10.20.4.0/22';
        errEl.hidden = false;
        sumEl.hidden = true;
        splitWrap.hidden = true;
        return;
      }
      var octs = m[1].split('.').map(Number);
      if (octs.some(function (o) { return o > 255; }) || +m[2] > 32) {
        errEl.textContent = 'Octets must be 0-255 and prefix 0-32.';
        errEl.hidden = false;
        sumEl.hidden = true;
        splitWrap.hidden = true;
        return;
      }

      var ip = ipToInt(m[1]);
      var p = +m[2];
      var mask = maskOf(p);
      var net = (ip & mask) >>> 0;
      var bcast = (net | (~mask >>> 0)) >>> 0;
      var total = Math.pow(2, 32 - p);
      var usable = total > 2 ? total - 2 : total;

      var hostRange;
      if (total > 2) {
        hostRange = intToIp(net + 1) + '  →  ' + intToIp(bcast - 1);
      } else {
        hostRange = intToIp(net) + '  →  ' + intToIp(bcast) + ' (/31+/32 special)';
      }

      sumEl.innerHTML =
        row('Network', intToIp(net) + '/' + p) +
        row('Broadcast', intToIp(bcast)) +
        row('Subnet mask', intToIp(mask)) +
        row('Wildcard', intToIp(~mask >>> 0)) +
        row('Usable hosts', hostRange) +
        row('Pool size', total.toLocaleString() + ' IPs (' + usable.toLocaleString() + ' usable)') +
        row('Type', '<span class="dim">' + rangeType(net, p) + '</span>');
      sumEl.hidden = false;

      /* child pools */
      var sp = $('split-prefix').value;
      if (!sp) { splitWrap.hidden = true; return; }
      var cp = +sp.replace('/', '');
      if (cp <= p) {
        splitWrap.hidden = true;
        return;
      }
      var count = Math.pow(2, cp - p);
      var step = Math.pow(2, 32 - cp);
      var rows = '';
      var MAX = 24;
      for (var i = 0; i < Math.min(count, MAX); i++) {
        var cnet = net + i * step;
        var cbcast = cnet + step - 1;
        rows += '<tr><td>' + intToIp(cnet) + '/' + cp + '</td><td>' +
          intToIp(cnet + 1) + ' – ' + intToIp(cbcast - 1) +
          '</td><td>' + intToIp(cbcast) + '</td><td>' +
          (Math.pow(2, 32 - cp) - 2).toLocaleString() + '</td></tr>';
      }
      $('split-table').innerHTML =
        '<thead><tr><th>CIDR</th><th>Usable range</th><th>Broadcast</th><th>Hosts</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>';
      $('split-more').textContent = count > MAX
        ? '+ ' + (count - MAX).toLocaleString() + ' more pools…'
        : '';
      splitWrap.hidden = false;
    };
  })();

  /* ---------------- Password generator ---------------- */
  (function initPwGen() {
    if (!$('pw-generate')) return;

    var SETS = {
      upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      lower: 'abcdefghijklmnopqrstuvwxyz',
      num:   '0123456789',
      sym:   '!@#$%^&*()-_=+[]{};:,.<>?/~'
    };

    /* unbiased random int in [0, max) via rejection sampling */
    function randInt(max) {
      var lim = Math.floor(4294967296 / max) * max;
      var buf = new Uint32Array(1);
      do {
        window.crypto.getRandomValues(buf);
      } while (buf[0] >= lim);
      return buf[0] % max;
    }

    function pick(str) { return str.charAt(randInt(str.length)); }

    var DEFAULT_COPY = '<i class="mdi mdi-content-copy"></i>';

    $('pw-length').oninput = function () {
      $('pw-len-val').textContent = this.value;
    };

    function generate() {
      var errEl = $('pw-error');
      var selected = [];
      ['upper', 'lower', 'num', 'sym'].forEach(function (k) {
        if ($('pw-' + k).checked) selected.push(SETS[k]);
      });

      if (!selected.length) {
        /* invalid config: refuse to generate an empty password */
        errEl.textContent = 'Select at least one character set.';
        errEl.hidden = false;
        return;
      }
      errEl.hidden = true;

      var len = parseInt($('pw-length').value, 10);
      if (isNaN(len)) len = 20;
      len = Math.min(128, Math.max(8, len));

      var pool = selected.join('');
      var chars = [];

      /* guarantee at least one char from every selected set */
      selected.forEach(function (set) { chars.push(pick(set)); });
      while (chars.length < len) chars.push(pick(pool));

      /* Fisher-Yates shuffle (crypto-seeded) */
      for (var i = chars.length - 1; i > 0; i--) {
        var j = randInt(i + 1);
        var tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
      }

      var pw = chars.join('');
      $('pw-output').value = pw;
      updateStrength(len, pool.length);
    }

    function updateStrength(len, poolSize) {
      var bits = Math.round(len * Math.log2(poolSize));
      var pct = Math.min(100, Math.round((bits / 128) * 100));
      var label, color;
      if (bits < 45)      { label = 'Weak';        color = '#ff6b6b'; }
      else if (bits < 65) { label = 'Fair';        color = '#e3b341'; }
      else if (bits < 85) { label = 'Strong';      color = 'var(--accent)'; }
      else                { label = 'Very strong'; color = 'var(--accent)'; }

      $('pw-bar').style.width = pct + '%';
      $('pw-bar').style.background = color;
      $('pw-label').innerHTML = label +
        ' <span class="dim">~' + bits + ' bits</span>';
    }

    var copyTimer = null;
    $('pw-copy').onclick = function () {
      var pw = $('pw-output').value;
      if (!pw || pw === '—') return;
      var btn = this;

      function confirmCopied(ok) {
        btn.classList.toggle('copied', ok);
        btn.innerHTML = ok
          ? '<i class="mdi mdi-check"></i>'
          : DEFAULT_COPY;
        btn.setAttribute('aria-label', ok ? 'Copied!' : 'Copy password to clipboard');
        if (copyTimer) clearTimeout(copyTimer);
        if (ok) copyTimer = setTimeout(function () {
          btn.classList.remove('copied');
          btn.innerHTML = DEFAULT_COPY;
        }, 1600);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pw).then(
          function () { confirmCopied(true); },
          function () { fallbackCopy(pw) ? confirmCopied(true) : confirmCopied(false); }
        );
      } else {
        confirmCopied(fallbackCopy(pw));
      }
    };

    /* textarea hack for non-secure contexts / older browsers */
    function fallbackCopy(text) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    }

    $('pw-generate').onclick = generate;

    /* field is never empty on arrival */
    generate();
  })();
})();
