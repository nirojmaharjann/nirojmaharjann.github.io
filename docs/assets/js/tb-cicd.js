/* ============================================================
   DevOps Toolbox - CI/CD category
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TB = window.TB;
  if (!TB) return;

  TB.wireOutputButtons();
  TB.wireAccordions();





  /* ============================================================
     1. GitHub Actions workflow generator
     ============================================================ */
  (function () {
    if (!$('ga-stack')) return;

  ['ga-stack', 'ga-version', 'ga-branch', 'ga-registry'].forEach(function (id) {
    $(id).addEventListener('input', renderActions);
  });
  $('ga-stack').addEventListener('change', renderActions);
  ['ga-lint', 'ga-test'].forEach(function (id) {
    $(id).addEventListener('click', function () { $(id).classList.toggle('on'); renderActions(); });
  });

  function renderActions() {
    var stack = $('ga-stack').value;
    var ver = $('ga-version').value.trim() || '22';
    var branches = $('ga-branch').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var lint = $('ga-lint').classList.contains('on');
    var test = $('ga-test').classList.contains('on');

    var wf = {
      name: 'CI',
      on: { push: { branches: branches }, pull_request: {} },
      permissions: { contents: 'read' },
      jobs: {}
    };
    var setup = {}, steps = [];

    if (stack === 'node') {
      wf.jobs.build = {
        'runs-on': 'ubuntu-latest',
        steps: [
          { uses: 'actions/checkout@v4' },
          { name: 'Setup Node', uses: 'actions/setup-node@v4',
            with: { 'node-version': ver, cache: 'npm' } },
          { name: 'Install', run: 'npm ci' }
        ]
      };
      var buildSteps = wf.jobs.build.steps;
      if (lint) buildSteps.push({ name: 'Lint', run: 'npm run lint' });
      if (test) buildSteps.push({ name: 'Test', run: 'npm test -- --coverage' });
      buildSteps.push({ name: 'Build', run: 'npm run build' });
    } else if (stack === 'python') {
      wf.jobs.build = {
        'runs-on': 'ubuntu-latest',
        steps: [
          { uses: 'actions/checkout@v4' },
          { name: 'Setup Python', uses: 'actions/setup-python@v5',
            with: { 'python-version': ver, cache: 'pip' } },
          { name: 'Install', run: 'pip install -r requirements.txt' }
        ]
      };
      var pySteps = wf.jobs.build.steps;
      if (lint) pySteps.push({ name: 'Lint', run: 'ruff check .' });
      if (test) pySteps.push({ name: 'Test', run: 'pytest --cov' });
    } else if (stack === 'go') {
      wf.jobs.build = {
        'runs-on': 'ubuntu-latest',
        steps: [
          { uses: 'actions/checkout@v4' },
          { name: 'Setup Go', uses: 'actions/setup-go@v5',
            with: { 'go-version': ver, 'cache-dependency-path': 'go.sum' } },
          { name: 'Build', run: 'go build ./...' }
        ]
      };
      var goSteps = wf.jobs.build.steps;
      if (lint) goSteps.splice(2, 0,
        { name: 'Lint', uses: 'golangci/golangci-lint-action@v6' });
      if (test) goSteps.push({ name: 'Test', run: 'go test ./... -race' });
    } else if (stack === 'docker-build') {
      var reg = $('ga-registry').value.trim() || 'ghcr.io/owner/image';
      wf.permissions = { contents: 'read', packages: 'write' };
      wf.jobs.docker = {
        'runs-on': 'ubuntu-latest',
        permissions: { contents: 'read', packages: 'write' },
        steps: [
          { uses: 'actions/checkout@v4' },
          { name: 'Set up Buildx', uses: 'docker/setup-buildx-action@v3' },
          { name: 'Log in to GHCR', uses: 'docker/login-action@v3',
            with: { registry: reg.split('/')[0], username: '${{ github.actor }}',
                    password: '${{ secrets.GITHUB_TOKEN }}' } },
          { name: 'Build and push', uses: 'docker/build-push-action@v6',
            with: {
              context: '.',
              push: true,
              tags: reg + ':${{ github.sha }},' + reg + ':latest',
              'cache-from': 'type=gha',
              'cache-to': 'type=gha,mode=max'
            } }
        ]
      };
    }

    $('ga-out').innerHTML = TB.highlight(TB.toYaml(wf), 'yaml');
  }
  renderActions();
  })();


  /* ============================================================
     2. Cron builder
     ============================================================ */
  (function () {
    if (!$('cr-min')) return;

  function cronExpr() {
    return [$('cr-min'), $('cr-hour'), $('cr-dom'), $('cr-mon'), $('cr-dow')]
      .map(function (el) { return el.value.trim() || '*'; }).join(' ');
  }
  function evalCron() {
    var errEl = $('cr-error'), kvEl = $('cr-kv'), nextEl = $('cr-next');
    errEl.hidden = true; kvEl.hidden = true; nextEl.hidden = true;
    var expr = cronExpr();
    var runs = TB.cronNextRuns(expr, 5);
    if (!runs) {
      errEl.textContent = '"' + expr + '" is not a valid five-field cron expression';
      errEl.hidden = false; return;
    }
    kvEl.hidden = false;
    TB.fillKv(kvEl, [['expression', expr], ['next 5 runs', '(local time below)']]);
    nextEl.hidden = false;
    nextEl.textContent = runs.map(function (d) {
      function p(n) { return String(n).padStart(2, '0'); }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }).join('\n');
  }
  ['cr-min', 'cr-hour', 'cr-dom', 'cr-mon', 'cr-dow'].forEach(function (id) {
    $(id).addEventListener('input', evalCron);
  });
  $('cr-eval').addEventListener('click', evalCron);
  evalCron();
  document.querySelectorAll('[data-cron]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.getAttribute('data-cron').split(' ');
      [$('cr-min'), $('cr-hour'), $('cr-dom'), $('cr-mon'), $('cr-dow')]
        .forEach(function (el, i) { el.value = f[i]; });
      evalCron();
    });
  });
  })();


  /* ============================================================
     3. SemVer checker
     ============================================================ */
  (function () {
    if (!$('sv-a')) return;

  /* regex from semver.org, lightly compacted */
  var SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

  function semverParts(v) {
    var m = SEMVER_RE.exec(v);
    if (!m) return null;
    return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || null, build: m[5] || null };
  }
  function preRank(p) {
    return p.split('.').map(function (id) {
      if (/^\d+$/.test(id)) return parseInt(id, 10);
      return id;
    });
  }
  function cmpSemver(a, b) {
    var A = semverParts(a), B = semverParts(b);
    if (!A || !B) return NaN;
    if (A.major !== B.major) return A.major < B.major ? -1 : 1;
    if (A.minor !== B.minor) return A.minor < B.minor ? -1 : 1;
    if (A.patch !== B.patch) return A.patch < B.patch ? -1 : 1;
    /* spec: a version WITHOUT prerelease outranks one with it */
    if (A.pre && !B.pre) return -1;
    if (!A.pre && B.pre) return 1;
    if (!A.pre && !B.pre) return 0;
    var pa = preRank(A.pre), pb = preRank(B.pre);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = pa[i], y = pb[i];
      if (x === undefined) return 1;   /* shorter prerelease wins */
      if (y === undefined) return -1;
      if (typeof x === 'number' && typeof y === 'number') { if (x !== y) return x < y ? -1 : 1; }
      else if (typeof x !== typeof y) return typeof x === 'number' ? -1 : 1;  /* numbers < strings */
      else if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  function compareVersions() {
    var a = $('sv-a').value.trim(), b = $('sv-b').value.trim();
    var kvEl = $('sv-kv');
    var A = semverParts(a), B = semverParts(b);
    if (!A || !B) {
      kvEl.hidden = false;
      TB.fillKv(kvEl, [['valid', (!A && !B) ? 'neither version is valid semver'
                        : !A ? ('A ("' + a + '") is not valid') : ('B ("' + b + '") is not valid')]]);
      return;
    }
    var c = cmpSemver(a, b);
    var verdict = c === 0 ? 'A == B' : c < 0 ? 'A < B' : 'A > B';
    var bump = B.major > A.major ? 'MAJOR bump (breaking)' :
               B.minor > A.minor ? 'MINOR bump (feature)' :
               B.patch > A.patch ? 'PATCH bump (fix)' : 'no forward bump';
    kvEl.hidden = false;
    TB.fillKv(kvEl, [
      ['A valid', 'yes' + (A.pre ? ' (prerelease)' : '')],
      ['B valid', 'yes' + (B.pre ? ' (prerelease)' : '')],
      ['precedence', verdict],
      ['change type', bump]
    ]);
  }
  $('sv-compare').addEventListener('click', compareVersions);
  })();


  /* ============================================================
     4. GitLab CI generator
     ============================================================ */
  (function () {
    if (!$('gl-stack')) return;
['gl-version', 'gl-branch', 'gl-registry'].forEach(function (id) {
      $(id).addEventListener('input', renderGl);
    });
    $('gl-stack').addEventListener('change', renderGl);
    ['gl-lint', 'gl-test', 'gl-deploy'].forEach(function (id) {
      $(id).addEventListener('click', function () { $(id).classList.toggle('on'); renderGl(); });
    });

    function renderGl() {
      var stack = $('gl-stack').value;
      var ver = $('gl-version').value.trim() || '22';
      var branches = $('gl-branch').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var lint = $('gl-lint').classList.contains('on');
      var test = $('gl-test').classList.contains('on');
      var deploy = $('gl-deploy').classList.contains('on');

      var stages = [];
      var jobs = {};

      if (stack === 'docker-build') {
        var reg = $('gl-registry').value.trim() || 'ghcr.io/owner/image';
        stages.push('build');
        jobs.build = {
          stage: 'build',
          image: 'docker:27',
          services: ['docker:27-dind'],
          variables: { IMAGE: reg },
          script: [
            'docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY',
            'docker build -t $IMAGE:$CI_COMMIT_SHA -t $IMAGE:latest .',
            'docker push $IMAGE:$CI_COMMIT_SHA',
            'docker push $IMAGE:latest'
          ]
        };
      } else {
        stages.push('test');
        var job = { stage: 'test' };
        if (stack === 'node') {
          job.image = 'node:' + ver;
          job.cache = { key: { files: ['package-lock.json'] }, paths: ['node_modules/'] };
          job.script = ['npm ci'];
          if (lint) job.script.push('npm run lint --if-present');
          if (test) job.script.push('npm test');
        } else if (stack === 'python') {
          job.image = 'python:' + ver + '-slim';
          job.cache = { key: { files: ['requirements.txt'] }, paths: ['.cache/pip'] };
          job.before_script = ['pip install -r requirements.txt'];
          job.script = [];
          if (lint) job.script.push('ruff check .');
          if (test) job.script.push('pytest --cov');
          if (!job.script.length) job.script.push('echo "nothing to do"');
        } else {
          job.image = 'golang:' + ver;
          job.cache = { key: { files: ['go.sum'] }, paths: ['/go/pkg/mod'] };
          job.script = ['go build ./...'];
          if (lint) job.script.splice(0, 0, 'go vet ./...');
          if (test) job.script.push('go test ./... -race');
        }
        jobs.test = job;
      }

      if (deploy) {
        stages.push('deploy');
        jobs.deploy = {
          stage: 'deploy',
          environment: { name: 'production' },
          rules: branches.map(function (b) {
            return { if: '$CI_COMMIT_BRANCH == "' + b + '"', when: 'manual' };
          }),
          script: ['echo "deploy ${CI_COMMIT_SHA:0:7}"']
        };
      }

      var wf = {};
      if (stages.length) wf.stages = stages;
      Object.keys(jobs).forEach(function (k) { wf[k] = jobs[k]; });
      $('gl-out').innerHTML = TB.highlight(TB.toYaml(wf), 'yaml');
    }
    renderGl();
  })();
})();
