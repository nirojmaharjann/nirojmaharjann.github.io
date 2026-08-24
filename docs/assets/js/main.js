/* Niroj Maharjan — portfolio interactions (vanilla JS, no dependencies) */

(function () {
  'use strict';

  /* ----- Floating tech logos (live background) ----- */
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    /* icon class + brand color pairs */
    var FLOAT_ICONS = [
      ['mdi-language-javascript', '#F7DF1E'], ['mdi-language-typescript', '#3178C6'],
      ['mdi-nodejs', '#83CD29'], ['mdi-language-python', '#3776AB'],
      ['mdi-language-java', '#EA2D2E'], ['mdi-language-go', '#00ADD8'],
      ['mdi-hexagon', '#CE422B'], ['mdi-language-cpp', '#659AD2'],
      ['mdi-language-csharp', '#68217A'], ['mdi-language-php', '#777BB3'],
      ['mdi-react', '#61DAFB'], ['mdi-vuejs', '#42B883'], ['mdi-angular', '#DD0031'],
      ['mdi-language-html5', '#E34F26'], ['mdi-language-css3', '#1572B6'],
      ['mdi-sass', '#CC6699'], ['mdi-webhook', '#2496ED'], ['mdi-flask', '#009688'],
      ['mdi-lambda', '#FF9900'], ['mdi-graphql', '#E10098'],
      ['mdi-docker', '#2496ED'], ['mdi-kubernetes', '#326CE5'], ['mdi-cube-outline', '#326CE5'],
      ['mdi-git', '#F05032'], ['mdi-github-circle', '#FFFFFF'], ['mdi-gitlab', '#FC6D26'],
      ['mdi-bitbucket', '#2684FF'], ['mdi-source-branch', '#7B42BC'], ['mdi-flash', '#F5A623'],
      ['mdi-terraform', '#7B42BC'], ['mdi-ansible', '#EE0000'],
      ['mdi-aws', '#FF9900'], ['mdi-azure', '#0089D6'], ['mdi-google', '#4285F4'],
      ['mdi-cloud', '#8AB4F8'], ['mdi-cloud-outline', '#8AB4F8'],
      ['mdi-database', '#336791'], ['mdi-server-network', '#95A5A6'],
      ['mdi-linux', '#FCC624'], ['mdi-console', '#4E9A06'], ['mdi-api', '#0B8F63'],
      ['mdi-network', '#2496ED'], ['mdi-shield-key', '#00E59F'], ['mdi-lock', '#F5A623']
    ];
    var FLOATER_COUNT = 34;
    var floaters = document.createElement('div');
    floaters.className = 'bg-floaters';
    floaters.setAttribute('aria-hidden', 'true');
    for (var fi = 0; fi < FLOATER_COUNT; fi++) {
      var fSpan = document.createElement('span');
      var pick = FLOAT_ICONS[Math.floor(Math.random() * FLOAT_ICONS.length)];
      var fIcon = document.createElement('i');
      fIcon.className = 'mdi ' + pick[0];
      fSpan.style.setProperty('--c', pick[1]);
      fSpan.style.setProperty('--x', (Math.random() * 96 + 2).toFixed(2) + '%');
      /* three depth layers: far (small, blurred), mid (default), near (large) */
      var layerRoll = Math.random();
      var layer = layerRoll < 0.34 ? 'fl-far' : layerRoll < 0.78 ? 'fl-mid' : 'fl-near';
      fSpan.className = layer;
      if (layer === 'fl-far') {
        fSpan.style.setProperty('--s', Math.round(Math.random() * 8 + 14) + 'px');
        fSpan.style.setProperty('--d', (Math.random() * 30 + 55).toFixed(1) + 's');
      } else if (layer === 'fl-near') {
        fSpan.style.setProperty('--s', Math.round(Math.random() * 18 + 36) + 'px');
        fSpan.style.setProperty('--d', (Math.random() * 18 + 30).toFixed(1) + 's');
      } else {
        fSpan.style.setProperty('--s', Math.round(Math.random() * 16 + 22) + 'px');
        fSpan.style.setProperty('--d', (Math.random() * 28 + 40).toFixed(1) + 's');
      }
      /* negative delay so logos are already mid-flight on load */
      fSpan.style.setProperty('--delay', (-Math.random() * 60).toFixed(1) + 's');
      /* every third icon drifts with an extra ultra-slow rotation */
      if (fi % 3 === 0) fIcon.classList.add('fl-spin');
      fSpan.appendChild(fIcon);
      floaters.appendChild(fSpan);
    }
    document.body.insertBefore(floaters, document.body.firstChild);
  }

  /* ----- Theme toggle (light / dark) -----
     Initial theme is set by an inline script in <head> to avoid a flash.
     This handler only flips and persists the choice. */
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    function paintThemeIcon() {
      var current = document.documentElement.getAttribute('data-theme');
      var light = current === 'light';
      themeBtn.innerHTML = '<i class="mdi ' + (light ? 'mdi-weather-night' : 'mdi-weather-sunny') + '"></i>';
      themeBtn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    }
    paintThemeIcon();
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
      paintThemeIcon();
    });
  }

  /* ----- Mobile nav toggle ----- */
  var burger = document.querySelector('.burger');
  var links = document.querySelector('.nav-links');
  if (burger && links) {
    burger.addEventListener('click', function () {
      links.classList.toggle('open');
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') links.classList.remove('open');
    });
  }

  /* ----- Typing effect in hero ----- */
  var typedEl = document.getElementById('typed');
  if (typedEl) {
    var roles = [
      'DevOps Engineer',
      'Cloud Engineer — AWS',
      'Kubernetes Operator',
      'Infrastructure as Code',
      'Automation Enthusiast'
    ];
    var roleIndex = 0;
    var charIndex = 0;
    var deleting = false;

    function tick() {
      var current = roles[roleIndex];
      charIndex += deleting ? -1 : 1;
      typedEl.textContent = current.slice(0, charIndex);

      var delay = deleting ? 45 : 85;
      if (!deleting && charIndex === current.length) {
        delay = 1800;           // pause when word is complete
        deleting = true;
      } else if (deleting && charIndex === 0) {
        deleting = false;
        roleIndex = (roleIndex + 1) % roles.length;
        delay = 400;
      }
      window.setTimeout(tick, delay);
    }
    tick();
  }

  /* ----- Reveal on scroll ----- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ----- Footer year ----- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  /* ----- Blog prose: inject copy buttons into code blocks ----- */
  document.querySelectorAll('.prose pre').forEach(function (pre) {
    if (pre.querySelector('.code-copy')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.setAttribute('aria-label', 'Copy code');
    btn.setAttribute('title', 'Copy code');
    btn.innerHTML = '<i class="mdi mdi-content-copy"></i>';
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code');
      var txt = code ? code.textContent : '';
      var done = function () {
        btn.innerHTML = '<i class="mdi mdi-check"></i>';
        setTimeout(function () { btn.innerHTML = '<i class="mdi mdi-content-copy"></i>'; }, 1200);
      };
      var fallback = function () {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, fallback);
      } else fallback();
    });
    pre.appendChild(btn);
  });
})();
