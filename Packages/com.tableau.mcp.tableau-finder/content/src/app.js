/* Tableau Finder — a Finder-style browser for a Tableau site's projects, workbooks and data sources.
 * Talks to the Tableau REST API directly (PAT sign-in). Falls back to an in-memory sample site. */
(function () {
  'use strict';

  var CFG = window.FINDER_CONFIG || {};
  // The Tableau server/pod origin is never hardcoded: use an explicit config/remembered value if one was given
  // (standalone browser use), otherwise derive it from the page that is hosting this extension.
  function serverRoot() {
    var s = '';
    try { s = (JSON.parse(localStorage.getItem('tf.conn') || '{}').server) || ''; } catch (e) { /* blocked */ }
    s = s || CFG.root || '';
    if (!s) { try { if (location.ancestorOrigins && location.ancestorOrigins.length) s = location.ancestorOrigins[0]; } catch (e) { /* ignore */ } }
    if (!s) { try { if (document.referrer) s = new URL(document.referrer).origin; } catch (e) { /* ignore */ } }
    return String(s || '').replace(/\/+$/, '');
  }
  var root = document.getElementById('app');

  /* =============================== helpers =============================== */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    if (kids == null) return;
    if (!Array.isArray(kids)) kids = [kids];
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) add(el, c);
      else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  var tpl = document.createElement('template');
  function icon(name, cls) {
    // Icons are static strings defined below (never live data).
    tpl.innerHTML = (ICONS[name] || ICONS.doc).trim();
    var s = tpl.content.firstChild.cloneNode(true);
    if (cls) s.setAttribute('class', cls);
    return s;
  }
  function lsGet(k, d) { try { var v = localStorage.getItem('tf.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  // Theme: no saved choice = follow the user's OS/browser preference (the CSS handles that via prefers-color-scheme).
  var themeChoice = lsGet('theme', null); // kept in memory too, in case localStorage is blocked in the extension sandbox
  var darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function effectiveTheme() { var t = themeChoice; return t === 'light' || t === 'dark' ? t : (darkMQ && darkMQ.matches ? 'dark' : 'light'); }
  function applyTheme() {
    var t = themeChoice;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme();
  function lsSet(k, v) { try { localStorage.setItem('tf.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function uid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function arr(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    if (!iso) return '--';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '--';
    var t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    var now = new Date();
    var diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (diff === 0) return 'Today at ' + t;
    if (diff === 1) return 'Yesterday at ' + t;
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' at ' + t;
  }
  function fmtBytes(b) {
    if (b == null || isNaN(b)) return '--';
    if (b < 1000) return b + ' bytes';
    var u = ['KB', 'MB', 'GB', 'TB'], i = -1;
    do { b /= 1000; i++; } while (b >= 1000 && i < u.length - 1);
    return (b >= 100 ? Math.round(b) : b.toFixed(1)) + ' ' + u[i];
  }
  // REST reports workbook size in MB; data source size may be bytes. Normalize heuristically.
  function sizeToBytes(v) {
    if (v == null || v === '') return null;
    v = Number(v);
    if (isNaN(v)) return null;
    return v < 100000 ? v * 1e6 : v;
  }
  var KIND = { project: 'Project', workbook: 'Tableau Workbook', datasource: 'Published Data Source' };
  var TAG_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#8e8e93'];
  function tagColor(label) {
    var x = 0;
    for (var i = 0; i < label.length; i++) x = (x * 31 + label.charCodeAt(i)) >>> 0;
    return TAG_COLORS[x % TAG_COLORS.length];
  }

  /* =============================== icons =============================== */
  var ICONS = {
    folderBig: '<svg viewBox="0 0 64 64"><path d="M5 15.5A4.5 4.5 0 0 1 9.5 11h14.2c1.2 0 2.3.5 3.2 1.3L30 15.5h24.5A4.5 4.5 0 0 1 59 20v4H5z" fill="#f2a516"/><rect x="5" y="19" width="54" height="36" rx="4.5" fill="#ffc94d"/><rect x="5" y="19" width="54" height="2" fill="#ffe08a" opacity=".7"/></svg>',
    workbookBig: '<svg viewBox="0 0 64 64"><path d="M14 5h26l12 12v40a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#fff" stroke="#c7c7cc"/><path d="M40 5v9a3 3 0 0 0 3 3h9" fill="#ececf0" stroke="#c7c7cc"/><rect x="18" y="38" width="5" height="12" rx="1" fill="#1f77b4"/><rect x="25.5" y="31" width="5" height="19" rx="1" fill="#ff7f0e"/><rect x="33" y="35" width="5" height="15" rx="1" fill="#2ca02c"/><rect x="40.5" y="27" width="5" height="23" rx="1" fill="#e15759"/><path d="M27 15v10M22 20h10" stroke="#5b6f8c" stroke-width="2.4" stroke-linecap="round"/></svg>',
    datasourceBig: '<svg viewBox="0 0 64 64"><path d="M12 15v34c0 4.4 9 8 20 8s20-3.6 20-8V15" fill="#54a3ea"/><ellipse cx="32" cy="15" rx="20" ry="8" fill="#8cc6f7"/><path d="M12 27c0 4.4 9 8 20 8s20-3.6 20-8M12 38c0 4.4 9 8 20 8s20-3.6 20-8" fill="none" stroke="#8cc6f7" stroke-width="1.6"/></svg>',
    server: '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="4.5" rx="1.2" fill="#0f8b8d"/><rect x="2" y="9" width="12" height="4.5" rx="1.2" fill="#1f8bff"/><circle cx="4.6" cy="4.75" r=".9" fill="#fff"/><circle cx="4.6" cy="11.25" r=".9" fill="#fff"/></svg>',
    folder: '<svg viewBox="0 0 16 16"><path d="M1.5 4A1.5 1.5 0 0 1 3 2.5h3.2l1.5 1.5H13A1.5 1.5 0 0 1 14.5 5.5V6h-13z" fill="#f2a516"/><rect x="1.5" y="5" width="13" height="8.5" rx="1.4" fill="#ffc94d"/></svg>',
    workbook: '<svg viewBox="0 0 16 16"><path d="M3.5 1.5h6l3 3v9.2a.8.8 0 0 1-.8.8H3.5a.8.8 0 0 1-.8-.8V2.3a.8.8 0 0 1 .8-.8z" fill="#fff" stroke="#b0b0b8" stroke-width=".8"/><rect x="4.5" y="9" width="1.6" height="3.5" fill="#1f77b4"/><rect x="7" y="7" width="1.6" height="5.5" fill="#ff7f0e"/><rect x="9.5" y="8" width="1.6" height="4.5" fill="#e15759"/></svg>',
    datasource: '<svg viewBox="0 0 16 16"><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" fill="#54a3ea"/><ellipse cx="8" cy="4" rx="5" ry="2" fill="#8cc6f7"/></svg>',
    back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
    fwd: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>',
    viewIcons: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
    viewList: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.6" rx=".8"/><rect x="2" y="7.2" width="12" height="1.6" rx=".8"/><rect x="2" y="11.4" width="12" height="1.6" rx=".8"/></svg>',
    viewCols: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.5"/><path d="M6 3v10M10 3v10"/></svg>',
    newFolder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.4H13c.7 0 1.2.5 1.2 1.2v6.6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2z"/><path d="M8 7v4M6 9h4" stroke-linecap="round"/></svg>',
    refresh: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5v3h-3"/></svg>',
    info: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4" stroke-linecap="round"/><circle cx="8" cy="5" r=".5" fill="currentColor"/></svg>',
    minimize: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M2 6h8"/></svg>',
    close: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>',
    sun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>',
    moon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/></svg>',
    search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/></svg>',
    clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
    grid: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 11V8M8 11V5M11 11V7" stroke-linecap="round"/></svg>',
    db: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/></svg>',
    person: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="5.5" r="2.7"/><path d="M2.8 14c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3" stroke-linecap="round"/></svg>',
    cloud: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M4.5 12.5a3 3 0 0 1-.3-6 4 4 0 0 1 7.6-.9 3 3 0 0 1 .2 6.9z"/></svg>',
    sbFolder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.4H13c.7 0 1.2.5 1.2 1.2v6.6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2z"/></svg>',
    tri: '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M3 1.5 7.5 5 3 8.5z"/></svg>',
    chev: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m3.5 1.5 3.5 3.5-3.5 3.5"/></svg>',
    up: '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M1.5 7 5 2.5 8.5 7z"/></svg>',
    down: '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M1.5 3 5 7.5 8.5 3z"/></svg>',
    sheet: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M5 11V8.5M8 11V6M11 11V7.5" stroke-linecap="round"/></svg>',
    warn: '<svg viewBox="0 0 56 56"><path d="M28 6 52 49H4z" fill="#ffcc00" stroke="#d9a800" stroke-linejoin="round" stroke-width="2"/><path d="M28 21v14" stroke="#1d1d1f" stroke-width="4" stroke-linecap="round"/><circle cx="28" cy="42" r="2.6" fill="#1d1d1f"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
    open: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/></svg>'
  };
  function bigIconName(it) { return it.kind === 'project' ? 'folderBig' : it.kind === 'workbook' ? 'workbookBig' : 'datasourceBig'; }
  function smallIconName(it) { return it.kind === 'project' ? 'folder' : it.kind; }

  /* =============================== transport =============================== */
  // Inside Tableau the extension frame has an opaque (null) origin, so browser fetch() to the REST API is
  // blocked by CORS. tableau.extensions.fetchAsync asks the Tableau host to make the request instead.
  // Both paths are wrapped in a minimal Response-like object: { ok, status, text(), blob() }.
  var bridgeReady = false;
  function hasBridge() { return bridgeReady && !!(window.tableau && tableau.extensions && typeof tableau.extensions.fetchAsync === 'function'); }
  function headerGet(hs, name) {
    if (!hs) return '';
    name = name.toLowerCase();
    for (var k in hs) if (Object.prototype.hasOwnProperty.call(hs, k) && k.toLowerCase() === name) return String(hs[k]);
    return '';
  }
  // The bridge's image body format isn't documented, so accept the plausible shapes and verify the bytes:
  //   data: URL | base64 (possibly double-encoded) | binary string | array of bytes | {data:[...]}
  function sniffImage(u8) {
    if (u8.length > 3 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return 'image/png';
    if (u8.length > 2 && u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'image/jpeg';
    if (u8.length > 3 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'image/gif';
    if (u8.length > 11 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'image/webp';
    return null;
  }
  var blobOf = {};
  function objUrl(b) { var u = URL.createObjectURL(b); blobOf[u] = b; return u; }
  function strBytes(str) { var u8 = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i) & 0xFF; return u8; }
  function tryB64(str) { try { return strBytes(atob(str.replace(/\s+/g, ''))); } catch (e) { return null; } }
  function bodyToImageBlob(body) {
    var cands = [];
    if (body && typeof body === 'object') {
      var arrLike = Array.isArray(body) ? body : (Array.isArray(body.data) ? body.data : null);
      if (arrLike) cands.push(new Uint8Array(arrLike));
      else if (body instanceof ArrayBuffer) cands.push(new Uint8Array(body));
      else if (typeof body.body === 'string') body = body.body;
    }
    if (typeof body === 'string') {
      var str = body.trim();
      var m = /^data:([^;,]+)?(;base64)?,/.exec(str);
      if (m) { str = str.slice(m[0].length); if (!m[2]) cands.push(strBytes(decodeURIComponent(str))); }
      var once = tryB64(str);
      if (once) {
        cands.push(once);
        // double-encoded? (decoded bytes are themselves base64 text, e.g. "iVBORw0K...")
        var asText = String.fromCharCode.apply(null, once.subarray(0, Math.min(once.length, 16)));
        if (/^[A-Za-z0-9+/]{8}/.test(asText)) { var twice = tryB64(new TextDecoder('latin1').decode(once)); if (twice) cands.push(twice); }
      }
      cands.push(strBytes(str)); // raw binary string
    }
    for (var k = 0; k < cands.length; k++) {
      var type = sniffImage(cands[k]);
      if (type) return new Blob([cands[k]], { type: type });
    }
    if (!bodyToImageBlob.warned) {
      bodyToImageBlob.warned = true;
      try { console.warn('[Tableau Finder] preview body is not a recognizable image', typeof body, typeof body === 'string' ? body.slice(0, 80) : body); } catch (e) { /* ignore */ }
    }
    return null;
  }
  function xfetch(url, init, asBlob) {
    init = init || {};
    if (!hasBridge()) return fetch(url, init);
    var opts = { method: init.method || 'GET', headers: init.headers || {} };
    if (init.body !== undefined) opts.body = init.body;
    if (asBlob) opts.base64EncodeResponse = true;
    if (init.urlVariables && Object.keys(init.urlVariables).length) opts.urlVariables = init.urlVariables;
    return tableau.extensions.fetchAsync(url, opts).then(function (res) {
      var body = res.body == null ? '' : res.body;
      var status = Number(res.status) || 0;
      return {
        ok: res.ok === true || res.ok === 'true' || (status >= 200 && status < 300),
        status: status,
        statusText: res.statusText || '',
        viaBridge: true,
        text: function () { return Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)); },
        blob: function () { var b = bodyToImageBlob(body); return b ? Promise.resolve(b) : Promise.reject(new Error('preview is not an image')); }
      };
    }, function (e) {
      var err = new Error('Tableau fetch bridge: ' + (e && (e.message || e.errorCode) || e));
      err.bridge = true; throw err;
    });
  }

  /* =============================== REST backend =============================== */
  function RestBackend(opts) {
    // REST calls are relative to the host page, e.g. /3.30/sites/{site-id}/workbooks/{workbook-id}
    this.root = (opts.root || '').replace(/\/+$/, '');
    this.base = (opts.apiBase || '').replace(/\/+$/, '');
    this.site = opts.site || '';
    this.patName = opts.patName;
    this.patSecret = opts.patSecret;
    this.ver = opts.apiVersion || '3.30';
    this.token = null; this.siteId = null; this.userId = null;
    this.isDemo = false;
  }
  // Bridge (inside Tableau): fetchAsync requires a host-relative URL, e.g. /3.30/sites/{site-id}/workbooks/{id}.
  // Browser fallback: absolute URL, root + apiBase + '/' + version + path.
  RestBackend.prototype.url = function (p) {
    if (hasBridge()) return (this.bridgePrefix || '') + '/' + this.ver + p;
    return this.root + this.base + '/' + this.ver + p;
  };
  function isNetErr(e) { return e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e && e.message || ''); }
  // When a call fails at the network level, find out why: is the server reachable at all from this
  // frame (no-cors probe), and what origin is the extension running on?
  function diagnose(url) {
    var origin = (function () { try { return String(self.origin) + (self.origin !== location.origin ? ' (page URL ' + location.origin + ')' : ''); } catch (e) { return '?'; } })();
    return fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      .then(function () { return { origin: origin, reachable: true }; }, function (e) { return { origin: origin, reachable: false, probeErr: e && e.message }; });
  }
  // Sign in as the user already authenticated in this Tableau session (no token needed): the host-side
  // fetchAsync bridge carries the viewer's session, so we ask who that is and verify a content call works.
  RestBackend.prototype.sessionSignIn = function () {
    var self = this;
    if (!hasBridge()) return Promise.reject(new Error('Not running inside Tableau, so there is no session to use.'));
    var prefixes = CFG.bridgePrefixes || ['', '/api'], tried = [];
    var attempt = function (i) {
      self.bridgePrefix = prefixes[i];
      return xfetch(hasBridge() ? '/api/{api-version}/sessions/current' : self.url('/sessions/current'), { method: 'GET', headers: { Accept: 'application/json' } })
        .then(function (r) { return self._parse(r); })
        .then(function (j) {
          var ss = j && j.session; if (!ss || !ss.site || !ss.user) throw new Error('No active Tableau session was returned.');
          self.token = null; self.sessionAuth = true;
          self.siteId = ss.site.id; self.userId = ss.user.id; self.userName = ss.user.name;
          self.siteName = ss.site.contentUrl || 'Default';
          return self.req('GET', '', null, false, true).then(function (sj) { if (sj && sj.site && sj.site.name) self.siteName = sj.site.name; }); // proves content calls are authorized
        })
        .catch(function (e) {
          if (e.status === 403) e.forbidden = true;
          tried.push((prefixes[i] || '') + '/{api-version}/sessions/current → ' + (e.status || '') + ' ' + String(e.message).slice(0, 90));
          var retryable = e.status === 404 || e.status === 405 || e.bridge;
          if (retryable && i + 1 < prefixes.length) return attempt(i + 1);
          self.sessionAuth = false; self.token = null;
          e.message = e.message + (tried.length > 1 ? '\nTried: ' + tried.join(' | ') : '');
          throw e;
        });
    };
    return attempt(0).then(function () { return self; });
  };
  RestBackend.prototype.signIn = function () {
    var self = this;
    if (hasBridge()) { // inside Tableau only the logged-in user's session is ever used (no token path)
      return this.sessionSignIn().catch(function (e) {
        throw e;
      });
    }
    return this.signIn2();
  };
  RestBackend.prototype.signIn2 = function () {
    var self = this;
    if (hasBridge()) {
      // Find the relative prefix the host routes: try each until one isn't a 404 / bridge rejection.
      var prefixes = CFG.bridgePrefixes || ['', '/api'], tried = [];
      var attempt = function (i) {
        self.bridgePrefix = prefixes[i];
        return self._signIn().catch(function (e) {
          tried.push((prefixes[i] || '') + '/' + self.ver + '/auth/signin → ' + (e.status || '') + ' ' + e.message);
          var retryable = e.status === 404 || e.status === 405 || e.bridge;
          if (retryable && i + 1 < prefixes.length) return attempt(i + 1);
          if (tried.length > 1) e.message = e.message + '\nTried: ' + tried.join(' | ');
          throw e;
        });
      };
      return attempt(0);
    }
    return this._signIn().catch(function (e) {
      if (!isNetErr(e) || hasBridge()) throw e;
      return diagnose(self.url('/serverinfo')).then(function (d) { e.diag = d; throw e; });
    });
  };
  RestBackend.prototype._signIn = function () {
    var self = this;
    var body = { credentials: { personalAccessTokenName: this.patName, personalAccessTokenSecret: this.patSecret, site: { contentUrl: this.site } } };
    return xfetch(this.url('/auth/signin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return self._parse(r); }).then(function (j) {
      self.token = j.credentials.token;
      self.siteId = j.credentials.site.id;
      self.userId = j.credentials.user.id;
      self.siteName = j.credentials.site.contentUrl || 'Default';
      return self;
    }).then(function () {
      // best effort: friendly site name
      return self.req('GET', '').then(function (j) { if (j && j.site && j.site.name) self.siteName = j.site.name; }, function () {});
    }).then(function () { return self; });
  };
  RestBackend.prototype._parse = function (r, asBlob) {
    if (r.ok) {
      if (asBlob) return r.blob();
      if (r.status === 204) return null;
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    }
    return r.text().then(function (t) {
      var msg = 'HTTP ' + r.status;
      try { var j = JSON.parse(t); if (j.error) msg = (j.error.summary || '') + (j.error.detail ? ': ' + j.error.detail : '') + ' (' + j.error.code + ')'; } catch (e) { if (t) msg += ' ' + t.slice(0, 200); }
      var err = new Error(msg); err.status = r.status; throw err;
    });
  };
  // Inside Tableau the site's REST allowlist is an exact match against the URL *template* handed to fetchAsync, e.g.
  // '/api/{api-version}/sites/{site-id}/workbooks/{workbook-id}'. The host fills in {api-version} and {site-id};
  // every other ID goes in options.urlVariables. Turn '/workbooks/<luid>/views' into that template + variables.
  var ID_AFTER = { projects: 'project-id', workbooks: 'workbook-id', views: 'view-id', datasources: 'datasource-id', users: 'user-id',
    groups: 'group-id', jobs: 'job-id', subscriptions: 'subscription-id', extractRefreshes: 'task-id', tags: 'tag-name' };
  function templatize(path) {
    var qi = path.indexOf('?'), q = qi >= 0 ? path.slice(qi) : '', segs = path.slice(0, qi >= 0 ? qi : undefined).split('/'), vars = {}, out = [];
    for (var i = 0; i < segs.length; i++) {
      var prev = segs[i - 1];
      if (i > 0 && segs[i] && ID_AFTER[prev]) { var k = ID_AFTER[prev]; try { vars[k] = decodeURIComponent(segs[i]); } catch (e) { vars[k] = segs[i]; } out.push('{' + k + '}'); }
      else out.push(segs[i]);
    }
    return { path: out.join('/') + q, vars: vars };
  }
  RestBackend.prototype.req = function (method, path, body, asBlob, retried) {
    var self = this;
    var headers = { Accept: asBlob ? '*/*' : 'application/json' };
    if (this.token) headers['X-Tableau-Auth'] = this.token;
    if (body) headers['Content-Type'] = 'application/json';
    var url, vars;
    if (hasBridge()) { var t = templatize(path); url = '/api/{api-version}/sites/{site-id}' + t.path; vars = t.vars; }
    else url = this.url('/sites/' + this.siteId + path);
    return xfetch(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, urlVariables: vars }, asBlob)
      .then(function (r) {
        if (r.status === 401 && !retried) return self.signIn().then(function () { return self.req(method, path, body, asBlob, true); });
        return self._parse(r, asBlob);
      });
  };
  RestBackend.prototype.getAll = function (path, plural, single, extra) {
    var self = this, out = [], size = 1000;
    function page(n) {
      var q = (path.indexOf('?') >= 0 ? '&' : '?') + 'pageSize=' + size + '&pageNumber=' + n + (extra || '');
      return self.req('GET', path + q).then(function (j) {
        out = out.concat(arr(j && j[plural] && j[plural][single]));
        var total = Number(j && j.pagination && j.pagination.totalAvailable) || 0;
        return n * size < total ? page(n + 1) : out;
      });
    }
    return page(1);
  };
  RestBackend.prototype.getAllWithFields = function (path, plural, single) {
    var self = this;
    return this.getAll(path, plural, single, '&fields=_all_').catch(function () { return self.getAll(path, plural, single); });
  };
  function tagsOf(x) { return arr(x && x.tags && x.tags.tag).map(function (t) { return t.label; }).filter(Boolean); }
  RestBackend.prototype.loadAll = function () {
    return Promise.all([
      this.getAll('/projects', 'projects', 'project'),
      this.getAllWithFields('/workbooks', 'workbooks', 'workbook'),
      this.getAllWithFields('/datasources', 'datasources', 'datasource')
    ]).then(function (res) {
      var projects = res[0].map(function (p) {
        return { kind: 'project', id: p.id, name: p.name, parentId: p.parentProjectId || null, description: p.description || '',
          owner: p.owner && (p.owner.name || p.owner.id), ownerId: p.owner && p.owner.id, createdAt: p.createdAt, updatedAt: p.updatedAt, tags: [] };
      });
      var wbs = res[1].map(function (w) {
        return { kind: 'workbook', id: w.id, name: w.name, projectId: w.project && w.project.id, description: w.description || '',
          owner: w.owner && (w.owner.fullName || w.owner.name || w.owner.id), ownerId: w.owner && w.owner.id, createdAt: w.createdAt, updatedAt: w.updatedAt,
          size: sizeToBytes(w.size), url: w.webpageUrl, contentUrl: w.contentUrl, tags: tagsOf(w), showTabs: w.showTabs };
      });
      var dss = res[2].map(function (d) {
        return { kind: 'datasource', id: d.id, name: d.name, projectId: d.project && d.project.id, description: d.description || '',
          owner: d.owner && (d.owner.fullName || d.owner.name || d.owner.id), ownerId: d.owner && d.owner.id, createdAt: d.createdAt, updatedAt: d.updatedAt,
          size: sizeToBytes(d.size), url: d.webpageUrl, contentUrl: d.contentUrl, tags: tagsOf(d), dsType: d.type,
          certified: d.isCertified === true || d.isCertified === 'true', hasExtracts: d.hasExtracts };
      });
      return { projects: projects, workbooks: wbs, datasources: dss };
    });
  };
  function seg(it) { return it.kind === 'project' ? '/projects/' : it.kind === 'workbook' ? '/workbooks/' : '/datasources/'; }
  RestBackend.prototype.rename = function (it, name) {
    var b = {}; b[it.kind] = { name: name };
    return this.req('PUT', seg(it) + it.id, b);
  };
  RestBackend.prototype.move = function (it, projectId) {
    var b = {};
    if (it.kind === 'project') b.project = { parentProjectId: projectId || '' };
    else b[it.kind] = { project: { id: projectId } };
    return this.req('PUT', seg(it) + it.id, b);
  };
  RestBackend.prototype.remove = function (it) { return this.req('DELETE', seg(it) + it.id); };
  RestBackend.prototype.createProject = function (name, parentId) {
    var p = { name: name }; if (parentId) p.parentProjectId = parentId;
    return this.req('POST', '/projects', { project: p }).then(function (j) {
      var x = j.project;
      return { kind: 'project', id: x.id, name: x.name, parentId: x.parentProjectId || null, description: '', owner: x.owner && x.owner.id, ownerId: x.owner && x.owner.id, createdAt: x.createdAt || new Date().toISOString(), updatedAt: x.updatedAt || new Date().toISOString(), tags: [] };
    });
  };
  RestBackend.prototype.addTag = function (it, label) { return this.req('PUT', seg(it) + it.id + '/tags', { tags: { tag: [{ label: label }] } }); };
  RestBackend.prototype.removeTag = function (it, label) { return this.req('DELETE', seg(it) + it.id + '/tags/' + encodeURIComponent(label)); };
  RestBackend.prototype.views = function (it) {
    return this.getAll('/workbooks/' + it.id + '/views', 'views', 'view').then(function (vs) {
      return vs.map(function (v) { return { id: v.id, name: v.name, contentUrl: v.contentUrl }; });
    });
  };
  RestBackend.prototype.preview = function (it) {
    return this.req('GET', '/workbooks/' + it.id + '/previewImage', null, true).then(objUrl);
  };
  RestBackend.prototype.viewPreview = function (it, v) {
    return this.req('GET', '/workbooks/' + it.id + '/views/' + v.id + '/previewImage', null, true).then(objUrl);
  };
  RestBackend.prototype.connections = function (it) {
    return this.req('GET', '/datasources/' + it.id + '/connections').then(function (j) {
      return arr(j && j.connections && j.connections.connection).map(function (c) { return { type: c.type, server: c.serverAddress, user: c.userName }; });
    });
  };

  // Admin Center overview: everything the signed-in user is permitted to see. Each optional source degrades to null.
  RestBackend.prototype.adminOverview = function () {
    var self = this, out = { site: this.siteName, errors: {} };
    function opt(key, p) { return p.catch(function (e) { out.errors[key] = e && e.message || 'failed'; return null; }); }
    return this.loadAll().then(function (d) {
      out.projects = d.projects; out.workbooks = d.workbooks; out.datasources = d.datasources;
      return Promise.all([
        opt('users', self.getAllWithFields('/users', 'users', 'user')),
        opt('groups', self.getAll('/groups', 'groups', 'group')),
        opt('jobs', self.req('GET', '/jobs?pageSize=200&sort=createdAt:desc').catch(function () { return self.req('GET', '/jobs?pageSize=200'); })),
        opt('views', self.getAll('/views?includeUsageStatistics=true', 'views', 'view'))
      ]);
    }).then(function (r) {
      out.users = r[0] && r[0].map(function (u) { return { name: u.fullName || u.name, email: u.email || (/@/.test(u.name || '') ? u.name : ''), role: u.siteRole || 'Unknown', lastLogin: u.lastLogin || null }; });
      out.groups = r[1] ? r[1].length : null;
      out.jobs = r[2] && arr(r[2].backgroundJobs && r[2].backgroundJobs.backgroundJob).map(function (j) { return { type: j.jobType, status: j.status, at: j.endedAt || j.startedAt || j.createdAt }; });
      out.views = r[3] && r[3].map(function (v) { return { name: v.name, workbook: v.workbook && v.workbook.name, count: Number(v.usage && v.usage.totalViewCount) || 0 }; });
      return out;
    });
  };

  /* ---- Admin Center: logs (REST-derived activity + Admin Insights via VizQL Data Service) ---- */
  RestBackend.prototype.listLogs = function () {
    var self = this;
    function soft(p) { return p.catch(function () { return []; }); }
    return Promise.all([this.loadAll(), soft(this.getAllWithFields('/users', 'users', 'user')), this.listJobs().catch(function () { return []; })]).then(function (r) {
      var ev = [], d = r[0], projName = {};
      d.projects.forEach(function (p) { projName[p.id] = p.name; });
      d.projects.concat(d.workbooks, d.datasources).forEach(function (it) {
        var kind = it.kind === 'datasource' ? 'Data source' : it.kind === 'workbook' ? 'Workbook' : 'Project', c = Date.parse(it.createdAt), u = Date.parse(it.updatedAt);
        if (!isNaN(c)) ev.push({ at: it.createdAt, source: 'Content', actor: it.owner || '', action: 'Created ' + kind.toLowerCase(), target: it.name, detail: projName[it.projectId] || '' });
        if (!isNaN(u) && (isNaN(c) || u - c > 60000)) ev.push({ at: it.updatedAt, source: 'Content', actor: it.owner || '', action: 'Updated ' + kind.toLowerCase(), target: it.name, detail: projName[it.projectId] || '' });
      });
      r[1].forEach(function (u) { if (u.lastLogin) ev.push({ at: u.lastLogin, source: 'Sign-in', actor: (u.fullName || u.name) + (u.email ? ' <' + u.email + '>' : ''), action: 'Last sign-in', target: u.siteRole || '', detail: '' }); });
      r[2].forEach(function (j) { ev.push({ at: j.endedAt || j.startedAt || j.createdAt, source: 'Job', actor: 'system', action: (j.type || 'Job') + ' — ' + j.status, target: j.title || j.id, detail: j.subtitle || '', status: j.status }); });
      ev = ev.filter(function (e) { return !isNaN(Date.parse(e.at)); }).sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); });
      return ev.slice(0, 3000);
    });
  };
  // Admin Insights (Tableau Cloud): read the "TS Events" datasource through the VizQL Data Service.
  RestBackend.prototype._vds = function (path, body) {
    var self = this, url = hasBridge() ? '/api/v1/vizql-data-service/' + path : this.root + '/api/v1/vizql-data-service/' + path;
    return xfetch(url, { method: 'POST', headers: this.token ? { 'X-Tableau-Auth': this.token, 'Content-Type': 'application/json', Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return self._parse(r); });
  };
  RestBackend.prototype.listInsights = function () {
    var self = this;
    return this.loadAll().then(function (d) {
      var pn = {}; d.projects.forEach(function (p) { pn[p.id] = p.name; });
      var cand = d.datasources.filter(function (x) { return /ts events/i.test(x.name); });
      var ds = cand.filter(function (x) { return /admin insights/i.test(pn[x.projectId] || ''); })[0] || cand[0];
      if (!ds) throw new Error('No “TS Events” data source found. Admin Insights is available on Tableau Cloud (site admins) in the “Admin Insights” project.');
      return self._vds('read-metadata', { datasource: { datasourceLuid: ds.id } }).then(function (m) {
        var caps = arr(m && m.data).map(function (f) { return f.fieldCaption; }).filter(Boolean);
        var all = caps.filter(function (c) { return !/luid|\bid$|\(copy\)/i.test(c); }).slice(0, 60);
        var dateF = all.filter(function (c) { return /event date|date|time/i.test(c); })[0];
        function q(list) {
          var fields = list.map(function (c) { var f = { fieldCaption: c }; if (c === dateF) { f.sortDirection = 'DESC'; f.sortPriority = 1; } return f; });
          return self._vds('query-datasource', { datasource: { datasourceLuid: ds.id }, query: { fields: fields }, options: { returnFormat: 'OBJECTS', disaggregate: true } });
        }
        var small = all.filter(function (c) { return /event|actor|item|date|time|user|status|site role/i.test(c); }).slice(0, 12);
        return q(all).then(function (r) { return { fields: all, r: r }; }, function () { return q(small).then(function (r) { return { fields: small, r: r }; }); }).then(function (o) {
          var rows = arr(o.r && o.r.data);
          if (dateF) rows.sort(function (x, y) { return Date.parse(y[dateF]) - Date.parse(x[dateF]); });
          return { source: ds.name, fields: o.fields, rows: rows.slice(0, 3000) };
        });
      });
    });
  };

  /* ---- Admin Center: jobs, subscriptions, extract refresh tasks ---- */
  function truthy(v) { return v === true || v === 'true'; }
  RestBackend.prototype.listJobs = function () {
    var self = this;
    return this.req('GET', '/jobs?pageSize=1000&sort=createdAt:desc').catch(function () { return self.req('GET', '/jobs?pageSize=1000'); }).then(function (j) {
      return arr(j && j.backgroundJobs && j.backgroundJobs.backgroundJob).map(function (x) {
        return { id: x.id, type: x.jobType || '', title: x.title || '', subtitle: x.subtitle || '', status: x.status || '', priority: x.priority, createdAt: x.createdAt, startedAt: x.startedAt, endedAt: x.endedAt, raw: x };
      });
    });
  };
  RestBackend.prototype.cancelJob = function (id) { return this.req('PUT', '/jobs/' + id, {}); };
  RestBackend.prototype.listSubscriptions = function () {
    var self = this;
    function soft(p) { return p.catch(function () { return []; }); }
    return Promise.all([this.getAll('/subscriptions', 'subscriptions', 'subscription'), soft(this.getAllWithFields('/users', 'users', 'user')),
      soft(this.getAll('/views', 'views', 'view')), soft(this.getAll('/workbooks', 'workbooks', 'workbook'))]).then(function (r) {
      var um = {}, nm = {};
      r[1].forEach(function (u) { um[u.id] = u; });
      r[2].forEach(function (v) { nm[v.id] = v.name + (v.workbook && v.workbook.name ? ' — ' + v.workbook.name : ''); });
      r[3].forEach(function (w) { nm[w.id] = w.name; });
      return r[0].map(function (x) {
        var u = um[x.user && x.user.id] || {}, cid = x.content && x.content.id;
        return { id: x.id, subject: x.subject || '', contentType: x.content && x.content.type || '', contentId: cid, contentName: nm[cid] || cid || '',
          scheduleName: x.schedule && x.schedule.name || '', scheduleId: x.schedule && x.schedule.id, userId: x.user && x.user.id,
          userName: u.fullName || u.name || (x.user && x.user.id) || '', userEmail: u.email || (/@/.test(u.name || '') ? u.name : ''),
          attachImage: truthy(x.attachImage), attachPdf: truthy(x.attachPdf), message: x.message || '', suspended: truthy(x.suspended), raw: x };
      });
    });
  };
  RestBackend.prototype.updateSubscription = function (id, fields) { return this.req('PUT', '/subscriptions/' + id, { subscription: fields }); };
  RestBackend.prototype.deleteSubscription = function (id) { return this.req('DELETE', '/subscriptions/' + id); };
  RestBackend.prototype.listExtractTasks = function () {
    function soft(p) { return p.catch(function () { return []; }); }
    return Promise.all([this.req('GET', '/tasks/extractRefreshes'), soft(this.getAll('/workbooks', 'workbooks', 'workbook')), soft(this.getAll('/datasources', 'datasources', 'datasource'))]).then(function (r) {
      var nm = {}; r[1].concat(r[2]).forEach(function (x) { nm[x.id] = x.name; });
      return arr(r[0] && r[0].tasks && r[0].tasks.task).map(function (t) {
        var x = t.extractRefresh || t, w = x.workbook, d = x.datasource, tid = (w || d || {}).id, sc = x.schedule || {};
        return { id: x.id, kind: w ? 'workbook' : 'datasource', targetId: tid, targetName: nm[tid] || tid || '', refreshType: x.type || '', priority: x.priority, failures: Number(x.consecutiveFailedCount) || 0,
          scheduleName: sc.name || '', frequency: sc.frequency || '', nextRunAt: sc.nextRunAt, state: sc.state || '', raw: x };
      });
    });
  };
  RestBackend.prototype.runExtractNow = function (id) { return this.req('POST', '/tasks/extractRefreshes/' + id + '/runNow', {}); };
  RestBackend.prototype.deleteExtractTask = function (id) { return this.req('DELETE', '/tasks/extractRefreshes/' + id); };
  RestBackend.prototype.updateExtractTask = function (id, fields) { return this.req('PUT', '/tasks/extractRefreshes/' + id, { extractRefresh: fields }); };

  /* ---- Admin Center: users & groups ---- */
  RestBackend.prototype.listUsers = function () {
    return this.getAllWithFields('/users', 'users', 'user').then(function (us) {
      return us.map(function (u) { return { id: u.id, name: u.name || '', fullName: u.fullName || '', email: u.email || (/@/.test(u.name || '') ? u.name : ''), role: u.siteRole || 'Unknown', lastLogin: u.lastLogin || null, authSetting: u.authSetting || '', raw: u }; });
    });
  };
  RestBackend.prototype.listGroups = function () {
    return this.getAll('/groups', 'groups', 'group').then(function (gs) {
      return gs.map(function (g) { return { id: g.id, name: g.name || '', domain: g.domain && g.domain.name || 'local', minRole: (g.import && g.import.minimumSiteRole) || g.minimumSiteRole || '', raw: g }; });
    });
  };
  function memberNorm(u) { return { id: u.id, name: u.fullName || u.name || u.id, email: u.email || (/@/.test(u.name || '') ? u.name : '') }; }
  RestBackend.prototype.groupMembers = function (gid) { return this.getAll('/groups/' + gid + '/users', 'users', 'user').then(function (us) { return us.map(memberNorm); }); };
  RestBackend.prototype.userGroups = function (uid) { return this.getAll('/users/' + uid + '/groups', 'groups', 'group').then(function (gs) { return gs.map(function (g) { return { id: g.id, name: g.name }; }); }); };
  RestBackend.prototype.updateUser = function (id, f) { return this.req('PUT', '/users/' + id, { user: f }); };
  RestBackend.prototype.removeUser = function (id) { return this.req('DELETE', '/users/' + id); };
  RestBackend.prototype.addUser = function (name, role) { return this.req('POST', '/users', { user: { name: name, siteRole: role } }); };
  RestBackend.prototype.createGroup = function (name) { return this.req('POST', '/groups', { group: { name: name } }); };
  RestBackend.prototype.updateGroup = function (id, f) { return this.req('PUT', '/groups/' + id, { group: f }); };
  RestBackend.prototype.deleteGroup = function (id) { return this.req('DELETE', '/groups/' + id); };
  RestBackend.prototype.addToGroup = function (gid, uid) { return this.req('POST', '/groups/' + gid + '/users', { user: { id: uid } }); };
  RestBackend.prototype.removeFromGroup = function (gid, uid) { return this.req('DELETE', '/groups/' + gid + '/users/' + uid); };

  /* =============================== Sample backend =============================== */
  function DemoBackend() { this.isDemo = true; this.siteName = 'Sample Site'; this.userId = 'me'; }
  DemoBackend.prototype.signIn = function () { return delay(250).then(function () { return this; }.bind(this)); };
  DemoBackend.prototype.loadAll = function () {
    var self = this;
    if (!this.db) {
      var now = Date.now(), d = function (days) { return new Date(now - days * 864e5 - Math.random() * 3e7).toISOString(); };
      var P = function (name, parent, desc) { return { kind: 'project', id: uid(), name: name, parentId: parent ? parent.id : null, description: desc || '', owner: 'Site Admin', ownerId: 'admin', createdAt: d(400), updatedAt: d(60), tags: [] }; };
      var exec = P('Executive', null, 'Board-level reporting'), sales = P('Sales', null, 'Pipeline and bookings'),
        regions = P('Regional', sales), mkt = P('Marketing', null), fin = P('Finance', null, 'Certified finance content'),
        ops = P('Operations', null), sandbox = P('Sandbox', null, 'Scratch space'), def = P('default', null, 'The default project');
      var projects = [exec, sales, regions, mkt, fin, ops, sandbox, def];
      var W = function (name, p, owner, days, size, tags, views) { return { kind: 'workbook', id: uid(), name: name, projectId: p.id, description: '', owner: owner, ownerId: owner === 'Alex Morgan' ? 'me' : owner, createdAt: d(days + 90), updatedAt: d(days), size: size * 1e6, url: '', tags: tags || [], views: views || ['Overview', 'Detail'] }; };
      var DS = function (name, p, owner, days, size, cert, tags) { return { kind: 'datasource', id: uid(), name: name, projectId: p.id, description: '', owner: owner, ownerId: owner === 'Alex Morgan' ? 'me' : owner, createdAt: d(days + 120), updatedAt: d(days), size: size * 1e6, url: '', tags: tags || [], certified: !!cert, dsType: cert ? 'snowflake' : 'excel-direct', hasExtracts: true }; };
      var workbooks = [
        W('Executive Summary', exec, 'Alex Morgan', 0, 4, ['Board'], ['KPIs', 'Revenue Trend', 'Headcount']),
        W('Quarterly Business Review', exec, 'Avery Chen', 3, 12, ['Board', 'QBR']),
        W('Pipeline Health', sales, 'Alex Morgan', 1, 7, ['Weekly'], ['Funnel', 'Stage Aging', 'Reps']),
        W('Bookings vs Plan', sales, 'Jordan Patel', 9, 3, ['Weekly']),
        W('EMEA Territory', regions, 'Sam Rivera', 15, 5), W('North America Territory', regions, 'Sam Rivera', 15, 6), W('APAC Territory', regions, 'Sam Rivera', 33, 4),
        W('Campaign Attribution', mkt, 'Riley Brooks', 4, 18, ['Draft'], ['Channels', 'Attribution', 'Spend']),
        W('Web Traffic', mkt, 'Riley Brooks', 2, 9),
        W('P&L Statement', fin, 'Morgan Lee', 6, 2, ['Certified'], ['P&L', 'Variance']), W('Cash Flow', fin, 'Morgan Lee', 21, 2, ['Certified']),
        W('Supply Chain Monitor', ops, 'Taylor Kim', 5, 22, null, ['Inventory', 'Shipments', 'Suppliers', 'Map']),
        W('Superstore', sandbox, 'Alex Morgan', 0, 3, ['Draft'], ['Overview', 'Product', 'Customers', 'Shipping', 'Performance', 'Forecast']),
        W('Untitled Analysis', sandbox, 'Alex Morgan', 48, 1)
      ];
      var datasources = [
        DS('Salesforce Opportunities', sales, 'Jordan Patel', 1, 120, true, ['Weekly']),
        DS('Marketing Touchpoints', mkt, 'Riley Brooks', 4, 340),
        DS('GL Actuals', fin, 'Morgan Lee', 2, 95, true, ['Certified']),
        DS('Inventory Snapshot', ops, 'Taylor Kim', 7, 210, true),
        DS('Superstore Datasource', sandbox, 'Alex Morgan', 30, 8, false, ['Draft']),
        DS('HR Headcount', exec, 'Avery Chen', 12, 15, true)
      ];
      this.db = { projects: projects, workbooks: workbooks, datasources: datasources };
    }
    return delay(300).then(function () { return JSON.parse(JSON.stringify(self.db)); });
  };
  DemoBackend.prototype._find = function (it) { var list = this.db[it.kind + 's']; for (var i = 0; i < list.length; i++) if (list[i].id === it.id) return list[i]; return null; };
  DemoBackend.prototype.rename = function (it, name) { var x = this._find(it); x.name = name; x.updatedAt = new Date().toISOString(); return delay(120); };
  DemoBackend.prototype.move = function (it, pid) { var x = this._find(it); if (it.kind === 'project') x.parentId = pid || null; else x.projectId = pid; return delay(150); };
  DemoBackend.prototype.remove = function (it) { var list = this.db[it.kind + 's']; var x = this._find(it); list.splice(list.indexOf(x), 1); return delay(150); };
  DemoBackend.prototype.createProject = function (name, parentId) {
    var p = { kind: 'project', id: uid(), name: name, parentId: parentId || null, description: '', owner: 'Alex Morgan', ownerId: 'me', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tags: [] };
    this.db.projects.push(p);
    return delay(150).then(function () { return JSON.parse(JSON.stringify(p)); });
  };
  DemoBackend.prototype.addTag = function (it, l) { var x = this._find(it); if (x.tags.indexOf(l) < 0) x.tags.push(l); return delay(80); };
  DemoBackend.prototype.removeTag = function (it, l) { var x = this._find(it); x.tags = x.tags.filter(function (t) { return t !== l; }); return delay(80); };
  DemoBackend.prototype.views = function (it) {
    var x = this._find(it);
    return delay(120).then(function () { return (x && x.views || []).map(function (n, i) { return { id: it.id + ':' + i, name: n }; }); });
  };
  DemoBackend.prototype.preview = function (it) { return delay(100 + Math.random() * 300).then(function () { return fakeChart(it.id, 0); }); };
  DemoBackend.prototype.viewPreview = function (it, v) { return delay(80).then(function () { return fakeChart(v.id, 1); }); };
  DemoBackend.prototype.connections = function (it) { return delay(80).then(function () { return [{ type: it.dsType, server: it.certified ? 'acme.snowflakecomputing.com' : 'local file', user: it.certified ? 'svc_tableau' : '' }]; }); };
  DemoBackend.prototype.adminOverview = function () {
    var self = this;
    return this.loadAll().then(function (d) {
      var roles = ['Creator', 'Explorer', 'Viewer', 'Viewer', 'Explorer'], names = {};
      d.workbooks.concat(d.datasources).forEach(function (x) { if (x.owner) names[x.owner] = 1; });
      var users = Object.keys(names).map(function (n, i) { return { name: n, email: n.toLowerCase().replace(/\s+/g, '.') + '@example.com', role: roles[i % roles.length], lastLogin: new Date(Date.now() - (i * i * 0.9 + i) * 864e5).toISOString() }; });
      var views = []; d.workbooks.forEach(function (w) { (w.views || []).forEach(function (n, i) { views.push({ name: n, workbook: w.name, count: Math.floor(Math.abs(Math.sin(w.name.length * (i + 3))) * 400) }); }); });
      var jobs = ['Succeeded', 'Succeeded', 'Failed', 'Succeeded', 'Succeeded'].map(function (st, i) { return { type: 'RefreshExtract', status: st, at: new Date(Date.now() - i * 36e5).toISOString() }; });
      return { site: self.siteName, errors: {}, projects: d.projects, workbooks: d.workbooks, datasources: d.datasources, users: users, groups: 4, jobs: jobs, views: views };
    });
  };
  DemoBackend.prototype._ops = function () {
    var self = this;
    return this.loadAll().then(function (d) {
      if (self.ops) return self.ops;
      var now = Date.now(), H = 36e5, pick = function (a, i) { return a[i % a.length]; };
      var ex = d.workbooks.slice(0, 5).map(function (w) { return { kind: 'workbook', n: w.name, id: w.id }; }).concat(d.datasources.slice(0, 4).map(function (x) { return { kind: 'datasource', n: x.name, id: x.id }; }));
      var scheds = ['Hourly', 'Daily 6am', 'Weekdays 8pm', 'Weekly Sunday'];
      var tasks = ex.map(function (e, i) { return { id: 'task' + i, kind: e.kind, targetId: e.id, targetName: e.n, refreshType: i % 3 ? 'FullRefresh' : 'IncrementalRefresh', priority: String(50), failures: i % 4 === 2 ? 3 : 0, scheduleName: pick(scheds, i), frequency: i % 2 ? 'Daily' : 'Hourly', nextRunAt: new Date(now + (i + 1) * H).toISOString(), state: 'Active', raw: {} }; });
      var jobs = [];
      for (var i = 0; i < 40; i++) {
        var e = ex[i % ex.length], st = i < 2 ? (i ? 'Pending' : 'InProgress') : (i % 7 === 3 ? 'Failed' : 'Success');
        var c = now - i * 2.5 * H;
        jobs.push({ id: 'job' + i, type: i % 9 === 4 ? 'SubscriptionsJob' : 'RefreshExtracts', title: e.n, subtitle: e.kind, status: st, priority: 50, createdAt: new Date(c).toISOString(), startedAt: st === 'Pending' ? null : new Date(c + 6e4).toISOString(), endedAt: /Pending|InProgress/.test(st) ? null : new Date(c + (60 + i * 7) * 1e3).toISOString(), raw: {} });
      }
      var views = d.workbooks.slice(0, 6), owners = ['Avery Chen', 'Jordan Lee', 'Sam Patel'];
      var subs = views.map(function (w, i) { return { id: 'sub' + i, subject: w.name + ' — weekly digest', contentType: i % 2 ? 'View' : 'Workbook', contentId: w.id, contentName: w.name, scheduleName: pick(scheds, i + 1), scheduleId: 's' + i, userId: 'u' + i, userName: pick(owners, i), userEmail: pick(owners, i).toLowerCase().replace(' ', '.') + '@example.com', attachImage: i % 2 === 0, attachPdf: i % 3 === 0, message: '', suspended: i === 4, raw: {} }; });
      return (self.ops = { tasks: tasks, jobs: jobs, subs: subs });
    });
  };
  DemoBackend.prototype.listJobs = function () { return this._ops().then(function (o) { return o.jobs.slice(); }); };
  DemoBackend.prototype.cancelJob = function (id) { return this._ops().then(function (o) { o.jobs.forEach(function (j) { if (j.id === id) { j.status = 'Cancelled'; j.endedAt = new Date().toISOString(); } }); }); };
  DemoBackend.prototype.listSubscriptions = function () { return this._ops().then(function (o) { return o.subs.slice(); }); };
  DemoBackend.prototype.updateSubscription = function (id, f) { return this._ops().then(function (o) { o.subs.forEach(function (s) { if (s.id === id) { if (f.subject != null) s.subject = f.subject; if (f.suspended != null) s.suspended = truthy(f.suspended); } }); }); };
  DemoBackend.prototype.deleteSubscription = function (id) { return this._ops().then(function (o) { o.subs = o.subs.filter(function (s) { return s.id !== id; }); }); };
  DemoBackend.prototype.listExtractTasks = function () { return this._ops().then(function (o) { return o.tasks.slice(); }); };
  DemoBackend.prototype.runExtractNow = function (id) { return this._ops().then(function (o) { o.tasks.forEach(function (t) { if (t.id === id) o.jobs.unshift({ id: 'job' + Date.now(), type: 'RefreshExtracts', title: t.targetName, subtitle: t.kind, status: 'Pending', priority: 50, createdAt: new Date().toISOString(), raw: {} }); }); }); };
  DemoBackend.prototype.deleteExtractTask = function (id) { return this._ops().then(function (o) { o.tasks = o.tasks.filter(function (t) { return t.id !== id; }); }); };
  DemoBackend.prototype.updateExtractTask = function (id, f) { return this._ops().then(function (o) { o.tasks.forEach(function (t) { if (t.id === id && f.priority != null) t.priority = String(f.priority); }); }); };
  DemoBackend.prototype._ug = function () {
    var self = this;
    return this.loadAll().then(function (d) {
      if (self.ug) return self.ug;
      var roles = ['Creator', 'Explorer', 'Viewer', 'Viewer', 'Explorer', 'SiteAdministratorCreator'], names = {};
      d.workbooks.concat(d.datasources).forEach(function (x) { if (x.owner) names[x.owner] = 1; });
      ['Avery Chen', 'Jordan Lee', 'Sam Patel', 'Morgan Diaz', 'Riley Kim'].forEach(function (n) { names[n] = 1; });
      var users = Object.keys(names).map(function (n, i) { var em = n.toLowerCase().replace(/\s+/g, '.') + '@example.com'; return { id: 'u' + i, name: em, fullName: n, email: em, role: roles[i % roles.length], lastLogin: new Date(Date.now() - (i * i * 0.9 + i) * 864e5).toISOString(), authSetting: 'ServerDefault', raw: {} }; });
      var groups = ['Finance Analysts', 'Sales', 'Executives', 'All Users'].map(function (n, i) { return { id: 'g' + i, name: n, domain: 'local', minRole: '', raw: {} }; });
      var mem = { g0: [users[0].id, users[1].id], g1: [users[2].id, users[3].id, users[4].id], g2: [users[0].id], g3: users.map(function (u) { return u.id; }) };
      return (self.ug = { users: users, groups: groups, mem: mem });
    });
  };
  DemoBackend.prototype.listLogs = function () {
    var self = this;
    return this.loadAll().then(function (d) {
      var ev = [];
      d.workbooks.concat(d.datasources).forEach(function (it) { ev.push({ at: it.createdAt, source: 'Content', actor: it.owner || '', action: 'Created ' + it.kind, target: it.name, detail: '' }); if (it.updatedAt !== it.createdAt) ev.push({ at: it.updatedAt, source: 'Content', actor: it.owner || '', action: 'Updated ' + it.kind, target: it.name, detail: '' }); });
      return self.listJobs().then(function (js) { js.forEach(function (j) { ev.push({ at: j.endedAt || j.startedAt || j.createdAt, source: 'Job', actor: 'system', action: j.type + ' — ' + j.status, target: j.title, detail: j.subtitle, status: j.status }); }); return ev.filter(function (e) { return !isNaN(Date.parse(e.at)); }).sort(function (x, y) { return Date.parse(y.at) - Date.parse(x.at); }); });
    });
  };
  DemoBackend.prototype.listInsights = function () { return Promise.reject(new Error('Admin Insights isn’t available in demo mode.')); };

  DemoBackend.prototype.listUsers = function () { return this._ug().then(function (o) { return o.users.slice(); }); };
  DemoBackend.prototype.listGroups = function () { return this._ug().then(function (o) { return o.groups.slice(); }); };
  DemoBackend.prototype.groupMembers = function (gid) { return this._ug().then(function (o) { return (o.mem[gid] || []).map(function (id) { var u = o.users.filter(function (x) { return x.id === id; })[0]; return u && { id: u.id, name: u.fullName, email: u.email }; }).filter(Boolean); }); };
  DemoBackend.prototype.userGroups = function (uid) { return this._ug().then(function (o) { return o.groups.filter(function (g) { return (o.mem[g.id] || []).indexOf(uid) > -1; }).map(function (g) { return { id: g.id, name: g.name }; }); }); };
  DemoBackend.prototype.updateUser = function (id, f) { return this._ug().then(function (o) { o.users.forEach(function (u) { if (u.id === id) { if (f.fullName != null) u.fullName = f.fullName; if (f.email != null) u.email = f.email; if (f.siteRole) u.role = f.siteRole; } }); }); };
  DemoBackend.prototype.removeUser = function (id) { return this._ug().then(function (o) { o.users = o.users.filter(function (u) { return u.id !== id; }); }); };
  DemoBackend.prototype.addUser = function (name, role) { return this._ug().then(function (o) { o.users.push({ id: 'u' + Date.now(), name: name, fullName: '', email: /@/.test(name) ? name : '', role: role, lastLogin: null, authSetting: 'ServerDefault', raw: {} }); }); };
  DemoBackend.prototype.createGroup = function (name) { return this._ug().then(function (o) { var id = 'g' + Date.now(); o.groups.push({ id: id, name: name, domain: 'local', minRole: '', raw: {} }); o.mem[id] = []; }); };
  DemoBackend.prototype.updateGroup = function (id, f) { return this._ug().then(function (o) { o.groups.forEach(function (g) { if (g.id === id && f.name) g.name = f.name; }); }); };
  DemoBackend.prototype.deleteGroup = function (id) { return this._ug().then(function (o) { o.groups = o.groups.filter(function (g) { return g.id !== id; }); delete o.mem[id]; }); };
  DemoBackend.prototype.addToGroup = function (gid, uid) { return this._ug().then(function (o) { var m = o.mem[gid] = o.mem[gid] || []; if (m.indexOf(uid) < 0) m.push(uid); }); };
  DemoBackend.prototype.removeFromGroup = function (gid, uid) { return this._ug().then(function (o) { o.mem[gid] = (o.mem[gid] || []).filter(function (x) { return x !== uid; }); }); };
  function fakeChart(seed, variant) {
    var x = 0; for (var i = 0; i < seed.length; i++) x = (x * 33 + seed.charCodeAt(i)) >>> 0;
    function rnd() { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }
    var c = document.createElement('canvas'); c.width = 400; c.height = 260;
    var g = c.getContext('2d');
    var pal = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1'];
    g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 260);
    g.fillStyle = '#333'; g.font = 'bold 15px "Segoe UI", Roboto, sans-serif'; g.fillText('Dashboard', 16, 26);
    var type = Math.floor(rnd() * 3 + variant) % 3;
    g.strokeStyle = '#e6e6e6';
    for (var k = 0; k < 5; k++) { g.beginPath(); g.moveTo(16, 60 + k * 40); g.lineTo(384, 60 + k * 40); g.stroke(); }
    if (type === 0) {
      for (var b = 0; b < 9; b++) { var hh = 30 + rnd() * 150; g.fillStyle = pal[b % 3 === 0 ? 0 : 1 + (b % 2)]; g.fillRect(24 + b * 40, 220 - hh, 28, hh); }
    } else if (type === 1) {
      for (var s = 0; s < 3; s++) {
        g.strokeStyle = pal[s]; g.lineWidth = 3; g.beginPath();
        var y = 80 + rnd() * 100;
        for (var p = 0; p < 12; p++) { y = Math.max(50, Math.min(215, y + (rnd() - .5) * 45)); if (p === 0) g.moveTo(20 + p * 33, y); else g.lineTo(20 + p * 33, y); }
        g.stroke();
      }
    } else {
      for (var q = 0; q < 4; q++) { g.fillStyle = '#f4f4f4'; g.fillRect(16 + q * 93, 44, 85, 54); g.fillStyle = pal[q]; g.font = 'bold 20px "Segoe UI", Roboto, sans-serif'; g.fillText((rnd() * 99).toFixed(1) + 'K', 24 + q * 93, 80); }
      for (var r = 0; r < 6; r++) { var w = 60 + rnd() * 280; g.fillStyle = pal[4]; g.fillRect(16, 112 + r * 23, w, 16); }
    }
    return c.toDataURL('image/png');
  }

  /* =============================== state =============================== */
  var S = {
    be: null, siteName: '', userId: null,
    projects: [], workbooks: [], datasources: [], byKey: {},
    loc: { type: 'project', id: null }, back: [], fwd: [],
    view: lsGet('view', 'icons'), iconSize: lsGet('iconSize', 72),
    sort: lsGet('sort', { key: 'name', dir: 1 }),
    sel: new Set(), anchor: null, expanded: new Set(),
    renaming: null, inspector: lsGet('inspector', false), query: '',
    visible: [], loading: false, ready: false
  };
  var thumbs = {}; // id -> url | 'none' | 'loading'
  function keyOf(it) { return it.kind + ':' + it.id; }
  function allItems() { return S.projects.concat(S.workbooks, S.datasources); }
  function reindex() { S.byKey = {}; allItems().forEach(function (it) { it.key = keyOf(it); S.byKey[it.key] = it; }); }
  function proj(id) { return id ? S.byKey['project:' + id] : null; }
  function children(pid) {
    pid = pid || null;
    return S.projects.filter(function (p) { return (p.parentId || null) === pid; })
      .concat(pid ? S.workbooks.filter(function (w) { return w.projectId === pid; }) : [],
        pid ? S.datasources.filter(function (d) { return d.projectId === pid; }) : []);
  }
  function childCount(pid) { return children(pid).length; }
  function ancestors(pid) { var out = []; var p = proj(pid); while (p) { out.unshift(p); p = proj(p.parentId); } return out; }
  function isDescendant(pid, ofId) { var p = proj(pid); while (p) { if (p.id === ofId) return true; p = proj(p.parentId); } return false; }
  function parentOf(it) { return it.kind === 'project' ? (it.parentId || null) : (it.projectId || null); }

  function locLabel(loc) {
    if (S.query) return 'Searching “' + S.query + '”';
    switch (loc.type) {
      case 'project': return loc.id ? (proj(loc.id) || { name: '?' }).name : S.siteName;
      case 'recents': return 'Recents';
      case 'workbooks': return 'All Workbooks';
      case 'datasources': return 'Data Sources';
      case 'mine': return 'My Content';
      case 'tag': return loc.tag;
    }
    return '';
  }
  function sameLoc(a, b) { return a.type === b.type && (a.id || null) === (b.id || null) && a.tag === b.tag; }
  function locItems() {
    var q = S.query.trim().toLowerCase();
    if (q) return allItems().filter(function (it) { return it.name.toLowerCase().indexOf(q) >= 0 || (it.tags || []).some(function (t) { return t.toLowerCase().indexOf(q) >= 0; }); });
    var L = S.loc;
    if (L.type === 'project') return children(L.id);
    var files = S.workbooks.concat(S.datasources);
    if (L.type === 'recents') return files.slice().sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); }).slice(0, 30);
    if (L.type === 'workbooks') return S.workbooks.slice();
    if (L.type === 'datasources') return S.datasources.slice();
    if (L.type === 'mine') return files.filter(function (f) { return f.ownerId === S.userId; });
    if (L.type === 'tag') return files.filter(function (f) { return (f.tags || []).indexOf(L.tag) >= 0; });
    return [];
  }
  function sortItems(list) {
    if (S.loc.type === 'recents' && !S.query && S.view !== 'list') return list;
    var k = S.sort.key, dir = S.sort.dir;
    function val(it) {
      if (k === 'date') return it.updatedAt || '';
      if (k === 'size') return it.kind === 'project' ? -1 : (it.size || 0);
      if (k === 'kind') return KIND[it.kind];
      if (k === 'where') return where(it).toLowerCase();
      return it.name.toLowerCase();
    }
    return list.slice().sort(function (a, b) {
      if (a.kind === 'project' && b.kind !== 'project') return -1;
      if (b.kind === 'project' && a.kind !== 'project') return 1;
      var x = val(a), y = val(b);
      var c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return c * dir || a.name.localeCompare(b.name);
    });
  }
  function where(it) { var p = proj(parentOf(it)); return p ? p.name : S.siteName; }
  function selItems() { var out = []; S.sel.forEach(function (k) { if (S.byKey[k]) out.push(S.byKey[k]); }); return out; }
  function currentProjectId() { return S.loc.type === 'project' && !S.query ? S.loc.id : null; }

  /* =============================== shell =============================== */
  var R = {};
  function buildShell() {
    clear(root);
    R.title = h('div', { class: 'tb-title' });
    R.back = tbBtn('back', 'Back (Ctrl+[)', function () { goBack(); });
    R.fwd = tbBtn('fwd', 'Forward (Ctrl+])', function () { goFwd(); });
    R.vIcons = tbBtn('viewIcons', 'Icon view (Ctrl+1)', function () { setView('icons'); });
    R.vList = tbBtn('viewList', 'List view (Ctrl+2)', function () { setView('list'); });
    R.vCols = tbBtn('viewCols', 'Column view (Ctrl+3)', function () { setView('columns'); });
    R.newFolder = tbBtn('newFolder', 'New Project (Ctrl+Shift+N)', function () { newFolder(); });
    R.trash = tbBtn('trash', 'Delete (Ctrl+Del)', function () { deleteSel(); });
    R.refresh = tbBtn('refresh', 'Refresh (Ctrl+R)', function () { reload(); });
    R.info = tbBtn('info', 'Details (Ctrl+I)', function () { toggleInspector(); });
    R.theme = h('button', { class: 'tb-btn', onClick: function () { themeChoice = effectiveTheme() === 'dark' ? 'light' : 'dark'; lsSet('theme', themeChoice); applyTheme(); syncThemeBtn(); } });
    function syncThemeBtn() {
      var dark = effectiveTheme() === 'dark', t = dark ? 'Switch to light mode' : 'Switch to dark mode';
      R.theme.title = t; R.theme.setAttribute('aria-label', t); R.theme.innerHTML = ''; R.theme.appendChild(icon(dark ? 'sun' : 'moon'));
    }
    syncThemeBtn();
    if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', function () { syncThemeBtn(); });
    R.search = h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search',
      onInput: function () { S.query = R.search.value; S.sel.clear(); renderAll(); },
      onKeydown: function (e) { if (e.key === 'Escape') { R.search.value = ''; S.query = ''; renderAll(); R.content.focus(); } if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); R.content.focus(); if (S.visible[0]) selectOnly(S.visible[0]); } } });
    R.conn = h('div', { class: 'conn-pill', title: 'Click to change connection', onClick: function () { showConnect(); } });
    var titlebar = h('div', { class: 'titlebar' }, [
      h('div', { class: 'side-spacer' }, [h('span', { class: 'brand' }, 'Files')]),
      R.back, R.fwd, R.title, h('div', { class: 'tb-flex' }),
      R.conn,
      h('div', { class: 'seg' }, [R.vIcons, R.vList, R.vCols]),
      R.newFolder, R.trash, R.refresh, R.info, R.theme,
      h('label', { class: 'search' }, [icon('search'), R.search])
    ]);
    R.sidebar = h('div', { class: 'sidebar' });
    R.content = h('div', { class: 'content', tabindex: '0',
      onMousedown: function (e) { if (e.target === R.content || e.target.classList.contains('grid') || e.target.classList.contains('rows') || e.target.classList.contains('col')) { if (!e.metaKey && !e.shiftKey) { S.sel.clear(); refreshSelection(); } } },
      onContextmenu: function (e) { if (!e.target.closest('[data-key]')) { e.preventDefault(); S.sel.clear(); refreshSelection(); bgMenu(e); } } });
    makeDropTarget(R.content, function () { return currentProjectId(); }, true);
    R.path = h('div', { class: 'pathbar' });
    R.statusText = h('span');
    R.zoom = h('input', { type: 'range', min: '40', max: '128', value: String(S.iconSize), 'aria-label': 'Icon size',
      onInput: function () { S.iconSize = Number(R.zoom.value); lsSet('iconSize', S.iconSize); renderMain(); } });
    R.zoomWrap = h('div', { class: 'zoom' }, [R.zoom]);
    R.status = h('div', { class: 'statusbar' }, [R.statusText, R.zoomWrap]);
    R.main = h('div', { class: 'main' }, [R.content, R.path, R.status]);
    R.inspector = h('div', { class: 'inspector' });
    R.toasts = h('div', { class: 'toasts' });
    // Window controls: both reveal the TableauOS desktop (minimize keeps a taskbar entry; close doesn't).
    R.winMax = h('button', { class: 'wb-btn', title: 'Maximize', 'aria-label': 'Maximize', onClick: function () { if (R.mgr) R.mgr.toggleMax(); } }, null);
    R.winMax.appendChild(WinMgr.icon(false));
    R.winMin = h('button', { class: 'wb-btn minimize', title: 'Minimize', 'aria-label': 'Minimize', onClick: function () { if (window.TableauOS) TableauOS.minimize('explorer'); } }, icon('minimize'));
    R.winClose = h('button', { class: 'wb-btn close', title: 'Close', 'aria-label': 'Close', onClick: function () { if (window.TableauOS) TableauOS.close('explorer'); } }, icon('close'));
    var winbar = h('div', { class: 'winbar' }, [
      h('div', { class: 'wb-title' }, [icon('folder'), h('span', null, 'Tableau File Explorer')]),
      h('div', { class: 'wb-ctl' }, [R.winMin, R.winMax, R.winClose])
    ]);
    R.win = h('div', { class: 'window' }, [winbar, titlebar, h('div', { class: 'body' }, [R.sidebar, R.main, R.inspector])]);
    R.win.hidden = true; // the desktop is the landing screen; the window opens from its icon
    root.appendChild(R.win);
    R.mgr = WinMgr.manage(R.win, { bar: winbar, w: 1180, h: 740, minW: 560, minH: 360,
      onMaxChange: function (m) { R.winMax.textContent = ''; R.winMax.appendChild(WinMgr.icon(m)); R.winMax.title = m ? 'Restore' : 'Maximize'; R.winMax.setAttribute('aria-label', R.winMax.title); } });
    if (window.TableauOS) TableauOS.register('explorer', { el: R.win, raise: R.mgr.raise, onShow: flushShown });
    root.appendChild(R.toasts);
    buildConnWindow(root);
  }
  function tbBtn(ic, title, fn) { return h('button', { class: 'tb-btn', title: title, 'aria-label': title, onClick: fn }, icon(ic)); }

  /* =============================== render =============================== */
  function pushConn() {
    if (!window.TableauOS || !TableauOS.setConn) return;
    var be = S.be, st = S.loading && !S.ready ? 'loading' : !be ? 'none' : be.isDemo ? 'demo' : 'ok', host = '';
    try { host = new URL(serverRoot() || location.href).host; } catch (e) { host = serverRoot(); }
    if (be && !be.connectedAt) be.connectedAt = new Date();
    TableauOS.setConn({ state: st, site: be && (S.siteName || 'Default'), server: host, projects: be && S.projects && S.projects.length, workbooks: be && S.workbooks && S.workbooks.length, datasources: be && S.datasources && S.datasources.length,
      at: be && be.connectedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
  }
  function renderAll() { pushConn(); renderToolbar(); renderSidebar(); renderMain(); renderPath(); renderStatus(); renderInspector(); }
  function renderToolbar() {
    R.title.textContent = locLabel(S.loc);
    R.back.disabled = !S.back.length; R.fwd.disabled = !S.fwd.length;
    R.vIcons.classList.toggle('on', S.view === 'icons');
    R.vList.classList.toggle('on', S.view === 'list');
    R.vCols.classList.toggle('on', S.view === 'columns');
    R.info.classList.toggle('on', S.inspector);
    R.trash.disabled = !S.sel.size;
    R.conn.textContent = S.be ? (S.be.isDemo ? 'Sample data' : S.siteName) : 'Not connected';
    R.conn.classList.toggle('demo', !!(S.be && S.be.isDemo));
  }
  function sbItem(label, ic, loc, opts) {
    opts = opts || {};
    var active = !S.query && sameLoc(S.loc, loc);
    var el = h('div', { class: 'sb-item' + (active ? ' active' : ''), title: label, onClick: function () { go(loc); } },
      [opts.dot ? h('span', { class: 'tagdot', style: { background: opts.dot } }) : icon(ic), h('span', { class: 'l', text: label }), opts.count != null ? h('span', { class: 'count', text: String(opts.count) }) : null]);
    if (loc.type === 'project') makeDropTarget(el, function () { return loc.id; });
    return el;
  }
  function renderSidebar() {
    clear(R.sidebar);
    var tops = S.projects.filter(function (p) { return !p.parentId; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var tags = {};
    S.workbooks.concat(S.datasources).forEach(function (it) { (it.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    var tagNames = Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a] || a.localeCompare(b); }).slice(0, 12);
    add(R.sidebar, [
      h('div', { class: 'sb-head', text: 'Favorites' }),
      sbItem('Recents', 'clock', { type: 'recents' }),
      sbItem('All Workbooks', 'grid', { type: 'workbooks' }),
      sbItem('Data Sources', 'db', { type: 'datasources' }),
      sbItem('My Content', 'person', { type: 'mine' }),
      h('div', { class: 'sb-head', text: 'Locations' }),
      sbItem(S.siteName || 'Site', 'cloud', { type: 'project', id: null }),
      tops.length ? h('div', { class: 'sb-head', text: 'Projects' }) : null,
      tops.map(function (p) { return sbItem(p.name, 'sbFolder', { type: 'project', id: p.id }); }),
      tagNames.length ? h('div', { class: 'sb-head', text: 'Tags' }) : null,
      tagNames.map(function (t) { return sbItem(t, null, { type: 'tag', tag: t }, { dot: tagColor(t), count: tags[t] }); })
    ]);
  }

  function renderMain() {
    var keepScroll = R.content._loc && sameLoc(R.content._loc, S.loc) && R.content._view === S.view ? R.content.scrollTop : 0;
    var keepX = R.content.scrollLeft;
    clear(R.content);
    R.content._loc = S.loc; R.content._view = S.view;
    R.zoomWrap.style.display = S.view === 'icons' ? '' : 'none';
    if (!S.ready) { R.content.appendChild(h('div', { class: 'empty' }, S.loading ? 'Loading…' : [h('div', null, 'Not connected to a Tableau site.'), h('button', { class: 'btn primary', type: 'button', style: { marginTop: '12px' }, onClick: function () { showConnect(); } }, 'Open Connection')])); S.visible = []; return; }
    var view = S.view;
    if (view === 'columns' && (S.loc.type !== 'project' || S.query)) view = 'list';
    if (view === 'icons') renderIcons();
    else if (view === 'list') renderList();
    else renderColumns();
    R.content.scrollTop = keepScroll;
    if (view === 'columns') R.content.scrollLeft = R.content.scrollWidth; else R.content.scrollLeft = keepX;
  }
  function emptyNote(items) { if (!items.length) R.content.appendChild(h('div', { class: 'empty', text: S.query ? 'No results' : 'This folder is empty' })); }

  function nameNode(it, cls) {
    if (S.renaming === it.key) return renameInput(it);
    var tagrow = (it.tags || []).length ? h('span', { class: 'tagrow' }, it.tags.slice(0, 3).map(function (t) { return h('span', { class: 'tagdot', style: { background: tagColor(t) } }); })) : null;
    return h('span', { class: cls }, [it.name, tagrow]);
  }
  function renderIcons() {
    var items = sortItems(locItems());
    S.visible = items;
    var sz = S.iconSize, cell = Math.max(sz + 34, 96);
    var grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(' + cell + 'px, 1fr))' } });
    items.forEach(function (it) {
      var ic = h('div', { class: 'tile-icon', style: { width: (sz + 8) + 'px', height: (sz + 8) + 'px' } }, thumbOrIcon(it, sz));
      var el = h('div', { class: 'tile' + (S.sel.has(it.key) ? ' sel' : ''), dataset: { key: it.key }, draggable: 'true' }, [ic, nameNode(it, 'tile-label')]);
      bindItem(el, it);
      grid.appendChild(el);
    });
    R.content.appendChild(grid);
    emptyNote(items);
  }
  function thumbImg(src, id, cls) {
    return h('img', { class: cls || 'thumb', src: src, alt: '', draggable: 'false', onError: function (e) {
      var n = e.target, cur = n.getAttribute('src') || '';
      // CSP may forbid blob: images; retry once as a data: URL before giving up.
      if (blobOf[cur] && !n._triedData) {
        n._triedData = true;
        var fr = new FileReader();
        fr.onload = function () { if (id && thumbs[id] === cur) thumbs[id] = fr.result; n.src = fr.result; };
        fr.readAsDataURL(blobOf[cur]);
        return;
      }
      if (id) thumbs[id] = 'none';
      if (n.parentNode) n.replaceWith(icon('workbookBig'));
    } });
  }
  function thumbOrIcon(it, sz) {
    if (it.kind === 'workbook') {
      var t = thumbs[it.id];
      if (t && t !== 'none' && t !== 'loading') return thumbImg(t, it.id);
      if (!t) loadThumb(it);
      var s = icon('workbookBig'); s.setAttribute('data-thumb', it.id); return s;
    }
    return icon(bigIconName(it));
  }
  var thumbQueue = [], thumbActive = 0;
  function loadThumb(it) {
    thumbs[it.id] = 'loading';
    thumbQueue.push(it);
    pumpThumbs();
  }
  function pumpThumbs() {
    while (thumbActive < 4 && thumbQueue.length) {
      var it = thumbQueue.shift(); thumbActive++;
      (function (it) {
        S.be.preview(it).then(function (url) { thumbs[it.id] = url; }, function () { thumbs[it.id] = 'none'; })
          .then(function () {
            thumbActive--; pumpThumbs();
            if (thumbs[it.id] === 'none') return;
            document.querySelectorAll('[data-thumb="' + it.id + '"]').forEach(function (n) {
              n.replaceWith(thumbImg(thumbs[it.id], it.id));
            });
          });
      })(it);
    }
  }

  var COLS = [['name', 'Name'], ['date', 'Date Modified'], ['size', 'Size'], ['kind', 'Kind'], ['where', 'Where']];
  function renderList() {
    var items = sortItems(locItems());
    var flat = S.loc.type === 'project' && !S.query;
    var rows = [];
    (function walk(list, depth) {
      list.forEach(function (it) {
        rows.push({ it: it, depth: depth });
        if (flat && it.kind === 'project' && S.expanded.has(it.id)) walk(sortItems(children(it.id)), depth + 1);
      });
    })(items, 0);
    S.visible = rows.map(function (r) { return r.it; });
    var head = h('div', { class: 'list-head' }, COLS.map(function (c) {
      var on = S.sort.key === c[0];
      var label = c[0] === 'where' && flat ? 'Owner' : c[1];
      return h('div', { class: on ? 'sorted' : '', onClick: function () { setSort(c[0]); } }, [label, on ? icon(S.sort.dir > 0 ? 'up' : 'down') : null]);
    }));
    var body = h('div', { class: 'rows' });
    rows.forEach(function (r) {
      var it = r.it;
      var disc = h('span', { class: 'disc' + (S.expanded.has(it.id) ? ' open' : '') }, it.kind === 'project' && flat ? icon('tri') : null);
      if (it.kind === 'project' && flat) disc.addEventListener('mousedown', function (e) { e.stopPropagation(); toggleExpand(it.id); });
      var el = h('div', { class: 'row' + (S.sel.has(it.key) ? ' sel' : ''), dataset: { key: it.key }, draggable: 'true' }, [
        h('div', { class: 'name', style: { paddingLeft: (4 + r.depth * 18) + 'px' } }, [disc, icon(smallIconName(it), 'small'), nameNode(it, 'nm')]),
        h('div', { text: fmtDate(it.updatedAt) }),
        h('div', { text: it.kind === 'project' ? '--' : fmtBytes(it.size) }),
        h('div', { text: it.kind === 'datasource' && it.certified ? 'Certified Data Source' : KIND[it.kind] }),
        h('div', { text: flat ? (it.owner || '--') : where(it) })
      ]);
      bindItem(el, it);
      body.appendChild(el);
    });
    R.content.appendChild(h('div', { class: 'list' }, [head, body]));
    emptyNote(items);
  }
  function renderColumns() {
    var chain = [null].concat(ancestors(S.loc.id).map(function (p) { return p.id; }));
    var wrap = h('div', { class: 'columns' });
    var last = [];
    chain.forEach(function (pid, i) {
      var items = sortItems(children(pid));
      var nextPid = chain[i + 1];
      var col = h('div', { class: 'col' });
      makeDropTarget(col, function () { return pid; });
      items.forEach(function (it) {
        var inPath = it.kind === 'project' && it.id === nextPid;
        var el = h('div', { class: 'row' + (S.sel.has(it.key) && i === chain.length - 1 ? ' sel' : '') + (inPath ? ' path' : ''), dataset: { key: it.key }, draggable: 'true' }, [
          h('div', { class: 'name' }, [icon(smallIconName(it), 'small'), nameNode(it, 'nm'), it.kind === 'project' ? h('span', { class: 'chev' }, icon('chev')) : null])
        ]);
        bindItem(el, it, { colPid: pid });
        col.appendChild(el);
      });
      if (!items.length) col.appendChild(h('div', { style: { color: 'var(--text-3)', padding: '8px', fontSize: '12px' }, text: 'Empty' }));
      wrap.appendChild(col);
      if (i === chain.length - 1) last = items;
    });
    S.visible = last;
    var sel = selItems();
    if (sel.length === 1) {
      var it = sel[0];
      if (it.kind === 'project' && parentOf(it) === S.loc.id) {
        // preview children of selected folder
        var col = h('div', { class: 'col' });
        sortItems(children(it.id)).forEach(function (c) {
          var el = h('div', { class: 'row', dataset: { key: c.key }, draggable: 'true' }, [h('div', { class: 'name' }, [icon(smallIconName(c), 'small'), h('span', { class: 'nm', text: c.name })])]);
          bindItem(el, c, { colPid: it.id });
          col.appendChild(el);
        });
        makeDropTarget(col, function () { return it.id; });
        wrap.appendChild(col);
      } else if (it.kind !== 'project') {
        wrap.appendChild(previewBlock(it, 'preview-col'));
      }
    }
    R.content.appendChild(wrap);
  }
  function previewBlock(it, cls) {
    var img = h('div', { class: 'pv-img' }, icon(bigIconName(it)));
    if (it.kind === 'workbook') {
      var apply = function () { var t = thumbs[it.id]; if (t && t !== 'none' && t !== 'loading') { clear(img); img.appendChild(thumbImg(t, it.id)); } };
      if (!thumbs[it.id]) { thumbs[it.id] = 'loading'; S.be.preview(it).then(function (u) { thumbs[it.id] = u; apply(); }, function () { thumbs[it.id] = 'none'; }); }
      else if (thumbs[it.id] === 'loading') { var tries = 0, iv = setInterval(function () { if (thumbs[it.id] !== 'loading' || ++tries > 40 || !img.isConnected && tries > 2) { clearInterval(iv); apply(); } }, 150); }
      else apply();
    }
    return h('div', { class: cls }, [img, h('h3', { text: it.name }), h('div', { class: 'sub', text: KIND[it.kind] + (it.size ? ' – ' + fmtBytes(it.size) : '') }), infoKV(it)]);
  }
  function infoKV(it) {
    var rows = [
      ['Kind', it.kind === 'datasource' && it.certified ? 'Certified Data Source' : KIND[it.kind]],
      it.kind !== 'project' ? ['Size', fmtBytes(it.size)] : ['Contents', childCount(it.id) + ' items'],
      ['Where', ancestors(parentOf(it)).map(function (p) { return p.name; }).join(' ▸ ') || S.siteName],
      ['Created', fmtDate(it.createdAt)],
      ['Modified', fmtDate(it.updatedAt)],
      ['Owner', it.owner || '--'],
      it.dsType ? ['Type', it.dsType] : null,
      it.description ? ['Comments', it.description] : null
    ].filter(Boolean);
    return h('div', { class: 'kv' }, rows.map(function (r) { return [h('div', { class: 'k', text: r[0] + ':' }), h('div', { class: 'v', text: r[1] })]; }));
  }

  function renderPath() {
    clear(R.path);
    var sel = selItems();
    var crumbs = [];
    var base = sel.length === 1 ? sel[0] : null;
    var pid = base ? parentOf(base) : (S.loc.type === 'project' && !S.query ? S.loc.id : undefined);
    if (pid === undefined) {
      crumbs.push(h('span', { class: 'crumb', text: locLabel(S.loc) }));
    } else {
      var siteCrumb = h('span', { class: 'crumb', onClick: function () { go({ type: 'project', id: null }); } }, [icon('cloud'), S.siteName]);
      makeDropTarget(siteCrumb, function () { return null; });
      crumbs.push(siteCrumb);
      ancestors(pid).forEach(function (p) {
        var c = h('span', { class: 'crumb', onClick: function () { go({ type: 'project', id: p.id }); } }, [icon('folder'), p.name]);
        makeDropTarget(c, function () { return p.id; });
        crumbs.push(c);
      });
      if (base) crumbs.push(h('span', { class: 'crumb', onDblclick: function () { openItem(base); } }, [icon(smallIconName(base)), base.name]));
    }
    crumbs.forEach(function (c, i) { if (i) R.path.appendChild(h('span', { class: 'crumb-sep', text: '›' })); R.path.appendChild(c); });
  }
  function renderStatus() {
    clear(R.statusText);
    if (S.loading) R.statusText.appendChild(h('span', { class: 'spinner' }));
    var n = S.visible.length;
    var t = S.sel.size ? S.sel.size + ' of ' + n + ' selected' : n + ' item' + (n === 1 ? '' : 's');
    if (S.loc.type === 'project' && !S.query && S.ready) t += ', ' + S.workbooks.length + ' workbooks · ' + S.datasources.length + ' data sources on site';
    R.statusText.appendChild(document.createTextNode(t));
  }
  var inspToken = 0;
  function renderInspector() {
    R.inspector.style.display = S.inspector ? '' : 'none';
    if (!S.inspector) return;
    clear(R.inspector);
    var sel = selItems();
    var it = sel.length === 1 ? sel[0] : (sel.length ? null : (S.loc.type === 'project' && S.loc.id && !S.query ? proj(S.loc.id) : null));
    if (!it) {
      R.inspector.appendChild(h('div', { class: 'sub', style: { textAlign: 'center', marginTop: '40px' }, text: sel.length ? sel.length + ' items selected' : 'Select an item to see its info' }));
      return;
    }
    var my = ++inspToken;
    R.inspector.appendChild(previewBlock(it, ''));
    if (it.kind !== 'project') {
      R.inspector.appendChild(h('div', { class: 'sec-title', text: 'Tags' }));
      R.inspector.appendChild(tagsEditor(it));
      var actions = h('div', { style: { marginTop: '14px', display: 'flex', gap: '12px' } }, [
        h('button', { class: 'link-btn', onClick: function () { quickLook(it); } }, 'Preview'),
        it.url ? h('button', { class: 'link-btn', onClick: function () { openInTableau(it); } }, 'Open in Tableau') : null
      ]);
      R.inspector.appendChild(actions);
    }
    if (it.kind === 'workbook') {
      var vl = h('div', { class: 'views-list' }, h('div', { style: { color: 'var(--text-3)' }, text: 'Loading…' }));
      R.inspector.appendChild(h('div', { class: 'sec-title', text: 'Sheets' }));
      R.inspector.appendChild(vl);
      S.be.views(it).then(function (vs) {
        if (my !== inspToken) return;
        clear(vl);
        if (!vs.length) vl.appendChild(h('div', { text: 'No views' }));
        vs.forEach(function (v) { vl.appendChild(h('div', null, [icon('sheet'), v.name])); });
      }, function (e) { if (my === inspToken) { clear(vl); vl.appendChild(h('div', { text: 'Could not load views' })); } });
    } else if (it.kind === 'datasource') {
      var cl = h('div', { class: 'views-list' }, h('div', { style: { color: 'var(--text-3)' }, text: 'Loading…' }));
      R.inspector.appendChild(h('div', { class: 'sec-title', text: 'Connections' }));
      R.inspector.appendChild(cl);
      S.be.connections(it).then(function (cs) {
        if (my !== inspToken) return;
        clear(cl);
        if (!cs.length) cl.appendChild(h('div', { text: 'None' }));
        cs.forEach(function (c) { cl.appendChild(h('div', null, [icon('db'), (c.type || 'connection') + (c.server ? ' · ' + c.server : '')])); });
      }, function () { if (my === inspToken) { clear(cl); cl.appendChild(h('div', { text: 'Could not load connections' })); } });
    }
  }
  function tagsEditor(it) {
    var wrap = h('div', { class: 'tags-edit' });
    (it.tags || []).forEach(function (t) {
      wrap.appendChild(h('span', { class: 'tag-chip' }, [h('span', { class: 'tagdot', style: { background: tagColor(t) } }), t,
        h('button', { title: 'Remove tag', 'aria-label': 'Remove tag ' + t, onClick: function () {
          S.be.removeTag(it, t).then(function () { it.tags = it.tags.filter(function (x) { return x !== t; }); renderAll(); }, err('Could not remove tag'));
        } }, '×')]));
    });
    var inp = h('input', { class: 'tag-input', placeholder: 'Add tag…', onKeydown: function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && inp.value.trim()) {
        var l = inp.value.trim();
        S.be.addTag(it, l).then(function () { if (it.tags.indexOf(l) < 0) it.tags.push(l); renderAll(); toast('Tagged “' + it.name + '” with ' + l); }, err('Could not add tag'));
      }
    } });
    wrap.appendChild(inp);
    return wrap;
  }
  function refreshSelection() {
    if (S.view === 'columns' && S.loc.type === 'project' && !S.query) { renderMain(); }
    else {
      R.content.querySelectorAll('[data-key]').forEach(function (n) { n.classList.toggle('sel', S.sel.has(n.dataset.key)); });
    }
    renderToolbar(); renderPath(); renderStatus(); renderInspector();
  }

  /* =============================== interactions =============================== */
  function bindItem(el, it, opts) {
    opts = opts || {};
    el.addEventListener('mousedown', function (e) {
      if (S.renaming === it.key) return;
      if (opts.colPid !== undefined && opts.colPid !== S.loc.id) {
        // column view: clicking in an earlier column navigates there
        if (it.kind === 'project' && e.button === 0) { goReplaceCol(it.id); return; }
        goReplaceCol(opts.colPid, it.key);
        return;
      }
      if (e.button === 2) { if (!S.sel.has(it.key)) selectOnly(it); return; }
      if (e.metaKey || e.ctrlKey) { if (S.sel.has(it.key)) S.sel.delete(it.key); else S.sel.add(it.key); S.anchor = it.key; }
      else if (e.shiftKey && S.anchor) {
        var a = S.visible.findIndex(function (x) { return x.key === S.anchor; }), b = S.visible.indexOf(it);
        if (a < 0) a = b;
        S.sel = new Set(S.visible.slice(Math.min(a, b), Math.max(a, b) + 1).map(function (x) { return x.key; }));
      } else if (!S.sel.has(it.key)) { S.sel = new Set([it.key]); S.anchor = it.key; }
      else { el._collapse = true; }
      if (opts.colPid !== undefined && it.kind === 'project' && !(e.metaKey || e.shiftKey)) { go({ type: 'project', id: it.id }, { keepHistory: false }); return; }
      refreshSelection();
    });
    el.addEventListener('click', function (e) {
      if (el._collapse && !e.metaKey && !e.shiftKey && S.sel.size > 1) { selectOnly(it); }
      el._collapse = false;
    });
    el.addEventListener('dblclick', function () { if (S.renaming !== it.key) openItem(it); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); if (!S.sel.has(it.key)) selectOnly(it); itemMenu(e); });
    el.addEventListener('dragstart', function (e) {
      var keys = S.sel.has(it.key) ? Array.from(S.sel) : [it.key];
      e.dataTransfer.setData('text/plain', keys.join('\n'));
      e.dataTransfer.effectAllowed = 'move';
      dragKeys = keys;
    });
    el.addEventListener('dragend', function () { dragKeys = null; clearDrops(); });
    if (it.kind === 'project') makeDropTarget(el, function () { return it.id; });
  }
  var dragKeys = null;
  function clearDrops() { document.querySelectorAll('.drop').forEach(function (n) { n.classList.remove('drop'); }); }
  function canDrop(keys, pid) {
    if (!keys || !keys.length) return false;
    return keys.every(function (k) {
      var it = S.byKey[k]; if (!it) return false;
      if (parentOf(it) === (pid || null)) return false;
      if (it.kind === 'project') return it.id !== pid && !(pid && isDescendant(pid, it.id));
      return !!pid; // files must live in a project
    });
  }
  function makeDropTarget(el, getPid, isBg) {
    el.addEventListener('dragover', function (e) {
      if (isBg && e.target.closest('[data-key]') && e.target.closest('[data-key]') !== el) return;
      var pid = getPid();
      if (isBg && pid === null && S.loc.type !== 'project') return;
      if (!canDrop(dragKeys, pid)) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      clearDrops(); el.classList.add('drop');
    });
    el.addEventListener('dragleave', function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove('drop'); });
    el.addEventListener('drop', function (e) {
      var pid = getPid();
      if (!canDrop(dragKeys, pid)) return;
      e.preventDefault(); e.stopPropagation();
      var keys = dragKeys; dragKeys = null; clearDrops();
      moveItems(keys.map(function (k) { return S.byKey[k]; }), pid);
    });
  }
  function selectOnly(it) { S.sel = new Set([it.key]); S.anchor = it.key; refreshSelection(); scrollIntoView(it); }
  function scrollIntoView(it) { var n = R.content.querySelector('[data-key="' + CSS.escape(it.key) + '"]'); if (n) n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }

  function go(loc, opts) {
    opts = opts || {};
    var hadQuery = !!S.query;
    if (sameLoc(loc, S.loc) && !hadQuery) { S.sel.clear(); renderAll(); return; }
    if (opts.keepHistory !== false) { S.back.push(S.loc); S.fwd = []; }
    S.loc = loc; S.sel = new Set(opts.select ? [opts.select] : []); S.anchor = opts.select || null;
    S.query = ''; R.search.value = ''; S.renaming = null;
    renderAll();
  }
  function goReplaceCol(pid, selectKey) { go({ type: 'project', id: pid }, { select: selectKey }); }
  function goBack() { if (!S.back.length) return; S.fwd.push(S.loc); S.loc = S.back.pop(); S.sel.clear(); S.query = ''; R.search.value = ''; renderAll(); }
  function goFwd() { if (!S.fwd.length) return; S.back.push(S.loc); S.loc = S.fwd.pop(); S.sel.clear(); S.query = ''; R.search.value = ''; renderAll(); }
  function goUp() {
    if (S.loc.type !== 'project' || !S.loc.id) return;
    var cur = proj(S.loc.id);
    go({ type: 'project', id: cur.parentId || null }, { select: cur.key });
  }
  function openItem(it) { if (it.kind === 'project') go({ type: 'project', id: it.id }); else quickLook(it); }
  function setView(v) { S.view = v; lsSet('view', v); renderAll(); R.content.focus(); }
  function setSort(k) { if (S.sort.key === k) S.sort.dir *= -1; else S.sort = { key: k, dir: k === 'date' || k === 'size' ? -1 : 1 }; lsSet('sort', S.sort); renderMain(); renderStatus(); }
  function toggleInspector() { S.inspector = !S.inspector; lsSet('inspector', S.inspector); renderToolbar(); renderInspector(); }
  function toggleExpand(id) { if (S.expanded.has(id)) S.expanded.delete(id); else S.expanded.add(id); renderMain(); renderStatus(); }

  function openInTableau(it) {
    if (!it.url) { toast('No web URL for this item' + (S.be.isDemo ? ' in sample data' : ''), true); return; }
    var w = null;
    try { w = window.open(it.url, '_blank', 'noopener'); } catch (e) { /* sandbox */ }
    if (!w) copyText(it.url, 'Pop-ups are blocked here — link copied to clipboard');
  }
  function copyText(t, msg) {
    var done = function () { toast(msg || 'Link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t) ? done() : toast(t); });
    else if (fallbackCopy(t)) done(); else toast(t);
  }
  function fallbackCopy(t) { try { var ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = t; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } }

  /* ---------- rename ---------- */
  function startRename(it) { if (!it) return; S.renaming = it.key; renderMain(); }
  function renameInput(it) {
    var inp = h('input', { class: 'rename', value: it.name, 'aria-label': 'Name' });
    var done = false;
    function finish(commit) {
      if (done) return; done = true;
      var name = inp.value.trim();
      S.renaming = null;
      if (!commit || !name || name === it.name) { renderMain(); R.content.focus(); return; }
      var old = it.name; it.name = name; renderAll(); R.content.focus();
      S.be.rename(it, name).then(function () { it.updatedAt = new Date().toISOString(); renderAll(); }, function (e) { it.name = old; renderAll(); toast('Couldn’t rename “' + old + '”: ' + e.message, true); });
    }
    inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', function () { if (inp.isConnected) finish(true); });
    inp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    inp.addEventListener('dblclick', function (e) { e.stopPropagation(); });
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
    return inp;
  }

  /* ---------- move / delete / create ---------- */
  function moveItems(items, pid) {
    items = items.filter(Boolean);
    if (!items.length) return;
    var dest = pid ? proj(pid).name : S.siteName;
    S.loading = true; renderStatus();
    var ok = 0, fails = [];
    items.reduce(function (p, it) {
      return p.then(function () {
        return S.be.move(it, pid).then(function () {
          if (it.kind === 'project') it.parentId = pid || null; else it.projectId = pid;
          ok++;
        }, function (e) { fails.push(it.name + ': ' + e.message); });
      });
    }, Promise.resolve()).then(function () {
      S.loading = false; renderAll();
      if (ok) toast('Moved ' + (ok === 1 ? '“' + items[0].name + '”' : ok + ' items') + ' to ' + dest);
      if (fails.length) toast('Move failed — ' + fails[0], true);
    });
  }
  function deleteSel() {
    var items = selItems();
    if (!items.length) return;
    var hasProj = items.some(function (i) { return i.kind === 'project'; });
    var title = items.length === 1 ? 'Are you sure you want to delete “' + items[0].name + '”?' : 'Are you sure you want to delete these ' + items.length + ' items?';
    var msg = (hasProj ? 'Deleting a project also deletes all of the workbooks, data sources and projects inside it. ' : '') + 'This deletes it from the Tableau site immediately. You can’t undo this action.';
    confirmDialog(title, msg, 'Delete', function () {
      S.loading = true; renderStatus();
      var ok = 0, fails = [];
      items.reduce(function (p, it) {
        return p.then(function () {
          return S.be.remove(it).then(function () { ok++; dropLocal(it); }, function (e) { fails.push(it.name + ': ' + e.message); });
        });
      }, Promise.resolve()).then(function () {
        S.loading = false; S.sel.clear(); reindex();
        if (S.loc.type === 'project' && S.loc.id && !proj(S.loc.id)) S.loc = { type: 'project', id: null };
        renderAll();
        if (ok) toast('Deleted ' + (ok === 1 ? '“' + items[0].name + '”' : ok + ' items'));
        if (fails.length) toast('Delete failed — ' + fails[0], true);
      });
    });
  }
  function dropLocal(it) {
    if (it.kind === 'project') {
      // remove nested content locally too
      var ids = [it.id];
      S.projects.forEach(function (p) { if (isDescendant(p.id, it.id)) ids.push(p.id); });
      S.projects = S.projects.filter(function (p) { return ids.indexOf(p.id) < 0; });
      S.workbooks = S.workbooks.filter(function (w) { return ids.indexOf(w.projectId) < 0; });
      S.datasources = S.datasources.filter(function (d) { return ids.indexOf(d.projectId) < 0; });
    } else {
      S[it.kind + 's'] = S[it.kind + 's'].filter(function (x) { return x.id !== it.id; });
    }
  }
  function newFolder() {
    var pid = currentProjectId();
    if (S.loc.type !== 'project' || S.query) { toast('Open a project or the site root to create a project', true); return; }
    var names = children(pid).map(function (c) { return c.name.toLowerCase(); });
    var name = 'untitled project', n = 2;
    while (names.indexOf(name) >= 0) name = 'untitled project ' + (n++);
    S.be.createProject(name, pid).then(function (p) {
      S.projects.push(p); reindex();
      S.sel = new Set([p.key]); S.anchor = p.key; S.renaming = p.key;
      renderAll();
      scrollIntoView(p);
    }, err('Couldn’t create project'));
  }
  function err(prefix) { return function (e) { toast(prefix + ': ' + (e && e.message || e), true); }; }

  /* ---------- menus ---------- */
  var menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function showMenu(e, items) {
    closeMenu();
    menuEl = h('div', { class: 'menu', role: 'menu' }, items.map(function (m) {
      if (m === '-') return h('div', { class: 'msep' });
      return h('div', { class: 'mi' + (m.disabled ? ' dis' : '') + (m.danger ? ' danger' : ''), role: 'menuitem',
        onMouseup: function (ev) { ev.stopPropagation(); if (m.disabled) return; closeMenu(); m.fn(); } },
        [h('span', { text: m.label }), m.sc ? h('span', { class: 'sc', text: m.sc }) : null]);
    }));
    document.body.appendChild(menuEl);
    var r = menuEl.getBoundingClientRect();
    menuEl.style.left = Math.min(e.clientX, innerWidth - r.width - 6) + 'px';
    menuEl.style.top = Math.min(e.clientY, innerHeight - r.height - 6) + 'px';
  }
  document.addEventListener('mousedown', function (e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
  function itemMenu(e) {
    var sel = selItems(), one = sel.length === 1 ? sel[0] : null;
    showMenu(e, [
      { label: 'Open', sc: 'Ctrl+↓', fn: function () { openItem(one); }, disabled: !one },
      { label: 'Open in Tableau', fn: function () { openInTableau(one); }, disabled: !one || !one.url },
      '-',
      { label: 'Details', sc: 'Ctrl+I', fn: function () { if (!S.inspector) toggleInspector(); } },
      { label: 'Rename', sc: '↩', fn: function () { startRename(one); }, disabled: !one },
      { label: 'Preview', sc: 'Space', fn: function () { quickLook(one); }, disabled: !one || one.kind === 'project' },
      '-',
      { label: 'Move To…', fn: function () { moveDialog(sel); } },
      { label: 'Copy Link', fn: function () { copyText(one.url); }, disabled: !one || !one.url },
      '-',
      { label: 'Delete', sc: 'Ctrl+Del', danger: true, fn: deleteSel }
    ]);
  }
  function bgMenu(e) {
    var canNew = S.loc.type === 'project' && !S.query;
    showMenu(e, [
      { label: 'New Project', sc: 'Ctrl+Shift+N', fn: newFolder, disabled: !canNew },
      { label: 'Details', sc: 'Ctrl+I', fn: function () { if (!S.inspector) toggleInspector(); } },
      '-',
      { label: (S.view === 'icons' ? '✓ ' : '   ') + 'Icon view', sc: 'Ctrl+1', fn: function () { setView('icons'); } },
      { label: (S.view === 'list' ? '✓ ' : '   ') + 'List view', sc: 'Ctrl+2', fn: function () { setView('list'); } },
      { label: (S.view === 'columns' ? '✓ ' : '   ') + 'Column view', sc: 'Ctrl+3', fn: function () { setView('columns'); } },
      '-',
      { label: 'Sort by Name', fn: function () { S.sort = { key: 'name', dir: 1 }; lsSet('sort', S.sort); renderMain(); } },
      { label: 'Sort by Date Modified', fn: function () { S.sort = { key: 'date', dir: -1 }; lsSet('sort', S.sort); renderMain(); } },
      { label: 'Sort by Size', fn: function () { S.sort = { key: 'size', dir: -1 }; lsSet('sort', S.sort); renderMain(); } },
      { label: 'Sort by Kind', fn: function () { S.sort = { key: 'kind', dir: 1 }; lsSet('sort', S.sort); renderMain(); } },
      '-',
      { label: 'Refresh', sc: 'Ctrl+R', fn: reload }
    ]);
  }

  /* ---------- modals ---------- */
  var modalOpen = 0;
  function modal(content, opts) {
    opts = opts || {};
    var ov = h('div', { class: 'overlay' + (opts.center ? ' center' : '') }, content);
    function close() { if (!ov.parentNode) return; ov.remove(); modalOpen--; document.removeEventListener('keydown', onKey, true); if (opts.onClose) opts.onClose(); R.content && R.content.focus(); }
    function onKey(e) {
      if (e.key === 'Escape' && opts.escape !== false) { e.preventDefault(); e.stopPropagation(); close(); }
      if (opts.onKey) opts.onKey(e, close);
    }
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && opts.clickOut) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov); modalOpen++;
    return close;
  }
  function confirmDialog(title, msg, okLabel, onOk) {
    var close;
    var ok = h('button', { class: 'btn danger', onClick: function () { close(); onOk(); } }, okLabel);
    close = modal(h('div', { class: 'dialog', role: 'alertdialog' }, [
      h('div', { class: 'dicon' }, icon('warn')),
      h('h4', { text: title }), h('p', { text: msg }),
      h('div', { class: 'btns' }, [h('button', { class: 'btn', onClick: function () { close(); } }, 'Cancel'), ok])
    ]), { center: true });
    setTimeout(function () { ok.focus(); }, 0);
  }
  function moveDialog(items) {
    var target;  // undefined = none chosen; null = site root
    var close, moveBtn;
    var tree = h('div', { class: 'tree' });
    function rowFor(p, depth) {
      var pid = p ? p.id : null;
      var allowed = canDrop(items.map(function (i) { return i.key; }), pid);
      var el = h('div', { class: 'row' + (target === pid ? ' sel' : ''), style: { opacity: allowed ? 1 : .4 }, onClick: function () { if (!allowed) return; target = pid; draw(); } },
        [h('div', { class: 'name', style: { paddingLeft: (6 + depth * 16) + 'px' } }, [icon(p ? 'folder' : 'cloud', 'small'), h('span', { class: 'nm', text: p ? p.name : S.siteName })])]);
      tree.appendChild(el);
      S.projects.filter(function (c) { return (c.parentId || null) === pid; }).sort(function (a, b) { return a.name.localeCompare(b.name); })
        .forEach(function (c) { rowFor(c, depth + 1); });
    }
    function draw() { clear(tree); rowFor(null, 0); moveBtn.disabled = target === undefined; }
    moveBtn = h('button', { class: 'btn primary', onClick: function () { close(); moveItems(items, target); } }, 'Move');
    close = modal(h('div', { class: 'sheet' }, [
      h('h2', { text: 'Move ' + (items.length === 1 ? '“' + items[0].name + '”' : items.length + ' items') + ' to…' }),
      tree,
      h('div', { class: 'btns' }, [h('button', { class: 'btn', onClick: function () { close(); } }, 'Cancel'), moveBtn])
    ]));
    draw();
  }
  function quickLook(it) {
    if (!it || it.kind === 'project') return;
    var main = h('div', { class: 'ql-main' }, icon(bigIconName(it)));
    var strip = h('div', { class: 'ql-strip' });
    var body = h('div', { class: 'ql-body' }, [main, strip]);
    var close = modal(h('div', { class: 'ql' }, [
      h('div', { class: 'ql-bar' }, [
        h('button', { class: 'tb-btn', title: 'Close', 'aria-label': 'Close', onClick: function () { close(); } }, icon('close')),
        h('div', { class: 't', text: it.name }),
        it.url ? h('button', { class: 'tb-btn', title: 'Open in Tableau', 'aria-label': 'Open in Tableau', onClick: function () { openInTableau(it); } }, icon('open')) : h('span', { style: { width: '28px' } })
      ]),
      body
    ]), { center: true, clickOut: true, onKey: function (e, close) { if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); close(); } } });
    function setMain(url) { clear(main); main.appendChild(thumbImg(url, null, 'ql-img')); }
    if (it.kind === 'workbook') {
      var t = thumbs[it.id];
      if (t && t !== 'none' && t !== 'loading') setMain(t);
      else S.be.preview(it).then(function (u) { thumbs[it.id] = u; setMain(u); }, function () {});
      S.be.views(it).then(function (vs) {
        vs.forEach(function (v, i) {
          var vt = h('div', { class: 'vt' }, icon('sheet'));
          var card = h('div', { class: 'ql-view', onClick: function () {
            strip.querySelectorAll('.ql-view').forEach(function (n) { n.classList.remove('active'); }); card.classList.add('active');
            if (v._url) setMain(v._url);
          } }, [vt, h('div', { text: v.name })]);
          strip.appendChild(card);
          if (i < 12) S.be.viewPreview(it, v).then(function (u) { v._url = u; clear(vt); vt.appendChild(thumbImg(u, null, 'vt-img')); }, function () {});
        });
      }, function () {});
    } else {
      body.appendChild(h('div', { style: { width: '320px' } }, infoKV(it)));
    }
  }

  /* ---------- saved credentials (browser storage only; never in the packaged code) ---------- */
  var CRED_COOKIE = 'tf_cred';
  function credParse(t) { try { var v = JSON.parse(t); return v && v.patName && v.patSecret ? v : null; } catch (e) { return null; } }
  function credLoad() {
    var v = null;
    try { v = credParse(localStorage.getItem('tf.cred')); } catch (e) { /* blocked */ }
    if (!v) { try { var m = document.cookie.match(new RegExp('(?:^|; )' + CRED_COOKIE + '=([^;]*)')); if (m) v = credParse(decodeURIComponent(m[1])); } catch (e) { /* blocked */ } }
    if (!v) { try { v = credParse(sessionStorage.getItem('tf.cred')); } catch (e) { /* blocked */ } }
    return v;
  }
  // Returns where the token was stored: 'local' | 'cookie' | 'session' | '' (nothing could be stored).
  function credSave(o) {
    var j = JSON.stringify(o);
    try { localStorage.setItem('tf.cred', j); if (localStorage.getItem('tf.cred') === j) return 'local'; } catch (e) { /* blocked */ }
    try { document.cookie = CRED_COOKIE + '=' + encodeURIComponent(j) + '; max-age=' + 60 * 60 * 24 * 90 + '; path=/; SameSite=None; Secure'; if (document.cookie.indexOf(CRED_COOKIE + '=') >= 0) return 'cookie'; } catch (e) { /* blocked */ }
    try { sessionStorage.setItem('tf.cred', j); if (sessionStorage.getItem('tf.cred') === j) return 'session'; } catch (e) { /* blocked */ }
    return '';
  }
  function credClear() {
    try { localStorage.removeItem('tf.cred'); } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem('tf.cred'); } catch (e) { /* ignore */ }
    try { document.cookie = CRED_COOKIE + '=; max-age=0; path=/; SameSite=None; Secure'; } catch (e) { /* ignore */ }
  }

  /* ---------- Connection window (desktop app; remembers the last site) ---------- */
  var CW = { err: '', busy: false };
  function buildConnWindow(root) {
    CW.max = h('button', { class: 'wb-btn', title: 'Maximize', 'aria-label': 'Maximize', onClick: function () { if (CW.mgr) CW.mgr.toggleMax(); } }, null);
    CW.max.appendChild(WinMgr.icon(false));
    var min = h('button', { class: 'wb-btn minimize', title: 'Minimize', 'aria-label': 'Minimize', onClick: function () { if (window.TableauOS) TableauOS.minimize('connect'); } }, icon('minimize'));
    var cls = h('button', { class: 'wb-btn close', title: 'Close', 'aria-label': 'Close', onClick: function () { if (window.TableauOS) TableauOS.close('connect'); } }, icon('close'));
    var bar = h('div', { class: 'winbar' }, [h('div', { class: 'wb-title' }, [icon('server'), h('span', null, 'Connection')]), h('div', { class: 'wb-ctl' }, [min, CW.max, cls])]);
    CW.body = h('div', { class: 'cw-body' });
    CW.win = h('div', { class: 'window conn-win' }, [bar, CW.body]);
    CW.win.hidden = true; root.appendChild(CW.win);
    CW.mgr = WinMgr.manage(CW.win, { bar: bar, w: 680, h: 380, minW: 640, minH: 240, dx: -120, dy: -20,
      onMaxChange: function (m) { CW.max.textContent = ''; CW.max.appendChild(WinMgr.icon(m)); CW.max.title = m ? 'Restore' : 'Maximize'; CW.max.setAttribute('aria-label', CW.max.title); } });
    if (window.TableauOS) TableauOS.register('connect', { el: CW.win, raise: CW.mgr.raise, onShow: function () { setTimeout(fitConn, 0); } });
    renderConn();
    TFConn.subscribe(function () { renderConn(); });
  }
  function fitConn() { // size the window to its content (no dead space under the buttons)
    if (!CW.win || CW.win.hidden || (CW.mgr && CW.mgr.isMax())) { CW.fitLater = true; return; }
    var bar = CW.win.querySelector('.winbar'), want = (bar ? bar.offsetHeight : 32) + CW.body.scrollHeight + 2;
    CW.win.style.height = Math.min(want, window.innerHeight - 70) + 'px';
  }
  function showConnect(errMsg) {
    CW.err = errMsg || ''; renderConn();
    if (window.TableauOS) TableauOS.launch('connect');
  }
  function renderConn() {
    if (!CW.body) return;
    pushConn();
    var saved = lsGet('conn', {}), prev = CW.f;
    var f = CW.f = {
      server: h('input', { value: prev ? prev.server.value : (saved.server || CFG.root || ''), placeholder: 'https://your-pod.online.tableau.com', spellcheck: 'false' }),
      site: h('input', { value: prev ? prev.site.value : (saved.site != null ? saved.site : ''), placeholder: 'site contentUrl (blank = Default)', spellcheck: 'false' }),
      pat: h('input', { value: prev ? prev.pat.value : ((credLoad() || {}).patName || ''), spellcheck: 'false', autocomplete: 'off' }),
      secret: h('input', { type: 'password', autocomplete: 'off', value: prev ? prev.secret.value : ((credLoad() || {}).patSecret || '') }),
      remember: h('input', { type: 'checkbox' })
    };
    f.remember.checked = prev ? prev.remember.checked : true;
    var errEl = h('div', { class: 'err', text: CW.err || '' });
    var live = !!(S.be && !S.be.isDemo) && !CW.err, dirty = false;
    var goBtn = h('button', { class: 'btn primary', type: 'button', title: hasBridge() ? 'Sign in as the user logged in to Tableau (or with the token above, if entered)' : '', onClick: function () { doConnect(); } }, hasBridge() ? 'Use my Tableau login' : (live ? 'Reconnect' : 'Connect'));
    var closeBtn = live ? h('button', { class: 'btn', type: 'button', onClick: function () { if (window.TableauOS) TableauOS.close('connect'); } }, 'Close') : null;
    if (CW.busy) { goBtn.disabled = true; goBtn.textContent = 'Connecting…'; }
    var showPat = !hasBridge();
    var status = h('div', { class: 'cw-status' + (S.be ? (S.be.isDemo ? ' demo' : ' ok') : '') }, [
      h('span', { class: 'cw-dot' }),
      h('div', null, [
        h('b', { text: S.be ? (S.be.isDemo ? 'Using sample data' : 'Connected') : 'Not connected' }),
        h('div', { class: 'cw-sub', text: S.be ? (S.be.isDemo ? 'No Tableau site is being queried.' : (S.be.sessionAuth ? 'Signed in as ' + (S.be.userName || 'your Tableau session') + ' · ' : '') + 'Site: ' + (S.siteName || 'Default') + ' · ' + serverRoot()) : (showPat ? 'Enter your personal access token to sign in.' : 'Sign in with your Tableau login.') })
      ])
    ]);
    function doConnect() {
      if (CW.busy) return;
      try {
        CW.busy = true; CW.err = ''; goBtn.disabled = true; goBtn.textContent = 'Connecting…'; errEl.textContent = '';
        var be = new RestBackend({ root: (f.server.value.trim().replace(/\/+$/, '') || serverRoot()), apiBase: CFG.apiBase, site: f.site.value.trim(), patName: f.pat.value.trim(), patSecret: f.secret.value, apiVersion: CFG.apiVersion });
        connect(be).then(function () {
          CW.busy = false;
          try { lsSet('conn', { site: f.site.value.trim(), server: f.server.value.trim().replace(/\/+$/, '') }); if (!f.pat.value.trim() || !f.secret.value) CW.saved = 'off'; else if (f.remember.checked) CW.saved = credSave({ patName: f.pat.value.trim(), patSecret: f.secret.value }); else { credClear(); CW.saved = 'off'; } saveSettings(f.site.value.trim()); } catch (x) { /* storage blocked */ }
          CW.err = ''; renderConn(); if (CW.saved === '' || CW.saved === 'session') { toast(CW.saved === '' ? 'Connected, but this browser frame blocks storage, so the token can’t be remembered after a refresh.' : 'Token kept for this tab session only (persistent storage is blocked here).', true); }
          if (window.TableauOS) TableauOS.close('connect');
        }, function (e) { CW.busy = false; if (e && e.blocked) { renderConn(); return; } if (hasBridge() && !f.pat.value.trim()) CW.showPat = true; CW.err = describeConnError(e); renderConn(); });
      } catch (x) { CW.busy = false; CW.err = 'Connect failed: ' + (x && x.message || x); renderConn(); }
    }
    [f.server, f.site, f.pat, f.secret].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doConnect(); } }); });
    var form = h('form', { onSubmit: function (e) { e.preventDefault(); doConnect();
    } }, [
      h('h2', { text: 'Connect to Server' }),
      h('p', { class: 'hint', text: hasBridge() ? (showPat ? 'Your Tableau login couldn’t be used here. Enter a personal access token instead.' : 'Signs in as the administrator already logged in to Tableau — no token needed.') : 'Signs in to the Tableau REST API with a personal access token. The site name is remembered for next time.' }),
      h('div', { class: 'form', style: showPat || !hasBridge() ? {} : { display: 'none' } }, [h('label', { text: 'Server URL' }), f.server, h('label', { text: 'Site' }), f.site].concat(showPat ? [h('label', { text: 'Token name' }), f.pat, h('label', { text: 'Token secret' }), f.secret,
        h('label', { text: '' }), h('label', { class: 'cw-rem' }, [f.remember, h('span', { text: ' Remember on this browser' })])] : [])),
      h('div', { class: 'hint', text: CW.saved === '' ? '⚠ Storage is blocked in this frame — the token could not be saved and must be re-entered after a refresh.' : CW.saved === 'session' ? 'Saved for this tab session only (persistent storage blocked).' : CW.saved === 'cookie' ? 'Saved in a browser cookie.' : CW.saved === 'local' ? 'Saved in browser storage.' : (credLoad() ? 'A saved token is available.' : '') }),
      errEl,
      h('div', { class: 'btns' }, [
        h('button', { class: 'btn left', type: 'button', onClick: function () { CW.err = ''; connect(new DemoBackend()).then(function () { renderConn(); }); } }, 'Use Sample Data'),
        (showPat && credLoad()) ? h('button', { class: 'btn', type: 'button', title: 'Remove the saved token from this browser', onClick: function () { credClear(); f.pat.value = ''; f.secret.value = ''; CW.err = ''; renderConn(); } }, 'Forget token') : null,
        closeBtn, goBtn
      ])
    ]);
    CW.body.textContent = ''; CW.body.appendChild(status); CW.body.appendChild(form);
    fitConn();
  }
  function describeConnError(e) {
    var m = e && e.message || String(e);
    if (e && /sessions\/current/.test(m) && !e.forbidden) m = 'Couldn’t sign in with your Tableau login (' + String(m).split('\n')[0].replace(/<[^>]*>/g, ' ').slice(0, 160).trim() + ').';
    if (e && e.bridge) return m + '\nThe request went through tableau.extensions.fetchAsync (the Tableau host), not the browser.';
    if (isNetErr(e)) {
      return 'The REST API request to ' + (serverRoot() || '') + (CFG.apiBase || '/api') + '/' + (CFG.apiVersion || '3.30') + '/auth/signin didn’t get a response' +
        (e && e.message ? ' (' + e.name + ': ' + e.message + ')' : '') + '.\n' +
        (e.diag ? '\nExtension origin: ' + e.diag.origin + '\n' + (e.diag.reachable
          ? 'Diagnosis: the server IS reachable from this frame (no-cors probe succeeded), so the block is CORS: Tableau doesn’t return Access-Control-Allow-Origin for this origin, and it answers the preflight (OPTIONS) with 405.'
          : 'Diagnosis: even a no-cors probe failed (' + (e.diag.probeErr || 'blocked') + '), so the extension sandbox / CSP is blocking outbound requests to this origin.') + '\n' : '\n') +
        'Transport: ' + (hasBridge() ? 'tableau.extensions.fetchAsync' : 'browser fetch (fetchAsync bridge not available' + (window.tableau && tableau.extensions && tableau.extensions.fetchAsync ? ', not initialized' : '') + ')') + '\n' +
        'You can still demo with sample data.';
    }
    if (e && e.status === 404) return 'REST endpoint not found (' + m + '). The host may not route relative API paths.';
    if (e && e.status === 401) return 'Sign-in failed: ' + m + '\nCheck the site name and that the token is still valid.';
    return m;
  }
  function saveSettings(site) {
    try {
      var st = window.tableau && tableau.extensions && tableau.extensions.settings;
      if (st) { st.set('site', site); st.saveAsync().catch(function () {}); }
    } catch (e) { /* not in authoring mode */ }
  }

  var TFConn = window.TFConn = (function () {
    var be = null, subs = [];
    return { get: function () { return be; }, set: function (b) { be = b; subs.slice().forEach(function (f) { try { f(b); } catch (e) { /* ignore */ } }); }, subscribe: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; } };
  })();
  /* ---------- administrator-only gate ---------- */
  var ADMIN_ROLES = ['ServerAdministrator', 'SiteAdministratorCreator', 'SiteAdministratorExplorer'];
  function blockApp(role, note) {
    S.blocked = true;
    try { if (window.TableauOS) TableauOS.close('connect'); } catch (e) { /* ignore */ }
    if (document.getElementById('tf-block')) return;
    var setup = /allowlist/i.test(note || '');
    var card = h('div', { class: 'tf-block-card' }, [
      h('div', { class: 'tf-block-ico', text: '!' }),
      h('h2', { text: setup ? 'Site setup needed' : 'Administrators only' }),
      h('p', { text: setup ? 'This site hasn’t allowed TableauOS to call the Tableau REST API yet. A site admin needs to add the REST endpoints listed in the TableauOS README to the site’s data app REST allowlist.' : 'TableauOS is only for Tableau site admins. Your account doesn’t have access to this app.' }),
      h('p', { class: 'tf-block-sub', text: note || ('Your site role: ' + (role || 'unknown') + '. Contact a site administrator if you need access.') })
    ]);
    var ov = h('div', { id: 'tf-block', class: 'tf-block', role: 'alertdialog', tabindex: '-1', 'aria-modal': 'true', 'aria-label': 'Administrators only' }, [card]);
    document.body.appendChild(ov);
    ['keydown', 'keyup', 'keypress', 'contextmenu'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); e.stopPropagation(); }, true); });
    try { document.activeElement && document.activeElement.blur(); ov.focus(); } catch (e) { /* ignore */ }
  }
  function adminCheck(be) {
    if (be.isDemo) return Promise.resolve();
    var fail = function (role, note) { blockApp(role, note); var e = new Error('Administrators only'); e.blocked = true; throw e; };
    return be.req('GET', '/users/' + be.userId).then(function (j) {
      var role = j && j.user && j.user.siteRole;
      if (ADMIN_ROLES.indexOf(role) < 0) fail(role);
    }, function (e) { if (e && e.blocked) throw e; fail('', 'Your site role couldn’t be verified (' + (e && e.message || e) + '), so access is denied.'); });
  }
  function connect(be) {
    S.loading = true; S.ready = false; renderAll();
    return be.signIn().catch(function (e) { if (e && !e.blocked && hasBridge() && !be.isDemo) { blockApp('', e.forbidden ? 'Your account doesn’t have administrator permissions on this site. Contact a site administrator if you need access.' : 'We couldn’t verify that you’re a site administrator (' + String(e.message || e).split('\n').join(' · ').replace(/<[^>]*>/g, ' ').slice(0, 700).trim() + '), so access is denied.'); e.blocked = true; } throw e; }).then(function () { return adminCheck(be); }).then(function () {
      S.be = be; S.siteName = be.siteName; S.userId = be.userId;
      TFConn.set(be);
      thumbs = {}; thumbQueue = [];
      S.loc = { type: 'project', id: null }; S.back = []; S.fwd = []; S.sel.clear();
      return reload(true);
    }).catch(function (e) { S.loading = false; S.ready = !!S.be; renderAll(); throw e; });
  }
  function reload(silent) {
    if (!S.be) return Promise.resolve();
    S.loading = true; renderStatus();
    return S.be.loadAll().then(function (d) {
      S.projects = d.projects; S.workbooks = d.workbooks; S.datasources = d.datasources;
      reindex();
      if (S.loc.type === 'project' && S.loc.id && !proj(S.loc.id)) S.loc = { type: 'project', id: null };
      S.sel.forEach(function (k) { if (!S.byKey[k]) S.sel.delete(k); });
      S.loading = false; S.ready = true; renderAll();
      if (!silent) toast('Refreshed');
    }, function (e) { S.loading = false; renderAll(); toast('Couldn’t load site content: ' + e.message, true); throw e; });
  }

  function toast(msg, isErr) {
    var t = h('div', { class: 'toast' + (isErr ? ' err' : ''), role: 'status', text: msg });
    R.toasts.appendChild(t);
    setTimeout(function () { t.remove(); }, isErr ? 6000 : 2600);
  }

  /* ---------- keyboard ---------- */
  function gridCols() {
    var tiles = R.content.querySelectorAll('.tile');
    if (tiles.length < 2) return 1;
    var top = tiles[0].offsetTop, n = 0;
    for (var i = 0; i < tiles.length && tiles[i].offsetTop === top; i++) n++;
    return n || 1;
  }
  document.addEventListener('keydown', function (e) {
    if (modalOpen || !S.ready || !R.win || R.win.hidden) return;
    var tag = (e.target.tagName || '').toLowerCase();
    var inField = tag === 'input' || tag === 'textarea';
    var mod = e.metaKey || e.ctrlKey;
    if (menuEl && e.key === 'Escape') { closeMenu(); return; }
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); R.search.focus(); R.search.select(); return; }
    if (inField) return;
    var sel = selItems(), one = sel.length === 1 ? sel[0] : null;
    var effView = S.view === 'columns' && (S.loc.type !== 'project' || S.query) ? 'list' : S.view;
    if (mod && e.key === '1') { e.preventDefault(); setView('icons'); return; }
    if (mod && e.key === '2') { e.preventDefault(); setView('list'); return; }
    if (mod && e.key === '3') { e.preventDefault(); setView('columns'); return; }
    if (mod && e.key === '[') { e.preventDefault(); goBack(); return; }
    if (mod && e.key === ']') { e.preventDefault(); goFwd(); return; }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); toggleInspector(); return; }
    if (mod && e.key.toLowerCase() === 'r') { e.preventDefault(); reload(); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newFolder(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); S.sel = new Set(S.visible.map(function (x) { return x.key; })); refreshSelection(); return; }
    if (mod && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); deleteSel(); return; }
    if (mod && e.key === 'ArrowUp') { e.preventDefault(); goUp(); return; }
    if ((mod && (e.key === 'ArrowDown' || e.key.toLowerCase() === 'o')) && one) { e.preventDefault(); openItem(one); return; }
    if (e.key === 'Enter' && one) { e.preventDefault(); startRename(one); return; }
    if (e.key === ' ' && one) { e.preventDefault(); quickLook(one); return; }
    if (e.key === 'Escape') { S.sel.clear(); refreshSelection(); return; }
    var arrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
    if (!(e.key in arrows)) return;
    e.preventDefault();
    if (effView === 'columns' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (e.key === 'ArrowLeft') goUp();
      else if (one && one.kind === 'project') { var first = sortItems(children(one.id))[0]; go({ type: 'project', id: one.id }, { select: first && first.key }); }
      return;
    }
    if (effView === 'list' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (one && one.kind === 'project' && S.loc.type === 'project') {
        if (e.key === 'ArrowRight' && !S.expanded.has(one.id)) toggleExpand(one.id);
        if (e.key === 'ArrowLeft' && S.expanded.has(one.id)) toggleExpand(one.id);
      }
      return;
    }
    var list = S.visible;
    if (!list.length) return;
    var step = arrows[e.key];
    if (effView === 'icons' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) step *= gridCols();
    var cur = S.anchor ? list.findIndex(function (x) { return x.key === S.anchor; }) : -1;
    var next = cur < 0 ? (step > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, cur + step));
    if (e.shiftKey && cur >= 0) { S.sel.add(list[next].key); S.anchor = list[next].key; refreshSelection(); scrollIntoView(list[next]); }
    else selectOnly(list[next]);
  });

  /* =============================== boot =============================== */
  // Connection prompts shouldn't pop over the desktop: queue them until the window is first opened.
  var shownQueue = [], everShown = false;
  function flushShown() { everShown = true; var q = shownQueue; shownQueue = []; q.forEach(function (f) { f(); }); }
  function whenShown(fn) { if (everShown) fn(); else shownQueue.push(fn); }
  function start() {
    buildShell();
    renderAll();
    var saved = lsGet('conn', {});
    var st = {};
    try { var s = window.tableau && tableau.extensions && tableau.extensions.settings; if (s) st = s.getAll() || {}; } catch (e) { /* ignore */ }
    var site = st.site != null ? st.site : (saved.site != null ? saved.site : '');
    if (/demo/.test(location.hash)) {
      connect(new DemoBackend()).then(function () {
        var m = /view=(\w+)/.exec(location.hash); if (m) setView(m[1]);
        if (/info/.test(location.hash)) { var w = S.projects.filter(function (p) { return p.name === 'Sales'; })[0]; go({ type: 'project', id: w.id }); selectOnly(S.workbooks.filter(function (x) { return x.projectId === w.id; })[0]); if (!S.inspector) toggleInspector(); }
      });
    } else if (CFG.autoConnect !== false && (hasBridge() || (credLoad() && serverRoot()))) {
      var cr = credLoad() || { patName: '', patSecret: '' };
      connect(new RestBackend({ root: serverRoot(), apiBase: CFG.apiBase, site: site, patName: cr.patName, patSecret: cr.patSecret, apiVersion: CFG.apiVersion }))
        .then(function () { var m = /loc=(\w+)/.exec(location.hash); if (m) go({ type: m[1] }); m = /view=(\w+)/.exec(location.hash); if (m) setView(m[1]); })
        
        .catch(function (e) { if (e && e.blocked) return; if (hasBridge() && !(cr.patName && cr.patSecret)) CW.showPat = true; showConnect(describeConnError(e)); });
    } else {
      showConnect();
    }
  }
  function boot() {
    var inTableau = window.tableau && tableau.extensions && window.parent !== window;
    if (!inTableau) { start(); return; }
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; start(); } }, 10000);
    tableau.extensions.initializeAsync().then(function () { bridgeReady = true; if (!done) { done = true; clearTimeout(timer); start(); } },
      function () { if (!done) { done = true; clearTimeout(timer); start(); } });
  }
  boot();
})();
