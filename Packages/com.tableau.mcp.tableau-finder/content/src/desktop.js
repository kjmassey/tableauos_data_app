/* TableauOS — the landing desktop. Apps (File Explorer, Admin Center) open as windows above it.
   window.TableauOS = { register(id, {el, raise, onShow}), launch(id), minimize(id), close(id) } */
(function () {
  'use strict';
  var APP_NAME = 'Tableau File Explorer';
  var el = null, clockTimer = null;

  // ---------- wallpaper ----------
  var COLORS = ['#1f8bff', '#ff7a1a', '#ff3d6e', '#22d3c5', '#ffd23f', '#9b6bff', '#5eead4'];
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  function plus(x, y, size, color, op, cls, delay) {
    var t = size * 0.3, r = t * 0.35, h = size / 2;
    return '<g class="' + (cls || '') + '" style="animation-delay:' + (delay || 0).toFixed(2) + 's" opacity="' + (op == null ? 1 : op) + '" fill="' + color + '">' +
      '<rect x="' + (x - h) + '" y="' + (y - t / 2) + '" width="' + size + '" height="' + t + '" rx="' + r + '"/>' +
      '<rect x="' + (x - t / 2) + '" y="' + (y - h) + '" width="' + t + '" height="' + size + '" rx="' + r + '"/></g>';
  }
  function sparkle(x, y, s, color, op, delay) {
    return '<path class="tw" style="animation-delay:' + delay.toFixed(2) + 's" opacity="' + op + '" fill="' + color + '" d="M' + x + ' ' + (y - s) +
      ' Q' + x + ' ' + y + ' ' + (x + s) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + s) +
      ' Q' + x + ' ' + y + ' ' + (x - s) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - s) + 'Z"/>';
  }
  function wallpaper() {
    var W = 1600, H = 900, r = rng(7), out = [];
    out.push('<svg class="os-wall" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">');
    out.push('<defs>' +
      '<linearGradient id="osg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#05041a"/><stop offset=".45" stop-color="#1c0b3f"/><stop offset=".8" stop-color="#3d1048"/><stop offset="1" stop-color="#5b1f2e"/></linearGradient>' +
      '<radialGradient id="osr1" cx=".22" cy=".25" r=".5"><stop offset="0" stop-color="#22d3c5" stop-opacity=".22"/><stop offset="1" stop-color="#22d3c5" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="osr2" cx=".8" cy=".78" r=".5"><stop offset="0" stop-color="#ffd23f" stop-opacity=".16"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="osr3" cx=".5" cy=".45" r=".4"><stop offset="0" stop-color="#ffffff" stop-opacity=".1"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>' +
      '<filter id="osglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>');
    out.push('<rect width="' + W + '" height="' + H + '" fill="url(#osg)"/>');
    out.push('<rect width="' + W + '" height="' + H + '" fill="url(#osr1)"/><rect width="' + W + '" height="' + H + '" fill="url(#osr2)"/><rect width="' + W + '" height="' + H + '" fill="url(#osr3)"/>');
    // faint oversized pluses for depth
    for (var i = 0; i < 9; i++) out.push(plus(r() * W, r() * H, 140 + r() * 220, '#ffffff', 0.025 + r() * 0.02, '', 0));
    // twinkling sparkles
    for (var j = 0; j < 70; j++) out.push(sparkle(r() * W, r() * H, 6 + r() * 16, j % 5 === 0 ? '#ffffff' : COLORS[Math.floor(r() * COLORS.length)], 0.4 + r() * 0.4, r() * 20));
    // small scattered pluses
    for (var k = 0; k < 26; k++) out.push(plus(r() * W, r() * H, 10 + r() * 16, COLORS[Math.floor(r() * COLORS.length)], 0.45 + r() * 0.3, 'tw', r() * 20));
    // hero logo: a cross-shaped cluster of pluses in the spirit of the classic mark
    var cx = W / 2, cy = H / 2 - 40, g = [];
    function P(dx, dy, s, c, d) { g.push(plus(cx + dx, cy + dy, s, c, 1, 'tw-slow', d)); }
    P(0, 0, 118, '#f1ecff', 0.0);
    P(0, -128, 64, '#ffd23f', 1.2); P(0, 128, 64, '#22d3c5', 2.4); P(-128, 0, 64, '#ff7a1a', 3.6); P(128, 0, 64, '#1f8bff', 4.8);
    P(0, -214, 34, '#ff3d6e', 6.0); P(0, 214, 34, '#9b6bff', 7.2); P(-214, 0, 34, '#5eead4', 8.4); P(214, 0, 34, '#ffd23f', 9.6);
    P(-82, -82, 30, '#1f8bff', 1.6); P(82, -82, 30, '#ff7a1a', 2.8); P(-82, 82, 30, '#ff3d6e', 4.0); P(82, 82, 30, '#22d3c5', 5.2);
    P(-156, -156, 18, '#ffffff', 6.4); P(156, -156, 18, '#ffffff', 7.6); P(-156, 156, 18, '#ffffff', 8.8); P(156, 156, 18, '#ffffff', 10.0);
    out.push('<g filter="url(#osglow)">' + g.join('') + '</g>');
    out.push('</svg>');
    return out.join('');
  }
  var LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="#fff"><rect x="10" y="3" width="4" height="18" rx="1.4"/><rect x="3" y="10" width="18" height="4" rx="1.4"/></g><g fill="#ffd23f"><rect x="10.7" y="0.5" width="2.6" height="5" rx="1" opacity="0"/></g></svg>';
  var APP_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M5 15.5A4.5 4.5 0 0 1 9.5 11h14.2c1.2 0 2.3.5 3.2 1.3L30 15.5h24.5A4.5 4.5 0 0 1 59 20v4H5z" fill="#f2a516"/><rect x="5" y="19" width="54" height="36" rx="4.5" fill="#ffc94d"/><rect x="5" y="19" width="54" height="2" fill="#ffe08a" opacity=".8"/><g fill="#0f8b8d"><rect x="29" y="27" width="6" height="20" rx="2"/><rect x="22" y="34" width="20" height="6" rx="2"/></g></svg>';

  var ADMIN_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="adg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9b6bff"/><stop offset="1" stop-color="#1f8bff"/></linearGradient></defs><rect x="6" y="8" width="52" height="48" rx="8" fill="url(#adg)"/><rect x="6" y="8" width="52" height="11" rx="8" fill="#fff" opacity=".22"/><g fill="#fff"><rect x="14" y="28" width="8" height="20" rx="2" opacity=".9"/><rect x="26" y="22" width="8" height="26" rx="2"/><rect x="38" y="32" width="8" height="16" rx="2" opacity=".9"/></g><circle cx="48" cy="14" r="3" fill="#ffd23f"/></svg>';

  var CONN_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="cng" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3c5"/><stop offset="1" stop-color="#1f8bff"/></linearGradient></defs><rect x="6" y="8" width="52" height="48" rx="8" fill="url(#cng)"/><rect x="6" y="8" width="52" height="11" rx="8" fill="#fff" opacity=".22"/><g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M24 40l-5 5a6 6 0 0 1-8.5-8.5l8-8A6 6 0 0 1 27 29"/><path d="M40 24l5-5a6 6 0 0 1 8.5 8.5l-8 8A6 6 0 0 1 37 35"/><path d="M26 38l12-12"/></g></svg>';

  var DEFS = [
    { id: 'explorer', name: APP_NAME, icon: APP_ICON },
    { id: 'admin', name: 'Admin Center', icon: ADMIN_ICON },
    { id: 'connect', name: 'Connection', icon: CONN_ICON, noIcon: true }
  ];
  var apps = {};
  DEFS.forEach(function (d) { apps[d.id] = { id: d.id, name: d.name, icon: d.icon, el: null, raise: null, running: false, pending: false, onShow: null, task: null, ico: null }; });
  var menuEl = null, widget = null, wstate = { state: 'none' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function paintWidget() {
    if (!widget) return;
    var s = wstate, label = s.state === 'ok' ? 'Connected' : s.state === 'demo' ? 'Sample data' : s.state === 'loading' ? 'Connecting…' : 'Not connected';
    var rows = [];
    function r(k, v) { if (v != null && v !== '') rows.push('<div class="ow-r"><span>' + k + '</span><b>' + esc(v) + '</b></div>'); }
    if (s.state === 'ok') { r('Site', s.site); r('Server', s.server); r('Projects', s.projects); r('Workbooks', s.workbooks); r('Data sources', s.datasources); r('Connected', s.at); }
    else if (s.state === 'demo') { r('Source', 'Built-in demo content'); r('Projects', s.projects); r('Workbooks', s.workbooks); r('Data sources', s.datasources); }
    else rows.push('<div class="ow-r"><span>Click to connect to a Tableau site</span></div>');
    widget.className = 'os-widget ' + (s.state || 'none');
    widget.innerHTML = '<div class="ow-h"><i class="ow-dot"></i><span>Connection</span><em>' + label + '</em></div>' + rows.join('');
  }
  function setConn(s) { wstate = s || { state: 'none' }; paintWidget(); }

  function mk(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function tick() {
    if (!el) return;
    var d = new Date(), t = document.querySelector('.os-time'), dt = document.querySelector('.os-date');
    if (t) t.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (dt) dt.textContent = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function visible(a) { return !!(a.el && !a.el.hidden); }
  function topmost() {
    var best = null, bz = -1;
    DEFS.forEach(function (d) { var a = apps[d.id]; if (visible(a)) { var zi = parseInt(a.el.style.zIndex || '0', 10); if (zi >= bz) { bz = zi; best = a; } } });
    return best;
  }
  function sync() {
    var top = topmost();
    DEFS.forEach(function (d) {
      var a = apps[d.id]; if (!a.task) return;
      a.task.hidden = !a.running;
      a.task.classList.toggle('active', visible(a) && a === top);
    });
  }
  function closeMenu() { if (menuEl) menuEl.hidden = true; }

  function launch(id) {
    var a = apps[id]; closeMenu();
    if (id === 'admin' && !a.el && window.AdminCenter) {
      var w = window.AdminCenter.create(document.body, { onMinimize: function () { minimize('admin'); }, onClose: function () { close('admin'); } });
      a.el = w.el; a.raise = w.raise; a._w = w;
    }
    a.running = true;
    if (!a.el) { a.pending = true; sync(); return; }   // window not built yet (e.g. extension still initializing)
    a.pending = false; a.el.hidden = false;
    if (a.raise) a.raise();
    if (a.onShow) a.onShow();
    sync();
  }
  function minimize(id) { var a = apps[id]; if (a.el) a.el.hidden = true; sync(); }
  function close(id) {
    var a = apps[id]; a.running = false; a.pending = false;
    if (id === 'admin' && a._w) { a._w.destroy(); a._w = null; a.el = null; a.raise = null; }
    else if (a.el) a.el.hidden = true;
    sync();
  }
  function register(id, o) {
    var a = apps[id]; if (!a) return;
    a.el = o.el; a.raise = o.raise || null; a.onShow = o.onShow || null;
    if (a.pending) launch(id);
  }
  function taskClick(id) {
    var a = apps[id];
    if (!visible(a)) launch(id);
    else if (topmost() === a) minimize(id);
    else { if (a.raise) a.raise(); sync(); }
  }

  function build() {
    el = mk('div', 'os on');
    el.setAttribute('aria-label', 'TableauOS desktop');
    el.innerHTML = wallpaper();
    el.appendChild(mk('div', 'os-brand', '<b>Tableau</b><span>OS</span>'));
    var icons = mk('div', 'os-icons'); el.appendChild(icons);
    widget = mk('button', 'os-widget'); widget.type = 'button'; widget.title = 'Open Connection';
    widget.addEventListener('click', function (e) { e.stopPropagation(); launch('connect'); });
    el.appendChild(widget); paintWidget();

    menuEl = mk('div', 'os-menu'); menuEl.hidden = true;
    var mHead = mk('div', 'os-menu-head', LOGO); mHead.appendChild(mk('span')).textContent = 'TableauOS';
    menuEl.appendChild(mHead);

    var bar = mk('div', 'os-taskbar');
    var start = mk('button', 'os-start', LOGO); start.type = 'button'; start.title = 'Start'; start.setAttribute('aria-label', 'Start');
    start.addEventListener('click', function (e) { e.stopPropagation(); menuEl.hidden = !menuEl.hidden; });
    var tasks = mk('div', 'os-tasks');

    DEFS.forEach(function (d) {
      var a = apps[d.id];
      if (!d.noIcon) {
  var ico = mk('button', 'os-icon'); ico.type = 'button'; ico.title = 'Open ' + d.name;
        ico.appendChild(mk('span', 'os-icon-img', d.icon));
        ico.appendChild(mk('span', 'os-icon-label')).textContent = d.name;
        ico.addEventListener('click', function (e) { e.stopPropagation(); icons.querySelectorAll('.os-icon').forEach(function (n) { n.classList.remove('sel'); }); ico.classList.add('sel'); closeMenu(); });
        ico.addEventListener('dblclick', function (e) { e.preventDefault(); launch(d.id); });
        ico.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); launch(d.id); } });
        icons.appendChild(ico); a.ico = ico;
      }

      var mi = mk('button', 'os-menu-item', d.icon); mi.type = 'button';
      mi.appendChild(mk('span')).textContent = d.name;
      mi.addEventListener('click', function () { launch(d.id); });
      menuEl.appendChild(mi);

      var task = mk('button', 'os-task os-task-' + d.id, d.icon); task.type = 'button'; task.hidden = true; task.title = d.name;
      task.appendChild(mk('span')).textContent = d.name;
      task.addEventListener('click', function () { taskClick(d.id); });
      tasks.appendChild(task); a.task = task;
    });

    bar.appendChild(start); bar.appendChild(tasks); bar.appendChild(mk('div', 'os-tray', '<div class="os-time"></div><div class="os-date"></div>'));
    document.body.appendChild(el); document.body.appendChild(menuEl); document.body.appendChild(bar);
    document.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.os-menu, .os-start')) closeMenu();
      if (!e.target.closest('.os-icon')) DEFS.forEach(function (d) { if (apps[d.id].ico) apps[d.id].ico.classList.remove('sel'); });
    });
    // Window clicks (raise) change the topmost app — refresh active states.
    document.addEventListener('mouseup', function () { setTimeout(sync, 0); });
    tick(); clockTimer = setInterval(tick, 20000);
  }
  build();
  window.TableauOS = { register: register, launch: launch, setConn: setConn, minimize: minimize, close: close };
  setTimeout(function () { launch('connect'); }, 0); // the Connection window greets you on desktop load
})();
