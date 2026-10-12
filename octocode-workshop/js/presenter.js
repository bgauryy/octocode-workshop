// @ts-check
/**
 * Octocode Slides — Presenter View (v2)
 *
 * Press P in the deck shell to open the popup: current + next slide previews,
 * slide title, speaker notes, elapsed timer (survives refresh),
 * wall clock, and jump-to-slide. Arrow keys / Space inside the popup drive
 * the deck, so the presenter can keep focus on the notes window.
 *
 * Speaker notes come from `<aside class="speaker-notes">` in each slide, reported
 * by the slide's navbridge over postMessage (slides render on their own origin when
 * served by octodeck, so their documents are not readable from here).
 *
 * Called by index.html:
 *   initPresenter({ slides, getIndex, getFrame, getInfo })
 *     slides   – playable slides [{ id, path, title? }]
 *     getIndex – () => current index
 *     getFrame – (i) => iframe for slide i
 *     getInfo  – (i) => { title, notes } reported by slide i, or null until it answers
 */
/**
 * @typedef {{ id: string, path: string, title?: string }} PresenterSlide
 * @typedef {{ title?: string, subtitle?: string, notes?: string }} PresenterInfo
 * @typedef {{
 *   slides: PresenterSlide[],
 *   getIndex: () => number,
 *   getFrame: (i: number) => HTMLIFrameElement | null | undefined,
 *   getInfo?: (i: number) => PresenterInfo | null | undefined
 * }} PresenterOptions
 */
