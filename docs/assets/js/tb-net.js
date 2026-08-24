/* ============================================================
   DevOps Toolbox - Networking category
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TB = window.TB;
  if (!TB) return;

  TB.wireOutputButtons();
  TB.wireAccordions();



  /* ============================================================
     1. DNS lookup (Google public DoH JSON API - CORS enabled)
     ============================================================ */
  (function () {
    if (!$('dn-name')) return;

  var dnBusy = false;
  $('dn-go').addEventListener('click', resolveDns);
  $('dn-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') resolveDns();
  });

  function resolveDns() {
    if (dnBusy) return;
    var name = $('dn-name').value.trim().replace(/\.$/, '');
    var type = $('dn-type').value;
    var errEl = $('dn-error'), box = $('dn-result');
    errEl.hidden = true; box.innerHTML = '';
    if (!name) { errEl.textContent = 'enter a hostname'; errEl.hidden = false; return; }

    dnBusy = true;
    $('dn-go').disabled = true;
    fetch('https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=' + type)
      .then(function (r) { if (!r.ok) throw new Error('resolver returned HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var rows = '';
        if (!data.Answer || !data.Answer.length) {
          rows = '<div class="empty-state"><i class="mdi mdi-help-circle-outline"></i>' +
            'no ' + type + ' records for <b>' + TB.esc(name) + '</b></div>';
        } else {
          rows = '<div class="table-wrap"><table class="table"><thead><tr>' +
            '<th>type</th><th>value</th><th>TTL</th></tr></thead><tbody>' +
            data.Answer.map(function (a) {
              return '<tr><td><span class="badge">' + a.type + ' (' + type + ')</span></td>' +
                '<td style="word-break:break-all">' + TB.esc(a.data) + '</td>' +
                '<td class="mono-label">' + a.TTL + 's</td></tr>';
            }).join('') + '</tbody></table></div>';
        }
        var statusNote = data.Status === 0 ? '' :
          '<p class="err">resolver status code: ' + data.Status + '</p>';
        box.innerHTML = statusNote + rows +
          '<p class="help-note">resolved via <b>dns.google</b> (public resolver) &mdash; results may differ ' +
          'from your local resolver&rsquo;s cached view.</p>';
      })
      .catch(function (e) {
        errEl.textContent = 'lookup failed: ' + e.message +
          ' (offline, blocked, or CORS proxy interference)';
        errEl.hidden = false;
      })
      .finally(function () { dnBusy = false; $('dn-go').disabled = false; });
  }
  })();


  /* ============================================================
     2. URL parser
     ============================================================ */
  (function () {
    if (!$('up-in')) return;

  function parseUrl() {
    var raw = $('up-in').value.trim();
    var errEl = $('up-error'), kvEl = $('up-kv');
    errEl.hidden = true;
    try {
      var u = new URL(raw);
      var pairs = [
        ['protocol', u.protocol.replace(':', '')],
        ['auth', (u.username || u.password) ? decodeURIComponent(u.username) +
          ':' + decodeURIComponent(u.password) : '-'],
        ['host', u.hostname],
        ['port', u.port || ({ https: '443', http: '80' }[u.protocol.replace(':', '')] || '-')],
        ['path', u.pathname],
        ['query', u.search || '-'],
        ['hash / fragment', u.hash || '-']
      ];
      if (u.searchParams.size) {
        u.searchParams.forEach(function (v, k) {
          pairs.push(['param ' + k, v]);
        });
      }
      kvEl.hidden = false;
      TB.fillKv(kvEl, pairs);
    } catch (e) {
      kvEl.hidden = true;
      errEl.textContent = 'invalid URL: ' + e.message; errEl.hidden = false;
    }
  }
  $('up-in').addEventListener('input', parseUrl);
  parseUrl();
  })();


  /* ============================================================
     3. Port reference
     ============================================================ */
  (function () {
    if (!$('pt-filter')) return;

  var PORTS = [
    ['20-21', 'TCP', 'FTP (data / control)'],
    ['22', 'TCP', 'SSH / SCP / SFTP — key auth preferred'],
    ['23', 'TCP', 'Telnet — plaintext, should be dead'],
    ['25', 'TCP', 'SMTP relay'],
    ['53', 'UDP/TCP', 'DNS'],
    ['67-68', 'UDP', 'DHCP server/client'],
    ['80', 'TCP', 'HTTP'],
    ['110', 'TCP', 'POP3'],
    ['143', 'TCP', 'IMAP'],
    ['443', 'TCP', 'HTTPS / TLS everything'],
    ['465', 'TCP', 'SMTPS (implicit TLS)'],
    ['587', 'TCP', 'SMTP submission with STARTTLS'],
    ['636', 'TCP', 'LDAPS'],
    ['993', 'TCP', 'IMAPS'],
    ['1433', 'TCP', 'MS SQL Server'],
    ['1521', 'TCP', 'Oracle DB'],
    ['2049', 'TCP', 'NFS'],
    ['2375-2377', 'TCP', 'Docker daemon / swarm management'],
    ['2379-2380', 'TCP', 'etcd client & peer'],
    ['3000', 'TCP', 'dev servers everywhere (Grafana, Node...)'],
    ['3306', 'TCP', 'MySQL / MariaDB'],
    ['3389', 'TCP', 'RDP — lock down, it gets hammered'],
    ['5432', 'TCP', 'PostgreSQL'],
    ['5672', 'TCP', 'RabbitMQ AMQP'],
    ['5900+', 'TCP', 'VNC'],
    ['6379', 'TCP', 'Redis'],
    ['6443', 'TCP', 'Kubernetes API server'],
    ['8080', 'TCP', 'HTTP alt — proxies, Tomcat, k8s dashboards'],
    ['8443', 'TCP', 'HTTPS alt'],
    ['9090', 'TCP', 'Prometheus'],
    ['9100', 'TCP', 'Prometheus node_exporter'],
    ['10250', 'TCP', 'kubelet API'],
    ['27017', 'TCP', 'MongoDB'],
    ['50000+', 'TCP', 'PASV FTP / ephemeral ranges']
  ];

  function renderPorts() {
    var q = $('pt-filter').value.trim().toLowerCase();
    var rows = PORTS.filter(function (r) {
      return !q || r.join(' ').toLowerCase().indexOf(q) !== -1;
    });
    document.querySelector('#pt-table tbody').innerHTML = rows.map(function (r) {
      return '<tr><td class="mono-label" style="color:var(--accent)">' + r[0] +
        '</td><td class="mono-label">' + r[1] + '</td><td>' + r[2] + '</td></tr>';
    }).join('');
  }
  $('pt-filter').addEventListener('input', renderPorts);
  renderPorts();
  })();


  /* ============================================================
     4. SSL/TLS check via SSL Labs v3 API
     ============================================================ */
  (function () {
    if (!$('sl-host')) return;

  var slTimer = null;

  function slLog(msg) {
    var el = $('sl-log');
    el.hidden = false;
    var stamp = new Date().toTimeString().slice(0, 8);
    el.textContent += '[' + stamp + '] ' + msg + '\n';
    el.scrollTop = el.scrollHeight;
  }
  function slFail(msg) {
    clearInterval(slTimer); slTimer = null;
    $('sl-go').disabled = false;
    $('sl-error').textContent = msg; $('sl-error').hidden = false;
    slLog('ERROR: ' + msg);
  }

  $('sl-go').addEventListener('click', function () {
    if (slTimer) { clearInterval(slTimer); slTimer = null; }
    var host = $('sl-host').value.trim();
    var errEl = $('sl-error'), kvEl = $('sl-kv');
    errEl.hidden = true; kvEl.hidden = true;
    $('sl-log').hidden = false; $('sl-log').textContent = '';
    if (!/^[a-z0-9]([\w.-]*\.[a-z]{2,})$/i.test(host)) {
      errEl.textContent = 'enter a valid hostname like example.com';
      errEl.hidden = false; return;
    }
    $('sl-go').disabled = true;
    var api = 'https://api.ssllabs.com/api/v3/analyze?host=' + encodeURIComponent(host) +
              '&publish=off&all=done&ignoreMismatch=on';
    slLog('submitting ' + host + ' to SSL Labs...');

    function poll() {
      fetch(api).then(function (r) {
        if (r.status === 429) throw new Error('SSL Labs rate limit - try again in a minute');
        if (!r.ok) throw new Error('API returned HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        if (d.status === 'ERROR') { slFail('assessment error: ' + (d.statusMessage || 'unknown')); return; }
        slLog('status: ' + d.status + (d.statusMessage ? ' (' + d.statusMessage + ')' : ''));
        if (d.status !== 'READY') return; /* keep polling */

        clearInterval(slTimer); slTimer = null;
        $('sl-go').disabled = false;
        var ep = d.endpoints && d.endpoints[0];
        if (!ep) { slFail('no endpoints returned'); return; }

        var cert = ep.details && ep.details.cert;
        var grade = ep.grade || '?';
        kvEl.hidden = false;
        var expDays = null;
        try {
          expDays = Math.round((new Date(cert.notAfter).getTime() - Date.now()) / 86400000);
        } catch (e) {}
        TB.fillKv(kvEl, [
          ['grade', grade],
          ['endpoint status', ep.statusMessage || ep.status],
          ['certificate CN', cert && cert.commonNames ? cert.commonNames.join(', ') : '?'],
          ['issuer', cert && cert.issuerOrg ? cert.issuerOrg : '?'],
          ['expires in', expDays != null ? expDays + ' days' : '?'],
          ['protocol support', (ep.details.protocols || []).map(function (p) {
            return p.name + ' ' + p.version; }).join(', ') || '?']
        ]);
        slLog('done - grade ' + grade);
        slLog('full report: https://www.ssllabs.com/ssltest/analyze.html?d=' + host);
      }).catch(function (e) {
        /* network hiccup during polling: retry a few times before failing */
        poll._tries = (poll._tries || 0) + 1;
        if (poll._tries > 4) slFail(e.message);
        else slLog('transient error, retrying (' + poll._tries + '/4): ' + e.message);
      });
    }
    poll();
    slTimer = setInterval(poll, 8000);
  });
  })();


  /* ============================================================
     5. cURL builder
     ============================================================ */
  (function () {
    if (!$('cu-url')) return;

  ['cu-method', 'cu-url', 'cu-headers', 'cu-body'].forEach(function (id) {
    $(id).addEventListener('input', renderCurl);
  });
  $('cu-method').addEventListener('change', renderCurl);
  ['cu-follow', 'cu-silent'].forEach(function (id) {
    $(id).addEventListener('click', function () { $(id).classList.toggle('on'); renderCurl(); });
  });

  function shellQ(s) {
    s = String(s);
    if (/^[\w@%+=:,./-]+$/.test(s)) return s;
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }

  function renderCurl() {
    var method = $('cu-method').value;
    var url = $('cu-url').value.trim() || 'https://example.com';
    var lines = [];
    if ($('cu-follow').classList.contains('on')) lines.push('-L');
    if ($('cu-silent').classList.contains('on')) lines.push('-s');
    $('cu-headers').value.split('\n').map(function (l) { return l.trim(); })
      .filter(Boolean).forEach(function (h) { lines.push('-H ' + shellQ(h)); });
    var body = $('cu-body').value.trim();
    if (body && method !== 'GET' && method !== 'HEAD')
      lines.push('-d ' + shellQ(body));
    if (method !== 'GET') lines.push('-X ' + method);

    var out = 'curl \\\n' + lines.map(function (l) { return '  ' + l; }).join(' \\\n') + ' \\\n  ' + shellQ(url);
    $('cu-out').innerHTML = TB.highlight(out, 'bash');
  }
  renderCurl();
  })();


  /* ============================================================
     6. IP / CIDR calculator
     ============================================================ */
  (function () {
    if (!$('cs-cidr')) return;
function fmt(n) { return n.toLocaleString('en-US'); }

    function parseCidr(raw) {
      var m = raw.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
      if (!m) throw new Error('expected IPv4 CIDR like 10.42.0.0/16');
      var prefix = parseInt(m[2], 10);
      if (prefix < 0 || prefix > 32) throw new Error('prefix must be 0-32');
      return TB.cidr(m[1], prefix);
    }

    function renderSubnet() {
      var errEl = $('cs-error'), sumEl = $('cs-summary');
      errEl.hidden = true; sumEl.hidden = true;
      var raw = $('cs-cidr').value;
      if (!raw.trim()) { $('cs-split-out').textContent = '// choose a split size above'; return; }
      try {
        var c = parseCidr(raw);
        TB.fillKv(sumEl, [
          ['network', c.networkIp + '/' + c.prefix],
          ['netmask', c.maskIp],
          ['wildcard', c.wildcardIp],
          ['broadcast', c.broadcastIp],
          ['usable range', c.range],
          ['usable hosts', fmt(c.usableHosts)]
        ]);
        sumEl.hidden = false;
        renderSplit(c);
      } catch (e) {
        errEl.textContent = e.message;
        errEl.hidden = false;
        $('cs-split-out').textContent = '// choose a split size above';
      }
    }

    function renderSplit(c) {
      var target = $('cs-split').value;
      if (!target) { $('cs-split-out').textContent = '// choose a split size above'; return; }
      var childPfx = parseInt(target.slice(1), 10);
      if (childPfx <= c.prefix) {
        $('cs-split-out').textContent = '// child prefix must be larger than /' + c.prefix;
        return;
      }
      var count = Math.pow(2, childPfx - c.prefix);
      if (count > 4096) {
        $('cs-split-out').textContent = '// ' + count + ' subnets is too many to display (max 4096)';
        return;
      }
      var step = Math.pow(2, 32 - childPfx);
      var lines = [];
      for (var i = 0; i < count; i++) {
        lines.push(TB.intToIp(c.network + i * step) + target);
      }
      $('cs-split-out').innerHTML = TB.highlight(lines.join('\n'), 'yaml');
    }

    $('cs-cidr').addEventListener('input', renderSubnet);
    $('cs-split').addEventListener('change', function () {
      var raw = $('cs-cidr').value;
      if (!raw.trim()) return;
      try { renderSplit(parseCidr(raw)); } catch (e) { renderSubnet(); }
    });
    renderSubnet();
  })();


  /* ============================================================
     7. HTTP status reference
     ============================================================ */
  (function () {
    if (!$('hs-filter')) return;
var HTTP_CODES = [
      ['100', 'Continue', 'large uploads: client asks server to keep going'],
      ['101', 'Switching Protocols', 'websocket upgrades over HTTP/1.1'],
      ['200', 'OK', 'the happy path'],
      ['201', 'Created', 'POST that created a resource; include Location header'],
      ['202', 'Accepted', 'async job queued; result comes later via callback/polling'],
      ['204', 'No Content', 'successful DELETE or PUT with empty body'],
      ['206', 'Partial Content', 'range requests / resumable downloads'],
      ['301', 'Moved Permanently', 'permanent URL change; caches and search engines update'],
      ['302', 'Found', 'temporary redirect; use 307 to preserve method'],
      ['304', 'Not Modified', 'ETag / If-None-Match cache hit saves the payload'],
      ['307', 'Temporary Redirect', 'like 302 but method and body preserved'],
      ['308', 'Permanent Redirect', 'like 301 but method and body preserved'],
      ['400', 'Bad Request', 'malformed syntax or invalid payload'],
      ['401', 'Unauthorized', 'actually means unauthenticated - token missing or expired'],
      ['403', 'Forbidden', 'authenticated but not allowed; do not retry'],
      ['404', 'Not Found', 'resource absent - check the URL and your routes'],
      ['405', 'Method Not Allowed', 'DELETE on a GET-only endpoint; Allow header says what is legal'],
      ['409', 'Conflict', 'version conflict, duplicate key, optimistic-lock failure'],
      ['410', 'Gone', 'deliberately removed; better than 404 for retired APIs'],
      ['412', 'Precondition Failed', 'If-Match etag stale in optimistic concurrency'],
      ['415', 'Unsupported Media Type', 'server cannot parse your content-type'],
      ['422', 'Unprocessable Entity', 'syntax fine, semantics broken (validation errors)'],
      ['429', 'Too Many Requests', 'rate limit hit; honor Retry-After or back off exponentially'],
      ['451', 'Unavailable For Legal Reasons', 'geo or legal blocking'],
      ['500', 'Internal Server Error', 'your bug; log it server-side before clients see it'],
      ['501', 'Not Implemented', 'server does not support the functionality'],
      ['502', 'Bad Gateway', 'proxy got garbage or nothing from upstream - upstream crashed?'],
      ['503', 'Service Unavailable', 'overloaded or down for maintenance; add Retry-After'],
      ['504', 'Gateway Timeout', 'upstream too slow - classic slow-query symptom behind nginx/ALB']
    ];

    function cls(code) {
      return code[0] === '1' ? 'i1' : code[0] === '2' ? 'i2' : code[0] === '3' ? 'i3' :
             code[0] === '4' ? 'i4' : 'i5';
    }

    function renderHttp() {
      var q = $('hs-filter').value.trim().toLowerCase();
      var rows = HTTP_CODES.filter(function (r) {
        return !q || r.join(' ').toLowerCase().indexOf(q) !== -1;
      });
      document.querySelector('#hs-table tbody').innerHTML = rows.map(function (r) {
        return '<tr><td><span class="status-pill ' + cls(r[0]) + '">' + r[0] +
          '</span></td><td>' + r[1] + '</td><td style="color:var(--muted); font-size:.82rem">' +
          r[2] + '</td></tr>';
      }).join('');
    }
    $('hs-filter').addEventListener('input', renderHttp);
    renderHttp();
  })();

})();
