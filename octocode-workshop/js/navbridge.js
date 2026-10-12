// @ts-check
/*
 * Slide -> parent navigation bridge.
 *
 * When a slide iframe has keyboard focus (after the user clicks anywhere
 * inside it), arrow keys fire on the iframe's document, not the parent
 * window. This script forwards those keys to the parent via postMessage
 * so the navigation controller in index.html can keep working.
 *
 * Animation lifecycle
 * ───────────────────
 * All iframes load upfront (before the user sees them), so CSS @keyframes
 * animations would finish before the slide is ever displayed. To fix this:
 *
 *   1. At load time we inject a freeze style that pauses all CSS animations
 *      and pause SVG timelines.
 *   2. When the parent sends octocode-slides:activate (in go() and on
 *      iframe load), we remove the freeze and replay every animation from
 *      the start so the full sequence runs on first view.
 */
/** @typedef {Window & { __octocodeNavbridge?: boolean }} NavbridgeWindow */
(function () {
  if (window.parent === window) return; // standalone, not embedded
  /** @type {NavbridgeWindow} */ (window).__octocodeNavbridge = true; // lets the deck shell know this slide forwards keys

  // ── Animation freeze ──────────────────────────────────────────────────────
  // Injected immediately (before DOMContentLoaded) so CSS animations never
  // get a chance to tick before the slide becomes visible.
  var freezeStyle = document.createElement('style');
  freezeStyle.textContent = '*, *::before, *::after { animation-play-state: paused !important; }';
  (document.head || document.documentElement).appendChild(freezeStyle);

  function pauseSVGs() {
    document.querySelectorAll('svg').forEach(function (svg) {
      try { svg.pauseAnimations(); } catch (_) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pauseSVGs);
  } else {
    pauseSVGs();
  }

  function activateAnimations() {
    // 1. Remove the CSS animation freeze so animations are no longer paused.
    if (freezeStyle.parentNode) freezeStyle.parentNode.removeChild(freezeStyle);

    // 2. Restart every CSS animation from the beginning (handles
    //    animation-fill-mode: forwards correctly — cancel() resets to
    //    pre-animation state, play() restarts including animation-delay).
    requestAnimationFrame(function () {
      try {
        document.getAnimations().forEach(function (anim) {
          try { anim.cancel(); anim.play(); } catch (_) {}
        });
      } catch (_) {}

      // 3. Reset and unpause SVG SMIL timelines.
      document.querySelectorAll('svg').forEach(function (svg) {
        try { svg.setCurrentTime(0); svg.unpauseAnimations(); } catch (_) {}
      });
    });
  }

  // ── Navigation bridge ─────────────────────────────────────────────────────

  // Every key the deck shell handles must be forwarded: focus sits inside the
  // active slide iframe after each navigation, so unforwarded keys are dead.
  /** @type {Record<string, number>} */
  var NAV_KEYS = {
    ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
    PageUp: 1, PageDown: 1, Home: 1, End: 1, Escape: 1,
    ' ': 1, g: 1, G: 1, f: 1, F: 1, p: 1, P: 1,
    b: 1, B: 1, w: 1, W: 1, e: 1, E: 1, r: 1, R: 1
  };

  /** @param {any} el an event target (Element, Document or null) */
  function isTypingTarget(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
  }

  function hasTextSelection() {
    try {
      var sel = window.getSelection && window.getSelection();
      return !!(sel && String(sel).length > 0);
    } catch (_) { return false; }
  }

  /** @param {string} key */
  function send(key) {
    try {
      window.parent.postMessage(
        { type: 'octocode-slides:nav', key: key },
        '*'
      );
    } catch (_) { /* ignore cross-origin failures */ }
  }

  document.addEventListener('keydown', function (e) {
    if (editing) return;
    if (tool === 'context') return; // The editor's element menu owns keyboard interaction.
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
    if (isTypingTarget(e.target)) return;
    if (!NAV_KEYS[e.key]) return;
    if (e.key === ' ' && hasTextSelection()) return;
    send(e.key);
    e.preventDefault();
  }, true);

  // Parent forwards nav keys here when the parent window has focus (not the
  // iframe). Re-dispatch as a real keydown so animation.js (loaded before
  // navbridge in capture phase) can intercept and consume a step first.
  // If animation.js has no step to consume, it lets the event through and
  // the keydown handler above calls send() to post back to the parent.
  //
  // Also handles octocode-slides:activate — starts (or restarts) all
  // CSS animations and SVG timelines from the beginning.
  //
  // Slides render on their own origin (octodeck serve), so the deck shell and the
  // presenter can't read this document: they ask for the title and speaker notes
  // (octocode-slides:get-notes) and get them back by message. Editor tooling and
  // notes are answered only to this machine's pages (localhost / 127.0.0.1) or to
  // the same origin (npx serve, file://).
  /** @param {string} origin */
  function trusted(origin) {
    return origin === location.origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
      (origin === 'null' && location.protocol === 'file:');
  }

  // Presses to reveal the slide, as animation.js counts them: elements sharing a
  // numeric data-step are one step; each non-numeric one is its own.
  function stepCount() {
    /** @type {Record<string, number>} */
    var seen = {};
    var n = 0;
    document.querySelectorAll('[data-step]').forEach(function (el) {
      var v = parseInt(el.getAttribute('data-step') || '', 10);
      if (isNaN(v)) n++;
      else if (!seen[v]) { seen[v] = 1; n++; }
    });
    return n;
  }

  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data !== 'object') return;

    if (e.data.type === 'octocode-slides:get-notes') {
      if (!trusted(e.origin) || !e.source) return;
      var aside = document.querySelector('.speaker-notes');
      var slide = document.querySelector('.slide') || document;
      var title = slide.querySelector('[data-slide-title]') || slide.querySelector('h1, h2');
      var subtitle = slide.querySelector('[data-slide-subtitle]') || slide.querySelector('.description, .subtitle');
      try {
        /** @type {Window} */ (e.source).postMessage({
          type: 'octocode-slides:notes',
          req: e.data.req,
          title: title ? (title.textContent || '').trim() : document.title || '',
          subtitle: subtitle ? (subtitle.textContent || '').trim() : '',
          notes: aside ? (aside.textContent || '').trim() : '',
          steps: stepCount()
        }, e.origin === 'null' ? '*' : e.origin);
      } catch (_) {}
      return;
    }

    if (e.data.type === 'octocode-slides:activate') {
      activateAnimations();
      return;
    }

    if (e.data.type === 'octocode-slides:key' && e.data.key) {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: e.data.key,
        bubbles: true,
        cancelable: true
      }));
      return;
    }

    // Edit-mode tooling (sent by the deck editor, which lives on another origin).
    if (!trusted(e.origin)) return;
    if (e.data.type === 'octocode-slides:reveal-all') { revealAll(); return; }
    if (e.data.type === 'octocode-slides:tool') { setTool(e.data.tool, e.source, e.origin, !!e.data.anywhere); }
    if ((tool === 'context' || tool === 'text') && e.source === toolTarget && (toolOrigin === '*' || e.origin === toolOrigin)) {
      if (e.data.type === 'octocode-slides:begin-text') { beginText(e.data); return; }
      if (e.data.type === 'octocode-slides:finish-text' && inline && e.data.session === inline.id) {
        finishText(e.data.action, true); return;
      }
    }
    // Selection controls belong to the editor that activated this iframe, never a sibling frame.
    if (!inline && tool && e.source === toolTarget && (toolOrigin === '*' || e.origin === toolOrigin) && e.data.type === 'octocode-slides:clear-selection') {
      selectElement(null, false);
      var selection = window.getSelection();
      if (selection) selection.removeAllRanges();
      reportSelection('octocode-slides:selected');
      return;
    }
    if (!inline && tool === 'context' && e.source === toolTarget && (toolOrigin === '*' || e.origin === toolOrigin)) {
      if (e.data.type === 'octocode-slides:clear-hover') highlight(null);
      if (e.data.type === 'octocode-slides:select-element' && typeof e.data.menuOpen === 'boolean') {
        if (e.data.path === null) selectElement(null, false);
        else {
          var target = elementAtPath(e.data.path);
          // An old menu's close event may arrive after a new canvas selection.
          if (target && (e.data.menuOpen || target === selectedEl)) selectElement(target, e.data.menuOpen);
        }
      }
    }
  });

  // ── Edit-mode tooling ─────────────────────────────────────────────────────
  // reveal-all: thumbnails show the finished slide (every data-step visible).
  // pick:       hover highlights an element; click reports it to the editor, with the click point
  //             (x / y = % of the slide). `anywhere` (review comments): a click on the background
  //             reports the point alone.
  // text:       click requests an edit; only a version-checked editor handshake
  //             enables typing. The editor owns persistence and failed-draft recovery.
  function revealAll() {
    var st = document.createElement('style');
    st.textContent = '[data-step]{opacity:1!important;transform:none!important;transition:none!important}.step-indicator{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
    // Kinds that are not opacity/transform (draw, mark) end on .step-visible too.
    document.querySelectorAll('[data-step]').forEach(function (x) { x.classList.add('step-visible'); });
    activateAnimations();
  }

  /** @type {'context' | 'pick' | 'text' | null} */
  var tool = null;
  /** @type {Window | null} */
  var toolTarget = null;
  var toolOrigin = '*';
  var pickAnywhere = false;
  /** @type {HTMLElement | null} */
  var hoverEl = null;
  /** @type {HTMLElement | null} */
  var selectedEl = null;
  var menuOpen = false;
  /** @type {HTMLElement | null} */
  var editing = null;
  /** @typedef {{ id: string, el: HTMLElement, originalHTML: string, originalText: string, initialText: string, attributes: [string, string][], text: string, html: string, composing: boolean, commitRequested: boolean, phase: 'editing' | 'committing' | 'failed', cleanup: () => void }} InlineDraft */
  /** @type {InlineDraft | null} */
  var inline = null;
  /** @type {{el: HTMLElement, range: Range | null} | null} */
  var editPointer = null;
  var toolStyle = document.createElement('style');
  toolStyle.textContent =
    'body.__deck-editor [data-editor-placeholder]:empty{display:block!important;min-height:1.4em;outline:1px dashed currentColor;outline-offset:8px;cursor:text}' +
    'body.__deck-editor [data-editor-placeholder]:empty:not([contenteditable])::before{content:attr(data-editor-placeholder);opacity:.5;font-size:clamp(18px,.55em,28px);font-weight:400;letter-spacing:normal}' +
    '.__deck-hover{outline:2px solid #5cd0ec!important;outline-offset:3px!important;cursor:pointer!important}' +
    '.__deck-selected{outline:3px solid #5cd0ec!important;outline-offset:3px!important;cursor:pointer!important}' +
    'body.__deck-text .__deck-hover{outline-style:dashed!important;cursor:text!important}' +
    '.__deck-editing{outline:2px solid #6ee7a7!important;outline-offset:3px!important;cursor:text!important}' +
    '.__deck-edit-error{outline:2px solid #f59e0b!important;outline-offset:3px!important}';

  var TEXT_TAGS = /^(H1|H2|H3|H4|H5|H6|P|LI|SPAN|STRONG|EM|B|I|A|BLOCKQUOTE|FIGCAPTION|TD|TH|DT|DD|LABEL|SMALL|CODE|PRE|DIV)$/;

  /**
   * @param {unknown} name
   * @param {MessageEventSource | null} source
   * @param {string} origin
   * @param {boolean} [anywhere]
   */
  function setTool(name, source, origin, anywhere) {
    if (inline && name !== tool) { finishText('commit', false); return; }
    var previousTool = tool;
    var changed = name !== tool;
    if (changed) { clearHover(); selectElement(null, false); }
    tool = name === 'context' || name === 'pick' || name === 'text' ? name : null;
    pickAnywhere = tool === 'pick' && !!anywhere;
    toolTarget = /** @type {Window | null} */ (source) || window.parent;
    toolOrigin = origin && origin !== 'null' ? origin : '*';
    if (tool && !toolStyle.parentNode) (document.head || document.documentElement).appendChild(toolStyle);
    document.body && document.body.classList.toggle('__deck-text', tool === 'text');
    document.body && document.body.classList.toggle('__deck-editor', !!tool);
    if (!tool) clearHover();
    if (changed && previousTool) reportSelection('octocode-slides:selected');
    // The pointer may arrive before the editor primes a newly loaded iframe.
    // Recover its existing target instead of requiring the user to leave and re-enter it.
    if (tool === 'context') {
      var underPointer = document.querySelectorAll('.slide :hover');
      if (underPointer.length) highlight(pickable(underPointer[underPointer.length - 1]));
    }
  }

  function clearHover() {
    if (hoverEl) hoverEl.classList.remove('__deck-hover');
    hoverEl = null;
  }

  /** @param {Element} el */
  function cleanClone(el) {
    var c = /** @type {Element} */ (el.cloneNode(true));
    /** @type {Element[]} */ ([c]).concat(Array.prototype.slice.call(c.querySelectorAll('*'))).forEach(function (n) {
      n.classList && n.classList.remove('__deck-hover', '__deck-selected', '__deck-editing', '__deck-edit-error', 'step-visible', 'step-past');
      if (n.getAttribute && n.getAttribute('class') === '') n.removeAttribute('class');
    });
    return c;
  }

  /** @param {Element} el */
  function selectorFor(el) {
    /** @type {string[]} */
    var parts = [];
    for (var n = /** @type {Element | null} */ (el); n && n.nodeType === 1 && !(n.classList && n.classList.contains('slide')) && n !== document.body; n = n.parentElement) {
      var node = n;
      /** @type {string[]} */
      var cls = Array.prototype.filter.call(n.classList, function (/** @type {string} */ c) { return c.indexOf('__deck') !== 0 && c !== 'step-visible' && c !== 'step-past'; }).slice(0, 2);
      var part = n.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : '');
      /** @type {Element[]} */
      var sib = n.parentElement ? Array.prototype.filter.call(n.parentElement.children, function (/** @type {Element} */ x) { return x.tagName === node.tagName; }) : [];
      if (sib.length > 1) part += ':nth-of-type(' + (sib.indexOf(n) + 1) + ')';
      parts.unshift(part);
    }
    return '.slide > ' + parts.join(' > ');
  }

  /** Stable element-child path below the authored slide root. @param {Element} el */
  function pathFor(el) {
    /** @type {number[]} */
    var path = [];
    for (var n = el; n.parentElement && !n.classList.contains('slide'); n = n.parentElement) {
      path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n));
    }
    return path;
  }

  /** Match the protocol's bounded element-child path. @param {unknown} path */
  function elementAtPath(path) {
    if (!Array.isArray(path) || !path.length || path.length > 100) return null;
    var el = document.querySelector('.slide');
    for (var i = 0; i < path.length; i++) {
      var index = path[i];
      if (!Number.isInteger(index) || index < 0 || index > 10000 || !el) return null;
      el = el.children[index] || null;
    }
    return pickable(el) === el ? /** @type {HTMLElement | null} */ (el) : null;
  }

  /** @param {Record<string, unknown>} msg */
  function report(msg) {
    try { (toolTarget || window.parent).postMessage(msg, toolOrigin); } catch (_) {}
  }

  /**
   * @param {any} el an event target
   * @returns {HTMLElement | null}
   */
  function pickable(el) {
    if (!el || el.nodeType !== 1 || !el.closest('.slide')) return null;
    if (el.closest('.slide-chrome, script, style, .speaker-notes')) return null;
    // SVG descendants cannot be edited individually; act on the authored image.
    el = el.closest('svg') || el;
    if (el.classList.contains('slide')) return null;
    if (tool === 'text') {
      while (el && !TEXT_TAGS.test(el.tagName)) el = el.parentElement;
      if (!el || el.classList.contains('slide') || !el.closest('.slide')) return null;
    }
    return el;
  }

  /** @param {Element} el @param {string} type @param {number} x @param {number} y */
  function elementMessage(el, type, x, y) {
    return { type: type, tag: el.tagName.toLowerCase(), selector: selectorFor(el),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      html: cleanClone(el).outerHTML, path: pathFor(el),
      x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
  }

  /** @param {HTMLElement | null} el */
  function highlight(el) {
    clearHover();
    if (el) { hoverEl = el; el.classList.add('__deck-hover'); }
    if (tool !== 'context') return;
    if (!el) { report({ type: 'octocode-slides:hovered', tag: '', selector: '' }); return; }
    var rect = el.getBoundingClientRect();
    report(elementMessage(el, 'octocode-slides:hovered', rect.right / window.innerWidth * 100, rect.top / window.innerHeight * 100));
  }

  /** @param {HTMLElement | null} el @param {boolean} open */
  function selectElement(el, open) {
    clearHover();
    if (selectedEl) selectedEl.classList.remove('__deck-selected');
    selectedEl = el;
    menuOpen = open;
    if (el) el.classList.add('__deck-selected');
  }

  /** @param {'octocode-slides:selected' | 'octocode-slides:picked'} type */
  function reportSelection(type) {
    if (!selectedEl) { report({ type: type, tag: '', selector: '' }); return; }
    var rect = selectedEl.getBoundingClientRect();
    report(elementMessage(selectedEl, type, rect.right / window.innerWidth * 100, rect.top / window.innerHeight * 100));
  }

  /** @param {MouseEvent} e */
  function hoverTarget(e) {
    if (!tool || inline || menuOpen) return;
    var el = pickable(e.target);
    if (el === hoverEl) return;
    highlight(el);
  }
  // Removing the overlaid button after Escape generates mouseover without moving the
  // pointer. Re-arm contextual hover only on movement so dismissal stays dismissed.
  document.addEventListener('mousemove', function (e) { if (tool === 'context') hoverTarget(e); }, true);
  document.addEventListener('mouseover', function (e) { if (tool !== 'context') hoverTarget(e); }, true);

  // The editor clears hover when leaving the entire canvas. Crossing this iframe's edge
  // into its overlaid ⋯ button must keep the target outlined.

  // Keyboard users can enter the canvas, step through authored items, and open the same menu.
  document.addEventListener('keydown', function (e) {
    if (inline || tool !== 'context' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Tab') {
      var items = Array.prototype.filter.call(document.querySelectorAll('.slide *'), function (el) {
        return pickable(el) === el && el.getBoundingClientRect().width > 0;
      });
      var next = items.indexOf(hoverEl || selectedEl) + (e.shiftKey ? -1 : 1);
      if (next < 0 || next >= items.length) return; // Tab out at the edges.
      e.preventDefault(); e.stopImmediatePropagation(); highlight(items[next]);
    } else if (e.key === 'F2' && (selectedEl || hoverEl)) {
      e.preventDefault(); e.stopImmediatePropagation();
      requestText(/** @type {HTMLElement} */ (selectedEl || hoverEl));
    } else if ((e.key === 'Enter' || e.key === ' ') && (hoverEl || selectedEl)) {
      e.preventDefault(); e.stopImmediatePropagation();
      selectElement(hoverEl || selectedEl, true);
      reportSelection('octocode-slides:picked');
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      selectElement(null, false);
      reportSelection('octocode-slides:selected');
    }
  }, true);

  document.addEventListener('click', function (e) {
    if (!tool) return;
    if (editing && editing.contains(/** @type {Node | null} */ (e.target))) return;
    if (inline) { e.preventDefault(); e.stopPropagation(); finishText('commit', false); return; }
    var el = pickable(e.target);
    // Pointing selects the target but never opens its options. The editor's top-right ⋯
    // button owns pointer activation; Enter/Space above remain the keyboard equivalent.
    if (tool === 'context') {
      e.preventDefault();
      e.stopPropagation();
      selectElement(el, false);
      reportSelection('octocode-slides:selected');
      return;
    }
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    var x = Math.round(Math.min(100, Math.max(0, (e.clientX / w) * 100)) * 10) / 10;
    var y = Math.round(Math.min(100, Math.max(0, (e.clientY / h) * 100)) * 10) / 10;
    if (!el) {
      if (tool === 'pick' && pickAnywhere) {
        e.preventDefault();
        e.stopPropagation();
        report({ type: 'octocode-slides:picked', tag: '', selector: '', text: '', html: '', x: x, y: y });
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    clearHover();
    if (tool === 'pick') {
      report(elementMessage(el, 'octocode-slides:picked', x, y));
    } else if (tool === 'text') {
      requestText(el, e);
    }
  }, true);

  document.addEventListener('dblclick', function (e) {
    if (tool !== 'context' || inline) return;
    var el = pickable(e.target);
    if (!el || !TEXT_TAGS.test(el.tagName)) return;
    e.preventDefault(); e.stopPropagation(); requestText(el, e);
  }, true);

  /** @param {HTMLElement} el @param {MouseEvent} [event] */
  function requestText(el, event) {
    if (!TEXT_TAGS.test(el.tagName)) return;
    var selection = window.getSelection();
    var range = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    if (!range || !el.contains(range.commonAncestorContainer)) {
      // Chromium's point API retains the clicked caret even after the async source read.
      var pointDocument = /** @type {Document & {caretRangeFromPoint?: (x: number, y: number) => Range | null}} */ (document);
      range = event && pointDocument.caretRangeFromPoint ? pointDocument.caretRangeFromPoint(event.clientX, event.clientY) : null;
    }
    editPointer = { el: el, range: range && el.contains(range.commonAncestorContainer) ? range : null };
    selectElement(el, false);
    reportSelection('octocode-slides:selected');
    var rect = el.getBoundingClientRect();
    report(elementMessage(el, 'octocode-slides:edit-request', rect.right / window.innerWidth * 100, rect.top / window.innerHeight * 100));
  }

  /** Preserve authored newlines and BRs; browser-created block boundaries are line breaks. @param {Node} node */
  function inlineText(node) {
    if (node.nodeType === 3) return node.textContent || '';
    if (node.nodeName === 'BR') return '\n';
    var text = '';
    Array.prototype.forEach.call(node.childNodes, function (/** @type {Node} */ child) {
      if (/^(DIV|P)$/.test(child.nodeName) && text && !text.endsWith('\n')) text += '\n';
      text += inlineText(child);
    });
    return text.replace(/\r\n?/g, '\n');
  }

  /** Apply CSS whitespace to authored text without confusing source newlines with BRs.
   * @param {Node} node @param {string} whiteSpace @param {boolean} [trimEnd] @param {boolean} [trimStart]
   */
  function visibleText(node, whiteSpace, trimEnd, trimStart) {
    var segments = [''];
    /** @param {Node} current */
    function collect(current) {
      if (current.nodeType === 3) segments[segments.length - 1] += current.textContent || '';
      else if (current.nodeName === 'BR') segments.push('');
      else Array.prototype.forEach.call(current.childNodes, collect);
    }
    collect(node);
    return segments.map(function (text, index) {
      text = text.replace(/\r\n?/g, '\n');
      if (/^(pre|pre-wrap|break-spaces)$/.test(whiteSpace)) return text;
      if (whiteSpace === 'pre-line') text = text.replace(/[ \t\f]+/g, ' ').replace(/ *\n */g, '\n');
      else text = text.replace(/[ \t\n\f]+/g, ' ');
      if (index > 0 || trimStart !== false) text = text.replace(/^ +/, '');
      return index < segments.length - 1 || trimEnd !== false ? text.replace(/ +$/, '') : text;
    }).join('\n');
  }

  /** @param {Element} el */
  function inlineDisplay(el) {
    var display = window.getComputedStyle(el).display;
    // Fall back to ordinary HTML flow when computed display is unavailable.
    return display || (/^(SPAN|STRONG|EM|B|I|A|LABEL|SMALL|CODE|BR|IMG|SVG)$/.test(el.tagName) ? 'inline' : 'block');
  }

  /** A collapsed edge space can separate words across adjacent inline elements.
   * Stop at a real line/block boundary, not at harmless source indentation.
   * @param {HTMLElement} target @param {boolean} before
   */
  function hasInlineNeighbor(target, before) {
    /** @param {Node} node @returns {number} 1 = visible content, -1 = boundary, 0 = empty */
    function content(node) {
      if (node.nodeType === 3) return /[^ \t\r\n\f]/.test(node.textContent || '') ? 1 : 0;
      if (node.nodeType !== 1) return 0;
      var el = /** @type {Element} */ (node), display = inlineDisplay(el);
      if (display === 'none') return 0;
      if (el.tagName === 'BR') return -1;
      if (/^inline-/.test(display) || /^(IMG|SVG)$/.test(el.tagName)) return 1;
      if (display !== 'inline' && display !== 'contents') return -1;
      for (var child = before ? el.lastChild : el.firstChild; child; child = before ? child.previousSibling : child.nextSibling) {
        var found = content(child); if (found) return found;
      }
      return 0;
    }
    for (var el = /** @type {Element | null} */ (target); el && /^(inline|contents)$/.test(inlineDisplay(el)); el = el.parentElement) {
      for (var sibling = before ? el.previousSibling : el.nextSibling; sibling; sibling = before ? sibling.previousSibling : sibling.nextSibling) {
        var found = content(sibling); if (found) return found === 1;
      }
    }
    return false;
  }

  /** Map the clicked text range through whitespace collapse before replacing its DOM.
   * @param {HTMLElement} target @param {Node} node @param {number} offset @param {string} whiteSpace @param {boolean} trimStart
   */
  function visibleOffset(target, node, offset, whiteSpace, trimStart) {
    var prefix = document.createRange();
    prefix.selectNodeContents(target); prefix.setEnd(node, offset);
    return visibleText(prefix.cloneContents(), whiteSpace, false, trimStart).length;
  }

  /** @param {InlineDraft} draft @param {'change' | 'commit' | 'cancel' | 'error'} action @param {string} [error] */
  function reportInline(draft, action, error) {
    report({ type: 'octocode-slides:inline-text', session: draft.id, action: action, text: draft.text, ...(error ? { error: error } : {}) });
  }

  /** @param {any} data */
  function beginText(data) {
    if (typeof data.session !== 'string' || !data.session.length || data.session.length > 100) return;
    var el = elementAtPath(data.path);
    var valid = el && typeof data.html === 'string' && data.html.length <= 200000 &&
      typeof data.text === 'string' && data.text.length <= 20000 && cleanClone(el).outerHTML === data.html &&
      TEXT_TAGS.test(el.tagName) && Array.prototype.every.call(el.children, function (/** @type {Element} */ child) { return child.tagName === 'BR'; });
    if (!valid || inline) {
      report({ type: 'octocode-slides:inline-text', session: data.session, action: 'error', text: typeof data.text === 'string' && data.text.length <= 20000 ? data.text : '',
        error: inline ? 'Finish the current text edit before editing another element.' : 'This element changed or contains formatting. Select its text again.' });
      return;
    }
    var target = /** @type {HTMLElement} */ (el);
    var whiteSpace = window.getComputedStyle(target).whiteSpace || 'normal';
    var trimStart = !hasInlineNeighbor(target, true);
    var initialText = visibleText(target, whiteSpace, !hasInlineNeighbor(target, false), trimStart);
    var pointerRange = editPointer && editPointer.el === target ? editPointer.range : null;
    var draft = /** @type {InlineDraft} */ ({ id: data.session, el: target, originalHTML: target.innerHTML, originalText: data.text, initialText: initialText,
      attributes: Array.prototype.map.call(target.attributes, function (/** @type {Attr} */ a) { return [a.name, a.value]; }),
      text: data.text, html: target.innerHTML, composing: false, commitRequested: false, phase: 'editing', cleanup: function () {} });
    // Editing uses intentional newlines. Source indentation must not become visible
    // merely because the editor enables pre-wrap for newly typed line breaks.
    if (inlineText(target) !== initialText) {
      var offsets = pointerRange && target.contains(pointerRange.commonAncestorContainer) ? [
        visibleOffset(target, pointerRange.startContainer, pointerRange.startOffset, whiteSpace, trimStart),
        visibleOffset(target, pointerRange.endContainer, pointerRange.endOffset, whiteSpace, trimStart)
      ] : null;
      target.textContent = initialText;
      draft.html = target.innerHTML;
      pointerRange = null;
      if (offsets && target.firstChild) {
        pointerRange = document.createRange();
        pointerRange.setStart(target.firstChild, Math.min(initialText.length, offsets[0]));
        pointerRange.setEnd(target.firstChild, Math.min(initialText.length, offsets[1]));
      }
    }
    inline = draft;
    selectElement(target, false);
    editing = target;
    target.classList.add('__deck-editing');
    target.setAttribute('contenteditable', 'plaintext-only');
    target.setAttribute('role', 'textbox');
    target.setAttribute('aria-label', 'Edit slide text');
    target.setAttribute('aria-multiline', 'true');
    target.style.setProperty('white-space', 'pre-wrap');
    target.focus();
    var selection = window.getSelection();
    if (selection) {
      var range = pointerRange;
      if (!range || !target.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(target); range.collapse(false); }
      selection.removeAllRanges(); selection.addRange(range);
    }
    editPointer = null;
    function changed() {
      if (inline !== draft || draft.phase !== 'editing') return;
      var text = inlineText(target);
      if (text.length > 20000) {
        target.innerHTML = draft.html;
        reportInline(draft, 'error', 'Text is limited to 20,000 characters. The last input was not inserted.');
        return;
      }
      // Equality uses the visible starting value; persistence uses the exact source
      // snapshot for a no-op, including a user undoing their edit before leaving.
      draft.text = text === draft.initialText ? draft.originalText : text; draft.html = target.innerHTML;
      reportInline(draft, 'change');
    }
    /** @param {KeyboardEvent} ev */
    function onKey(ev) {
      ev.stopPropagation();
      if (ev.isComposing || draft.composing || ev.keyCode === 229) return;
      if (ev.key === 'Escape') { ev.preventDefault(); finishText('cancel', false); }
      else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); finishText('commit', false); }
    }
    function onBlur() { finishText('commit', false); }
    function onHide() { draft.composing = false; finishText('commit', false); }
    function onCompositionStart() { draft.composing = true; }
    function onCompositionEnd() { draft.composing = false; changed(); if (draft.commitRequested) finishText('commit', false); }
    /** @param {InputEvent} ev */
    function beforeInput(ev) {
      if (!ev.data || ev.inputType.indexOf('insert') !== 0) return;
      var selected = window.getSelection();
      var replaced = selected && selected.rangeCount && target.contains(selected.getRangeAt(0).commonAncestorContainer) ? selected.toString().length : 0;
      if (inlineText(target).length - replaced + ev.data.length > 20000) {
        ev.preventDefault(); reportInline(draft, 'error', 'Text is limited to 20,000 characters. The last input was not inserted.');
      }
    }
    target.addEventListener('keydown', onKey, true);
    target.addEventListener('blur', onBlur, true);
    target.addEventListener('input', changed);
    target.addEventListener('beforeinput', beforeInput);
    target.addEventListener('compositionstart', onCompositionStart);
    target.addEventListener('compositionend', onCompositionEnd);
    window.addEventListener('pagehide', onHide);
    draft.cleanup = function () {
      target.removeEventListener('keydown', onKey, true);
      target.removeEventListener('blur', onBlur, true);
      target.removeEventListener('input', changed);
      target.removeEventListener('beforeinput', beforeInput);
      target.removeEventListener('compositionstart', onCompositionStart);
      target.removeEventListener('compositionend', onCompositionEnd);
      window.removeEventListener('pagehide', onHide);
    };
  }

  /** @param {unknown} action @param {boolean} explicit */
  function finishText(action, explicit) {
    var draft = inline;
    if (!draft) return;
    if (action === 'commit') {
      if (draft.phase !== 'editing') { if (explicit) reportInline(draft, 'commit'); return; }
      if (draft.composing) { draft.commitRequested = true; return; }
      var text = inlineText(draft.el);
      if (text.length > 20000) { reportInline(draft, 'error', 'Text is limited to 20,000 characters. Shorten the draft before saving.'); return; }
      draft.text = text === draft.initialText ? draft.originalText : text;
      draft.phase = 'committing';
      draft.cleanup(); editing = null;
      draft.el.removeAttribute('contenteditable');
      reportInline(draft, 'commit');
    } else if (action === 'failed') {
      draft.phase = 'failed'; draft.cleanup(); editing = null;
      draft.el.removeAttribute('contenteditable');
      draft.el.classList.add('__deck-edit-error');
    } else if (action === 'cancel' || action === 'saved') {
      draft.cleanup(); editing = null; inline = null;
      if (action === 'cancel' || draft.text === draft.originalText) draft.el.innerHTML = draft.originalHTML;
      var target = draft.el;
      Array.prototype.slice.call(target.attributes).forEach(function (/** @type {Attr} */ attr) { target.removeAttribute(attr.name); });
      draft.attributes.forEach(function (attr) { target.setAttribute(attr[0], attr[1]); });
      target.classList.remove('__deck-hover', '__deck-selected', '__deck-editing', '__deck-edit-error');
      if (target.getAttribute('class') === '' && !draft.attributes.some(function (attr) { return attr[0] === 'class'; })) target.removeAttribute('class');
      if (selectedEl === draft.el) draft.el.classList.add('__deck-selected');
      if (action === 'cancel') reportInline(draft, 'cancel');
    }
  }

  // Forward clicks anywhere on the slide as a "wake the HUD" hint so the
  // top-right status pill reappears when the user interacts with a slide.
  document.addEventListener('mousemove', function () {
    try { window.parent.postMessage({ type: 'octocode-slides:activity' }, '*'); }
    catch (_) {}
  }, { passive: true });
})();

// The deck's shared frame (logo / footer / page number from octodeck.json "chrome"):
// js/chrome.js sits next to this file, so every slide gets it without including it.
(function () {
  var me = /** @type {HTMLScriptElement | null} */ (document.currentScript);
  if (!me || !me.src || document.querySelector('script[data-octodeck-chrome]')) return;
  var s = document.createElement('script');
  s.src = new URL('chrome.js', me.src).href;
  s.async = true;
  s.setAttribute('data-octodeck-chrome', '');
  (document.head || document.documentElement).appendChild(s);
})();
