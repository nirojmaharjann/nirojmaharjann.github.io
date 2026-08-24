/* ============================================================
   DevOps Toolbox - Security category
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TB = window.TB;
  if (!TB) return;

  TB.wireOutputButtons();
  TB.wireAccordions();





  /* ============================================================
     1. Password generator (crypto.getRandomValues, rejection sampling)
     ============================================================ */
  (function () {
    if (!$('pw-length')) return;

  var PW = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    num: '0123456789',
    sym: '!@#$%^&*()-_=+[]{};:,.<>?/'
  };

  /* uniform random integer in [0, max) via rejection sampling */
  function randInt(max) {
    if (max <= 0 || !isFinite(max)) throw new Error('randInt: bad range');
    var limit = Math.floor(0x100000000 / max) * max;   /* largest multiple of max */
    var buf = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(buf);
      if (buf[0] < limit) return buf[0] % max;
    }
  }

  function generatePassword(len, sets) {
    if (!sets.length) throw new Error('select at least one character set');
    if (!Number.isInteger(len) || len < 8 || len > 128)
      throw new Error('length must be between 8 and 128');

    var all = sets.join('');
    var chars = [];
    /* guarantee at least one char from each selected set */
    sets.forEach(function (set) { chars.push(set[randInt(set.length)]); });
    while (chars.length < len) chars.push(all[randInt(all.length)]);

    /* Fisher-Yates shuffle with CSPRNG swaps */
    for (var i = chars.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
    }
    return chars.slice(0, len).join('');
  }

  function entropyBits(len, setCount) {
    return Math.round(len * Math.log2(setCount));
  }

  var pwCurrent = '';

  function pwGenerate() {
    var len = parseInt($('pw-length').value, 10);
    var sets = [];
    if ($('pw-upper').checked) sets.push(PW.upper);
    if ($('pw-lower').checked) sets.push(PW.lower);
    if ($('pw-num').checked) sets.push(PW.num);
    if ($('pw-sym').checked) sets.push(PW.sym);

    var errEl = $('pw-error'), outEl = $('pw-output');
    try {
      pwCurrent = generatePassword(len, sets);
      outEl.textContent = pwCurrent;
      errEl.hidden = true;

      var bits = entropyBits(len, sets.length);
      var label, pct, color;
      if (bits < 45)       { label = 'weak'; }
      else if (bits < 70)  { label = 'okay'; }
      else if (bits < 100) { label = 'strong'; }
      else                 { label = 'overkill'; }

      pct = Math.min(100, Math.round(bits / 128 * 100));
      $('pw-bar').style.width = pct + '%';
      $('pw-bar').className =
        bits < 45 ? 'weak' : bits < 70 ? 'okay' : bits < 100 ? 'strong' : 'overkill';
      $('pw-label').textContent = '~' + bits + ' bits of entropy - ' + label;
    } catch (e) {
      errEl.textContent = e.message; errEl.hidden = false;
      outEl.textContent = '\u2014';
      $('pw-bar').style.width = '0';
      $('pw-label').textContent = '\u2014';
    }
  }

  ['pw-length', 'pw-upper', 'pw-lower', 'pw-num', 'pw-sym'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      $('pw-len-val').textContent = $('pw-length').value;
      pwGenerate();
    });
  });
  $('pw-generate').addEventListener('click', pwGenerate);
  $('pw-copy').addEventListener('click', function () {
    TB.copy(pwCurrent).then(function () {
      var btn = $('pw-copy');
      var icon = btn.querySelector('i');
      icon.className = 'mdi mdi-check';
      setTimeout(function () { icon.className = 'mdi mdi-content-copy'; }, 1200);
    });
  });
  $('pw-len-val').textContent = $('pw-length').value;
  pwGenerate();
  })();


  /* ============================================================
     2. Secret scanner
     ============================================================ */
  (function () {
    if (!$('sc-in')) return;

  var SECRET_RULES = [
    { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/, sev: 'err' },
    { name: 'AWS secret key (40-char base62)', re: /\b(?<![A-Za-z0-9\/+=])[A-Za-z0-9\/+=]{40}(?![A-Za-z0-9\/+=])\b/, sev: 'warn' },
    { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/, sev: 'err' },
    { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, sev: 'err' },
    { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, sev: 'err' },
    { name: 'private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/, sev: 'err' },
    { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*\b/, sev: 'warn' },
    { name: 'suspicious env var', re: /^\s*(?:export\s+)?([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)\s*=\s*["']?([^"'\s#]{8,})/im, sev: 'err' },
    { name: 'database URL with credentials', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@]+:[^\s@]+@[^\s]+/i, sev: 'err' }
  ];

  /* rough Shannon entropy per string - flags random-looking secrets */
  function shannon(s) {
    var freq = {}, i;
    for (i = 0; i < s.length; i++) freq[s[i]] = (freq[s[i]] || 0) + 1;
    return Object.keys(freq).reduce(function (acc, ch) {
      var p = freq[ch] / s.length;
      return acc - p * Math.log2(p);
    }, 0);
  }

  function maskSecret(s) {
    s = String(s);
    if (s.length <= 8) return '*'.repeat(s.length);
    return s.slice(0, 4) + '*'.repeat(Math.max(3, s.length - 8)) + s.slice(-2);
  }

  function scanSecrets() {
    var src = $('sc-in').value;
    var box = $('sc-findings');
    box.innerHTML = '';
    if (!src.trim()) return;

    var lines = src.split('\n');
    var findings = [];

    lines.forEach(function (line, idx) {
      SECRET_RULES.forEach(function (rule) {
        var m;
        var re = new RegExp(rule.re.source, rule.re.flags.replace('m', '') + 'g');
        while ((m = re.exec(line)) !== null) {
          var matched = m[0];
          /* skip obvious placeholders */
          if (/^(x{8,}|\*+|<[^>]+>|\$\{[^}]+\}|changeme|example|xxx)/i.test(matched)) {
            if (re.lastIndex === m.index) re.lastIndex++; /* zero-length guard */
            continue;
          }
          findings.push({
            sev: rule.sev, line: idx + 1, name: rule.name,
            preview: maskSecret(matched)
          });
          if (re.lastIndex === m.index) re.lastIndex++; /* zero-length guard */
        }
      });

      /* generic high-entropy assignment values */
      var kv = line.match(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*[:=]\s*["']?([A-Za-z0-9+/=_-]{24,})["']?\s*$/);
      if (kv && shannon(kv[1]) > 4.2 && !/^[0-9.:/]+$/.test(kv[1])) {
        findings.push({ sev: 'warn', line: idx + 1,
          name: 'high-entropy value (' + shannon(kv[1]).toFixed(1) + ' bits/char)',
          preview: maskSecret(kv[1]) });
      }
    });

    if (!findings.length) {
      box.innerHTML = '<div class="finding f-info"><span class="badge ok">CLEAN</span> no secrets detected by the current ruleset</div>';
      return;
    }
    box.innerHTML = findings.map(function (f) {
      return '<div class="finding ' + (f.sev === 'err' ? 'f-err' : 'f-warn') + '">' +
        '<div class="meta"><span class="badge ' + (f.sev === 'err' ? 'err' : 'warn') + '">' +
        f.sev.toUpperCase() + '</span> line ' + f.line + ' &mdash; ' + TB.esc(f.name) + '</div>' +
        '<code class="mono-label">' + TB.esc(f.preview) + '</code></div>';
    }).join('');
  }
  $('sc-in').addEventListener('input', scanSecrets);
  })();


  /* ============================================================
     3. JWT decoder
     ============================================================ */
  (function () {
    if (!$('jw-in')) return;

  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(Array.prototype.map.call(atob(s), function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  }

  $('jw-in').addEventListener('input', function () {
    var tok = $('jw-in').value.trim();
    var errEl = $('jw-error'), kvEl = $('jw-kv');
    var hOut = $('jw-header'), pOut = $('jw-payload');
    errEl.hidden = true; kvEl.hidden = true;
    hOut.textContent = '// paste a token above';
    pOut.textContent = '// claims decoded here';
    if (!tok) return;

    var parts = tok.split('.');
    if (parts.length !== 3) {
      errEl.textContent = 'expected three dot-separated segments, got ' + parts.length;
      errEl.hidden = false; return;
    }
    try {
      var header = JSON.parse(b64urlDecode(parts[0]));
      var payload = JSON.parse(b64urlDecode(parts[1]));
      hOut.innerHTML = TB.highlight(JSON.stringify(header, null, 2), 'json');
      pOut.innerHTML = TB.highlight(JSON.stringify(payload, null, 2), 'json');

      var pairs = [['alg', header.alg || '?'], ['signature', 'NOT verified here']];
      var nowSec = Math.floor(Date.now() / 1000);
      ['iat', 'nbf', 'exp'].forEach(function (claim) {
        if (payload[claim]) {
          var d = new Date(payload[claim] * 1000);
          var extra = claim === 'exp'
            ? (payload.exp < nowSec ? ' \u26a0 EXPIRED' : ' (valid)')
            : '';
          pairs.push([claim, d.toLocaleString() + extra]);
        }
      });
      if (payload.sub != null) pairs.push(['sub', payload.sub]);
      if (payload.aud != null) pairs.push(['aud', Array.isArray(payload.aud) ? payload.aud.join(', ') : payload.aud]);
      kvEl.hidden = false;
      TB.fillKv(kvEl, pairs);
    } catch (e) {
      errEl.textContent = 'cannot decode token: ' + e.message;
      errEl.hidden = false;
    }
  });
  })();


  /* ============================================================
     5. Hash generator (WebCrypto SHA family)
     ============================================================ */
  (function () {
    if (!$('ha-in')) return;

  function toHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  var haTimer = null;
  $('ha-in').addEventListener('input', function () {
    clearTimeout(haTimer);
    haTimer = setTimeout(hashIt, 250);
  });

  function hashIt() {
    var text = $('ha-in').value;
    var algos = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
    if (!text) { $('ha-kv').innerHTML = ''; return; }
    var data = new TextEncoder().encode(text);
    Promise.all(algos.map(function (a) {
      return crypto.subtle.digest(a, data).then(function (d) { return [a, toHex(d)]; });
    })).then(function (rows) {
      TB.fillKv($('ha-kv'), rows.map(function (r) { return [r[0].toLowerCase(), r[1]]; }));
    }).catch(function () {
      TB.fillKv($('ha-kv'), [['error', 'WebCrypto unavailable (needs HTTPS or localhost)']]);
    });
  }
  })();

})();
