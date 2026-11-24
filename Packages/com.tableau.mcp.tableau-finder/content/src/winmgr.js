/* WinMgr — tiny window manager for TableauOS: focus/raise, drag by title bar, 8-way resize, maximize/restore.
   WinMgr.manage(winEl, { bar, w, h, minW, minH, dx, dy, onMaxChange }) -> { toggleMax, isMax, raise } */
(function () {
  'use strict';
  var TASKBAR = 48, z = 110;
  var ICON_MAX = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="2" width="8" height="8" rx="1"/></svg>';
  var ICON_RESTORE = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="3.8" width="6.2" height="6.2" rx="1"/><path d="M4 3.8V2.6A.6.6 0 0 1 4.6 2H9.4a.6.6 0 0 1 .6.6V7.4a.6.6 0 0 1-.6.6H8.2"/></svg>';
  function area() { return { w: window.innerWidth, h: window.innerHeight - TASKBAR }; }

  function manage(win, o) {
    o = o || {};
    var bar = o.bar, minW = o.minW || 440, minH = o.minH || 300, max = false, saved = null;
    win.classList.add('wm');
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(function (d) {
      var hd = document.createElement('div'); hd.className = 'wm-h wm-' + d; hd.setAttribute('data-dir', d); win.appendChild(hd);
    });
    function setRect(r) { win.style.left = r.x + 'px'; win.style.top = r.y + 'px'; win.style.width = r.w + 'px'; win.style.height = r.h + 'px'; }
    function getRect() { return { x: win.offsetLeft, y: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight }; }
    function clamp(r) {
      var a = area();
      r.w = Math.max(minW, Math.min(r.w, a.w)); r.h = Math.max(minH, Math.min(r.h, a.h));
      r.x = Math.max(120 - r.w, Math.min(r.x, a.w - 120)); r.y = Math.max(0, Math.min(r.y, a.h - 34));
      return r;
    }
    (function initial() {
      var a = area(), w = Math.min(o.w || 1100, a.w - 40), h = Math.min(o.h || 680, a.h - 30);
      setRect(clamp({ x: Math.round((a.w - w) / 2) + (o.dx || 0), y: Math.round((a.h - h) / 2) + (o.dy || 0), w: w, h: h }));
    })();

    function raise() { win.style.zIndex = ++z; }
    win.addEventListener('mousedown', raise, true);

    function setMax(v) {
      if (v === max) return;
      if (v) { saved = getRect(); max = true; win.classList.add('wm-max'); var a = area(); setRect({ x: 0, y: 0, w: a.w, h: a.h }); }
      else { max = false; win.classList.remove('wm-max'); setRect(clamp(saved || getRect())); }
      if (o.onMaxChange) o.onMaxChange(max);
    }
    function toggleMax() { setMax(!max); }

    var op = null;
    function onMove(e) {
      if (!op) return;
      var dx = e.clientX - op.sx, dy = e.clientY - op.sy, r = { x: op.r.x, y: op.r.y, w: op.r.w, h: op.r.h }, d = op.dir;
      if (d === 'move') { r.x += dx; r.y += dy; r = clamp(r); }
      else {
        if (d.indexOf('e') > -1) r.w = Math.max(minW, op.r.w + dx);
        if (d.indexOf('s') > -1) r.h = Math.max(minH, op.r.h + dy);
        if (d.indexOf('w') > -1) { r.w = Math.max(minW, op.r.w - dx); r.x = op.r.x + (op.r.w - r.w); }
        if (d.indexOf('n') > -1) { r.h = Math.max(minH, op.r.h - dy); r.y = Math.max(0, op.r.y + (op.r.h - r.h)); r.h = op.r.y + op.r.h - r.y; }
      }
      setRect(r);
    }
    function onUp() { op = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.classList.remove('wm-busy'); }
    function begin(e, dir) {
      if (e.button !== 0) return; op = { dir: dir, sx: e.clientX, sy: e.clientY, r: getRect() };
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.body.classList.add('wm-busy'); e.preventDefault();
    }
    win.querySelectorAll('.wm-h').forEach(function (hd) { hd.addEventListener('mousedown', function (e) { if (!max) begin(e, hd.getAttribute('data-dir')); }); });
    if (bar) {
      bar.addEventListener('mousedown', function (e) { if (max || e.target.closest('button, .wb-ctl, .ac-ctl')) return; begin(e, 'move'); });
      bar.addEventListener('dblclick', function (e) { if (!e.target.closest('button, .wb-ctl, .ac-ctl')) toggleMax(); });
    }
    function onWinResize() { if (max) { var a = area(); setRect({ x: 0, y: 0, w: a.w, h: a.h }); } else setRect(clamp(getRect())); }
    window.addEventListener('resize', onWinResize);
    return { toggleMax: toggleMax, isMax: function () { return max; }, raise: raise, destroy: function () { window.removeEventListener('resize', onWinResize); onUp(); } };
  }
  function iconFor(isMax) { var t = document.createElement('template'); t.innerHTML = isMax ? ICON_RESTORE : ICON_MAX; return t.content.firstChild; }
  window.WinMgr = { manage: manage, icon: iconFor, TASKBAR: TASKBAR };
})();
