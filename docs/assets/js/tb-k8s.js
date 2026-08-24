/* ============================================================
   DevOps Toolbox - Kubernetes category
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TB = window.TB;
  if (!TB) return;

  TB.wireOutputButtons();
  TB.wireAccordions();



  /* ============================================================
     1. Manifest validator (structural lint, not schema validation)
     ============================================================ */
  (function () {
    if (!$('kv-in')) return;

  var KNOWN_KINDS = ['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job',
    'CronJob', 'Service', 'ConfigMap', 'Secret', 'Ingress',
    'PersistentVolumeClaim', 'Namespace', 'ServiceAccount'];
  var WORKLOAD_WITH_PODSPEC = { Deployment: 1, StatefulSet: 1, DaemonSet: 1, Job: 1 };

  function validateManifest(doc, lineOf) {
    var f = [];
    function add(sev, msg, fix) { f.push({ sev: sev, msg: msg, fix: fix }); }

    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      add('err', 'document is not a YAML mapping', 'expected key: value pairs at top level');
      return f;
    }
    var kind = doc.kind;
    if (!kind) add('err', 'missing kind', 'e.g. kind: Deployment');
    else if (KNOWN_KINDS.indexOf(kind) === -1)
      add('warn', 'unusual kind "' + kind + '"', 'check spelling; CRDs are fine if intentional');

    if (!doc.apiVersion)
      add('err', 'missing apiVersion', 'core resources use v1; deployments use apps/v1');
    else if (kind === 'Deployment' && doc.apiVersion !== 'apps/v1')
      add('err', 'Deployment requires apiVersion apps/v1', 'extensions/v1beta1 was removed years ago');
    else if (kind === 'Service' && doc.apiVersion !== 'v1')
      add('err', 'Service requires apiVersion v1', '');

    var md = doc.metadata;
    if (!md || !md.name)
      add('err', 'metadata.name missing', 'DNS-1123 label: lowercase alphanumerics and "-" only');
    else if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(String(md.name)))
      add('warn', 'metadata.name "' + md.name + '" violates DNS-1123 subdomain style', 'lowercase alphanumeric, "-" or "." inside');

    if (WORKLOAD_WITH_PODSPEC[kind]) {
      var spec = doc.spec || {};
      var tpl = spec.template || {};
      var ps = tpl.spec || {};
      if (!ps.containers || !Array.isArray(ps.containers) || !ps.containers.length)
        add('err', 'spec.template.spec.containers missing or empty', 'at least one container required');
      else {
        ps.containers.forEach(function (c, i) {
          var tag = c.image ? String(c.image).split('@')[0].split('/').pop().split(':')[1] : undefined;
          if (!c.image) add('err', 'containers[' + i + '] has no image', '');
          else if (!tag && String(c.image).indexOf('@') === -1)
            add('warn', 'container "' + c.name + '" image has no explicit tag', 'untagged means :latest');
          else if (tag === 'latest')
            add('warn', 'container "' + c.name + '" uses :latest', 'pin versions for rollbacks');
          if (!c.resources || !c.resources.requests)
            add('warn', 'container "' + c.name + '" has no resource requests', 'scheduler needs requests for bin-packing');
          if (!c.livenessProbe && !c.readinessProbe)
            add('info', 'container "' + c.name + '" defines no health probes', 'add readiness/liveness endpoints');
        });
      }
      /* selector vs labels */
      var sel = spec.selector && spec.selector.matchLabels;
      var lbl = tpl.metadata && tpl.metadata.labels;
      if (sel && lbl) {
        for (var k in sel) {
          if (!(k in lbl))
            add('err', 'selector matchLabels key "' + k + '" missing from template labels',
              'selector must match pod labels or pods will never join the deployment');
          else if (String(lbl[k]) !== String(sel[k]))
            add('err', 'selector matchLabels.' + k + '=' + sel[k] + ' != template label value "' + lbl[k] + '"',
              'selector and template labels must be equal for pods to join');
        }
      } else if (kind === 'Deployment' && !sel)
        add('warn', 'spec.selector.matchLabels missing', 'required for apps/v1 Deployments');
    }

    if (kind === 'Service') {
      var sspec = doc.spec || {};
      if (sspec.type === 'LoadBalancer' && Array.isArray(sspec.ports) && sspec.ports.length > 5)
        add('info', 'LoadBalancer with many ports costs money per service', 'consider an Ingress in front');
      if (!sspec.selector)
        add('warn', 'Service has no selector', 'it will not route to any pods (headless/manual EndpointSlices are exceptions)');
    }

    if (kind === 'Secret' && doc.data)
      Object.keys(doc.data).forEach(function (key) {
        var v = doc.data[key];
        if (typeof v === 'string' && !/^[A-Za-z0-9+/=\s]+$/.test(v.replace(/\s/g, '')))
          add('warn', 'secret.data["' + key + '"] does not look base64-encoded', 'kubectl create secret encodes automatically');
      });

    return f;
  }

  function renderValidate() {
    var src = $('kv-in').value;
    var box = $('kv-findings');
    box.innerHTML = '';
    if (!src.trim()) return;
    var docs;
    try {
      docs = TB.parseYaml(src);
    } catch (e) {
      box.innerHTML = '<div class="finding f-err"><span class="badge err">YAML</span> ' +
        TB.esc(e.message) + '</div>';
      return;
    }
    if (!Array.isArray(docs)) docs = [docs];
    var all = [];
    docs.forEach(function (d) { all = all.concat(validateManifest(d)); });
    if (!all.length) {
      box.innerHTML = '<div class="finding f-info"><span class="badge ok">STRUCTURE OK</span> ' +
        'no structural issues found &mdash; still run kubectl apply --dry-run=server before shipping</div>';
      return;
    }
    var cls = { err: ['ERROR', 'f-err'], warn: ['WARN', 'f-warn'], info: ['INFO', 'f-info'] };
    box.innerHTML = all.map(function (x) {
      return '<div class="finding ' + cls[x.sev][1] + '">' +
        '<span class="badge ' + (x.sev === 'err' ? 'err' : x.sev === 'warn' ? 'warn' : '') + '">' +
        cls[x.sev][0] + '</span> ' + TB.esc(x.msg) +
        (x.fix ? '<div class="mono-label">fix: ' + TB.esc(x.fix) + '</div>' : '') + '</div>';
    }).join('');
  }
  $('kv-in').addEventListener('input', renderValidate);
  })();


  /* ============================================================
     2. Deployment generator
     ============================================================ */
  (function () {
    if (!$('kd-name')) return;

  ['kd-name', 'kd-image', 'kd-replicas', 'kd-port', 'kd-cpu-r', 'kd-mem-r']
    .forEach(function (id) { $(id).addEventListener('input', renderDeploy); });
  ['kd-probes', 'kd-limits', 'kd-svc'].forEach(function (id) {
    $(id).addEventListener('click', function () { $(id).classList.toggle('on'); renderDeploy(); });
  });

  function renderDeploy() {
    var name = $('kd-name').value.trim() || 'app';
    var img = $('kd-image').value.trim() || 'image:latest';
    var port = parseInt($('kd-port').value, 10) || 8080;
    var cpu = $('kd-cpu-r').value.trim() || '100m';
    var mem = $('kd-mem-r').value.trim() || '128Mi';

    var c = {
      name: name,
      image: img,
      ports: [{ containerPort: port }],
      resources: { requests: { cpu: cpu, memory: mem } }
    };
    if ($('kd-limits').classList.contains('on')) {
      c.resources.limits = { cpu: cpu.indexOf('m') !== -1 ? (parseInt(cpu, 10) * 2) + 'm' : cpu, memory: mem };
    }
    if ($('kd-probes').classList.contains('on')) {
      c.readinessProbe = { httpGet: { path: '/healthz', port: port }, initialDelaySeconds: 5, periodSeconds: 10 };
      c.livenessProbe = { httpGet: { path: '/healthz', port: port }, initialDelaySeconds: 15, periodSeconds: 20 };
    }

    var dep = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: name, labels: { app: name } },
      spec: {
        replicas: Math.max(0, parseInt($('kd-replicas').value, 10) || 1),
        selector: { matchLabels: { app: name } },
        strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: 1, maxUnavailable: 0 } },
        template: {
          metadata: { labels: { app: name } },
          spec: { containers: [c] }
        }
      }
    };

    var out = TB.toYaml(dep);
    if ($('kd-svc').classList.contains('on')) {
      out += '\n---\n' + TB.toYaml({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: name },
        spec: {
          selector: { app: name },
          ports: [{ port: 80, targetPort: port }]
        }
      });
    }
    $('kd-out').innerHTML = TB.highlight(out, 'yaml');
  }
  renderDeploy();
  })();


  /* ============================================================
     3. Resource calculator
     ============================================================ */
  (function () {
    if (!$('kr-replicas')) return;

  function parseCpu(s) {
    s = String(s).trim().toLowerCase();
    if (/^\d+m$/.test(s)) return parseInt(s, 10) / 1000;
    var v = parseFloat(s);
    return isNaN(v) ? null : v;
  }
  function parseMem(s) {
    var m = String(s).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?i?b?)$/);
    if (!m) return null;
    var mult = { '': 1, k: 1e3, ki: 1024, m: 1e6, mi: 1048576, g: 1e9, gi: 1073741824,
                 t: 1e12, ti: 1099511627776 }[m[2].replace(/b$/, '')] || 1;
    return parseFloat(m[1]) * mult;
  }
  function humanBytes(b) {
    if (b >= 1099511627776) return (b / 1099511627776).toFixed(2) + ' TiB';
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GiB';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MiB';
    return Math.round(b) + ' KiB';
  }

  ['kr-replicas', 'kr-cpu', 'kr-mem'].forEach(function (id) {
    $(id).addEventListener('input', renderResources);
  });
  function renderResources() {
    var errEl = $('kr-error'), kvEl = $('kr-kv');
    errEl.hidden = true; kvEl.hidden = true;
    var reps = parseInt($('kr-replicas').value, 10);
    var cpu = parseCpu($('kr-cpu').value);
    var mem = parseMem($('kr-mem').value);
    if (!(reps > 0)) { errEl.textContent = 'replicas must be a positive number'; errEl.hidden = false; return; }
    if (cpu == null || cpu <= 0) { errEl.textContent = 'invalid CPU value (try 250m or 1.5)'; errEl.hidden = false; return; }
    if (mem == null || mem <= 0) { errEl.textContent = 'invalid memory value (try 512Mi or 0.5Gi)'; errEl.hidden = false; return; }
    TB.fillKv(kvEl, [
      ['total CPU', (cpu * reps).toFixed(3).replace(/\.?0+$/, '') + ' cores (' + Math.round(cpu * 1000 * reps) + 'm)'],
      ['total memory', humanBytes(mem * reps)],
      ['per replica', cpu.toFixed(3).replace(/\.?0+$/, '') + ' core / ' + humanBytes(mem)],
      ['suggested node headroom', '+20% buffer = ' +
        ((Math.ceil(cpu * reps * 1.2 * 10) / 10)).toFixed(1).replace(/\.0$/, '') + ' cores / ' + humanBytes(mem * reps * 1.2)]
    ]);
    kvEl.hidden = false;
  }
  renderResources();
  })();


  /* ============================================================
     4. kubectl command builder
     ============================================================ */
  (function () {
    if (!$('kc-verb')) return;

  ['kc-verb', 'kc-type', 'kc-name', 'kc-ns', 'kc-extra']
    .forEach(function (id) { $(id).addEventListener('input', renderKubectl); });
  $('kc-verb').addEventListener('change', renderKubectl);
  $('kc-type').addEventListener('change', renderKubectl);
  ['kc-allns', 'kc-yaml'].forEach(function (id) {
    $(id).addEventListener('click', function () { $(id).classList.toggle('on'); renderKubectl(); });
  });

  function renderKubectl() {
    var verb = $('kc-verb').value;
    var type = $('kc-type').value;
    var name = $('kc-name').value.trim();
    var ns = $('kc-ns').value.trim();
    var extra = $('kc-extra').value.trim();
    var allns = $('kc-allns').classList.contains('on');
    var yaml = $('kc-yaml').classList.contains('on');

    var parts = ['kubectl', verb];
    if (allns && (verb === 'get' || verb === 'describe')) parts.push('--all-namespaces');
    else if (!allns && ns && ns !== 'default') parts.push('-n ' + ns);

    if (verb === 'logs' || verb === 'exec' || verb === 'scale') {
      parts.push(name ? type.replace(/s$/, '') + '/' + name : type);
      if (verb === 'scale') parts.push('--replicas=');
    } else if (verb === 'apply') {
      parts.push('-f manifest.yaml');
    } else {
      parts.push(type + (name ? '/' + name : ''));
    }
    if (yaml && (verb === 'get')) parts.push('-o yaml');
    if (extra) parts.push(extra);

    $('kc-out').innerHTML = TB.highlight(parts.join(' '), 'bash');
  }
  renderKubectl();
  })();


  /* ============================================================
     5. YAML <-> JSON converter
     ============================================================ */
  (function () {
    if (!$('kj-in')) return;

  function kjErr(msg) {
    var e = $('kj-error');
    e.textContent = msg; e.hidden = !msg;
  }
  $('kj-tojson').addEventListener('click', function () {
    kjErr('');
    try {
      var obj = TB.parseYaml($('kj-in').value);
      var json = JSON.stringify(obj, null, 2);
      $('kj-out').innerHTML = TB.highlight(json, 'json');
    } catch (e) { kjErr(String(e.message)); }
  });
  $('kj-toyaml').addEventListener('click', function () {
    kjErr('');
    try {
      var obj = JSON.parse($('kj-in').value);
      $('kj-out').innerHTML = TB.highlight(TB.toYaml(obj), 'yaml');
    } catch (e) { kjErr('invalid JSON: ' + e.message); }
  });
  })();

})();
