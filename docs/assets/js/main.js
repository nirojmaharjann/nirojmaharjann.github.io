/* Niroj Maharjan — portfolio interactions (vanilla JS, no dependencies) */

(function () {
  'use strict';

  /* ----- Floating tech logos (live background) ----- */
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    var FLOAT_ICONS = [
      'mdi-aws', 'mdi-docker', 'mdi-linux', 'mdi-kubernetes',
      'mdi-terraform', 'mdi-ansible', 'mdi-git', 'mdi-gitlab',
      'mdi-nodejs', 'mdi-language-python', 'mdi-language-go',
      'mdi-language-javascript'
    ];
    /* brand colors, one per icon above */
    var FLOAT_COLORS = [
      '#FF9900', '#2496ED', '#FCC624', '#326CE5',
      '#7B42BC', '#EE0000', '#F05032', '#FC6D26',
      '#83CD29', '#FFD43B', '#00ADD8', '#F7DF1E'
    ];
    var FLOATER_COUNT = 16;
    var floaters = document.createElement('div');
    floaters.className = 'bg-floaters';
    floaters.setAttribute('aria-hidden', 'true');
    for (var fi = 0; fi < FLOATER_COUNT; fi++) {
      var fSpan = document.createElement('span');
      var fIcon = document.createElement('i');
      fIcon.className = 'mdi ' + FLOAT_ICONS[fi % FLOAT_ICONS.length];
      fSpan.style.setProperty('--c', FLOAT_COLORS[fi % FLOAT_COLORS.length]);
      fSpan.style.setProperty('--x', (Math.random() * 96 + 2).toFixed(2) + '%');
      fSpan.style.setProperty('--s', Math.round(Math.random() * 40 + 22) + 'px');
      fSpan.style.setProperty('--d', (Math.random() * 30 + 28).toFixed(1) + 's');
      /* negative delay so logos are already mid-flight on load */
      fSpan.style.setProperty('--delay', (-Math.random() * 40).toFixed(1) + 's');
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
})();
