/* ============================================================
   DevOps Toolbox - Docker category
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TB = window.TB;
  if (!TB) return;

  TB.wireOutputButtons();
  TB.wireAccordions();




  /* ============================================================
     1. Dockerfile generator
     ============================================================ */
  (function () {
    if (!$('dg-runtime')) return;

  var dgOut = $('dg-out');
  ['dg-runtime', 'dg-port', 'dg-user'].forEach(function (id) {
    $(id).addEventListener('input', renderDockerfile);
  });
  ['dg-multistage', 'dg-healthcheck', 'dg-nonroot'].forEach(function (id) {
    $(id).addEventListener('click', function () { $(id).classList.toggle('on'); renderDockerfile(); });
  });

  function healthLine(port) {
    return 'HEALTHCHECK --interval=30s --timeout=3s \\\n' +
           '  CMD wget -qO- http://127.0.0.1:' + port + '/healthz || exit 1';
  }

  function dockerfileTemplate(rt, o) {
    var P = o.port, U = o.user || 'appuser';
    switch (rt) {
      case 'node':
        if (!o.multi) return [
          'FROM node:22-alpine',
          'ENV NODE_ENV=production',
          'WORKDIR /app',
          '',
          'COPY package*.json ./',
          'RUN npm ci --omit=dev',
          '',
          'COPY . .',
          o.nonroot ? '\nUSER ' + U : '',
          'EXPOSE ' + P,
          o.health ? '\n' + healthLine(P) : '',
          '',
          'CMD ["node", "server.js"]'
        ].join('\n').replace(/\n\n+/, '\n\n');
        return [
          '# ---- deps ----',
          'FROM node:22-alpine AS deps',
          'WORKDIR /app',
          'COPY package*.json ./',
          'RUN npm ci --omit=dev',
          '',
          '# ---- build ----',
          'FROM node:22-alpine AS build',
          'WORKDIR /app',
          'COPY package*.json ./',
          'RUN npm ci',
          'COPY . .',
          'RUN npm run build',
          '',
          '# ---- runtime ----',
          'FROM node:22-alpine',
          'ENV NODE_ENV=production',
          'WORKDIR /app',
          'COPY --from=deps /app/node_modules ./node_modules',
          'COPY --from=build /app/dist ./dist',
          o.nonroot ? '\nUSER ' + U : '',
          'EXPOSE ' + P,
          o.health ? '\n' + healthLine(P) : '',
          '',
          'CMD ["node", "server.js"]'
        ].join('\n');

      case 'python':
        return [
          'FROM python:3.12-slim',
          'ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1',
          'WORKDIR /app',
          '',
          'COPY requirements.txt ./',
          'RUN pip install --no-cache-dir -r requirements.txt',
          '',
          'COPY . .',
          o.nonroot ? '\nRUN useradd -m ' + U + ' && chown -R ' + U + ' /app\nUSER ' + U : '',
          'EXPOSE ' + P,
          o.health ? '\nHEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:' + P + '/healthz || exit 1' : '',
          '',
          'CMD ["gunicorn", "-b", "0.0.0.0:' + P + '", "app:app"]'
        ].join('\n');

      case 'go':
        if (!o.multi) return [
          'FROM golang:1.23-alpine',
          'WORKDIR /src',
          'COPY go.mod go.sum ./',
          'RUN go mod download',
          'COPY . .',
          'RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /bin/app ./cmd/app',
          o.nonroot ? '\nUSER nobody' : '',
          'EXPOSE ' + P,
          o.health ? '\n' + healthLine(P) : '',
          '',
          'CMD ["/bin/app"]'
        ].join('\n');
        return [
          '# ---- build ----',
          'FROM golang:1.23-alpine AS build',
          'WORKDIR /src',
          'COPY go.mod go.sum ./',
          'RUN go mod download',
          'COPY . .',
          'RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /bin/app ./cmd/app',
          '',
          '# ---- runtime ----',
          'FROM alpine:3.20',
          'RUN adduser -D -u 10001 ' + U,
          'COPY --from=build /bin/app /bin/app',
          'USER ' + U,
          'EXPOSE ' + P,
          o.health ? '\nHEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:' + P + '/healthz || exit 1' : '',
          '',
          'CMD ["/bin/app"]'
        ].join('\n');

      case 'static':
        return [
          'FROM nginx:1.27-alpine',
          '',
          'COPY site/ /usr/share/nginx/html/',
          'COPY nginx.conf /etc/nginx/conf.d/default.conf',
          'EXPOSE ' + P,
          o.health ? '\nHEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:' + P + '/ >/dev/null || exit 1' : ''
        ].join('\n') + (o.nonroot ? '\n# note: nginx master needs root; workers drop privileges automatically' : '');

      case 'java':
        return [
          'FROM eclipse-temurin:21-jre-alpine',
          'WORKDIR /app',
          '',
          'COPY target/app.jar app.jar',
          o.nonroot ? '\nRUN addgroup -S ' + U + ' && adduser -S ' + U + ' -G ' + U + ' && chown -R ' + U + ' /app\nUSER ' + U : '',
          'EXPOSE ' + P,
          o.health ? '\nHEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:' + P + '/actuator/health | grep -q UP || exit 1' : '',
          '',
          'ENTRYPOINT ["java", "-jar", "/app/app.jar"]'
        ].join('\n');
    }
    return '';
  }

  function renderDockerfile() {
    var opts = {
      port: parseInt($('dg-port').value, 10) || 3000,
      user: $('dg-user').value.trim() || 'appuser',
      multi: $('dg-multistage').classList.contains('on'),
      health: $('dg-healthcheck').classList.contains('on'),
      nonroot: $('dg-nonroot').classList.contains('on')
    };
    dgOut.innerHTML = TB.highlight(dockerfileTemplate($('dg-runtime').value, opts), 'dockerfile');
  }
  renderDockerfile();
  })();


  /* ============================================================
     2. Compose file generator
     ============================================================ */
  (function () {
    if (!$('cg-add')) return;

  var cgList = $('cg-services'), cgOut = $('cg-out');

  function svcCard() {
    var card = document.createElement('div');
    card.className = 'svc-card';
    card.innerHTML =
      '<button type="button" class="rm" title="Remove service"><i class="mdi mdi-close"></i></button>' +
      '<h3>service</h3>' +
      '<div class="grid2">' +
        '<div class="field"><label>name</label><input class="s-name" value="api" spellcheck="false"></div>' +
        '<div class="field"><label>image</label><input class="s-image" value="ghcr.io/acme/api:latest" spellcheck="false"></div>' +
        '<div class="field" style="grid-column:1/-1"><label>ports host:container (comma sep)</label><input class="s-ports" placeholder="8000:8000" spellcheck="false"></div>' +
        '<div class="field" style="grid-column:1/-1"><label>volumes (comma sep)</label><input class="s-volumes" placeholder="./data:/data" spellcheck="false"></div>' +
        '<div class="field" style="grid-column:1/-1"><label>env KEY=value (comma sep)</label><input class="s-env" placeholder="LOG_LEVEL=info" spellcheck="false"></div>' +
      '</div>';
    card.querySelector('.rm').addEventListener('click', function () {
      card.remove();
      renderCompose();
      if (!cgList.children.length) svcCard();
    });
    card.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('input', renderCompose);
    });
    cgList.appendChild(card);
    return card;
  }


  function composeObject() {
    var services = {};
    cgList.querySelectorAll('.svc-card').forEach(function (card, i) {
      var name = card.querySelector('.s-name').value.trim() || ('service' + (i + 1));
      var svc = { image: card.querySelector('.s-image').value.trim() || 'alpine:3.20', restart: 'unless-stopped' };
      var ports = TB.splitCsv(card.querySelector('.s-ports').value);
      var vols = TB.splitCsv(card.querySelector('.s-volumes').value);
      var env = TB.splitCsv(card.querySelector('.s-env').value);
      if (ports.length) svc.ports = ports;
      if (vols.length) svc.volumes = vols;
      if (env.length) {
        var map = {};
        env.forEach(function (pair) {
          var idx = pair.indexOf('=');
          if (idx > 0) map[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
        });
        if (Object.keys(map).length) svc.environment = map;
      }
      services[name] = svc;
    });
    return { services: services };
  }

  function renderCompose() {
    var obj = composeObject();
    cgOut.innerHTML = TB.highlight(TB.toYaml(obj), 'yaml');
  }
  $('cg-add').addEventListener('click', svcCard);
  svcCard();
  renderCompose();
  })();


  /* ============================================================
     3. docker run command builder
     ============================================================ */
  (function () {
    if (!$('dr-image')) return;

  ['dr-image', 'dr-name', 'dr-restart', 'dr-ports', 'dr-volumes', 'dr-env',
   'dr-network'].forEach(function (id) { $(id).addEventListener('input', renderRun); });
  ['dr-detach', 'dr-rm'].forEach(function (id) {
    $(id).addEventListener('click', function () { $(id).classList.toggle('on'); renderRun(); });
  });

  function q(s) {
    return /\s/.test(s) ? '"' + s.replace(/"/g, '\\"') + '"' : s;
  }

  function renderRun() {
    var img = $('dr-image').value.trim() || 'IMAGE';
    var args = [];
    if ($('dr-detach').classList.contains('on')) args.push('-d');
    if ($('dr-rm').classList.contains('on')) args.push('--rm');
    var name = $('dr-name').value.trim();
    if (name) args.push('--name ' + name);
    var restart = $('dr-restart').value;
    if (restart && restart !== 'no') args.push('--restart ' + restart);
    var net = $('dr-network').value.trim();
    if (net) args.push('--network ' + net);
    TB.splitCsv($('dr-ports').value).forEach(function (p) {
      if (/^[\w.\-]+:\d+$/.test(p)) args.push('-p ' + p);
    });
    TB.splitCsv($('dr-volumes').value).forEach(function (v) {
      if (/^.{1,}:.{1,}/.test(v)) args.push('-v ' + v);
    });
    TB.splitCsv($('dr-env').value).forEach(function (e) {
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(e)) args.push('-e ' + e);
    });
    var cmd = 'docker run \\\n' +
      args.map(function (a) { return '  ' + a; }).join(' \\\n') + ' \\\n' +
      '  ' + img;
    $('dr-out').innerHTML = TB.highlight(cmd, 'bash');
  }
  renderRun();
  })();


  /* ============================================================
     4. Image tag & reference tool
     ============================================================ */
  (function () {
    if (!$('tt-ref')) return;

  var TAG_RE = /^[\w][\w.-]{0,127}$/;

  function parseRef(ref) {
    ref = ref.trim();
    if (!ref) throw new Error('empty reference');
    var digest = null, tag = 'latest';
    var dIdx = ref.indexOf('@');
    if (dIdx !== -1) {
      digest = ref.slice(dIdx + 1);
      ref = ref.slice(0, dIdx);
    }
    /* find last path segment */
    var slash = ref.lastIndexOf('/');
    var tail = slash === -1 ? ref : ref.slice(slash + 1);
    var colon = tail.indexOf(':');
    if (colon !== -1) {
      tag = tail.slice(colon + 1);
      tail = tail.slice(0, colon);
      ref = slash === -1 ? tail : ref.slice(0, slash + 1) + tail;
    }
    /* registry heuristic: first segment has dot/colon/localhost and a slash follows */
    var firstSlash = ref.indexOf('/');
    var registry = null, path = ref;
    if (firstSlash !== -1) {
      var head = ref.slice(0, firstSlash);
      if (head === 'localhost' || /[:.]/.test(head)) {
        registry = head;
        path = ref.slice(firstSlash + 1);
      }
    } else if (/[:.]/.test(ref) && !TAG_RE.test(ref)) {
      registry = ref; path = '';
    }
    return { registry: registry || '(docker hub)', namespace: path, tag: tag, digest: digest };
  }

  function renderTagParse() {
    var errEl = $('tt-error'), kvEl = $('tt-kv'), outRef = $('tt-out-ref');
    var ref = $('tt-ref').value.trim();
    errEl.hidden = true;
    try {
      var p = parseRef(ref);
      kvEl.hidden = false;
      TB.fillKv(kvEl, [
        ['registry', p.registry],
        ['namespace / repo', p.namespace],
        ['tag', p.tag],
        ['digest', p.digest || '-'],
        ['effective tag', p.namespace ? (p.namespace.split('/').pop() + ':' + p.tag) : p.tag]
      ]);
      outRef.value = '';
    } catch (e) {
      kvEl.hidden = true;
      errEl.textContent = String(e.message);
      errEl.hidden = false;
    }
    /* build side */
    var reg = $('tt-reg').value.trim().replace(/\/+$/, '');
    var ns = $('tt-ns').value.trim().replace(/^\/+|\/+$/g, '');
    var tg = $('tt-tag').value.trim() || 'latest';
    if (!reg && !ns) { outRef.value = ''; return; }
    var built = (reg ? reg + '/' : '') + ns + ':' + tg;
    if (!ns && reg) built = reg.replace(/:.*/, '') + ':' + tg;
    var bad = !TAG_RE.test(tg) ? '  # invalid tag charset' : '';
    outRef.value = built + bad;
  }
  ['tt-ref', 'tt-reg', 'tt-ns', 'tt-tag'].forEach(function (id) {
    $(id).addEventListener('input', renderTagParse);
  });
  renderTagParse();
  })();


  /* ============================================================
     5. Dockerfile linter
     ============================================================ */
  (function () {
    if (!$('li-in')) return;

  var SECRET_ENV = /pass(word)?|secret|token|api[_-]?key|private[_-]?key|credential/i;

  function lintDockerfile(src) {
    var findings = [];
    var lines = src.split('\n');
    function add(sev, line, msg, fix) { findings.push({ sev: sev, line: line, msg: msg, fix: fix }); }
    var hasUser = false, hasHealthcheck = false, fromCount = 0;

    lines.forEach(function (raw, i) {
      var ln = i + 1;
      var line = raw.replace(/\s+#.*$/, '');
      if (!line.trim() || /^\s*#/.test(line)) return;
      var up = line.toUpperCase();

      if (/^FROM\b/.test(up)) {
        fromCount++;
        var m = line.match(/^FROM\s+(\S+)/i);
        if (m) {
          var base = m[1];
          if (base.indexOf(':') === -1 && base.indexOf('@') === -1)
            add('err', ln, 'FROM "' + base + '" has no tag — builds are not reproducible', 'pin an explicit tag, e.g. ' + base + ':1.2-alpine');
          else if (/:(latest|)\s*$/i.test(base) === true && /:latest/i.test(base))
            add('warn', ln, 'base image tag is :latest', 'pin a specific version');
        }
      }
      if (/^USER\s+\S+/i.test(up)) hasUser = true;
      if (/^HEALTHCHECK\b/.test(up)) hasHealthcheck = true;
      if (/^ADD\s/i.test(up))
        add('warn', ln, 'ADD used for a plain copy', 'prefer COPY unless you need tar auto-extraction or remote URL');
      if (/curl[^\n]*\|\s*(ba)?sh|wget[^\n]*\|\s*(ba)?sh/i.test(line))
        add('err', ln, 'piping curl/wget straight into a shell executes unverified code', 'download, verify checksum, then run');
      if (/\bsudo\b/.test(up))
        add('warn', ln, 'sudo inside a container is usually pointless', 'containers already control their user; drop sudo');
      if (/apt-get\s+upgrade|apk\s+upgrade|dist-upgrade/i.test(line))
        add('warn', ln, 'uncontrolled upgrade in build layer breaks reproducibility', 'rebuild images on schedule instead of upgrading in-place');
      if (/COPY\s.*\.git[\s"']|$/.test(line) && /\.git(\s|"|')/.test(line))
        add('warn', ln, '.git directory copied into the image leaks history and credentials', 'use .dockerignore to exclude .git');
      var envM = line.match(/^ENV\s+([A-Za-z_][A-Za-z0-9_]*)=(.+)$/i);
      if (envM && SECRET_ENV.test(envM[1]))
        add('err', ln, 'ENV ' + envM[1] + ' looks like a secret baked into layers', 'inject at runtime via secrets manager or --env-file');
      if (/npm\s+install(?!\s+ci)/.test(line))
        add('info', ln, 'npm install does not respect package-lock.json deterministically', 'use npm ci in CI/production images');
      if (/pip\s+install(?!.*(==|~=|>=|-r))/i.test(line))
        add('info', ln, 'unpinned pip installs drift over time', 'pin versions or use a requirements.txt with hashes');
    });

    if (fromCount === 0)
      add('err', 0, 'no FROM instruction found', 'every Dockerfile starts with FROM <base>:<tag>');
    if (!hasUser && fromCount > 0)
      add('warn', 0, 'no USER instruction — container runs as root', 'add a dedicated user and switch before CMD');
    if (!hasHealthcheck)
      add('info', 0, 'no HEALTHCHECK — orchestrators cannot detect hung containers', 'add HEALTHCHECK hitting your health endpoint');

    return findings;
  }

  function renderLint() {
    var src = $('li-in').value;
    var box = $('li-findings');
    if (!src.trim()) { box.innerHTML = ''; return; }
    var fnd = lintDockerfile(src);
    if (!fnd.length) {
      box.innerHTML = '<div class="finding f-info"><span class="badge ok">CLEAN</span> no issues detected</div>';
      return;
    }
    var label = { err: ['ERROR', 'f-err'], warn: ['WARN', 'f-warn'], info: ['INFO', 'f-info'] };
    box.innerHTML = fnd.map(function (f) {
      return '<div class="finding ' + label[f.sev][1] + '">' +
        '<div class="meta"><span class="badge ' + (f.sev === 'err' ? 'err' : f.sev === 'warn' ? 'warn' : '') + '">' +
        label[f.sev][0] + '</span> ' + (f.line ? 'line ' + f.line : 'general') + '</div>' +
        '<div>' + TB.esc(f.msg) + '</div>' +
        '<div class="mono-label">fix: ' + TB.esc(f.fix) + '</div></div>';
    }).join('');
  }
  $('li-in').addEventListener('input', renderLint);
  })();

})();