/** @param {PresenterOptions} opts */
function initPresenter(opts) {
  var slides = opts.slides;
  var LS_KEY = 'octocode-slides:timer:' + (document.title || 'deck') + ':' + location.pathname;

  /** @type {Window | null} */
  var win = null;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  var timerRef = undefined;
  /** @type {number | null} */
  var startTime = null;

  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    // A timer older than 6 hours belongs to a previous talk — start fresh.
    if (saved && saved.startTime && Date.now() - saved.startTime < 6 * 3600_000) startTime = saved.startTime;
  } catch (_) {}

  var POPUP_HTML =
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Presenter View</title><style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'html,body{height:100%;background:#0a0a0a;color:#e0e0e0;font-family:system-ui,sans-serif;overflow:hidden}' +
    '#wrap{display:grid;grid-template-rows:auto auto 1fr auto;height:100vh;padding:14px 18px;gap:10px}' +
    '#topbar{display:flex;align-items:baseline;gap:12px}' +
    '#where{flex:1;min-width:0}' +
    '#slide-name{font-size:14px;font-weight:600;color:#d8d8d8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#slide-subtitle{font-size:12px;color:#aeb7c5;line-height:1.4;max-height:2.8em;overflow:auto}#slide-subtitle:empty{display:none}' +
    '#pos{font-size:12px;color:#777;font-variant-numeric:tabular-nums}' +
    '#clock{font-size:12px;color:#777;font-variant-numeric:tabular-nums}' +
    '#timer{font-variant-numeric:tabular-nums;font-size:22px;font-weight:700;letter-spacing:.08em}' +
    '#timer.warn{color:#f59e0b}#timer.over{color:#ef4444}' +
    '#previews{display:grid;grid-template-columns:3fr 2fr;gap:12px;align-items:start}' +
    '.pv-col{display:flex;flex-direction:column;gap:5px;min-width:0}' +
    '.pv-label{font-size:10px;color:#666;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.pv-box{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:5px;background:#000;border:1px solid #222}' +
    '.pv-box iframe{position:absolute;top:0;left:0;width:1280px;height:720px;border:none;pointer-events:none;transform-origin:top left}' +
    '.pv-empty{position:absolute;inset:0;display:grid;place-items:center;font-size:11px;color:#444;font-style:italic}' +
    '#notes{background:#141414;border:1px solid #2a2a2a;border-radius:6px;padding:12px 16px;' +
      'font-size:var(--notes-size,16px);line-height:1.65;overflow-y:auto;white-space:pre-wrap;color:#d6d6d6;min-height:0}' +
    '#notes.empty{color:#555;font-style:italic}' +
    '#bottom{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid #1e1e1e;padding-top:8px;font-size:12px;color:#666}' +
    '#jump-input{width:48px;background:#1e1e1e;border:1px solid #333;border-radius:4px;color:#ccc;font:13px system-ui;padding:3px 6px;text-align:center}' +
    '#spacer{flex:1}' +
    'button{background:#1e1e1e;border:1px solid #333;border-radius:4px;color:#aaa;font:12px system-ui;padding:4px 10px;cursor:pointer}' +
    'button:hover{background:#2a2a2a;color:#eee}' +
    '</style></head><body><div id="wrap">' +
    '<div id="topbar"><div id="where"><div id="slide-name">—</div><div id="slide-subtitle"></div></div>' +
    '<span id="pos"></span><span id="clock"></span><span id="timer">00:00</span></div>' +
    '<div id="previews">' +
    '<div class="pv-col"><div class="pv-label">Now</div><div class="pv-box" id="curr-box"><div class="pv-empty">—</div></div></div>' +
    '<div class="pv-col"><div class="pv-label" id="next-label">Next</div><div class="pv-box" id="next-box"><div class="pv-empty">(last slide)</div></div></div>' +
    '</div>' +
    '<div id="notes" class="empty">(no speaker notes)</div>' +
    '<div id="bottom">Slide <input id="jump-input" type="number" min="1" value="1"><span id="jump-total"></span>' +
    '<span id="spacer"></span><button id="btn-smaller" title="Smaller notes">A−</button><button id="btn-bigger" title="Bigger notes">A+</button>' +
    '<button id="btn-reset">Reset timer</button><button id="btn-close">Close</button></div>' +
    '</div><script>' +
    'var size=16;function setSize(d){size=Math.max(11,Math.min(30,size+d));document.documentElement.style.setProperty("--notes-size",size+"px")}' +
    'document.getElementById("btn-smaller").onclick=function(){setSize(-2)};' +
    'document.getElementById("btn-bigger").onclick=function(){setSize(2)};' +
    'function fit(){["curr","next"].forEach(function(id){var b=document.getElementById(id+"-box");var f=b.querySelector("iframe");' +
    'if(f)f.style.transform="scale("+(b.clientWidth/1280)+")"})}' +
    'window.addEventListener("resize",fit);' +
    'function show(id,url){var b=document.getElementById(id+"-box");var f=b.querySelector("iframe");' +
    'if(!url){b.innerHTML=\'<div class="pv-empty">(last slide)</div>\';return}' +
    'if(!f||f.getAttribute("src")!==url){b.innerHTML="";f=document.createElement("iframe");f.src=url;f.tabIndex=-1;' +
    'f.onload=function(){try{this.contentWindow.postMessage({type:"octocode-slides:activate"},"*")}catch(_){}};b.appendChild(f)}fit()}' +
    'window.addEventListener("message",function(e){var d=e.data;if(!d||d.type!=="octocode-slides:presenter-update")return;' +
    'var n=document.getElementById("notes");if(d.notes){n.textContent=d.notes;n.className=""}else{n.textContent="(no speaker notes)";n.className="empty"}' +
    'document.getElementById("slide-name").textContent=d.title||"—";' +
    'document.getElementById("slide-subtitle").textContent=d.subtitle||"";' +
    'document.getElementById("pos").textContent=(d.index+1)+" / "+d.total;' +
    'document.getElementById("jump-total").textContent="/ "+d.total;' +
    'var j=document.getElementById("jump-input");j.max=d.total;if(document.activeElement!==j)j.value=d.index+1;' +
    'document.getElementById("next-label").textContent=d.nextTitle?"Next · "+d.nextTitle:"Next";' +
    'show("curr",d.currUrl);show("next",d.nextUrl)});' +
    'document.getElementById("jump-input").addEventListener("change",function(){var n=parseInt(this.value,10);' +
    'if(isFinite(n)&&window.opener)window.opener.postMessage({type:"octocode-slides:presenter-goto",index:n-1},"*")});' +
    'document.addEventListener("keydown",function(e){if(e.target.tagName==="INPUT")return;' +
    'var k={ArrowRight:1,ArrowLeft:1,ArrowUp:1,ArrowDown:1," ":1,PageUp:1,PageDown:1,Home:1,End:1,b:1,B:1,w:1,W:1};' +
    'if(k[e.key]&&window.opener){e.preventDefault();window.opener.postMessage({type:"octocode-slides:presenter-key",key:e.key},"*")}});' +
    'document.getElementById("btn-reset").onclick=function(){window.opener&&window.opener.postMessage({type:"octocode-slides:presenter-reset"},"*")};' +
    'document.getElementById("btn-close").onclick=function(){window.close()};' +
    '<\/script></body></html>';

  /** @param {number} n */
  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    if (!win || win.closed) { clearInterval(timerRef); return; }
    var elapsed = Math.max(0, Math.floor((Date.now() - (startTime || 0)) / 1000));
    var t = win.document.getElementById('timer');
    var c = win.document.getElementById('clock');
    if (t) {
      t.textContent = pad(Math.floor(elapsed / 60)) + ':' + pad(elapsed % 60);
      t.className = elapsed > 3600 ? 'over' : elapsed > 2700 ? 'warn' : '';
    }
    if (c) { var d = new Date(); c.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  }

  function startTimer() {
    if (!startTime) startTime = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify({ startTime: startTime })); } catch (_) {}
    clearInterval(timerRef);
    timerRef = setInterval(tick, 1000);
    tick();
  }

  // Slides may render on another origin, so title and notes come from the shell's cache
  // (each slide reports them by message — see navbridge.js), never from the frame's document.
  /** @param {number} i */
  function infoOf(i) {
    return (opts.getInfo && opts.getInfo(i)) || null;
  }

  /** @param {number} i */
  function titleOf(i) {
    var s = slides[i];
    if (!s) return null;
    var inf = infoOf(i);
    return (inf && inf.title) || s.title || s.id;
  }

  /** @param {number} i */
  function readNotes(i) {
    var inf = infoOf(i);
    if (!inf) return opts.getInfo ? '' : '(speaker notes unavailable — update the deck: npx @octocodeai/octodeck upgrade)';
    return inf.notes || '';
  }

  /** @param {number} i */
  function urlOf(i) {
    var f = opts.getFrame(i);
    if (f && f.src) return f.src;
    if (f && f.dataset && f.dataset.src) return f.dataset.src; // not loaded yet (shell load order)
    var base = location.href.replace(/[#?].*$/, '').replace(/[^\/]*$/, '');
    return slides[i] ? base + slides[i].path : null;
  }

  function push() {
    if (!win || win.closed) return;
    var idx = opts.getIndex();
    var curr = slides[idx];
    var next = slides[idx + 1];
    // Sent now, and again by the shell when this slide's notes arrive (onSlideChange).
    win.postMessage({
      type: 'octocode-slides:presenter-update',
      index: idx,
      total: slides.length,
      title: titleOf(idx),
      subtitle: (opts.getInfo && opts.getInfo(idx) || {}).subtitle || '',
      nextTitle: titleOf(idx + 1),
      notes: readNotes(idx),
      currUrl: curr ? urlOf(idx) : null,
      nextUrl: next ? urlOf(idx + 1) : null
    }, '*');
  }

  function open() {
    if (win && !win.closed) { win.focus(); return; }
    win = window.open('', 'octocode-presenter', 'width=900,height=640,resizable=yes');
    if (!win) { console.warn('[presenter] Popup blocked — allow popups for this origin.'); return; }
    win.document.open();
    win.document.write(POPUP_HTML);
    win.document.close();
    startTimer();
    setTimeout(push, 200);
  }

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'octocode-slides:presenter-reset') {
      startTime = Date.now();
      try { localStorage.setItem(LS_KEY, JSON.stringify({ startTime: startTime })); } catch (_) {}
      tick();
    }
  });

  return { open: open, push: push, onSlideChange: push };
}
