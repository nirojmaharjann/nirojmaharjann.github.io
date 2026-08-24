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
   5. Hash generator (MD5 + WebCrypto SHA family)
   ============================================================ */
  (function () {
    if (!$('ha-in')) return;

    var HA_LABEL = { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };
    var haAlg = 'sha256';

    function toHex(buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    }

    /* ---- pure-JS MD5 (WebCrypto does not provide it) ---- */
    var ha_add = function (a, b) { return (a + b) & 0xFFFFFFFF; };
    function ha_cmn(q, a, b, x, s, t) {
      a = ha_add(ha_add(a, q), ha_add(x, t));
      return ha_add((a << s) | (a >>> (32 - s)), b);
    }
    function ha_ff(a, b, c, d, x, s, t) { return ha_cmn((b & c) | (~b & d), a, b, x, s, t); }
    function ha_gg(a, b, c, d, x, s, t) { return ha_cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function ha_hh(a, b, c, d, x, s, t) { return ha_cmn(b ^ c ^ d, a, b, x, s, t); }
    function ha_ii(a, b, c, d, x, s, t) { return ha_cmn(c ^ (b | ~d), a, b, x, s, t); }

    function md5cycle(x, k) {
      var a = x[0], b = x[1], c = x[2], d = x[3];
      a = ha_ff(a,b,c,d,k[0],7,-680876936); d = ha_ff(d,a,b,c,k[1],12,-389564586);
      c = ha_ff(c,d,a,b,k[2],17,606105819); b = ha_ff(b,c,d,a,k[3],22,-1044525330);
      a = ha_ff(a,b,c,d,k[4],7,-176418897); d = ha_ff(d,a,b,c,k[5],12,1200080426);
      c = ha_ff(c,d,a,b,k[6],17,-1473231341); b = ha_ff(b,c,d,a,k[7],22,-45705983);
      a = ha_ff(a,b,c,d,k[8],7,1770035416); d = ha_ff(d,a,b,c,k[9],12,-1958414417);
      c = ha_ff(c,d,a,b,k[10],17,-42063); b = ha_ff(b,c,d,a,k[11],22,-1990404162);
      a = ha_ff(a,b,c,d,k[12],7,1804603682); d = ha_ff(d,a,b,c,k[13],12,-40341101);
      c = ha_ff(c,d,a,b,k[14],17,-1502002290); b = ha_ff(b,c,d,a,k[15],22,1236535329);

      a = ha_gg(a,b,c,d,k[1],5,-165796510); d = ha_gg(d,a,b,c,k[6],9,-1069501632);
      c = ha_gg(c,d,a,b,k[11],14,643717713); b = ha_gg(b,c,d,a,k[0],20,-373897302);
      a = ha_gg(a,b,c,d,k[5],5,-701558691); d = ha_gg(d,a,b,c,k[10],9,38016083);
      c = ha_gg(c,d,a,b,k[15],14,-660478335); b = ha_gg(b,c,d,a,k[4],20,-405537848);
      a = ha_gg(a,b,c,d,k[9],5,568446438); d = ha_gg(d,a,b,c,k[14],9,-1019803690);
      c = ha_gg(c,d,a,b,k[3],14,-187363961); b = ha_gg(b,c,d,a,k[8],20,1163531501);
      a = ha_gg(a,b,c,d,k[13],5,-1444681467); d = ha_gg(d,a,b,c,k[2],9,-51403784);
      c = ha_gg(c,d,a,b,k[7],14,1735328473); b = ha_gg(b,c,d,a,k[12],20,-1926607734);

      a = ha_hh(a,b,c,d,k[5],4,-378558); d = ha_hh(d,a,b,c,k[8],11,-2022574463);
      c = ha_hh(c,d,a,b,k[11],16,1839030562); b = ha_hh(b,c,d,a,k[14],23,-35309556);
      a = ha_hh(a,b,c,d,k[1],4,-1530992060); d = ha_hh(d,a,b,c,k[4],11,1272893353);
      c = ha_hh(c,d,a,b,k[7],16,-155497632); b = ha_hh(b,c,d,a,k[10],23,-1094730640);
      a = ha_hh(a,b,c,d,k[13],4,681279174); d = ha_hh(d,a,b,c,k[0],11,-358537222);
      c = ha_hh(c,d,a,b,k[3],16,-722521979); b = ha_hh(b,c,d,a,k[6],23,76029189);
      a = ha_hh(a,b,c,d,k[9],4,-640364487); d = ha_hh(d,a,b,c,k[12],11,-421815835);
      c = ha_hh(c,d,a,b,k[15],16,530742520); b = ha_hh(b,c,d,a,k[2],23,-995338651);

      a = ha_ii(a,b,c,d,k[0],6,-198630844); d = ha_ii(d,a,b,c,k[7],10,1126891415);
      c = ha_ii(c,d,a,b,k[14],15,-1416354905); b = ha_ii(b,c,d,a,k[5],21,-57434055);
      a = ha_ii(a,b,c,d,k[12],6,1700485571); d = ha_ii(d,a,b,c,k[3],10,-1894986606);
      c = ha_ii(c,d,a,b,k[10],15,-1051523); b = ha_ii(b,c,d,a,k[1],21,-2054922799);
      a = ha_ii(a,b,c,d,k[8],6,1873313359); d = ha_ii(d,a,b,c,k[15],10,-30611744);
      c = ha_ii(c,d,a,b,k[6],15,-1560198380); b = ha_ii(b,c,d,a,k[13],21,1309151649);
      a = ha_ii(a,b,c,d,k[4],6,-145523070); d = ha_ii(d,a,b,c,k[11],10,-1120210379);
      c = ha_ii(c,d,a,b,k[2],15,718787259); b = ha_ii(b,c,d,a,k[9],21,-343485551);

      x[0] = ha_add(a, x[0]); x[1] = ha_add(b, x[1]);
      x[2] = ha_add(c, x[2]); x[3] = ha_add(d, x[3]);
    }

    function md5blk(str) {
      var blks = [], i;
      for (i = 0; i < 16; i++) {
        var j = i * 4;
        blks[i] = str.charCodeAt(j) + (str.charCodeAt(j + 1) << 8) +
                  (str.charCodeAt(j + 2) << 16) + (str.charCodeAt(j + 3) << 24);
      }
      return blks;
    }

    function md5hex(text) {
      /* utf-8 bytes as a binary string so charCodeAt reads raw bytes */
      var bytes = unescape(encodeURIComponent(text));
      var n = bytes.length;
      var state = [1732584193, -271733879, -1732584194, 271733878];
      var i;
      for (i = 64; i <= n; i += 64) {
        md5cycle(state, md5blk(bytes.substring(i - 64, i)));
      }
      var rest = bytes.substring(i - 64);
      var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (i = 0; i < rest.length; i++) tail[i >> 2] |= rest.charCodeAt(i) << ((i % 4) << 3);
      tail[i >> 2] |= 0x80 << ((i % 4) << 3);
      if (i > 55) { md5cycle(state, tail); tail = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]; }
      /* bit length little-endian, low word only (inputs < 512 MB) */
      tail[14] = n * 8;
      md5cycle(state, tail);
      var out = '';
      for (i = 0; i < 4; i++) {
        out += ('0' + ((state[i] >>> 0) & 0xFF).toString(16)).slice(-2) +
               ('0' + (((state[i] >>> 0) >> 8) & 0xFF).toString(16)).slice(-2) +
               ('0' + (((state[i] >>> 0) >> 16) & 0xFF).toString(16)).slice(-2) +
               ('0' + (((state[i] >>> 0) >> 24) & 0xFF).toString(16)).slice(-2);
      }
      return out;
    }

    function haShowErr(msg) {
      $('ha-error').textContent = msg;
      $('ha-error').hidden = false;
      $('ha-out').textContent = '// hash appears here';
    }

    function haDone(hex) {
      $('ha-error').hidden = true;
      $('ha-out').textContent = hex;
    }

    function hashIt() {
      var text = $('ha-in').value;
      if (!text) {
        haShowErr('Type or paste some text to hash first.');
        return;
      }
      try {
        if (haAlg === 'md5') { haDone(md5hex(text)); return; }
        if (!(window.crypto && window.crypto.subtle)) {
          haShowErr('WebCrypto is unavailable - SHA hashes need HTTPS or localhost. MD5 still works.');
          return;
        }
        window.crypto.subtle.digest(HA_LABEL[haAlg], new TextEncoder().encode(text))
          .then(function (d) { haDone(toHex(d)); })
          .catch(function (e) { haShowErr('Hashing failed: ' + (e && e.message ? e.message : e)); });
      } catch (e) {
        haShowErr('Hashing failed: ' + (e && e.message ? e.message : e));
      }
    }

    /* algorithm tabs - single source of truth, one active at a time */
    $('ha-algos').addEventListener('click', function (ev) {
      var btn = ev.target.closest('.tab');
      if (!btn) return;
      haAlg = btn.getAttribute('data-alg');
      this.querySelectorAll('.tab').forEach(function (b) {
        var on = b.getAttribute('data-alg') === haAlg;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if ($('ha-in').value) hashIt();
    });

    $('ha-go').addEventListener('click', hashIt);
    $('ha-in').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); hashIt(); }
    });

    $('ha-reset').addEventListener('click', function () {
      $('ha-in').value = '';
      $('ha-error').hidden = true;
      $('ha-out').textContent = '// hash appears here';
    });
  })();

})();
