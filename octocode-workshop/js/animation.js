// @ts-check
/*
 * animation.js — In-slide motion for Octocode Slides: step reveals and arrival moves
 *
 * Elements marked with [data-step] are "steps" — components revealed
 * sequentially with → / Space / ↓ and hidden in reverse with ← / ↑.
 * [data-anim] says HOW something appears. Marks are made, not faded: a line
 * draws along its path, a number counts to its value, a highlight sweeps
 * under the words. Every kind ends on the slide as written, so thumbnails,
 * PDF export and reduced motion show the finished slide.
 *
 * HOW IT WORKS
 * ─────────────
 * Steps are revealed before the slide advances to the next slide, and
 * all steps must be hidden before the slide retreats to the previous one.
 *
 * This is achieved by intercepting keydown events in capture phase, before
 * navbridge.js forwards them to the parent (index.html). When a step is
 * consumed, stopImmediatePropagation() prevents navbridge from seeing the
 * key — so the parent does not advance the slide. Once all steps are
 * exhausted in either direction, the key passes through normally and the
 * parent navigates to the next or previous slide.
 *
 * REQUIRED LOADING ORDER (in slide HTML, before </body>):
 *   <script src="../js/animation.js"></script>   ← MUST come first
 *   <script src="../js/navbridge.js"></script>    ← always last
 *
 * USAGE
 * ─────
 * Add data-step="N" to any element (N = 1-based display order):
 *
 *   <li data-step="1">First point</li>
 *   <li data-step="2" data-anim="mark">Second point, highlighted as it lands</li>
 *
 * Elements with the same N are ONE step: they come in together on one press
 * (a label, its bar and its value in a grid row). If the value is absent or
 * non-numeric, the element is a step of its own, after the numbered ones, in
 * DOM order.
 * Elements without [data-step] are unaffected and always visible.
 *
 * KINDS — data-anim="<kind>" (on a step, or on any element to play on arrival)
 * ─────
 *   rise   (default) fades up 14px
 *   fade   opacity only
 *   draw   SVG: every path/line/circle… inside draws along its stroke, then its
 *          fill washes in; HTML: wipes on left → right (a rule, a bar, a connector)
 *   land   pops onto its spot with a small overshoot (a callout dot, a badge)
 *   mark   a highlighter sweeps under the text (inline text: <span>, <em>)
 *   count  the first number in it counts up from data-from (default 0); combine
 *          with a visual kind: data-anim="rise count"
 *   none   appears at once (a hard cut)
 *
 * An element with data-anim but no data-step plays when the slide arrives
 * (CSS keyframes that navbridge.js replays on each visit); delay it with
 * style="--delay: 400ms". data-stagger on a parent plays its children one
 * after another (--stagger, default 90ms) instead of the parent as a whole.
 * data-step-focus on the slide root dims the steps already shown, so the
 * newest one holds the eye (--step-past-opacity, default .6).
 *
 * CUSTOMISING ANIMATIONS
 * ──────────────────────
 * Override the default fade-up in the slide's local <style>:
 *
 *   [data-step]          { opacity: 0; transform: scale(0.95); transition: ... }
 *   [data-step].step-visible { opacity: 1; transform: scale(1); }
 *
 * OPTIONAL — step indicator dot bar
 * ───────────────────────────────────
 * Add data-step-indicator to the slide root (<div class="slide ...">)
 * to enable a small dot bar that tracks the current step count.
 *
 * See the octocode-slides skill (references/animation.md) for full documentation.
 */
