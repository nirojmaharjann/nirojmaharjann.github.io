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
     2. Kubernetes manifest generator
     ============================================================ */
  (function () {
    if (!$('kg-fields')) return;

    /* ---------- shared utilities ---------- */
    var NAME_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    var DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

    function L() {
      var out = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        if (a === null || a === undefined) continue;
        if (typeof a === 'string') out.push(a);
        else for (var j = 0; j < a.length; j++) if (a[j] !== null && a[j] !== undefined) out.push(a[j]);
      }
      return out;
    }
    function q(v) {
      var s = String(v);
      if (/^[-A-Za-z0-9_.\/]+$/.test(s)) return s;
      return JSON.stringify(s);
    }
    function b64(s) {
      try { return btoa(unescape(encodeURIComponent(String(s)))); }
      catch (e) { return ''; }
    }
    function parseKV(text) {
      var m = {};
      String(text || '').split('\n').forEach(function (ln) {
        ln = ln.trim();
        if (!ln || ln.charAt(0) === '#') return;
        var i = ln.indexOf('=');
        if (i > 0) m[ln.slice(0, i).trim()] = ln.slice(i + 1).trim();
      });
      return m;
    }
    function esc2(s) { return TB.esc(String(s)); }

    /* ---------- state ---------- */
    var S = {
      res: {},
      vals: {},
      kv: { cm: [], sec: [] },
      touched: {},
      tab: 'all',
      preset: 'web-service',
      lastGood: null
    };

    var RES_ORDER = ['namespace', 'pvc', 'configmap', 'secret', 'deployment', 'hpa', 'service', 'ingress', 'tls'];

    /* ---------- resource registry ---------- */
    var RES = {

      namespace: {
        label: 'Namespace', icon: 'mdi-tag-outline', file: 'namespace.yaml',
        fields: [
          { id: 'name', el: 'kd-nsname', label: 'Namespace name', derive: function (g, c) { return c.ns(); }, req: true },
          { id: 'labels', el: 'kd-nslabels', label: 'Labels', type: 'textarea', ph: 'KEY=value per line', half: true },
          { id: 'anns', el: 'kd-nsanns', label: 'Annotations', type: 'textarea', ph: 'KEY=value per line', half: true }
        ],
        validate: function (v, g, add) {
          if (!NAME_RE.test(v.name)) add('name', 'must be a DNS-1123 label (lowercase alphanumerics and "-")');
        },
        gen: function (v, g, c) {
          var lbl = parseKV(v.labels), ann = parseKV(v.anns);
          var l = L('apiVersion: v1', 'kind: Namespace', 'metadata:', '  name: ' + q(v.name));
          var extra = [];
          Object.keys(lbl).forEach(function (k) { extra.push('    ' + q(k) + ': ' + q(lbl[k])); });
          if (extra.length) { l.push('  labels:'); l.push.apply(l, extra); }
          var ex2 = [];
          Object.keys(ann).forEach(function (k) { ex2.push('    ' + q(k) + ': ' + q(ann[k])); });
          if (ex2.length) { l.push('  annotations:'); l.push.apply(l, ex2); }
          return l.join('\n');
        }
      },

      pvc: {
        label: 'PersistentVolumeClaim', short: 'PVC', icon: 'mdi-database-outline', file: 'pvc.yaml',
        fields: [
          { id: 'name', el: 'kd-pvcname', label: 'PVC name', derive: function (g) { return g('general', 'name') + '-data'; }, req: true },
          { id: 'size', el: 'kd-pvcsize', label: 'Storage size', def: '5Gi', req: true },
          { id: 'sc', el: 'kd-sc', label: 'Storage class', ph: 'blank = cluster default' },
          { id: 'vmode', el: 'kd-vmode', label: 'Volume mode', type: 'select', opts: ['Filesystem', 'Block'], def: 'Filesystem' },
          { id: 'amRwo', el: 'kd-am-rwo', label: 'ReadWriteOnce', type: 'check', def: true },
          { id: 'amRox', el: 'kd-am-rox', label: 'ReadOnlyMany', type: 'check', def: false },
          { id: 'amRwx', el: 'kd-am-rwx', label: 'ReadWriteMany', type: 'check', def: false },
          { id: 'mount', el: 'kg-pvc-mount', label: 'Mount into the Deployment', type: 'check', def: false, hint: 'adds a volume + volumeMount below /data style path' },
          { id: 'mountPath', el: 'kd-pvc-mountpath', label: 'Mount path', def: '/data', show: function (g) { return !!g('pvc', 'mount'); } }
        ],
        validate: function (v, g, add) {
          if (!NAME_RE.test(v.name)) add('name', 'must be a DNS-1123 label');
          if (!/^\d+(\.\d+)?(Ei|Pi|Ti|Gi|Mi|Ki|E|P|T|G|M|K)$/.test(String(v.size).trim()))
            add('size', 'use a quantity like 5Gi, 500Mi or 1Ti');
        },
        gen: function (v, g, c) {
          var modes = [];
          if (v.amRwo) modes.push('ReadWriteOnce');
          if (v.amRox) modes.push('ReadOnlyMany');
          if (v.amRwx) modes.push('ReadWriteMany');
          if (!modes.length) modes.push('ReadWriteOnce');
          var l = L(
            'apiVersion: v1', 'kind: PersistentVolumeClaim', 'metadata:', '  name: ' + q(v.name),
            'spec:',
            '  accessModes:',
            modes.map(function (m) { return '  - ' + m; }),
            '  volumeMode: ' + v.vmode,
            '  resources:', '    requests:', '      storage: ' + q(v.size));
          if (String(v.sc).trim()) l.push('  storageClassName: ' + q(String(v.sc).trim()));
          return l.join('\n');
        }
      },

      configmap: {
        label: 'ConfigMap', icon: 'mdi-script-text-outline', file: 'configmap.yaml',
        fields: [
          { id: 'name', el: 'kd-cmname', label: 'ConfigMap name', derive: function (g) { return g('general', 'name') + '-config'; }, req: true },
          { id: 'asEnv', el: 'kg-cm-env', label: 'Use as environment variables (envFrom)', type: 'check', def: true },
          { id: 'asVol', el: 'kg-cm-vol', label: 'Mount ConfigMap as volume', type: 'check', def: false },
          { id: 'mountPath', el: 'kd-cm-mount', label: 'Mount path', def: '/etc/config', show: function (g) { return !!g('configmap', 'asVol'); } }
        ],
        kvKey: 'cm',
        validate: function (v, g, add, kv) {
          if (!NAME_RE.test(v.name)) add('name', 'must be a DNS-1123 label');
          kv.forEach(function (r) {
            if (!/^[-._a-zA-Z][-._a-zA-Z0-9]*$/.test(r.k)) add(null, '"' + r.k + '" is not a valid key (letters, digits, "-", "_", ".")');
            if (!String(r.v).length) add(null, 'value for "' + r.k + '" is empty');
          });
        },
        gen: function (v, g, c, kv) {
          var l = L('apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: ' + q(v.name));
          if (kv.length) {
            l.push('data:');
            kv.forEach(function (r) { l.push('  ' + q(r.k) + ': ' + q(r.v)); });
          }
          return l.join('\n');
        }
      },

      secret: {
        label: 'Secret', icon: 'mdi-key-variant', file: 'secret.yaml',
        fields: [
          { id: 'name', el: 'kd-secname', label: 'Secret name', derive: function (g) { return g('general', 'name') + '-secret'; }, req: true },
          { id: 'type', el: 'kd-sectype', label: 'Secret type', type: 'select', opts: ['Opaque', 'kubernetes.io/basic-auth', 'kubernetes.io/dockerconfigjson'], def: 'Opaque' },
          { id: 'asEnv', el: 'kg-sec-env', label: 'Use as environment variables (envFrom)', type: 'check', def: true },
          { id: 'asVol', el: 'kg-sec-vol', label: 'Mount Secret as volume', type: 'check', def: false },
          { id: 'mountPath', el: 'kd-sec-mount', label: 'Mount path', def: '/etc/secrets', show: function (g) { return !!g('secret', 'asVol'); } }
        ],
        kvKey: 'sec', isSecret: true,
        note: '<b>Plain text in, base64 out.</b> You type readable values here; Kubernetes Secret manifests normally carry base64-encoded <code>data</code>, so the generator encodes them automatically.',
        warn: '<i class="mdi mdi-alert-outline"></i> Never commit generated Secrets to public repositories. Ship them with <code>kubectl create secret</code>, sealed-secrets or an external secrets operator instead.',
        validate: function (v, g, add, kv) {
          if (!NAME_RE.test(v.name)) add('name', 'must be a DNS-1123 label');
          kv.forEach(function (r) {
            if (!/^[-._a-zA-Z][-._a-zA-Z0-9]*$/.test(r.k)) add(null, '"' + r.k + '" is not a valid key');
            if (!String(r.v).length) add(null, 'value for "' + r.k + '" is empty');
          });
        },
        gen: function (v, g, c, kv) {
          var l = L('apiVersion: v1', 'kind: Secret', 'metadata:', '  name: ' + q(v.name),
            'type: ' + v.type);
          if (kv.length) {
            l.push('data:');
            kv.forEach(function (r) { l.push('  ' + q(r.k) + ': ' + q(b64(r.v))); });
          }
          return l.join('\n');
        }
      },

      deployment: {
        label: 'Deployment', icon: 'mdi-cube-outline', file: 'deployment.yaml',
        fields: [
          { id: 'image', el: 'kd-image', label: 'Docker image', def: 'ghcr.io/acme/web-api', req: true },
          { id: 'tag', el: 'kd-tag', label: 'Image tag', def: '1.4.0', half: true },
          { id: 'container', el: 'kd-container', label: 'Container name', def: 'app', half: true },
          { id: 'replicas', el: 'kd-replicas', label: 'Replicas', type: 'number', def: 3, min: 0, max: 999, half: true },
          { id: 'port', el: 'kd-port', label: 'Container port', type: 'number', def: 8080, min: 1, max: 65535, half: true },
          { id: 'pull', el: 'kd-pull', label: 'Image pull policy', type: 'select', opts: ['IfNotPresent', 'Always', 'Never'], def: 'IfNotPresent' },
          { id: 'cpuR', el: 'kd-cpu-r', label: 'CPU request', def: '100m', half: true },
          { id: 'memR', el: 'kd-mem-r', label: 'Memory request', def: '128Mi', half: true },
          { id: 'limitsChip', el: 'kd-limits', label: 'resource limits', type: 'chip', def: true },
          { id: 'cpuL', el: 'kd-cpu-l', label: 'CPU limit', def: '200m', half: true, show: function (g) { return !!g('deployment', 'limitsChip'); } },
          { id: 'memL', el: 'kd-mem-l', label: 'Memory limit', def: '256Mi', half: true, show: function (g) { return !!g('deployment', 'limitsChip'); } },
          { id: 'sa', el: 'kd-sa', label: 'Service account', ph: 'omit if blank' },
          { id: 'strategy', el: 'kd-strategy', label: 'Update strategy', type: 'select', opts: ['RollingUpdate', 'Recreate'], def: 'RollingUpdate' },
          { id: 'surge', el: 'kd-surge', label: 'maxSurge', type: 'number', def: 1, min: 0, max: 99, half: true, show: function (g) { return g('deployment', 'strategy') === 'RollingUpdate'; } },
          { id: 'unavail', el: 'kd-unavail', label: 'maxUnavailable', type: 'number', def: 0, min: 0, max: 99, half: true, show: function (g) { return g('deployment', 'strategy') === 'RollingUpdate'; } },
          { id: 'probesChip', el: 'kd-probes', label: 'health probes', type: 'chip', def: true },
          { id: 'lp', el: 'kd-lp', label: 'Liveness probe', type: 'check', def: true, show: function (g) { return !!g('deployment', 'probesChip'); } },
          { id: 'rp', el: 'kd-rp', label: 'Readiness probe', type: 'check', def: true, show: function (g) { return !!g('deployment', 'probesChip'); } },
          { id: 'sp', el: 'kd-sp', label: 'Startup probe', type: 'check', def: false, show: function (g) { return !!g('deployment', 'probesChip'); } },
          { id: 'path', el: 'kd-path', label: 'Probe path', def: '/healthz', half: true, show: function (g) { return !!g('deployment', 'probesChip'); } },
          { id: 'env', el: 'kd-env', label: 'Environment variables', type: 'textarea', ph: 'KEY=value per line' }
        ],
        validate: function (v, g, add) {
          if (!NAME_RE.test(g('general', 'name'))) add(null, 'application name must be a DNS-1123 label');
          if (!String(v.image).trim()) add('image', 'container image is required');
          else if (/\s/.test(v.image)) add('image', 'image may not contain spaces');
          if (/\s/.test(String(v.tag))) add('tag', 'tag may not contain spaces');
          var rep = parseInt(v.replicas, 10);
          if (!(rep >= 0 && rep <= 999)) add('replicas', 'replicas must be 0 - 999');
          var p = parseInt(v.port, 10);
          if (!(p >= 1 && p <= 65535)) add('port', 'container port must be 1 - 65535');
          if (v.strategy === 'RollingUpdate') {
            if (!(parseInt(v.surge, 10) >= 0)) add('surge', 'maxSurge must be >= 0');
            if (!(parseInt(v.unavail, 10) >= 0)) add('unavail', 'maxUnavailable must be >= 0');
          }
        },
        gen: function (v, g, c) {
          var app = g('general', 'name'), ns = c.ns(), P = parseInt(v.port, 10) || 8080;
          var img = String(v.image).trim() + (String(v.tag).trim() ? ':' + String(v.tag).trim() : '');
          var l = L(
            'apiVersion: apps/v1', 'kind: Deployment', 'metadata:',
            '  name: ' + q(app), '  namespace: ' + q(ns), '  labels:', '    app: ' + q(app),
            'spec:',
            '  replicas: ' + (parseInt(v.replicas, 10) || 0),
            '  selector:', '    matchLabels:', '      app: ' + q(app));
          if (v.strategy === 'RollingUpdate') {
            l.push('  strategy:', '    type: RollingUpdate', '    rollingUpdate:');
            l.push('      maxSurge: ' + (parseInt(v.surge, 10) || 0));
            l.push('      maxUnavailable: ' + (parseInt(v.unavail, 10) || 0));
          } else {
            l.push('  strategy:', '    type: Recreate');
          }
          l.push('  template:');
          l.push('    metadata:', '      labels:', '        app: ' + q(app));
          l.push('    spec:');
          if (String(v.sa).trim()) l.push('      serviceAccountName: ' + q(String(v.sa).trim()));
          l.push('      containers:', '      - name: ' + q(v.container || 'app'));
          l.push('        image: ' + q(img));
          l.push('        imagePullPolicy: ' + v.pull);
          l.push('        ports:', '        - containerPort: ' + P);
          var envMap = parseKV(v.env);
          var envKeys = Object.keys(envMap);
          if (envKeys.length) {
            l.push('        env:');
            envKeys.forEach(function (k) {
              l.push('        - name: ' + q(k));
              l.push('          value: ' + q(envMap[k]));
            });
          }
          var envFrom = [];
          if (c.sel('configmap') && c.g('configmap', 'asEnv'))
            envFrom.push.apply(envFrom, L('        - configMapRef:', '            name: ' + q(c.g('configmap', 'name'))));
          if (c.sel('secret') && c.g('secret', 'asEnv'))
            envFrom.push.apply(envFrom, L('        - secretRef:', '            name: ' + q(c.g('secret', 'name'))));
          if (envFrom.length) { l.push('        envFrom:'); l.push.apply(l, envFrom); }
          var res = L('        resources:', '          requests:',
            '            cpu: ' + q(v.cpuR || '100m'),
            '            memory: ' + q(v.memR || '128Mi'));
          if (v.limitsChip) {
            res.push('          limits:');
            res.push('            cpu: ' + q(v.cpuL || '200m'));
            res.push('            memory: ' + q(v.memL || '256Mi'));
          }
          l.push.apply(l, res);
          if (v.probesChip) {
            var probe = function (kind, delay, period) {
              return L('        ' + kind + ':',
                '          httpGet:', '            path: ' + q(v.path || '/healthz'), '            port: ' + P,
                '          initialDelaySeconds: ' + delay,
                '          periodSeconds: ' + period);
            };
            if (v.sp) l.push.apply(l, probe('startupProbe', 10, 5));
            if (v.rp) l.push.apply(l, probe('readinessProbe', 5, 10));
            if (v.lp) l.push.apply(l, probe('livenessProbe', 15, 20));
          }
          var vols = [], mounts = [];
          if (c.sel('configmap') && c.g('configmap', 'asVol')) {
            vols.push.apply(vols, L('      - name: app-config', '        configMap:', '          name: ' + q(c.g('configmap', 'name'))));
            mounts.push.apply(mounts, L('        - name: app-config', '          mountPath: ' + q(c.g('configmap', 'mountPath') || '/etc/config')));
          }
          if (c.sel('secret') && c.g('secret', 'asVol')) {
            vols.push.apply(vols, L('      - name: app-secret', '        secret:', '          secretName: ' + q(c.g('secret', 'name'))));
            mounts.push.apply(mounts, L('        - name: app-secret', '          mountPath: ' + q(c.g('secret', 'mountPath') || '/etc/secrets')));
          }
          if (c.sel('pvc') && c.g('pvc', 'mount')) {
            vols.push.apply(vols, L('      - name: app-data', '        persistentVolumeClaim:', '          claimName: ' + q(c.g('pvc', 'name'))));
            mounts.push.apply(mounts, L('        - name: app-data', '          mountPath: ' + q(c.g('pvc', 'mountPath') || '/data')));
          }
          if (vols.length) { l.push('      volumes:'); l.push.apply(l, vols); }
          if (mounts.length) { l.push('        volumeMounts:'); l.push.apply(l, mounts); }
          return l.join('\n');
        }
      },

      hpa: {
        label: 'HorizontalPodAutoscaler', short: 'HPA', icon: 'mdi-arrow-expand-vertical', file: 'hpa.yaml',
        fields: [
          { id: 'target', el: 'kd-hpatarget', label: 'Target Deployment', derive: function (g) { return g('general', 'name'); }, req: true },
          { id: 'min', el: 'kd-hpamin', label: 'Min replicas', type: 'number', def: 1, min: 1, max: 99, half: true },
          { id: 'max', el: 'kd-hpamax', label: 'Max replicas', type: 'number', def: 5, min: 1, max: 99, half: true },
          { id: 'cpu', el: 'kd-hpacpu', label: 'CPU target %', type: 'number', def: 70, min: 1, max: 100, half: true },
          { id: 'memOn', el: 'kg-hpa-mem', label: 'Also scale on memory', type: 'check', def: false },
          { id: 'mem', el: 'kd-hpamem', label: 'Memory target %', type: 'number', def: 75, min: 1, max: 100, half: true, show: function (g) { return !!g('hpa', 'memOn'); } }
        ],
        validate: function (v, g, add) {
          var mn = parseInt(v.min, 10), mx = parseInt(v.max, 10);
          if (!(mn >= 1)) add('min', 'min replicas must be >= 1');
          if (!(mx >= 1)) add('max', 'max replicas must be >= 1');
          if (mn >= 1 && mx >= 1 && mx < mn) add('max', 'max replicas must be >= min replicas');
          if (!(parseInt(v.cpu, 10) >= 1 && parseInt(v.cpu, 10) <= 100)) add('cpu', 'CPU target must be 1 - 100');
        },
        gen: function (v, g, c) {
          var l = L(
            'apiVersion: autoscaling/v2', 'kind: HorizontalPodAutoscaler',
            'metadata:', '  name: ' + q(v.target) + '-hpa', '  namespace: ' + q(c.ns()),
            'spec:',
            '  scaleTargetRef:', '    apiVersion: apps/v1', '    kind: Deployment', '    name: ' + q(v.target),
            '  minReplicas: ' + (parseInt(v.min, 10) || 1),
            '  maxReplicas: ' + (parseInt(v.max, 10) || 5),
            '  metrics:');
          l.push.apply(l, L(
            '  - type: Resource', '    resource:', '      name: cpu',
            '      target:', '        type: Utilization', '        averageUtilization: ' + (parseInt(v.cpu, 10) || 70)));
          if (v.memOn) l.push.apply(l, L(
            '  - type: Resource', '    resource:', '      name: memory',
            '      target:', '        type: Utilization', '        averageUtilization: ' + (parseInt(v.mem, 10) || 75)));
          return l.join('\n');
        }
      },

      service: {
        label: 'Service', icon: 'mdi-lan-connect', file: 'service.yaml',
        fields: [
          { id: 'name', el: 'kd-svcname', label: 'Service name', derive: function (g) { return g('general', 'name') + '-service'; }, req: true },
          { id: 'type', el: 'kd-stype', label: 'Service type', type: 'select', opts: ['ClusterIP', 'NodePort', 'LoadBalancer'], def: 'ClusterIP' },
          { id: 'port', el: 'kd-sport', label: 'Port', type: 'number', def: 80, min: 1, max: 65535, half: true },
          { id: 'targetPort', el: 'kd-tport', label: 'Target port', type: 'number', derive: function (g) { return g('deployment', 'port'); }, half: true },
          { id: 'nodePort', el: 'kd-nodeport', label: 'Node port', type: 'number', def: 30080, min: 30000, max: 32767, half: true, show: function (g) { return g('service', 'type') === 'NodePort'; } },
          { id: 'proto', el: 'kd-proto', label: 'Protocol', type: 'select', opts: ['TCP', 'UDP', 'SCTP'], def: 'TCP' }
        ],
        validate: function (v, g, add) {
          if (!NAME_RE.test(v.name)) add('name', 'must be a DNS-1123 label');
          var p = parseInt(v.port, 10);
          if (!(p >= 1 && p <= 65535)) add('port', 'port must be 1 - 65535');
          var tp = parseInt(v.targetPort, 10);
          if (!(tp >= 1 && tp <= 65535)) add('targetPort', 'target port must be 1 - 65535');
          if (v.type === 'NodePort') {
            var np = parseInt(v.nodePort, 10);
            if (!(np >= 30000 && np <= 32767)) add('nodePort', 'NodePort must be 30000 - 32767');
          }
        },
        gen: function (v, g, c) {
          var app = g('general', 'name');
          var l = L(
            'apiVersion: v1', 'kind: Service', 'metadata:',
            '  name: ' + q(v.name), '  namespace: ' + q(c.ns()), '  labels:', '    app: ' + q(app),
            'spec:', '  type: ' + v.type,
            '  selector:', '    app: ' + q(app),
            '  ports:', '  - name: http', '    protocol: ' + v.proto,
            '    port: ' + (parseInt(v.port, 10) || 80),
            '    targetPort: ' + (parseInt(v.targetPort, 10) || 8080));
          if (v.type === 'NodePort') l.push('    nodePort: ' + (parseInt(v.nodePort, 10) || 30080));
          return l.join('\n');
        }
      },

      ingress: {
        label: 'Ingress', icon: 'mdi-door-open', file: 'ingress.yaml',
        fields: [
          { id: 'name', el: 'kd-ingname', label: 'Ingress name', derive: function (g) { return g('general', 'name') + '-ingress'; }, req: true },
          { id: 'host', el: 'kd-host', label: 'Host / domain', def: 'app.example.com', req: true },
          { id: 'path', el: 'kd-ipath', label: 'Path', def: '/', half: true },
          { id: 'pathType', el: 'kd-iptype', label: 'Path type', type: 'select', opts: ['Prefix', 'Exact', 'ImplementationSpecific'], def: 'Prefix', half: true },
          { id: 'svc', el: 'kd-isvc', label: 'Service name', derive: function (g) { return g('service', 'name'); }, req: true },
          { id: 'svcPort', el: 'kd-iport', label: 'Service port', type: 'number', derive: function (g) { return g('service', 'port'); }, half: true },
          { id: 'class', el: 'kd-iclass', label: 'Ingress class', type: 'select', opts: ['nginx', 'traefik', 'custom'], def: 'nginx' },
          { id: 'classCustom', el: 'kd-iclass-custom', label: 'Custom class', ph: 'e.g. contour', show: function (g) { return g('ingress', 'class') === 'custom'; } },
          { id: 'tls', el: 'kd-ingtls', label: 'Enable TLS', type: 'check', def: false, hint: 'uses the SSL/TLS section secret' },
          { id: 'rewrite', el: 'kd-irewrite', label: 'Rewrite annotations', type: 'check', def: false, hint: 'nginx rewrite-target: /' }
        ],
        validate: function (v, g, add) {
          if (!NAME_RE.test(v.name)) add('name', 'must be a DNS-1123 label');
          if (!DOMAIN_RE.test(String(v.host).trim())) add('host', 'enter a valid domain like app.example.com');
          if (!String(v.path).trim()) add('path', 'path is required');
          if (!v.svc) add('svc', 'service name is required');
          else if (!NAME_RE.test(v.svc)) add('svc', 'must be a DNS-1123 label');
          var sp = parseInt(v.svcPort, 10);
          if (!(sp >= 1 && sp <= 65535)) add('svcPort', 'service port must be 1 - 65535');
          if (v.class === 'custom' && !String(v.classCustom).trim())
            add('classCustom', 'name your custom ingress class');
        },
        gen: function (v, g, c) {
          var cls = v.class === 'custom' ? String(v.classCustom).trim() : v.class;
          var anns = [];
          if (v.rewrite) anns.push(['nginx.ingress.kubernetes.io/rewrite-target', '/']);
          var l = L(
            'apiVersion: networking.k8s.io/v1', 'kind: Ingress', 'metadata:',
            '  name: ' + q(v.name), '  namespace: ' + q(c.ns()));
          if (anns.length) {
            l.push('  annotations:');
            anns.forEach(function (a) { l.push('    ' + q(a[0]) + ': ' + q(a[1])); });
          }
          l.push('spec:', '  ingressClassName: ' + q(cls));
          var tlsOn = v.tls && c.sel('tls');
          if (tlsOn) {
            var secretName = c.g('tls', 'mode') === 'certmanager'
              ? c.g('tls', 'certSecret')
              : c.g('tls', 'secret');
            l.push('  tls:');
            l.push('  - hosts:');
            l.push('    - ' + q(String(v.host).trim()));
            l.push('    secretName: ' + q(secretName));
          }
          l.push('  rules:');
          l.push('  - host: ' + q(String(v.host).trim()));
          l.push('    http:');
          l.push('      paths:');
          l.push('      - path: ' + q(v.path));
          l.push('        pathType: ' + v.pathType);
          l.push('        backend:');
          l.push('          service:');
          l.push('            name: ' + q(v.svc));
          l.push('            port:');
          l.push('              number: ' + (parseInt(v.svcPort, 10) || 80));
          return l.join('\n');
        }
      },

      tls: {
        label: 'SSL / TLS', short: 'SSL/TLS', icon: 'mdi-lock-outline', file: 'tls.yaml',
        fields: [
          { id: 'mode', el: 'kg-tls-mode', label: 'Mode', type: 'select', opts: [['existing', 'Existing TLS Secret'], ['certmanager', 'cert-manager']], def: 'existing' },
          { id: 'secret', el: 'kd-tlssecret', label: 'TLS secret name', derive: function (g) { return g('general', 'name') + '-tls'; }, show: function (g) { return g('tls', 'mode') === 'existing'; } },
          { id: 'domain', el: 'kd-tlsdomain', label: 'Domain', derive: function (g) { return String(g('ingress', 'host') || 'app.example.com').trim(); }, show: function (g) { return g('tls', 'mode') === 'existing'; } },
          { id: 'certName', el: 'kd-certname', label: 'Certificate name', derive: function (g) { return g('general', 'name') + '-cert'; }, show: function (g) { return g('tls', 'mode') === 'certmanager'; } },
          { id: 'certDomains', el: 'kd-certdomains', label: 'Domains (one per line)', type: 'textarea', half: true,
            derive: function (g) { return String(g('ingress', 'host') || 'app.example.com').trim(); },
            show: function (g) { return g('tls', 'mode') === 'certmanager'; } },
          { id: 'certSecret', el: 'kd-certsecret', label: 'Secret name', derive: function (g) { return g('general', 'name') + '-tls'; }, show: function (g) { return g('tls', 'mode') === 'certmanager'; } },
          { id: 'issuer', el: 'kd-issuername', label: 'Issuer name', def: 'letsencrypt', req: true, show: function (g) { return g('tls', 'mode') === 'certmanager'; } },
          { id: 'issuerKind', el: 'kd-issuertype', label: 'Issuer type', type: 'select', opts: ['ClusterIssuer', 'Issuer'], def: 'ClusterIssuer', show: function (g) { return g('tls', 'mode') === 'certmanager'; } },
          { id: 'email', el: 'kd-acmeemail', label: 'ACME email', def: 'ops@example.com', show: function (g) { return g('tls', 'mode') === 'certmanager'; } },
          { id: 'leEnv', el: 'kd-leenv', label: "Let's Encrypt server", type: 'select', opts: [['production', 'Production'], ['staging', 'Staging']], def: 'production', show: function (g) { return g('tls', 'mode') === 'certmanager'; } },
          { id: 'makeIssuer', el: 'kg-make-issuer', label: 'Also generate the issuer resource', type: 'check', def: false, show: function (g) { return g('tls', 'mode') === 'certmanager'; } }
        ],
        existingNote: 'Reference mode: no manifest is emitted. The Ingress TLS block points at the secret named above - make sure it exists in the target namespace (kubectl get secret ...).',
        validate: function (v, g, add) {
          if (v.mode === 'certmanager') {
            if (!String(v.issuer).trim()) add('issuer', 'issuer name is required');
            if (String(v.email).indexOf('@') < 1) add('email', 'enter the ACME registration email');
            var doms = String(v.certDomains || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            if (!doms.length) { doms = [String(g('ingress', 'host') || '').trim()]; }
            if (!doms.length || !doms.every(function (d) { return DOMAIN_RE.test(d); }))
              add('certDomains', 'at least one valid domain is required');
            if (!NAME_RE.test(v.certSecret)) add('certSecret', 'must be a DNS-1123 label');
          }
        },
        gen: function (v, g, c) {
          if (v.mode !== 'certmanager') return null;
          var doms = String(v.certDomains || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
          if (!doms.length) doms = [String(g('ingress', 'host') || 'app.example.com').trim()];
          var server = v.leEnv === 'staging'
            ? 'https://acme-staging-v02.api.letsencrypt.org/directory'
            : 'https://acme-v02.api.letsencrypt.org/directory';
          var docs = [];
          var cert = L(
            'apiVersion: cert-manager.io/v1', 'kind: Certificate',
            'metadata:', '  name: ' + q(v.certName), '  namespace: ' + q(c.ns()),
            'spec:', '  secretName: ' + q(v.certSecret),
            '  dnsNames:',
            doms.map(function (d) { return '  - ' + q(d); }),
            '  issuerRef:', '    name: ' + q(v.issuer), '    kind: ' + v.issuerKind);
          docs.push(cert.join('\n'));
          if (v.makeIssuer) {
            var iss = L(
              'apiVersion: cert-manager.io/v1', 'kind: ' + v.issuerKind,
              'metadata:', '  name: ' + q(v.issuer),
              v.issuerKind === 'Issuer' ? '  namespace: ' + q(c.ns()) : null,
              'spec:', '  acme:',
              '    email: ' + q(v.email),
              '    server: ' + q(server),
              '    privateKeySecretRef:', '      name: ' + q(v.issuer) + '-account-key',
              '    solvers:',
              '    - http01:', '        ingress:', '          class: nginx');
            docs.push(iss.filter(Boolean).join('\n'));
          }
          return docs.join('\n---\n');
        }
      }
    };

    /* ---------- presets ---------- */
    var PRESETS = {
      'basic-web':       { res: ['deployment'] },
      'web-service':     { res: ['deployment', 'service'] },
      'web-ingress':     { res: ['deployment', 'service', 'ingress'] },
      'production-web':  { res: ['deployment', 'service', 'ingress', 'configmap', 'secret', 'tls'],
                           patch: { general: { ns: 'production' }, deployment: { replicas: 3 } } },
      'fullstack':       { res: ['deployment', 'service', 'ingress', 'configmap', 'secret'],
                           patch: { general: { ns: 'production' } } },
      'app-config-secret': { res: ['deployment', 'configmap', 'secret'] },
      'app-ingress-tls': { res: ['deployment', 'service', 'ingress', 'tls'] },
      'prod-hpa':        { res: ['deployment', 'service', 'hpa'],
                           patch: { general: { ns: 'production' }, hpa: { min: 2, max: 8 } } }
    };

    var DEFAULT_KV = {
      cm: [{ k: 'NODE_ENV', v: 'production' }, { k: 'LOG_LEVEL', v: 'info' }],
      sec: [{ k: 'DATABASE_URL', v: 'postgres://app:s3cret@db:5432/app' }, { k: 'JWT_SECRET', v: 'change-me-please' }]
    };

    /* ---------- getters ---------- */
    function fieldDef(res, fid) {
      if (res === 'general') {
        if (fid === 'name') return { id: 'name', el: 'kd-name', def: 'web-api' };
        if (fid === 'ns') return { id: 'ns', el: 'kd-ns', def: 'default' };
        return null;
      }
      var fs = RES[res] && RES[res].fields;
      if (!fs) return null;
      for (var i = 0; i < fs.length; i++) if (fs[i].id === fid) return fs[i];
      return null;
    }
    function getV(res, fid) {
      var d = fieldDef(res, fid);
      if (!d) return '';
      if (!S.vals[res]) S.vals[res] = {};
      if (S.vals[res][fid] !== undefined) return S.vals[res][fid];
      return d.def !== undefined ? d.def : '';
    }
    function setV(res, fid, val) {
      if (!S.vals[res]) S.vals[res] = {};
      S.vals[res][fid] = val;
    }
    function sel(res) { return !!S.res[res]; }
    function ctx() {
      return {
        sel: sel,
        g: getV,
        ns: function () { return String(getV('general', 'ns')).trim() || 'default'; }
      };
    }
    function kvRows(key) { return S.kv[key]; }

    /* ---------- derivation ---------- */
    function syncDerived() {
      RES_ORDER.forEach(function (rid) {
        var fs = RES[rid].fields;
        if (!fs) return;
        fs.forEach(function (f) {
          if (!f.derive) return;
          if (!sel(rid) && rid !== 'general') {
            /* still compute lazily through getV at read time; nothing stored */
            return;
          }
          if (!S.touched[rid + '.' + f.id]) setV(rid, f.id, f.derive(getV, ctx()));
        });
      });
    }

    /* ---------- validation ---------- */
    function validateAll() {
      var errs = [];
      function push(fid, res, msg) { errs.push({ fid: fid, res: res, msg: msg }); }
      if (!NAME_RE.test(getV('general', 'name')))
        push('name', 'general', 'application name must be a DNS-1123 label (lowercase alphanumerics and "-")');
      if (!NAME_RE.test(ctx().ns()))
        push('ns', 'general', 'namespace must be a DNS-1123 label');
      RES_ORDER.forEach(function (rid) {
        if (!sel(rid)) return;
        var def = RES[rid];
        var v = {};
        def.fields.forEach(function (f) { v[f.id] = getV(rid, f.id); });
        def.validate(v, getV, function (fid, msg) { push(fid, rid, def.label + ': ' + msg); }, kvRows(def.kvKey || ''));
      });
      return errs;
    }

    /* ---------- YAML assembly ---------- */
    function buildDocs() {
      var docs = [];
      RES_ORDER.forEach(function (rid) {
        if (!sel(rid)) return;
        var def = RES[rid];
        if (rid === 'tls' && getV('tls', 'mode') === 'existing') {
          docs.push({
            id: rid,
            yaml: L('# Reference-only: no manifest emitted for an existing TLS secret.',
                    '# Expected in namespace ' + q(ctx().ns()) + ':',
                    '#   kubectl get secret ' + q(getV('tls', 'secret')) + ' -n ' + q(ctx().ns())),
            notice: true
          });
          return;
        }
        var v = {};
        def.fields.forEach(function (f) { v[f.id] = getV(rid, f.id); });
        var y = def.gen(v, getV, ctx(), kvRows(def.kvKey || ''));
        if (y) docs.push({ id: rid, yaml: y });
      });
      return docs;
    }

    function paintCode(yaml) {
      var lines = yaml.split('\n');
      $('kd-out').innerHTML = lines.map(function (ln) {
        return '<span class="dgl">' + TB.highlight(ln, 'yaml') + '</span>';
      }).join('\n');
    }

    function paint() {
      syncDerived();
      var box = $('kg-errors');
      var errs = validateAll();
      var anySel = RES_ORDER.some(sel);

      /* inline field errors */
      document.querySelectorAll('#kg-fields .field').forEach(function (el) {
        el.classList.remove('invalid');
        var m = el.querySelector('.fmsg');
        if (m) m.textContent = '';
      });
      errs.forEach(function (e) {
        if (!e.fid) return;
        var def = fieldDef(e.res, e.fid);
        if (!def) return;
        var elId = def.el || ('kg-' + e.res + '-' + e.fid);
        var inp = $(elId);
        if (!inp) return;
        var wrap = inp.closest('.field');
        if (!wrap) return;
        wrap.classList.add('invalid');
        var m = wrap.querySelector('.fmsg');
        if (m) m.textContent = e.msg.replace(/^[^:]+:\s*/, '');
      });

      if (!anySel) {
        box.hidden = true;
        $('kg-tabs').innerHTML = '';
        $('kg-file-label').textContent = '-';
        $('kd-out').innerHTML = '<span class="dgl">' + TB.highlight('# tick at least one resource above to generate manifests', 'yaml') + '</span>';
        return;
      }

      var docs = buildDocs();
      var byId = {};
      docs.forEach(function (d) { byId[d.id] = d; });
      if (S.tab !== 'all' && !byId[S.tab]) S.tab = 'all';

      /* tabs */
      var tabs = $('kg-tabs');
      tabs.innerHTML = '';
      var mkTab = function (id, label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tab' + (S.tab === id ? ' on' : '');
        b.setAttribute('data-tab', id);
        b.setAttribute('role', 'tab');
        b.textContent = label;
        tabs.appendChild(b);
      };
      mkTab('all', 'All (' + docs.length + ')');
      docs.forEach(function (d) {
        mkTab(d.id, RES[d.id].short || RES[d.id].label);
      });

      /* active content */
      var label = $('kg-file-label');
      var dlBtn = document.querySelector('[data-dl-target="kd-out"]');
      if (S.tab !== 'all' && !byId[S.tab]) S.tab = 'all';

      if (errs.length) {
        box.hidden = false;
        var msgs = errs.map(function (e) { return e.msg; }).slice(0, 4).join('; ');
        box.innerHTML = '<i class="mdi mdi-alert-circle-outline"></i> ' +
          errs.length + ' configuration problem' + (errs.length > 1 ? 's' : '') + ': ' +
          esc2(msgs) + (errs.length > 4 ? ' &hellip;' : '') +
          '. Preview keeps the last valid result.';
        if (S.lastGood !== null) { paintCode(S.lastGood.all); }
      } else {
        box.hidden = true;
        var real = docs.filter(function (d) { return !d.notice; });
        var combined = real.map(function (d) { return d.yaml; }).join('\n---\n');
        S.lastGood = { all: combined, byId: byId };
        if (S.tab === 'all') {
          paintCode(combined || '# nothing to emit for the current selection');
          label.textContent = 'manifests.yaml';
          if (dlBtn) dlBtn.setAttribute('data-dl-name', 'manifests.yaml');
        } else {
          paintCode(byId[S.tab].yaml);
          label.textContent = RES[S.tab].file;
          if (dlBtn) dlBtn.setAttribute('data-dl-name', RES[S.tab].file);
        }
      }
    }

    /* ---------- rendering ---------- */
    function makeFieldEl(f, rid) {
      var wrap = document.createElement('div');
      wrap.className = 'field' + (f.half ? ' half' : '');
      var elId = f.el || ('kg-' + rid + '-' + f.id);
      if (f.type === 'check') {
        wrap.className += ' check-field';
        wrap.innerHTML = '<label class="check-row"><input type="checkbox" id="' + elId + '"' +
          (getV(rid, f.id) ? ' checked' : '') + '> ' + esc2(f.label) + '</label>' +
          (f.hint ? '<span class="fhint">' + esc2(f.hint) + '</span>' : '') + '<span class="fmsg"></span>';
      } else if (f.type === 'chip') {
        wrap.className = 'chips';
        wrap.style.marginTop = '6px';
        wrap.innerHTML = '<button type="button" class="chip' + (getV(rid, f.id) ? ' on' : '') + '" id="' + elId + '">' +
          esc2(f.label) + '</button>';
      } else {
        var lab = '<label for="' + elId + '">' + esc2(f.label) + '</label>';
        var ctl;
        var val = getV(rid, f.id);
        if (f.type === 'select') {
          var opts = f.opts.map(function (o) {
            var ov = Array.isArray(o) ? o[0] : o, ol = Array.isArray(o) ? o[1] : o;
            return '<option value="' + esc2(ov) + '"' + (String(val) === String(ov) ? ' selected' : '') + '>' + esc2(ol) + '</option>';
          }).join('');
          ctl = '<select id="' + elId + '">' + opts + '</select>';
        } else if (f.type === 'textarea') {
          ctl = '<textarea id="' + elId + '" rows="3" spellcheck="false" placeholder="' + esc2(f.ph || '') + '">' + esc2(val) + '</textarea>';
        } else if (f.type === 'number') {
          ctl = '<input type="number" id="' + elId + '" value="' + esc2(val) + '"' +
            (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.max !== undefined ? ' max="' + f.max + '"' : '') + '>';
        } else {
          ctl = '<input type="text" id="' + elId + '" value="' + esc2(val) + '" spellcheck="false" placeholder="' + esc2(f.ph || '') + '">';
        }
        wrap.innerHTML = lab + ctl + '<span class="fmsg"></span>';
      }
      return wrap;
    }

    function kvRowHtml(key, row, idx) {
      return '<div class="kv-row" data-kvkey="' + key + '" data-idx="' + idx + '">' +
        '<input type="text" class="kv-k" value="' + esc2(row.k) + '" placeholder="KEY" spellcheck="false">' +
        '<input type="text" class="kv-v" value="' + esc2(row.v) + '" placeholder="value" spellcheck="false">' +
        '<button type="button" class="kv-del" title="Remove"><i class="mdi mdi-close"></i></button>' +
        '</div>';
    }

    function renderCards() {
      var host = $('kg-fields');
      host.innerHTML = '';

      /* general strip (always visible) */
      var generalCard = document.createElement('section');
      generalCard.className = 'kg-card';
      generalCard.setAttribute('data-res', 'general');
      generalCard.innerHTML =
        '<h3><i class="mdi mdi-cog-outline"></i> General</h3>' +
        '<div class="grid3">' +
        '<div class="field"><label for="kd-name">Application name</label>' +
        '<input type="text" id="kd-name" spellcheck="false"><span class="fmsg"></span></div>' +
        '<div class="field"><label for="kd-ns">Namespace</label>' +
        '<input type="text" id="kd-ns" spellcheck="false"><span class="fmsg"></span></div>' +
        '</div>';
      host.appendChild(generalCard);
      $('kd-name').value = getV('general', 'name');
      $('kd-ns').value = getV('general', 'ns');

      RES_ORDER.forEach(function (rid) {
        if (!sel(rid)) return;
        var def = RES[rid];
        var card = document.createElement('section');
        card.className = 'kg-card';
        card.setAttribute('data-res', rid);
        var h = '<h3><i class="mdi ' + def.icon + '"></i> ' + esc2(def.label) + ' Configuration</h3>';

        if (def.note) h += '<p class="note-box">' + def.note + '</p>';
        if (def.warn) h += '<p class="note-box warn">' + def.warn + '</p>';

        h += '<div class="grid3"></div>';
        card.innerHTML = h;
        var grid = card.querySelector('.grid3');
        def.fields.forEach(function (f) {
          if (f.show && !f.show(function (r, fid) { return getV(r || rid, fid || f.id); })) return;
          grid.appendChild(makeFieldEl(f, rid));
        });

        if (def.kvKey) {
          var rows = S.kv[def.kvKey];
          var kvBox = document.createElement('div');
          kvBox.className = 'field kv-editor';
          kvBox.innerHTML = '<label>' + esc2(def.isSecret ? 'Secret key/value pairs (plain text)' : 'Key/value pairs') + '</label>' +
            '<div class="kv-rows">' +
            rows.map(function (r, i) { return kvRowHtml(def.kvKey, r, i); }).join('') +
            '</div>' +
            '<button type="button" class="btn-ghost kv-add" data-kvkey="' + def.kvKey + '"><i class="mdi mdi-plus"></i> Add pair</button>';
          grid.appendChild(kvBox);
        }

        if (rid === 'tls') {
          var modeVal = getV('tls', 'mode');
          var noteEl = document.createElement('p');
          noteEl.className = 'note-box';
          noteEl.innerHTML = modeVal === 'existing' ? esc2(def.existingNote) :
            'Certificate CRD generated for cert-manager &ge; 1.0. The Ingress does not need cert-manager annotations when a Certificate resource exists.';
          card.appendChild(noteEl);
        }

        host.appendChild(card);
      });
    }

    /* refresh values of derived inputs in place (no DOM rebuild) */
    function refreshDerivedInputs() {
      RES_ORDER.forEach(function (rid) {
        if (!sel(rid)) return;
        RES[rid].fields.forEach(function (f) {
          if (!f.derive) return;
          if (S.touched[rid + '.' + f.id]) return;
          var el = $(f.el || ('kg-' + rid + '-' + f.id));
          if (el) el.value = getV(rid, f.id);
        });
      });
    }

    /* ---------- presets ---------- */
    function applyPreset(id) {
      var p = PRESETS[id] || PRESETS['web-service'];
      S.preset = id;
      S.tab = 'all';
      S.lastGood = null;
      S.touched = {};
      S.vals = {};
      S.res = {};
      RES_ORDER.forEach(function (rid) { S.res[rid] = false; });
      p.res.forEach(function (rid) { S.res[rid] = true; });
      S.kv.cm = DEFAULT_KV.cm.map(function (r) { return { k: r.k, v: r.v }; });
      S.kv.sec = DEFAULT_KV.sec.map(function (r) { return { k: r.k, v: r.v }; });
      if (p.patch) {
        Object.keys(p.patch).forEach(function (rid) {
          Object.keys(p.patch[rid]).forEach(function (fid) {
            setV(rid, fid, p.patch[rid][fid]);
            S.touched[rid + '.' + fid] = true;
          });
        });
      }
      syncResourceChecks();
      renderCards();
      paint();
    }

    function syncResourceChecks() {
      RES_ORDER.forEach(function (rid) {
        if (rid === 'tls') return;
        var cb = $(rid === 'service' ? 'kd-svc' : 'kg-res-' + rid);
        if (cb) cb.checked = sel(rid);
      });
      syncTlsSeg();
    }

    /* ---------- events ---------- */
    $('kg-fields').addEventListener('input', function (ev) {
      var t = ev.target;
      var card = t.closest('.kg-card');
      var kvRow = t.closest('.kv-row');
      if (kvRow) {
        var key = kvRow.getAttribute('data-kvkey');
        var idx = parseInt(kvRow.getAttribute('data-idx'), 10);
        if (t.classList.contains('kv-k')) S.kv[key][idx].k = t.value;
        else S.kv[key][idx].v = t.value;
        paint();
        return;
      }
      if (!card) return;
      var rid = card.getAttribute('data-res');
      var fidMap = { 'kd-name': 'name', 'kd-ns': 'ns' };
      var fid = t.id ? (ELSID(t.id, rid) || fidMap[t.id]) : null;
      if (!fid) return;
      setV(rid, fid, t.value);
      S.touched[rid + '.' + fid] = true;
      /* any source change re-derives untouched dependent fields everywhere */
      RES_ORDER.forEach(function (rr) {
        if (!sel(rr)) return;
        RES[rr].fields.forEach(function (f) {
          if (!f.derive) return;
          if (S.touched[rr + '.' + f.id]) return;
          setV(rr, f.id, f.derive(getV, ctx()));
        });
      });
      refreshDerivedInputs();
      paint();
    });

    function ELSID(elId, rid) {
      for (var rid2 in RES) {
        var fs = RES[rid2].fields;
        for (var i = 0; i < fs.length; i++) {
          var eid = fs[i].el || ('kg-' + rid2 + '-' + fs[i].id);
          if (eid === elId) return fs[i].id;
        }
      }
      return null;
    }

    $('kg-fields').addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.tagName !== 'SELECT' && t.type !== 'checkbox') return;
      var card = t.closest('.kg-card');
      if (!card) return;
      var rid = card.getAttribute('data-res');
      var fid = ELSID(t.id, rid);
      if (!fid) return;
      setV(rid, fid, t.type === 'checkbox' ? t.checked : t.value);
      S.touched[rid + '.' + fid] = true;
      renderCards();
      paint();
    });

    $('kg-fields').addEventListener('click', function (ev) {
      var t = ev.target.closest('button');
      if (!t) return;
      if (t.classList.contains('kv-del')) {
        var row = t.closest('.kv-row');
        var key = row.getAttribute('data-kvkey');
        S.kv[key].splice(parseInt(row.getAttribute('data-idx'), 10), 1);
        renderCards();
        paint();
        return;
      }
      if (t.classList.contains('kv-add')) {
        S.kv[t.getAttribute('data-kvkey')].push({ k: '', v: '' });
        renderCards();
        paint();
        return;
      }
      if (t.classList.contains('chip')) {
        t.classList.toggle('on');
        var card = t.closest('.kg-card');
        var fid = ELSID(t.id, card.getAttribute('data-res'));
        setV(card.getAttribute('data-res'), fid, t.classList.contains('on'));
        renderCards();
        paint();
      }
    });

    $('kg-tabs').addEventListener('click', function (ev) {
      var b = ev.target.closest('.tab');
      if (!b) return;
      S.tab = b.getAttribute('data-tab');
      paint();
    });

    RES_ORDER.forEach(function (rid) {
      if (rid === 'tls') return; /* driven by the segmented SSL/TLS toggle */
      var cb = $(rid === 'service' ? 'kd-svc' : 'kg-res-' + rid);
      if (!cb) return;
      cb.addEventListener('change', function () {
        S.res[rid] = cb.checked;
        if (!cb.checked && S.tab === rid) S.tab = 'all';
        renderCards();
        paint();
      });
    });

    $('kg-all').addEventListener('click', function () {
      RES_ORDER.forEach(function (rid) { S.res[rid] = true; });
      syncResourceChecks();
      renderCards();
      paint();
    });
    $('kg-none').addEventListener('click', function () {
      RES_ORDER.forEach(function (rid) { S.res[rid] = false; });
      S.tab = 'all';
      syncResourceChecks();
      renderCards();
      paint();
    });


    /* SSL/TLS segmented control - app state is the single source of truth.
       Clicking a segment applies that exact state; clicking anywhere else on
       the card flips to the opposite state. No checkbox involved. */
    function setTlsEnabled(on) {
      if (sel('tls') === on) return;
      S.res.tls = on;
      if (!on && S.tab === 'tls') S.tab = 'all';
      syncTlsSeg();
      renderCards();
      paint();
    }
    function syncTlsSeg() {
      var on = sel('tls');
      var bOn = $('kg-tls-on'), bOff = $('kg-tls-off');
      if (bOn) {
        bOn.classList.toggle('on', on);
        bOn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      if (bOff) {
        bOff.classList.toggle('on', !on);
        bOff.setAttribute('aria-pressed', !on ? 'true' : 'false');
      }
    }
    $('kg-tls-toggle').addEventListener('click', function (ev) {
      var btn = ev.target.closest('.seg-btn');
      if (btn) setTlsEnabled(btn.id === 'kg-tls-on');
      else setTlsEnabled(!sel('tls'));
    });

    $('kg-preset').addEventListener('change', function () {
      applyPreset(this.value);
    });

    $('kg-generate').addEventListener('click', function () {
      paint();
      var outEl = $('kd-out');
      if (typeof outEl.scrollIntoView === 'function') outEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('kg-reset').addEventListener('click', function () {
      applyPreset(S.preset);
    });

    /* ---------- boot ---------- */
    syncResourceChecks();
    applyPreset(S.preset);
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
