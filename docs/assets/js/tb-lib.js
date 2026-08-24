/* ============================================================
   DevOps Toolbox — shared library (no dependencies)
   Exposes window.TB helpers used by every toolbox page.
   ============================================================ */
(function (root) {
  'use strict';

  var TB = {};

  /* ---------- DOM ---------- */
  TB.$ = function (id) { return document.getElementById(id); };
  TB.$$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  TB.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ---------- Clipboard + download ---------- */
  TB.fallbackCopy = function (text) {
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
  };

  /** Copy text; flips btn to a check mark for ~1.4 s. */
  TB.copy = function (text, btn) {
    function done(ok) {
      if (!btn) return ok;
      if (ok) {
        var old = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = '<i class="mdi mdi-check"></i>';
        setTimeout(function () { btn.classList.remove('copied'); btn.innerHTML = old; }, 1400);
      }
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return done(true); },
        function () { return done(TB.fallbackCopy(text)); });
    }
    return Promise.resolve(done(TB.fallbackCopy(text)));
  };

  TB.download = function (filename, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
  };

  /* ---------- Tiny syntax highlighter ---------- */
  TB.highlight = function (code, lang) {
    code = String(code);
    if (lang === 'dockerfile') {
      return code.split('\n').map(function (line) {
        var e = TB.esc(line);
        var m = e.match(/^(\s*)([A-Z][A-Z]+)(\s+|$)/);
        if (!m) return /^(\s*)#/.test(e) ? '<span class="c">' + e + '</span>' : e;
        return m[1] + '<span class="k">' + m[2] + '</span>' +
          e.slice(m[1].length + m[2].length);
      }).join('\n');
    }
    if (lang === 'json') {
      var ej = TB.esc(code);
      ej = ej.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?/g, function (_, str, colon) {
        return '<span class="' + (colon ? 'k' : 's') + '">' + str + '</span>' + (colon || '');
      });
      ej = ej.replace(/\b(true|false|null)\b/g, '<span class="b">$1</span>');
      ej = ej.replace(/(:\s*)(-?\d+(?:\.\d+)?)/g, '$1<span class="n">$2</span>');
      return ej;
    }
    /* default: yaml-ish, one safe pass per line */
    return code.split('\n').map(function (line) {
      var e = TB.esc(line);
      if (/^\s*#/.test(e)) return '<span class="c">' + e + '</span>';
      e = e.replace(/^(\s*(?:-\s)*)([\w.\-/]+)(:)(\s|$)/,
        '$1<span class="k">$2</span><span class="p">$3</span>$4');
      e = e.replace(/^(\s*-\s*)(.+)$/, '$1$2');
      e = e.replace(/(<span class="p">:<\/span>\s*)(&quot;[^&]*?&quot;)$/, '$1<span class="s">$2</span>');
      e = e.replace(/(<span class="p">:<\/span>\s*)(true|false|null)$/, '$1<span class="b">$2</span>');
      e = e.replace(/(<span class="p">:<\/span>\s*)(\d+(?:\.\d+)?)$/, '$1<span class="n">$2</span>');
      return e;
    }).join('\n');
  };

  /** Wire copy (+optional download) buttons for an output block. */
  TB.wireOutput = function (opts) {
    var out = TB.$(opts.out);
    function text() { return out.value !== undefined ? out.value : out.textContent; }
    if (opts.copy) {
      var copyBtn = TB.$(opts.copy);
      copyBtn.addEventListener('click', function () { TB.copy(text(), copyBtn); });
    }
    if (opts.download) {
      TB.$(opts.download).addEventListener('click', function () {
        TB.download(opts.filename || 'output.txt', text());
      });
    }
  };

  TB.splitCsv = function (s) {
    return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  };

  /** Toggleable accordions (.acc > button -> .open on parent). */
  TB.wireAccordions = function () {
    document.querySelectorAll('.acc > button').forEach(function (b) {
      b.addEventListener('click', function () {
        b.parentElement.classList.toggle('open');
      });
    });
  };

  /* ============================================================
     Minimal YAML subset parser.
     Supports everything Kubernetes / Compose manifests use:
       nested block maps & sequences, "- key: value" inline maps,
       plain / quoted scalars, flow [a,b] {k: v}, block scalars
       | |- > >-, multi-document (---), comments.
     Throws Error("line N: message") on structural problems.
     ============================================================ */
  TB.parseYaml = function (text) {
    var raw = String(text).replace(/\r\n?/g, '\n').split('\n');

    /* split into documents */
    var docs = [], cur = [], startLine = 1, base = 1;
    for (var i = 0; i < raw.length; i++) {
      if (/^---\s*$/.test(raw[i])) { docs.push({ lines: cur, start: startLine }); cur = []; startLine = i + 2; }
      else cur.push(raw[i]);
    }
    docs.push({ lines: cur, start: startLine });

    var toks = [];
    var pos = { i: 0 };
    var results = docs.map(parseDoc).filter(function (v) { return v !== undefined; });
    if (!results.length) throw new Error('line 1: empty input');
    return results.length === 1 ? results[0] : results;

    /* ---- per-document parse ---- */
    function parseDoc(doc) {
      toks.length = 0;
      pos.i = 0;
      var li, ln;
      for (li = 0; li < doc.lines.length; li++) {
        ln = doc.lines[li];
        var noComment = stripComment(ln);
        if (/^\s*$/.test(noComment)) continue;
        var indent = noComment.match(/^ */)[0].length;
        var text = noComment.slice(indent);
        var lineNo = doc.start + li;
        var bs = text.match(/^([^:#]+:\s*)((?:\||>)[+-]?)$/);
        if (bs) {
          /* keep token text as "key:" so it stays a mapping pair;
             the block body rides along in tok.block */
          var body = [];
          var k = li + 1;
          var lastContent = -1;
          for (; k < doc.lines.length; k++) {
            var bl = doc.lines[k];
            var bc = stripComment(bl);
            if (/^\s*$/.test(bc)) { body.push(null); continue; }
            var bi = bc.match(/^ */)[0].length;
            if (bi <= indent) break;
            body.push(bc.slice(Math.max(indent + 2, bi)));
            lastContent = body.length - 1;
          }
          li = k - 1;
          body.length = lastContent + 1;
          toks.push({ indent: indent, text: bs[1],
                      block: { style: bs[2], body: body }, line: lineNo });
          continue;
        }
        toks.push({ indent: indent, text: text, line: lineNo });
      }
      if (!toks.length) return undefined;

      var t0 = toks[0];
      if (/^-(?:\s|$)/.test(t0.text)) return parseSeq(pos, t0.indent);
      if (/^[^:\s]+:(\s|$)/.test(t0.text)) return parseMap(pos, t0.indent);
      pos.i++;
      if (toks.length > 1)
        throw new Error('line ' + toks[1].line +
          ': unexpected content after plain scalar document');
      return scalar(t0.text, t0.line);
    }

    function stripComment(s) {
      var outS = '', q = null, j;
      for (j = 0; j < s.length; j++) {
        var ch = s[j];
        if (q) { outS += ch; if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'") { q = ch; outS += ch; continue; }
        if (ch === '#' && (j === 0 || /[ \t]/.test(s[j - 1]))) break;
        outS += ch;
      }
      return outS.replace(/[ \t]+$/, '');
    }

    function scalar(raw, line) {
      raw = String(raw).trim();
      if (raw === '' || raw === '~' || raw === 'null') return null;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      if (/^[+-]?\d+$/.test(raw)) return parseInt(raw, 10);
      if (/^[+-]?\d*\.\d+$/.test(raw)) return parseFloat(raw);
      if ((raw[0] === '"' && raw[raw.length - 1] === '"') ||
          (raw[0] === "'" && raw[raw.length - 1] === "'")) {
        if (raw.length < 2) throw new Error('line ' + line + ': unterminated quote');
        var inner = raw.slice(1, -1);
        return raw[0] === "'" ? inner.replace(/''/g, "'") : inner.replace(/\\"/g, '"');
      }
      if (raw[0] === '[' || raw[0] === '{') return flow(raw, line);
      return raw;
    }

    function flow(raw, line) {
      var s = raw, p = 0;
      function ws() { while (p < s.length && /[ \t]/.test(s[p])) p++; }
      function val() {
        ws();
        var c = s[p];
        if (c === '[') {
          p++; var arr = []; ws();
          if (s[p] === ']') { p++; return arr; }
          for (;;) {
            arr.push(val()); ws();
            if (s[p] === ',') { p++; continue; }
            if (s[p] === ']') { p++; return arr; }
            break;
          }
          err();
        }
        if (c === '{') {
          p++; var obj = {}; ws();
          if (s[p] === '}') { p++; return obj; }
          for (;;) {
            ws(); var k = '';
            while (p < s.length && s[p] !== ':') k += s[p++];
            p++; /* colon */
            obj[k.trim().replace(/^["']+|["']+$/g, '')] = val(); ws();
            if (s[p] === ',') { p++; continue; }
            if (s[p] === '}') { p++; return obj; }
            break;
          }
          err();
        }
        if (c === '"' || c === "'") {
          var q = c; p++; var str = '';
          while (p < s.length && s[p] !== q) { str += s[p]; p++; }
          if (p >= s.length) err();
          p++;
          return q === "'" ? str : str;
        }
        var tok = '';
        while (p < s.length && !/[,\]}]/.test(s[p])) { tok += s[p]; p++; }
        tok = tok.trim();
        if (/^-?\d+$/.test(tok)) return parseInt(tok, 10);
        if (/^-?\d*\.\d+$/.test(tok)) return parseFloat(tok);
        if (tok === 'true') return true;
        if (tok === 'false') return false;
        if (tok === 'null' || tok === '~' || tok === '') return null;
        return tok;
      }
      function err() { throw new Error('bad'); }
      var result;
      try { result = val(); ws(); if (p !== s.length) err(); return result; }
      catch (e) {
        throw new Error('line ' + line + ': invalid flow collection "' + raw + '"');
      }
    }

    function readBlock(tok) {
      var style = tok.block.style;
      var body = tok.block.body;
      var text = body.map(function (l) { return l === null ? '' : l; }).join(style[0] === '>' ? ' ' : '\n');
      if (style.indexOf('-') < 0 && text !== '') text += '\n';
      return text;
    }

    function parseSeq(pos, indent) {
      var arr = [];
      while (pos.i < toks.length) {
        var t = toks[pos.i];
        if (t.indent < indent) break;
        if (t.indent > indent) throw new Error('line ' + t.line + ': unexpected indentation in sequence');
        if (!/^-(?:\s|$)/.test(t.text)) break;
        var item = t.text.replace(/^-[ ]?/, '');
        pos.i++;
        if (item === '') {
          var nxt = toks[pos.i];
          arr.push(nxt && nxt.indent > indent ? parseNode(pos, nxt.indent) : null);
          continue;
        }
        if (t.block) { arr.push(readBlock(t)); continue; }
        if (/^[^:\s]+:(\s|$)/.test(item)) {
          arr.push(parseMapInline(pos, indent + 2, item));
          continue;
        }
        arr.push(scalar(item, t.line));
      }
      return arr;
    }

    /* mapping whose first "key: value" arrived inline after "- " */
    function parseMapInline(pos, indent, firstPair) {
      var obj = {};
      applyPair(obj, firstPair, indent);
      while (pos.i < toks.length) {
        var t = toks[pos.i];
        if (t.indent < indent) break;
        if (t.indent > indent) throw new Error('line ' + t.line + ': unexpected indentation');
        if (/^-(?:\s|$)/.test(t.text)) break;
        pos.i++;
        applyPair(obj, t.text, indent, t);
      }
      return obj;
    }

    function parseMap(pos, indent) {
      var obj = {};
      while (pos.i < toks.length) {
        var t = toks[pos.i];
        if (t.indent < indent) break;
        if (t.indent > indent) throw new Error('line ' + t.line + ': unexpected indentation in mapping');
        if (/^-(?:\s|$)/.test(t.text)) break;
        pos.i++;
        applyPair(obj, t.text, indent, t);
      }
      return obj;
    }

    function applyPair(obj, text, indent, tok) {
      var pair = text.match(/^([^:]+):\s*(.*)$/);
      if (!pair) throw new Error('line ' + (tok ? tok.line : '?') + ': expected "key: value", got "' + text + '"');
      var key = pair[1].trim().replace(/^["']+|["']+$/g, '');
      var rhs = pair[2].trim();
      var line = tok ? tok.line : 0;

      if (tok && tok.block) { obj[key] = readBlock(tok); return; }

      if (rhs === '') {
        /* pos.i already points past this pair's token */
        var nxt = toks[pos.i];
        if (nxt && nxt.indent > indent) {
          obj[key] = parseNode(pos, nxt.indent);
        } else if (nxt && nxt.indent === indent && /^-(?:\s|$)/.test(nxt.text)) {
          obj[key] = parseSeq(pos, indent);
        } else {
          obj[key] = null;
        }
        return;
      }
      obj[key] = scalar(rhs, line);
    }

    function parseNode(pos, indent) {
      var t = toks[pos.i];
      if (!t || t.indent < indent) return null;
      if (/^-(?:\s|$)/.test(t.text)) return parseSeq(pos, indent);
      if (/^[^:\s]+:(\s|$)/.test(t.text)) return parseMap(pos, indent);
      pos.i++;
      return scalar(t.text, t.line);
    }
  };

  /* ---------- YAML serializer ---------- */
  function yamlScalar(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    var s = String(v);
    if (s === '') return "''";
    if (/[:#\[\]{},&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s) ||
        /^(true|false|null|~)$/.test(s) || /\n/.test(s)) {
      return JSON.stringify(s);
    }
    return s;
  }

  TB.toYaml = function (data, indent) {
    indent = indent || 0;
    var pad = new Array(indent + 1).join(' ');
    if (Array.isArray(data)) {
      if (!data.length) return pad + '[]\n';
      var sp2 = new Array(indent + 3).join(' ');
      return data.map(function (item) {
        if (item && typeof item === 'object') {
          var block = TB.toYaml(item, indent + 2).split('\n');
          if (block[block.length - 1] === '') block.pop();
          var rel = block.map(function (l) {
            return l.indexOf(sp2) === 0 ? l.slice(sp2.length) : l;
          });
          return pad + '- ' + rel[0] +
            rel.slice(1).map(function (l) { return '\n' + pad + '  ' + l; }).join('') + '\n';
        }
        return pad + '- ' + yamlScalar(item) + '\n';
      }).join('');
    }
    if (data && typeof data === 'object') {
      var keys = Object.keys(data);
      if (!keys.length) return pad + '{}\n';
      return keys.map(function (k) {
        var v = data[k];
        if (v && typeof v === 'object') {
          if (Array.isArray(v) &&
              v.every(function (x) { return x === null || typeof x !== 'object'; })) {
            if (!v.length) return pad + k + ': []\n';
            if (v.length <= 4) return pad + k + ': [' + v.map(yamlScalar).join(', ') + ']\n';
          }
          return pad + k + ':\n' + TB.toYaml(v, indent + 2);
        }
        if (typeof v === 'string' && v.indexOf('\n') >= 0) {
          return pad + k + ': |\n' + v.split('\n').map(function (l) {
            return pad + '  ' + l; }).join('\n') + '\n';
        }
        return pad + k + ': ' + yamlScalar(v) + '\n';
      }).join('');
    }
    return pad + yamlScalar(data) + '\n';
  };

  /* ---------- IPv4 / CIDR math ---------- */
  TB.ipToInt = function (ip) {
    var o = ip.split('.');
    if (o.length !== 4 || o.some(function (x) { return x === '' || +x > 255 || isNaN(+x); })) {
      throw new Error('invalid IPv4 address');
    }
    return ((+o[0] << 24) | (+o[1] << 16) | (+o[2] << 8) | +o[3]) >>> 0;
  };
  TB.intToIp = function (n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  };
  TB.maskOf = function (p) { return p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0; };

  TB.cidr = function (ipStr, prefix) {
    var mask = TB.maskOf(prefix);
    var ip = typeof ipStr === 'number' ? ipStr >>> 0 : TB.ipToInt(ipStr);
    var net = (ip & mask) >>> 0;
    var bcast = (net | (~mask >>> 0)) >>> 0;
    var total = Math.pow(2, 32 - prefix);
    return {
      network: net,
      broadcast: bcast,
      prefix: prefix,
      mask: mask,
      totalIps: total,
      usableHosts: total > 2 ? total - 2 : total,
      networkIp: TB.intToIp(net),
      broadcastIp: TB.intToIp(bcast),
      maskIp: TB.intToIp(mask),
      wildcardIp: TB.intToIp(~mask >>> 0),
      firstUsable: total > 2 ? TB.intToIp(net + 1) : TB.intToIp(net),
      lastUsable: total > 2 ? TB.intToIp(bcast - 1) : TB.intToIp(bcast),
      range: total > 2 ? TB.intToIp(net + 1) + ' – ' + TB.intToIp(bcast - 1)
                       : TB.intToIp(net)
    };
  };

  TB.ipRangeType = function (netInt) {
    function inCidr(prefixIp, bits) {
      return (netInt >> (32 - bits)) === (TB.ipToInt(prefixIp) >> (32 - bits));
    }
    if (inCidr('10.0.0.0', 8)) return 'Private (RFC1918)';
    if (inCidr('172.16.0.0', 12)) return 'Private (RFC1918)';
    if (inCidr('192.168.0.0', 16)) return 'Private (RFC1918)';
    if (inCidr('127.0.0.0', 8)) return 'Loopback';
    if (inCidr('100.64.0.0', 10)) return 'CGNAT (RFC6598)';
    if (inCidr('169.254.0.0', 16)) return 'Link-local (RFC3927)';
    return 'Public';
  };

  /* ---------- Cron: field expansion + next N runs ---------- */
  TB.cronNextRuns = function (expr, count, from) {
    var parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    var names = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
                  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
                  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

    function expand(field, min, max) {
      var values = {};
      field.toLowerCase().split(',').forEach(function (part) {
        var step = 1, m = part.split('/');
        if (m.length === 2) { part = m[0]; step = parseInt(m[1], 10) || 1; }
        var lo = min, hi = max;
        if (part !== '*' && part !== '?') {
          var range = part.split('-');
          lo = range[0];
          if (/^[a-z]{3}$/.test(lo)) lo = names[lo];
          lo = parseInt(lo, 10);
          hi = range.length === 2 ? range[1] : range[0];
          if (/^[a-z]{3}$/.test(hi)) hi = names[hi];
          hi = parseInt(hi, 10);
        }
        if (isNaN(lo) || isNaN(hi) || lo < min || hi > max || lo > hi) throw new Error('bad field');
        for (var v = lo; v <= hi; v += step) values[v] = true;
      });
      return values;
    }

    var mins, hrs, doms, months, dows;
    try {
      mins = expand(parts[0], 0, 59);
      hrs = expand(parts[1], 0, 23);
      doms = expand(parts[2], 1, 31);
      months = expand(parts[3], 1, 12);
      dows = expand(parts[4].replace(/^7$/, '0'), 0, 6);
    } catch (e) { return null; }

    var restricted = parts[2] !== '*' && parts[2] !== '?' &&
                     parts[4] !== '*' && parts[4] !== '?';

    var t = new Date((from ? from.getTime() : Date.now()) + 60000);
    t.setSeconds(0, 0);
    var out = [];
    var guard = 366 * 24 * 60;
    while (out.length < count && guard-- > 0) {
      if (months[t.getMonth() + 1]) {
        var dayOk = restricted
          ? (!!doms[t.getDate()] || !!dows[t.getDay()])
          : (!!doms[t.getDate()] && !!dows[t.getDay()]);
        if (dayOk && hrs[t.getHours()] && mins[t.getMinutes()]) {
          out.push(new Date(t.getTime()));
        }
      }
      t.setMinutes(t.getMinutes() + 1);
    }
    return out.length === count ? out : null;
  };

  root.TB = TB;
  /* HTML-escape helper */
  TB.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* fill a <dl class="kv"> with [label, value] pairs */
  TB.fillKv = function (el, pairs) {
    el.innerHTML = pairs.map(function (p) {
      return '<dt>' + TB.esc(p[0]) + '</dt><dd>' + TB.esc(p[1]) + '</dd>';
    }).join('');
  };

  /* ---------- shared output-bar buttons ---------- */
  TB.wireOutputButtons = function () {
    document.querySelectorAll('[data-copy-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var out = document.getElementById(btn.getAttribute('data-copy-target'));
        if (!out) return;
        TB.copy(out.textContent).then(function (ok) {
          if (!ok) return;
          btn.classList.add('copied');
          setTimeout(function () { btn.classList.remove('copied'); }, 1200);
        });
      });
    });
    document.querySelectorAll('[data-dl-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var out = document.getElementById(btn.getAttribute('data-dl-target'));
        if (!out) return;
        TB.download(btn.getAttribute('data-dl-name') || 'output.txt', out.textContent);
      });
    });
  };

})(window);