(function () {
  var EASE = 'cubic-bezier(.4,0,.2,1)';
  var DRAW_EASE = 'cubic-bezier(.65,0,.35,1)';
  var SHAPES = ':is(path,line,polyline,polygon,circle,ellipse,rect)';
  var MARK_BG = 'linear-gradient(transparent 58%, color-mix(in srgb, var(--accent, #39D353) 38%, transparent) 58%, color-mix(in srgb, var(--accent, #39D353) 38%, transparent) 92%, transparent 92%)';

  /* The finished look of each kind: needed everywhere, also standalone and in exports. */
  var finalCss = [
    '[data-anim~="mark"]{background-image:' + MARK_BG + ';background-repeat:no-repeat;background-size:100% 100%;-webkit-box-decoration-break:clone;box-decoration-break:clone}',
    '[data-anim~="draw"] ' + SHAPES + '[pathLength]{stroke-dasharray:1 1;stroke-dashoffset:0}',
    '[data-anim~="count"]{font-variant-numeric:tabular-nums}'
  ];

  /* Not embedded in an iframe (opened standalone, or a print/screenshot page): finished slide, no motion. */
  if (window.parent === window) {
    var still = document.createElement('style');
    still.textContent = finalCss.join('');
    (document.head || document.documentElement).appendChild(still);
    return;
  }

  /* ── Kinds: hidden state, transition (steps) and keyframes (arrival) ─── */
  /* off = hidden state; on = the shown state when the kind needs one (a wipe cannot interpolate to
     clip-path:none). The draw wipe keeps a 50% margin so what overhangs the box (a connector to the
     previous card, a shadow) is drawn first and never cut. */
  /** @type {Record<string, { off: string, on?: string, t: string }>} */
  var KINDS = {
    rise: { off: 'opacity:0;transform:translateY(14px)', t: 'opacity 320ms ' + EASE + ',transform 320ms ' + EASE },
    fade: { off: 'opacity:0', t: 'opacity 400ms ease' },
    land: { off: 'opacity:0;transform:scale(.3)', t: 'opacity 180ms ease,transform 420ms cubic-bezier(.34,1.56,.64,1)' },
    draw: { off: 'clip-path:inset(-50% 150% -50% -50%)', on: 'clip-path:inset(-50%)', t: 'clip-path 700ms ' + DRAW_EASE },
    mark: { off: 'background-size:0% 100%', t: 'background-size 600ms ' + DRAW_EASE },
    none: { off: 'opacity:0', t: 'none' }
  };
  var IN_STEP = ':not([data-step]):not([data-step] *)'; /* arrival: not a step, not inside one */

  /**
   * @param {string} k kind
   * @param {boolean} [dflt] also match steps with no data-anim (the default kind)
   */
  function stepTargets(k, dflt) {
    var own = '[data-anim~="' + k + '"]';
    var sel = dflt ? [own, ':not([data-anim])'] : [own];
    return {
      self: sel.map(function (s) { return '[data-step]' + s + ':not([data-stagger])'; }).join(','),
      hiddenSelf: sel.map(function (s) { return '[data-step]:not(.step-visible)' + s + ':not([data-stagger])'; }).join(','),
      kids: sel.map(function (s) { return '[data-step][data-stagger]' + s + '>*'; }).join(','),
      hiddenKids: sel.map(function (s) { return '[data-step][data-stagger]:not(.step-visible)' + s + '>*'; }).join(',')
    };
  }

  var css = finalCss.slice();
  /* Count's sentinel: screenshot / export pages zero every transition, which tells count to show the
     final number. Before the [data-step] rule so a step's own transition wins over it. */
  css.push('[data-anim~="count"]{transition:outline-offset 1s}');
  /* Back-compat: slides override these two selectors in their own <style>. */
  css.push('[data-step]{opacity:0;transform:translateY(14px);transition:opacity 320ms ' + EASE + ',transform 320ms ' + EASE + ';will-change:opacity,transform}');
  css.push('[data-step].step-visible{opacity:1;transform:translateY(0)}');
  css.push('[data-step][data-stagger]{opacity:1;transform:none}');
  css.push('[data-stagger]>*:nth-child(2){--i:1}[data-stagger]>*:nth-child(3){--i:2}[data-stagger]>*:nth-child(4){--i:3}[data-stagger]>*:nth-child(5){--i:4}[data-stagger]>*:nth-child(6){--i:5}[data-stagger]>*:nth-child(7){--i:6}[data-stagger]>*:nth-child(8){--i:7}[data-stagger]>*:nth-child(9){--i:8}[data-stagger]>*:nth-child(n+10){--i:9}');
  Object.keys(KINDS).forEach(function (k) {
    var K = KINDS[k];
    var s = stepTargets(k, k === 'rise');
    var delay = 'transition-delay:calc(var(--i,0) * var(--stagger,90ms))';
    /* Real specificity (not :where): a kind must beat the generic [data-step] default above. */
    var on = K.on ? K.on + ';' : '';
    if (k !== 'rise') css.push(s.self + '{opacity:1;transform:none;' + on + 'transition:' + K.t + '}');
    css.push(s.kids + '{' + on + 'transition:' + K.t + ';' + delay + '}');
    css.push(s.hiddenSelf + ',' + s.hiddenKids + '{' + K.off + '}');
    /* arrival: keyframes from the hidden state to the slide as written */
    if (k === 'none') return;
    var dur = K.t.match(/(\d+)ms/g) || ['320ms'];
    var len = dur.map(function (d) { return parseInt(d, 10); }).reduce(function (a, b) { return Math.max(a, b); }, 0) + 'ms';
    css.push('@keyframes oa-' + k + '{from{' + K.off + '}' + (K.on ? 'to{' + K.on + '}' : '') + '}');
    css.push(':where([data-anim~="' + k + '"]' + IN_STEP + ':not([data-stagger])){animation:oa-' + k + ' ' + len + ' ' + (k === 'land' ? 'cubic-bezier(.34,1.56,.64,1)' : DRAW_EASE) + ' both;animation-delay:var(--delay,0ms)}');
    css.push(':where([data-anim~="' + k + '"][data-stagger]' + IN_STEP + '>*){animation:oa-' + k + ' ' + len + ' ' + DRAW_EASE + ' both;animation-delay:calc(var(--delay,0ms) + var(--i,0) * var(--stagger,90ms))}');
  });
  /* draw on SVG: the strokes draw along their paths, then the fills wash in; the svg itself is not wiped */
  css.push(':where([data-anim~="draw"]:has(svg),svg[data-anim~="draw"]){clip-path:none!important;animation-name:none!important}');
  css.push(':where([data-step][data-anim~="draw"]) ' + SHAPES + '[pathLength]{transition:stroke-dashoffset 900ms ' + DRAW_EASE + ',fill-opacity 300ms ease 650ms}');
  css.push(':where([data-step]:not(.step-visible)[data-anim~="draw"]) ' + SHAPES + '[pathLength]{stroke-dashoffset:1;fill-opacity:0}');
  css.push(':where([data-step][data-anim~="draw"]) text{transition:opacity 300ms ease 600ms}:where([data-step]:not(.step-visible)[data-anim~="draw"]) text{opacity:0}');
  css.push('@keyframes oa-stroke{from{stroke-dashoffset:1;fill-opacity:0}70%{stroke-dashoffset:0;fill-opacity:0}}');
  css.push('@keyframes oa-label{from{opacity:0}60%{opacity:0}}');
  css.push(':where([data-anim~="draw"]' + IN_STEP + ') ' + SHAPES + '[pathLength]{animation:oa-stroke 1200ms ' + DRAW_EASE + ' both;animation-delay:var(--delay,0ms)}');
  css.push(':where([data-anim~="draw"]' + IN_STEP + ') text{animation:oa-label 1200ms ease both;animation-delay:var(--delay,0ms)}');
  /* focus: the newest step holds the eye */
  css.push('[data-step-focus] [data-step].step-visible.step-past{opacity:var(--step-past-opacity,.6)}');
  /* Step indicator dot bar */
  css.push('.step-indicator{display:flex;gap:6px;align-items:center;position:absolute;bottom:18px;left:50%;transform:translateX(-50%);z-index:20;pointer-events:none}');
  css.push('.step-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.25);transition:background 200ms ease,transform 200ms ease}');
  css.push('.step-dot.is-done{background:rgba(255,255,255,0.85);transform:scale(1.2)}');
  css.push('@media (prefers-reduced-motion: reduce){[data-step],[data-step] *,[data-anim],[data-anim] *{transition-duration:0.01ms!important;animation-duration:0.01ms!important;animation-delay:0ms!important}}');

  var style = document.createElement('style');
  style.textContent = css.join('\n');
  document.head.appendChild(style);

  /* ── State ──────────────────────────────────────────────────────────── */
  /** @type {HTMLElement[][]} */
  var steps       = [];   /* ordered steps; each is the [data-step] elements shown on one press */
  var currentStep = 0;    /* how many steps are currently visible */
  /** @type {HTMLElement | null} */
  var indicator   = null; /* dot bar element, if enabled */
  var focusMode   = false;

  /* SVG shapes inside a draw element need pathLength="1" so one dash covers the stroke. */
  function prepareDraw() {
    document.querySelectorAll('[data-anim~="draw"]').forEach(function (el) {
      var shapes = el.matches(SHAPES) ? [el] : Array.prototype.slice.call(el.querySelectorAll(SHAPES));
      shapes.forEach(function (/** @type {Element} */ s) {
        if (s.namespaceURI === 'http://www.w3.org/2000/svg' && !s.hasAttribute('pathLength')) s.setAttribute('pathLength', '1');
      });
    });
  }

  /* ── Count: the first number in the element counts to its written value ── */
  /** @type {Map<Text, { text: string, raf: number }>} */
  var counting = new Map();

  /** @param {Element} el */
  function firstNumberNode(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var n = walker.nextNode(); n; n = walker.nextNode()) if (/\d/.test(n.nodeValue || '')) return /** @type {Text} */ (n);
    return null;
  }

  /** @param {Element} el */
  function motionOff(el) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    var t = getComputedStyle(el).transitionDuration || '0s'; /* screenshot/export pages set transition:none */
    return Math.max.apply(null, t.split(',').map(function (x) { return parseFloat(x) * (/ms/.test(x) ? 1 : 1000); })) < 50;
  }

  /** @param {Element} el @param {number} delayMs */
  function count(el, delayMs) {
    var found = firstNumberNode(el);
    if (!found || counting.has(found) || motionOff(el)) return;
    var node = found;
    var text = node.nodeValue || '';
    var parts = /^([\s\S]*?)(-?\d[\d,]*(?:\.\d+)?)([\s\S]*)$/.exec(text);
    if (!parts) return;
    var before = parts[1], num = parts[2], after = parts[3];
    var to = parseFloat(num.replace(/,/g, ''));
    var from = parseFloat(el.getAttribute('data-from') || '0') || 0;
    var decimals = (num.split('.')[1] || '').length;
    var commas = num.indexOf(',') >= 0;
    var ms = parseInt(el.getAttribute('data-count-ms') || '', 10) || 1100;
    /** @param {number} v */
    function fmt(v) {
      var s = v.toFixed(decimals);
      if (commas) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
      return before + s + after;
    }
    var t0 = 0;
    var job = { text: text, raf: 0 };
    counting.set(node, job);
    node.nodeValue = fmt(from);
    /** @param {number} now */
    function tick(now) {
      if (!t0) t0 = now + delayMs;
      var p = Math.min(1, Math.max(0, (now - t0) / ms));
      var e = 1 - Math.pow(1 - p, 3);
      if (p >= 1) { node.nodeValue = text; counting.delete(node); return; }
      node.nodeValue = fmt(from + (to - from) * e);
      job.raf = requestAnimationFrame(tick);
    }
    job.raf = requestAnimationFrame(tick);
  }

  /** @param {Element} [within] only numbers inside it (default: everywhere) */
  function finishCounts(within) {
    counting.forEach(function (job, node) {
      if (within && !within.contains(node)) return;
      cancelAnimationFrame(job.raf);
      node.nodeValue = job.text;
      counting.delete(node);
    });
  }

  /** @param {Element} root */
  function countsIn(root) {
    var list = Array.prototype.slice.call(root.querySelectorAll('[data-anim~="count"]'));
    if (root.matches('[data-anim~="count"]')) list.unshift(root);
    return list;
  }

  function playArrival() {
    finishCounts();
    document.querySelectorAll('[data-anim~="count"]').forEach(function (el) {
      if (el.closest('[data-step]')) return;
      count(el, parseFloat(getComputedStyle(el).getPropertyValue('--delay')) || 0);
    });
  }

  /* ── Collect and group steps ────────────────────────────────────────── */
  /* Same numeric N = one step, in N order; non-numeric = one step each, after them, in DOM order. */
  function collectSteps() {
    prepareDraw();
    /** @type {Record<string, HTMLElement[]>} */
    var byN = {};
    /** @type {HTMLElement[][]} */
    var loose = [];
    document.querySelectorAll('[data-step]').forEach(function (el) {
      var n = parseInt(el.getAttribute('data-step') || '', 10);
      if (isNaN(n)) loose.push([/** @type {HTMLElement} */ (el)]);
      else (byN[n] = byN[n] || []).push(/** @type {HTMLElement} */ (el));
    });
    steps = Object.keys(byN)
      .sort(function (a, b) { return Number(a) - Number(b); })
      .map(function (n) { return byN[n]; })
      .concat(loose);
    focusMode = !!document.querySelector('[data-step-focus]');

    if (!steps.length) return;

    /* Build optional dot indicator */
    var slideRoot = document.querySelector('[data-step-indicator]');
    if (slideRoot) {
      indicator = document.createElement('div');
      indicator.className = 'step-indicator';
      steps.forEach(function () {
        var dot = document.createElement('span');
        dot.className = 'step-dot';
        /** @type {HTMLElement} */ (indicator).appendChild(dot);
      });
      slideRoot.appendChild(indicator);
    }
  }

  function markPast() {
    if (!focusMode) return;
    steps.forEach(function (group, i) {
      group.forEach(function (s) { s.classList.toggle('step-past', i < currentStep - 1); });
    });
  }

  /* ── Show next step ─────────────────────────────────────────────────── */
  function showNext() {
    if (currentStep >= steps.length) return false; /* all shown — pass through */
    steps[currentStep].forEach(function (step) {
      step.classList.add('step-visible');
      countsIn(step).forEach(function (el) { count(el, 0); });
    });
    if (indicator) {
      indicator.children[currentStep].classList.add('is-done');
    }
    currentStep++;
    markPast();
    return true; /* consumed */
  }

  /* ── Hide last visible step ─────────────────────────────────────────── */
  function hideLast() {
    if (currentStep <= 0) return false; /* none shown — pass through */
    currentStep--;
    steps[currentStep].forEach(function (step) {
      finishCounts(step);
      step.classList.remove('step-visible', 'step-past');
    });
    if (indicator) {
      indicator.children[currentStep].classList.remove('is-done');
    }
    markPast();
    return true; /* consumed */
  }

  /* ── Key sets ───────────────────────────────────────────────────────── */
  /** @type {Record<string, number>} */
  var FORWARD  = { ArrowRight: 1, ArrowDown: 1, ' ': 1 };
  /** @type {Record<string, number>} */
  var BACKWARD = { ArrowLeft: 1, ArrowUp: 1 };

  /* ── Keydown interceptor (capture phase, before navbridge) ──────────── */
  /*
   * Both animation.js and navbridge.js attach to document in capture phase.
   * Because animation.js is loaded (and therefore registered) first, its
   * handler runs before navbridge's. When a step is consumed, calling
   * stopImmediatePropagation() prevents navbridge from seeing the event,
   * so the parent (index.html) does not advance or retreat the slide.
   *
   * When no step is available (all shown going forward, none going back),
   * the key is NOT consumed — it falls through to navbridge, which forwards
   * it to the parent, and normal slide navigation occurs.
   */
  document.addEventListener('keydown', function (e) {
    if (!steps.length) return; /* this slide has no steps — no-op */
    var t = /** @type {HTMLElement | null} */ (e.target);
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return; /* typing, not navigating */

    var consumed = false;
    if (FORWARD[e.key])  consumed = showNext();
    if (BACKWARD[e.key]) consumed = hideLast();

    if (consumed) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true /* capture phase */);

  /* Arrival (the deck shows this slide) replays the counts; reveal-all (thumbnails, editor) finishes everything. */
  window.addEventListener('message', function (e) {
    var type = e.data && typeof e.data === 'object' ? e.data.type : '';
    if (type === 'octocode-slides:activate') requestAnimationFrame(playArrival);
    else if (type === 'octocode-slides:reveal-all') {
      finishCounts();
      document.querySelectorAll('.step-past').forEach(function (s) { s.classList.remove('step-past'); });
    }
  });

  /* ── Init ────────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', collectSteps);
  } else {
    collectSteps();
  }
})();
