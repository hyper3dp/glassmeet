/*!
 * GlassMeet embed: put a GlassMeet booking page on any website.
 *
 * Inline (the calendar sits in the page and grows to fit):
 *   <div class="glassmeet-inline" data-url="https://hyper3dp.github.io/glassmeet/book/EVENT_ID"></div>
 *   <script src="https://hyper3dp.github.io/glassmeet/embed.js" async></script>
 *
 * Pop-up from your own link or button:
 *   <a href="#" data-glassmeet-popup="https://hyper3dp.github.io/glassmeet/book/EVENT_ID">Book a call</a>
 *
 * Floating button in the corner of every page:
 *   <script src="https://hyper3dp.github.io/glassmeet/embed.js" async
 *     data-button-url="https://hyper3dp.github.io/glassmeet/book/EVENT_ID"
 *     data-button-text="Book a call" data-button-color="#2b7a75"></script>
 *
 * Optional on any of them: data-theme="light" or "dark" (default: follows the visitor's device).
 * From your own code: GlassMeet.open(url, { theme, onClose }) and GlassMeet.close().
 * When someone books, the page receives a "glassmeet:booked" event on window with the
 * booking times and event name in event.detail (never the guest's details).
 */
(function () {
  if (window.GlassMeet && window.GlassMeet.version) return;

  var script = document.currentScript;
  var frames = []; // iframes this script created, so messages are only taken from them

  function frameUrl(url, theme) {
    var u = new URL(url, location.href);
    u.searchParams.set('embed', '1');
    if (theme === 'light' || theme === 'dark') u.searchParams.set('theme', theme);
    return u.toString();
  }

  function makeFrame(url, theme, title) {
    var iframe = document.createElement('iframe');
    iframe.src = frameUrl(url, theme);
    iframe.title = title || 'Book a meeting';
    iframe.setAttribute('allow', 'clipboard-write');
    // the frame's colour scheme must match the page inside it, or browsers paint it opaque
    var scheme = theme === 'light' || theme === 'dark' ? theme : 'light dark';
    iframe.style.cssText = 'display:block;width:100%;border:0;background:transparent;color-scheme:' + scheme + ';';
    frames.push(iframe);
    return iframe;
  }

  function mountInline(el) {
    if (el.getAttribute('data-glassmeet-mounted')) return;
    el.setAttribute('data-glassmeet-mounted', '1');
    var iframe = makeFrame(el.getAttribute('data-url'), el.getAttribute('data-theme'), el.getAttribute('data-title'));
    iframe.style.height = (parseInt(el.getAttribute('data-height'), 10) || 700) + 'px';
    iframe.setAttribute('data-glassmeet-autoheight', '1');
    iframe.loading = 'lazy';
    el.appendChild(iframe);
  }

  // ── pop-up ───────────────────────────────────────────────────────────────
  var overlay = null;
  var lastFocus = null;
  var savedOverflow = '';
  var onClosed = null;

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.documentElement.style.overflow = savedOverflow;
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    var done = onClosed;
    onClosed = null;
    if (done) done();
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(url, opts) {
    opts = opts || {};
    close();
    onClosed = typeof opts.onClose === 'function' ? opts.onClose : null;
    lastFocus = document.activeElement;
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', opts.title || 'Book a meeting');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,21,22,.55);';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    // phones: full screen on the page colour; wider: the booking card floats on the dim
    // backdrop with the close button just above its corner (clear of the card's ribbon)
    var phone = window.matchMedia('(max-width: 640px)').matches;
    var dark = opts.theme ? opts.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var box = document.createElement('div');
    box.style.cssText = phone
      ? 'position:fixed;inset:0;background:' + (dark ? '#0f1516' : '#f6f9f9') + ';'
      : 'position:relative;width:100%;max-width:1080px;height:min(760px,calc(100vh - 88px));margin-top:44px;';

    var iframe = makeFrame(url, opts.theme, opts.title);
    iframe.style.height = '100%';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Close');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    btn.style.cssText = (phone ? 'position:absolute;top:10px;right:10px;' : 'position:absolute;top:-44px;right:8px;') + 'z-index:1;width:36px;height:36px;border-radius:999px;border:1px solid rgba(52,66,72,.18);background:#fff;color:#344248;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);';
    btn.addEventListener('click', close);

    box.appendChild(iframe);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
    btn.focus();
  }

  // ── floating button ──────────────────────────────────────────────────────
  function readableOn(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#fff';
    var n = parseInt(m[1], 16);
    var lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#14201f' : '#fff';
  }

  function mountButton() {
    var url = script && script.getAttribute('data-button-url');
    if (!url) return;
    var color = script.getAttribute('data-button-color') || '#2b7a75';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = script.getAttribute('data-button-text') || 'Book a meeting';
    btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483645;height:48px;padding:0 22px;border:0;border-radius:999px;font:600 15px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2);background:' + color + ';color:' + readableOn(color) + ';';
    btn.addEventListener('click', function () { open(url, { theme: script.getAttribute('data-theme') }); });
    document.body.appendChild(btn);
  }

  // ── messages from the booking page inside the frame ──────────────────────
  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.source !== 'glassmeet') return;
    var iframe = null;
    for (var i = 0; i < frames.length; i++) if (frames[i].contentWindow === e.source) iframe = frames[i];
    if (!iframe) return;
    if (data.type === 'height' && iframe.getAttribute('data-glassmeet-autoheight') && data.height > 0) {
      iframe.style.height = Math.max(400, Math.min(data.height, 4000)) + 'px';
    }
    if (data.type === 'booked') {
      window.dispatchEvent(new CustomEvent('glassmeet:booked', { detail: { booking: data.booking, event: data.event } }));
    }
  });

  // links and buttons marked data-glassmeet-popup, including ones added later
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-glassmeet-popup]');
    if (!el) return;
    e.preventDefault();
    open(el.getAttribute('data-glassmeet-popup') || el.getAttribute('href'), { theme: el.getAttribute('data-theme'), title: el.getAttribute('data-title') });
  });

  function init() {
    var els = document.querySelectorAll('.glassmeet-inline[data-url]');
    for (var i = 0; i < els.length; i++) mountInline(els[i]);
    mountButton();
  }

  window.GlassMeet = { version: '1', open: open, close: close, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
