// @ts-check
/**
 * Octocode Slides — shared slide frame ("chrome")
 *
 * Draws the deck's logo, footer text and page number inside every
 * slide, from octodeck.json:
 *
 *   "chrome": { "logo": "assets/logo.svg", "footer": "Guy Bary · 2026",
 *               "pageNumber": true, "skip": ["title", "section", "closing"] }
 *
 * Off unless "chrome" is set. "skip" lists masters (root class slide--<name>) that
 * get no frame; a slide opts out with data-no-chrome on <html> or its .slide.
 * Styles live in css/masters.css (.slide-chrome, .chrome-*). When finished it sets
 * <html data-chrome="ready|off|skipped"> so exports and checks wait for it.
 * Loaded by navbridge.js — slides do not include it themselves.
 */
/**
 * @typedef {{ id: string, file?: string, hidden?: boolean }} ChromeSlide
 */
(function () {
  var html = document.documentElement;
  var done = function (/** @type {string} */ state) { html.setAttribute('data-chrome', state); };
  var slide = /** @type {HTMLElement} */ (document.querySelector('.slide'));
  if (!slide || html.hasAttribute('data-no-chrome') || slide.hasAttribute('data-no-chrome') || location.protocol === 'file:' || !window.fetch) return done('off');

  var here = location.pathname.split('/').pop();
  var root = new URL('../', location.href); // slides/<file>.html → deck root (also under preview prefixes)
  var wanted = new URLSearchParams(location.search).get('slide');

  fetch(new URL('octodeck.json', root), { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (deck) {
    var c = deck && deck.chrome;
    if (!c || typeof c !== 'object' || !Array.isArray(deck.slides)) return done('off');
    var master = (slide.className.match(/\bslide--([a-z0-9-]+)/) || [])[1] || 'default';
    if (Array.isArray(c.skip) && c.skip.indexOf(master) >= 0) return done('skipped');

    var total = 0, page = 0;
    deck.slides.forEach(function (/** @type {ChromeSlide} */ s) {
      var mine = wanted ? s.id === wanted : String(s.file || '').split('/').pop() === here;
      if (!s.hidden) total++;
      if (mine && !s.hidden) page = total;
    });

    var layer = document.createElement('div');
    layer.className = 'slide-chrome';
    layer.setAttribute('aria-hidden', 'true');
    if (c.logo && /^[\w][\w./-]*$/.test(c.logo) && c.logo.indexOf('..') < 0) {
      var img = document.createElement('img');
      img.className = 'chrome-logo';
      img.alt = '';
      img.src = new URL(c.logo, root).href;
      layer.appendChild(img);
    }
    var pageEl = null;
    if (c.pageNumber && page) {
      pageEl = document.createElement('span');
      pageEl.className = 'chrome-page';
      pageEl.textContent = page + ' / ' + total;
    }
    var own = slide.querySelector('.slide-footer');
    if (own) {
      // The slide already has a footer line: add only the page number to it (no overlap).
      if (pageEl) own.appendChild(pageEl);
    } else {
      var left = c.footer ? String(c.footer) : '';
      if (left || pageEl) {
        var band = document.createElement('div');
        band.className = 'chrome-band';
        var l = document.createElement('span');
        l.className = 'chrome-left';
        l.textContent = left;
        band.appendChild(l);
        if (pageEl) band.appendChild(pageEl);
        layer.appendChild(band);
      }
    }
    if (layer.childNodes.length) slide.appendChild(layer);
    done('ready');
  }).catch(function () { done('off'); });
})();
