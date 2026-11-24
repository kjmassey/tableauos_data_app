/* Admin Center — command-center / approvals / management console for TableauOS.
   Overview, Content, Jobs, Extracts, Users & Groups and Logs are live (via TFConn backend); Approvals and Settings are DEMO data in memory. Exposes window.AdminCenter.create(parent, hooks). */
(function () {
  'use strict';

  var NAV = [
    ['overview', 'Overview', '◈'], ['approvals', 'Approvals', '✓'], ['jobs', 'Jobs & Subscriptions', '▶'], ['extracts', 'Extracts', '⟳'], ['users', 'Users & Groups', '☺'],
    ['content', 'Content', '▤'], ['logs', 'Logs', '≡'], ['settings', 'Settings', '⚙']
  ];
  var DATA = {
    kpis: [
      { k: 'Active users (30d)', v: '1,284', d: '+4.2%', up: true },
      { k: 'Pending approvals', v: '', d: 'needs attention', up: false, live: 'pending' },
      { k: 'Failed extracts (24h)', v: '7', d: '+2 vs. yesterday', up: false },
      { k: 'Licenses used', v: '1,412 / 1,600', d: '88% of capacity', up: true }
    ],
    logins: [38, 52, 47, 61, 58, 22, 18, 55, 63, 70, 66, 72, 31, 27],
    health: [['Backgrounder', 'ok', '3 of 4 nodes busy'], ['VizQL Server', 'ok', 'p95 render 1.8s'], ['Data Server', 'warn', 'queue depth rising'], ['Search & Browse', 'ok', 'index fresh'], ['Gateway', 'ok', '99.98% uptime']],
    activity: [
      ['Avery Chen published “Q4 Pipeline Review”', '2m ago'], ['Extract refresh failed: Superstore Orders', '9m ago'],
      ['Jordan Lee was added to Finance Analysts', '24m ago'], ['License upgraded: Sam Patel → Creator', '1h ago'],
      ['Project “Sandbox” permissions changed', '2h ago'], ['New site role template created', '3h ago']
    ],
    approvals: [
      { id: 1, type: 'Publish', title: 'Publish “Board KPI Pack” to Executive', who: 'Avery Chen', when: '12m ago', risk: 'High' },
      { id: 2, type: 'Access', title: 'Access to “HR Compensation” data source', who: 'Morgan Diaz', when: '41m ago', risk: 'High' },
      { id: 3, type: 'License', title: 'Upgrade Viewer → Explorer', who: 'Sam Patel', when: '1h ago', risk: 'Low' },
      { id: 4, type: 'Delete', title: 'Delete 14 stale workbooks in Sandbox', who: 'Alex Morgan', when: '3h ago', risk: 'Medium' },
      { id: 5, type: 'Schedule', title: 'Hourly extract for “Sales Orders”', who: 'Riley Kim', when: '5h ago', risk: 'Medium' },
      { id: 6, type: 'Access', title: 'Add Taylor Brooks to Finance Analysts', who: 'Taylor Brooks', when: 'Yesterday', risk: 'Low' }
    ],
    users: [
      ['Avery Chen', 'avery.chen@example.com', 'Creator', 'Today', 'Active'], ['Jordan Lee', 'jordan.lee@example.com', 'Explorer', 'Today', 'Active'],
      ['Sam Patel', 'sam.patel@example.com', 'Viewer', 'Yesterday', 'Active'], ['Morgan Diaz', 'morgan.diaz@example.com', 'Explorer', '3 days ago', 'Active'],
      ['Riley Kim', 'riley.kim@example.com', 'Creator', '5 days ago', 'Active'], ['Taylor Brooks', 'taylor.brooks@example.com', 'Viewer', '12 days ago', 'Active'],
      ['Casey Nguyen', 'casey.nguyen@example.com', 'Viewer', '48 days ago', 'Suspended']
    ],
    settings: [
      ['Require approval to publish to Executive project', true], ['Auto-suspend users inactive for 45+ days', true],
      ['Email digest of pending approvals (daily)', false], ['Allow personal-space publishing', true]
    ]
  };

  function mk(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }

  function create(parent, hooks) {
    hooks = hooks || {};
    var S = { view: 'overview', detail: null, filter: 'Pending', q: '', approvals: DATA.approvals.map(function (a) { return Object.assign({ status: 'Pending' }, a); }), users: DATA.users.map(function (u) { return u.slice(); }), settings: DATA.settings.map(function (s) { return s.slice(); }) };
    var win = mk('div', 'ac-win'); win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', 'Admin Center');
    var bar = mk('div', 'ac-bar');
    var ttl = mk('div', 'ac-ttl'); var badge = mk('span', 'ac-badge', 'Demo');
    add(ttl, mk('span', 'ac-logo', '✚'), mk('span', null, 'Admin Center'), badge);
    var ctl = mk('div', 'ac-ctl');
    var bMin = mk('button', 'wb-btn', '—'), bMax = mk('button', 'wb-btn'), bClose = mk('button', 'wb-btn close', '✕');
    bMin.type = bMax.type = bClose.type = 'button'; bMin.title = 'Minimize'; bClose.title = 'Close'; bMin.setAttribute('aria-label', 'Minimize'); bClose.setAttribute('aria-label', 'Close');
    function syncMax(m) { bMax.textContent = ''; bMax.appendChild(WinMgr.icon(m)); bMax.title = m ? 'Restore' : 'Maximize'; bMax.setAttribute('aria-label', bMax.title); }
    syncMax(false);
    bMin.addEventListener('click', function () { hooks.onMinimize && hooks.onMinimize(); });
    bClose.addEventListener('click', function () { hooks.onClose && hooks.onClose(); });
    add(ctl, bMin, bMax, bClose); add(bar, ttl, ctl);
    var body = mk('div', 'ac-body'), nav = mk('div', 'ac-nav'), main = mk('div', 'ac-main');
    add(body, nav, main); add(win, bar, body);

    function pending() { return S.approvals.filter(function (a) { return a.status === 'Pending'; }).length; }
    function chip(text, kind) { return mk('span', 'ac-chip ' + (kind || ''), text); }
    function table(heads, rows) {
      var t = mk('table', 'ac-table'), th = mk('thead'), tr = mk('tr');
      heads.forEach(function (h) { tr.appendChild(mk('th', null, h)); }); th.appendChild(tr); t.appendChild(th);
      var tb = mk('tbody'); rows.forEach(function (r) { tb.appendChild(r); }); t.appendChild(tb); return t;
    }
    function row(cells) { var tr = mk('tr'); cells.forEach(function (c) { var td = mk('td'); if (c && c.nodeType) td.appendChild(c); else td.textContent = c; tr.appendChild(td); }); return tr; }
    function card(title, child, cls) { var c = mk('section', 'ac-card ' + (cls || '')); c.appendChild(mk('h3', null, title)); c.appendChild(child); return c; }

    function renderNav() {
      nav.textContent = '';
      NAV.forEach(function (n) {
        var b = mk('button', 'ac-nav-item' + (S.view === n[0] ? ' on' : '')); b.type = 'button';
        add(b, mk('span', 'ac-ico', n[2]), mk('span', null, n[1]));
        if (n[0] === 'approvals' && pending()) b.appendChild(mk('span', 'ac-count', String(pending())));
        b.addEventListener('click', function () { S.view = n[0]; S.detail = null; OPS.sel = null; OPS.msg = null; OPS.q = ''; OPS.f = 'All'; render(); });
        nav.appendChild(b);
      });
    }
    function head(title, sub) { var h = mk('div', 'ac-head'); add(h, mk('h2', null, title), mk('p', null, sub)); return h; }

    /* ---- live overview data ---- */
    var L = { state: 'idle', data: null, err: '', be: null, at: null };
    function load() {
      var be = window.TFConn && TFConn.get();
      L.be = be;
      if (!be) { L.state = 'none'; L.data = null; if (S.view === 'overview') render(); return; }
      L.state = 'loading'; if (S.view === 'overview') render();
      be.adminOverview().then(function (d) { if (L.be !== be) return; L.data = d; L.state = 'ok'; L.at = new Date(); }, function (e) { if (L.be !== be) return; L.state = 'error'; L.err = e && e.message || 'Request failed'; })
        .then(function () { if (S.view === 'overview') render(); syncBadge(); });
    }
    function syncBadge() {
      var live = ((S.view === 'overview' || S.view === 'content') && L.state === 'ok') || (isOps() && (OPS.d.jobs.s === 'ok' || OPS.d.subs.s === 'ok' || OPS.d.tasks.s === 'ok' || OPS.d.users.s === 'ok' || OPS.d.groups.s === 'ok'));
      badge.textContent = live ? (L.be && L.be.isDemo ? 'Sample data' : 'Live data') : 'Demo';
      badge.classList.toggle('live', live);
    }
    function ago(iso) {
      var t = Date.parse(iso); if (isNaN(t)) return '';
      var m = Math.max(0, Math.round((Date.now() - t) / 6e4));
      if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; var h = Math.round(m / 60); if (h < 24) return h + 'h ago';
      var d = Math.round(h / 24); return d < 60 ? d + 'd ago' : Math.round(d / 30) + ' mo ago';
    }
    function num(n) { return Number(n).toLocaleString(); }
    function click(el, key) {
      el.classList.add('ac-click'); el.tabIndex = 0; el.setAttribute('role', 'button');
      var go = function () { S.detail = key; S.dscroll = 0; render(); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      return el;
    }
    function dstr(iso) { var t = Date.parse(iso); return isNaN(t) ? '—' : new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    function bytes(b) { if (b == null) return '—'; var u = ['B', 'KB', 'MB', 'GB'], i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return (b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)) + ' ' + u[i]; }
    // Resolve a drill-down key into a table spec from the current overview data.
    function detailFor(key, D) {
      var DAY = 864e5, now = Date.now(), pj = {};
      D.projects.forEach(function (p) { pj[p.id] = p.name; });
      var items = D.workbooks.concat(D.datasources);
      var itemHeads = ['Name', 'Type', 'Project', 'Owner', 'Updated', 'Size'];
      function irow(x) { return { url: x.url, c: [x.name, x.kind === 'workbook' ? 'Workbook' : 'Data source', pj[x.projectId] || '—', x.owner || '—', dstr(x.updatedAt), bytes(x.size)] }; }
      function byUpd(a, b) { return Date.parse(b.updatedAt) - Date.parse(a.updatedAt); }
      var userHeads = ['Name', 'Email', 'Role', 'Last sign-in'];
      function urow(u) { return { c: [u.name, u.email || '—', u.role, u.lastLogin ? dstr(u.lastLogin) + ' (' + ago(u.lastLogin) + ')' : 'Never'] }; }
      function ulist(f) { return (D.users || []).filter(f).sort(function (a, b) { return (Date.parse(b.lastLogin) || 0) - (Date.parse(a.lastLogin) || 0); }).map(urow); }
      var k = key.split(':'), arg = k.slice(1).join(':');
      switch (k[0]) {
        case 'active': return { title: 'Users', sub: 'All users, most recent sign-in first. Active = signed in within 30 days.', heads: ['Name', 'Email', 'Role', 'Last sign-in', 'Status'],
          rows: (D.users || []).slice().sort(function (a, b) { return (Date.parse(b.lastLogin) || 0) - (Date.parse(a.lastLogin) || 0); }).map(function (u) { var t = Date.parse(u.lastLogin), on = !isNaN(t) && now - t <= 30 * DAY; return { c: [u.name, u.email || '—', u.role, u.lastLogin ? dstr(u.lastLogin) + ' (' + ago(u.lastLogin) + ')' : 'Never', chip(on ? 'Active' : 'Inactive', on ? 'ok' : 'warn')] }; }) };
        case 'content': return { title: 'All content', sub: 'Workbooks and data sources, most recently updated first.', heads: itemHeads, rows: items.slice().sort(byUpd).map(irow) };
        case 'stale': return { title: 'Stale content', sub: 'Not updated in 180+ days, oldest first.', heads: itemHeads,
          rows: items.filter(function (x) { var t = Date.parse(x.updatedAt); return !isNaN(t) && now - t > 180 * DAY; }).sort(function (a, b) { return -byUpd(a, b); }).map(irow) };
        case 'failed': return { title: 'Background jobs', sub: 'Most recent jobs; failures first.', heads: ['Job type', 'Status', 'When'],
          rows: (D.jobs || []).slice().sort(function (a, b) { var fa = /fail/i.test(a.status) ? 0 : 1, fb = /fail/i.test(b.status) ? 0 : 1; return fa - fb || Date.parse(b.at) - Date.parse(a.at); })
            .map(function (j) { var bad = /fail/i.test(j.status || ''); return { c: [j.type || '—', chip(j.status || '—', bad ? 'bad' : 'ok'), j.at ? dstr(j.at) + ' (' + ago(j.at) + ')' : '—'] }; }) };
        case 'day': var t0 = Number(arg); return { title: 'Sign-ins on ' + new Date(t0).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }), sub: 'Users whose most recent sign-in was this day.', heads: userHeads,
          rows: ulist(function (u) { var t = Date.parse(u.lastLogin); if (isNaN(t)) return false; var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() === t0; }) };
        case 'role': return { title: arg + ' users', sub: 'Users with this site role.', heads: userHeads, rows: ulist(function (u) { return u.role === arg; }) };
        case 'cert': return { title: 'Certified data sources', sub: 'Data sources marked certified.', heads: itemHeads, rows: D.datasources.filter(function (x) { return x.certified; }).map(irow) };
        case 'uncert': return { title: 'Data sources', sub: 'All data sources (certified ones are marked).', heads: itemHeads, rows: D.datasources.slice().sort(byUpd).map(irow) };
        case 'extracts': return { title: 'Data sources with extracts', sub: 'Data sources that use extracts.', heads: itemHeads, rows: D.datasources.filter(function (x) { return x.hasExtracts === true || x.hasExtracts === 'true'; }).map(irow) };
        case 'untag': return { title: 'Untagged content', sub: 'Items with no tags — harder to find and govern.', heads: itemHeads, rows: items.filter(function (x) { return !(x.tags && x.tags.length); }).sort(byUpd).map(irow) };
        case 'projects': return { title: 'Projects', sub: 'All projects with item counts.', heads: ['Project', 'Parent', 'Owner', 'Items', 'Updated'],
          rows: D.projects.map(function (p) { return { c: [p.name, pj[p.parentId] || '—', p.owner || '—', String(items.filter(function (x) { return x.projectId === p.id; }).length), dstr(p.updatedAt)] }; }) };
        case 'views': return { title: 'Most viewed', sub: 'Views ranked by total view count.', heads: ['View', 'Workbook', 'Total views'],
          rows: (D.views || []).slice().sort(function (a, b) { return b.count - a.count; }).map(function (v) { return { c: [v.name, v.workbook || '—', num(v.count)] }; }) };
        case 'recent': return { title: 'Recent content changes', sub: 'Workbooks and data sources by last update.', heads: itemHeads, rows: items.slice().sort(byUpd).map(irow) };
        case 'groups': return { title: 'Groups', sub: num(D.groups) + ' groups on this site. Group membership detail is coming with the Users & Groups section.', heads: [], rows: [] };
      }
      return { title: 'Details', sub: '', heads: [], rows: [] };
    }
    function vDetail(D) {
      var f = document.createDocumentFragment(), d = detailFor(S.detail, D);
      var back = mk('button', 'btn ac-back', '← Overview'); back.type = 'button';
      back.addEventListener('click', function () { S.detail = null; render(); });
      var h = head(d.title, d.sub); h.appendChild(back); f.appendChild(h);
      if (!d.rows.length) { f.appendChild(mk('div', 'ac-empty', d.heads.length ? 'Nothing to show here.' : '')); return f; }
      var CAP = 300, rows = d.rows.slice(0, CAP).map(function (r) {
        var cells = r.c.slice();
        if (r.url) { var a = mk('button', 'btn', 'Open'); a.type = 'button'; a.addEventListener('click', function () { window.open(r.url, '_blank', 'noopener'); }); cells.push(a); }
        else if (d.heads.length > cells.length) cells.push('');
        return row(cells);
      });
      var heads = d.heads.slice(); if (d.rows.some(function (r) { return r.url; })) heads.push('');
      f.appendChild(mk('div', 'ac-axis', num(d.rows.length) + ' item' + (d.rows.length === 1 ? '' : 's') + (d.rows.length > CAP ? ' · showing first ' + CAP : '')));
      f.appendChild(table(heads, rows)); return f;
    }
    function vOverview() {
      var f = document.createDocumentFragment();
      f.appendChild(head('Command center', L.state === 'ok' ? (L.data.site || 'Site') + ' · updated ' + ago(L.at.toISOString()) : 'Site health, content and activity at a glance.'));
      if (L.state !== 'ok') {
        var box = mk('div', 'ac-empty');
        if (L.state === 'none') {
          box.appendChild(mk('div', null, 'Not connected to a Tableau site yet.'));
          var go = mk('button', 'btn primary', 'Open Connection'); go.type = 'button'; go.style.marginTop = '12px';
          go.addEventListener('click', function () { if (window.TableauOS) TableauOS.launch('connect'); }); box.appendChild(go);
        } else if (L.state === 'error') {
          box.appendChild(mk('div', null, 'Couldn’t load site data: ' + L.err));
          var rt = mk('button', 'btn', 'Retry'); rt.type = 'button'; rt.style.marginTop = '12px'; rt.addEventListener('click', load); box.appendChild(rt);
        } else box.appendChild(mk('div', null, 'Loading site data…'));
        f.appendChild(box); return f;
      }
      if (S.detail) return vDetail(L.data);
      var D = L.data, now = Date.now(), DAY = 864e5, nA = function (x) { return x ? x.length : 0; };
      var items = D.workbooks.concat(D.datasources);
      var stale = items.filter(function (x) { var t = Date.parse(x.updatedAt); return !isNaN(t) && now - t > 180 * DAY; });
      var users = D.users, active = users ? users.filter(function (u) { var t = Date.parse(u.lastLogin); return !isNaN(t) && now - t <= 30 * DAY; }).length : null;
      var failed = D.jobs ? D.jobs.filter(function (j) { return /fail/i.test(j.status || ''); }) : null;
      var viewsN = D.views ? D.views.length : null;
      var refresh = mk('button', 'btn ac-refresh', 'Refresh'); refresh.type = 'button'; refresh.addEventListener('click', load);
      f.firstChild.appendChild(refresh);
      var kp = [
        { key: 'active', k: 'Active users (30d)', v: users ? num(active) : '—', d: users ? 'of ' + num(users.length) + ' users' : 'needs admin role', up: !!users },
        { key: 'content', k: 'Content items', v: num(items.length + (viewsN || 0)), d: num(D.workbooks.length) + ' workbooks · ' + num(D.datasources.length) + ' data sources' + (viewsN != null ? ' · ' + num(viewsN) + ' views' : ''), up: true },
        { key: 'stale', k: 'Stale content (180d+)', v: num(stale.length), d: items.length ? Math.round(stale.length / items.length * 100) + '% of workbooks & sources' : '—', up: !stale.length },
        { key: 'failed', k: 'Failed jobs (recent)', v: failed ? num(failed.length) : '—', d: failed ? 'of last ' + num(D.jobs.length) + ' background jobs' : 'job history unavailable', up: failed ? !failed.length : false }
      ];
      var k = mk('div', 'ac-kpis');
      kp.forEach(function (x) { var t = mk('div', 'ac-kpi'); add(t, mk('div', 'k', x.k), mk('div', 'v', x.v), mk('div', 'd ' + (x.up ? 'up' : 'dn'), x.d)); if (x.key === 'active' && !users) { } else if (x.key === 'failed' && !failed) { } else click(t, x.key); k.appendChild(t); });
      f.appendChild(k);
      var g = mk('div', 'ac-grid');
      // sign-ins by day (users' most recent login)
      var days = [], i;
      for (i = 13; i >= 0; i--) { var d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - i); days.push({ t: d0.getTime(), n: 0 }); }
      if (users) users.forEach(function (u) { var t = Date.parse(u.lastLogin); if (isNaN(t)) return; var dd = new Date(t); dd.setHours(0, 0, 0, 0); days.forEach(function (x) { if (x.t === dd.getTime()) x.n++; }); });
      var max = Math.max.apply(null, days.map(function (x) { return x.n; }).concat([1])), bars = mk('div', 'ac-bars');
      days.forEach(function (x) { var b = mk('div', 'ac-bar-col'); b.title = new Date(x.t).toLocaleDateString() + ': ' + x.n + ' user' + (x.n === 1 ? '' : 's'); var i2 = mk('i'); i2.style.height = Math.round(x.n / max * 100) + '%'; b.appendChild(i2); if (x.n) click(b, 'day:' + x.t); bars.appendChild(b); });
      var chart = mk('div'); add(chart, users ? bars : mk('div', 'ac-empty', 'User list requires a site admin role.'), users ? mk('div', 'ac-axis', 'Users by most recent sign-in · last 14 days') : null);
      // site roles
      var roles = {}; (users || []).forEach(function (u) { roles[u.role] = (roles[u.role] || 0) + 1; });
      var rl = mk('div', 'ac-list');
      var rk = Object.keys(roles).sort(function (a, b) { return roles[b] - roles[a]; });
      if (!users) rl.appendChild(mk('div', 'ac-li', 'Requires a site admin role.'));
      rk.forEach(function (r) { var row = mk('div', 'ac-li'); add(row, mk('span', 'ac-dot' + (r === 'Unlicensed' ? ' warn' : '')), mk('b', null, r), mk('span', 'sub', num(roles[r]))); click(row, 'role:' + r); rl.appendChild(row); });
      if (D.groups != null) { var gr = mk('div', 'ac-li'); add(gr, mk('span', 'ac-dot'), mk('b', null, 'Groups'), mk('span', 'sub', num(D.groups))); click(gr, 'groups'); rl.appendChild(gr); }
      // content health
      var cert = D.datasources.filter(function (x) { return x.certified; }).length, ext = D.datasources.filter(function (x) { return x.hasExtracts === true || x.hasExtracts === 'true'; }).length;
      var untag = items.filter(function (x) { return !(x.tags && x.tags.length); }).length;
      var hl = mk('div', 'ac-list');
      [['Failed background jobs', failed ? (failed.length ? 'bad' : 'ok') : 'warn', failed ? (failed.length ? failed.length + ' recent' : 'none recent') : 'unavailable', failed ? 'failed' : null],
       ['Stale content', stale.length > items.length * 0.25 ? 'warn' : 'ok', num(stale.length) + ' items', 'stale'],
       ['Certified data sources', cert ? 'ok' : 'warn', cert + ' of ' + D.datasources.length, cert ? 'cert' : 'uncert'],
       ['Data sources with extracts', 'ok', num(ext), 'extracts'],
       ['Untagged content', untag > items.length * 0.75 ? 'warn' : 'ok', num(untag) + ' items', 'untag'],
       ['Projects', 'ok', num(D.projects.length), 'projects']
      ].forEach(function (h) { var r = mk('div', 'ac-li'); add(r, mk('span', 'ac-dot ' + h[1]), mk('b', null, h[0]), mk('span', 'sub', h[2])); if (h[3]) click(r, h[3]); hl.appendChild(r); });
      // top views
      var tv = mk('div', 'ac-list');
      if (!D.views) tv.appendChild(mk('div', 'ac-li', 'View usage unavailable.'));
      else D.views.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, 6).forEach(function (v) { var r = mk('div', 'ac-li'); add(r, mk('span', null, v.name + (v.workbook ? ' — ' + v.workbook : '')), mk('span', 'sub', num(v.count) + ' views')); click(r, 'views'); tv.appendChild(r); });
      // recent activity = latest content changes
      var al = mk('div', 'ac-list');
      items.slice().sort(function (a, b) { return Date.parse(b.updatedAt) - Date.parse(a.updatedAt); }).slice(0, 8).forEach(function (x) {
        var r = mk('div', 'ac-li'); add(r, mk('span', null, (x.owner || 'Someone') + ' updated ' + (x.kind === 'workbook' ? 'workbook' : 'data source') + ' “' + x.name + '”'), mk('span', 'sub', ago(x.updatedAt))); click(r, 'recent'); al.appendChild(r);
      });
      add(g, card('Sign-in trend', chart), card('Site roles', rl), card('Content health', hl), card('Most viewed', tv), card('Recent content changes', al, 'wide'));
      f.appendChild(g); return f;
    }
    function vApprovals() {
      var f = document.createDocumentFragment();
      f.appendChild(head('Approvals', 'Review and decide on requests from your site.'));
      f.appendChild(mk('div', 'ac-note', 'ⓘ This view is for demo purposes. It is easily implemented with an app backend that stores and routes approval requests.'));
      var tabs = mk('div', 'ac-tabs');
      ['Pending', 'Approved', 'Rejected'].forEach(function (t) {
        var n = S.approvals.filter(function (a) { return a.status === t; }).length;
        var b = mk('button', 'ac-tab' + (S.filter === t ? ' on' : ''), t + ' (' + n + ')'); b.type = 'button';
        b.addEventListener('click', function () { S.filter = t; render(); }); tabs.appendChild(b);
      });
      f.appendChild(tabs);
      var items = S.approvals.filter(function (a) { return a.status === S.filter; });
      var list = mk('div', 'ac-appr');
      if (!items.length) list.appendChild(mk('div', 'ac-empty', 'Nothing here. 🎉'));
      items.forEach(function (a) {
        var r = mk('div', 'ac-ap'), m = mk('div', 'm');
        add(m, mk('div', 't', a.title), (function () { var s = mk('div', 's'); add(s, chip(a.type), chip(a.risk + ' risk', a.risk === 'High' ? 'bad' : a.risk === 'Medium' ? 'warn' : 'ok'), mk('span', null, a.who + ' · ' + a.when)); return s; })());
        r.appendChild(m);
        if (a.status === 'Pending') {
          var act = mk('div', 'a'), no = mk('button', 'btn', 'Reject'), yes = mk('button', 'btn primary', 'Approve'); no.type = yes.type = 'button';
          no.addEventListener('click', function () { a.status = 'Rejected'; render(); }); yes.addEventListener('click', function () { a.status = 'Approved'; render(); });
          add(act, no, yes); r.appendChild(act);
        }
        list.appendChild(r);
      });
      f.appendChild(list); return f;
    }
    function vContent() {
      var f = document.createDocumentFragment();
      f.appendChild(head('Content', 'Workbooks and data sources flagged for review: stale (180+ days), large (500+ MB) or ownerless.'));
      if (L.state !== 'ok') {
        var box = mk('div', 'ac-empty');
        if (L.state === 'none') {
          box.appendChild(mk('div', null, 'Not connected to a Tableau site yet.'));
          var go = mk('button', 'btn primary', 'Open Connection'); go.type = 'button'; go.style.marginTop = '12px';
          go.addEventListener('click', function () { if (window.TableauOS) TableauOS.launch('connect'); }); box.appendChild(go);
        } else if (L.state === 'error') {
          box.appendChild(mk('div', null, 'Couldn’t load site data: ' + L.err));
          var rt = mk('button', 'btn', 'Retry'); rt.type = 'button'; rt.style.marginTop = '12px'; rt.addEventListener('click', load); box.appendChild(rt);
        } else box.appendChild(mk('div', null, 'Loading site data…'));
        f.appendChild(box); return f;
      }
      var D = L.data, DAY = 864e5, now = Date.now(), pj = {};
      D.projects.forEach(function (p) { pj[p.id] = p.name; });
      var flagged = [];
      D.workbooks.concat(D.datasources).forEach(function (x) {
        var why = [], t = Date.parse(x.updatedAt);
        if (!isNaN(t) && now - t > 180 * DAY) why.push('Stale');
        if (x.size > 500 * 1048576) why.push('Large');
        if (!x.owner) why.push('Ownerless');
        if (why.length) flagged.push({ x: x, why: why });
      });
      flagged.sort(function (a, b) { return (Date.parse(a.x.updatedAt) || 0) - (Date.parse(b.x.updatedAt) || 0); });
      var CAP = 300, refresh = mk('button', 'btn ac-refresh', 'Refresh'); refresh.type = 'button'; refresh.addEventListener('click', load);
      f.firstChild.appendChild(refresh);
      if (!flagged.length) { f.appendChild(mk('div', 'ac-empty', 'Nothing flagged. 🎉')); return f; }
      f.appendChild(mk('div', 'ac-axis', num(flagged.length) + ' flagged item' + (flagged.length === 1 ? '' : 's') + (flagged.length > CAP ? ' · showing first ' + CAP : '')));
      f.appendChild(table(['Name', 'Type', 'Project', 'Owner', 'Updated', 'Size', 'Flags', ''], flagged.slice(0, CAP).map(function (r) {
        var x = r.x, open = '';
        if (x.url) { open = mk('button', 'btn', 'Open'); open.type = 'button'; open.addEventListener('click', function () { window.open(x.url, '_blank', 'noopener'); }); }
        var flags = mk('span'); r.why.forEach(function (w) { flags.appendChild(chip(w, w === 'Large' ? 'warn' : 'bad')); });
        return row([x.name, x.kind === 'workbook' ? 'Workbook' : 'Data source', pj[x.projectId] || '—', x.owner || '—', dstr(x.updatedAt), bytes(x.size), flags, open]);
      })));
      return f;
    }
    function vSettings() {
      var f = document.createDocumentFragment();
      f.appendChild(head('Settings', 'Governance defaults for this site (demo).'));
      var l = mk('div', 'ac-set');
      S.settings.forEach(function (s) {
        var r = mk('label', 'ac-sw'), cb = mk('input'); cb.type = 'checkbox'; cb.checked = s[1];
        cb.addEventListener('change', function () { s[1] = cb.checked; });
        add(r, mk('span', null, s[0]), cb); l.appendChild(r);
      });
      f.appendChild(l); return f;
    }

    /* ================= Jobs, Subscriptions & Extracts (live, with admin actions) ================= */
    var OPS = { tab: 'jobs', xtab: 'sched', q: '', f: 'All', sel: null, msg: null, log: [], d: { jobs: { s: 'idle' }, subs: { s: 'idle' }, tasks: { s: 'idle' }, users: { s: 'idle' }, groups: { s: 'idle' }, logs: { s: 'idle' }, insights: { s: 'idle' } }, cache: {}, utab: 'users', ltab: 'activity' };
    var LOADERS = { jobs: 'listJobs', subs: 'listSubscriptions', tasks: 'listExtractTasks', users: 'listUsers', groups: 'listGroups', logs: 'listLogs', insights: 'listInsights' };
    function resetOps() { OPS.d = {}; Object.keys(LOADERS).forEach(function (k) { OPS.d[k] = { s: 'idle' }; }); OPS.sel = null; OPS.cache = {}; }
    function isOps() { return S.view === 'jobs' || S.view === 'extracts' || S.view === 'users' || S.view === 'logs'; }
    function opsLoad(key, force) {
      var d = OPS.d[key], be = window.TFConn && TFConn.get();
      if (!be) { d.s = 'none'; return; }
      if (!force && d.be === be && d.s !== 'idle') return;
      d.s = 'loading'; d.be = be;
      be[LOADERS[key]]().then(function (x) { if (d.be !== be) return; d.data = x; d.s = 'ok'; d.at = new Date(); },
        function (e) { if (d.be !== be) return; d.s = 'error'; d.err = e && e.message || 'Request failed'; })
        .then(function () { if (isOps()) render(); });
    }
    function need() { for (var i = 0; i < arguments.length; i++) opsLoad(arguments[i]); }
    function notReady() { // returns a node when any needed source isn't loaded
      var bad = null;
      for (var i = 0; i < arguments.length; i++) { var d = OPS.d[arguments[i]]; if (d.s !== 'ok') { bad = d; break; } }
      if (!bad) return null;
      var box = mk('div', 'ac-empty');
      if (bad.s === 'none') {
        box.appendChild(mk('div', null, 'Not connected to a Tableau site yet.'));
        var go = mk('button', 'btn primary', 'Open Connection'); go.type = 'button'; go.style.marginTop = '12px';
        go.addEventListener('click', function () { if (window.TableauOS) TableauOS.launch('connect'); }); box.appendChild(go);
      } else if (bad.s === 'error') {
        box.appendChild(mk('div', null, 'Couldn’t load: ' + bad.err));
        var rt = mk('button', 'btn', 'Retry'); rt.type = 'button'; rt.style.marginTop = '12px';
        rt.addEventListener('click', function () { Object.keys(OPS.d).forEach(function (k) { if (OPS.d[k].s === 'error') opsLoad(k, true); }); render(); }); box.appendChild(rt);
      } else box.appendChild(mk('div', null, 'Loading…'));
      return box;
    }
    function dt(iso) { var t = Date.parse(iso); return isNaN(t) ? '—' : new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    function dur(a, b) { var x = Date.parse(a), y = Date.parse(b); if (isNaN(x) || isNaN(y)) return '—'; var s = Math.max(0, Math.round((y - x) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm'; }
    function jobKind(st) { return /fail|error/i.test(st) ? 'bad' : /success|complete/i.test(st) ? 'ok' : /cancel/i.test(st) ? '' : 'warn'; }
    function jobActive(j) { return /pending|inprogress|running/i.test(j.status || ''); }
    function btn(text, cls, fn) { var b = mk('button', 'btn ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); }); return b; }
    function confirmBtn(text, cls, fn) {
      var timer = null, b = btn(text, cls, function () {
        if (timer) { clearTimeout(timer); timer = null; fn(); return; }
        b.textContent = 'Confirm?'; b.classList.add('danger'); timer = setTimeout(function () { timer = null; b.textContent = text; b.classList.remove('danger'); }, 4000);
      }); return b;
    }
    function link(text, fn) { var a = mk('button', 'ac-link', text); a.type = 'button'; a.addEventListener('click', fn); return a; }
    // Run an admin action: report progress, record it in the session audit trail, then reload.
    function act(label, target, fn, reload) {
      OPS.msg = { t: label + '…', k: '' }; render();
      return fn().then(function () { OPS.log.unshift({ at: new Date(), what: label, target: target, res: 'Success' }); OPS.msg = { t: label + ' — done', k: 'ok' }; },
        function (e) { var m = e && e.message || 'failed'; OPS.log.unshift({ at: new Date(), what: label, target: target, res: 'Failed: ' + m }); OPS.msg = { t: label + ' failed: ' + m, k: 'bad' }; })
        .then(function () { OPS.cache = {}; (reload || []).forEach(function (k) { opsLoad(k, true); }); render(); });
    }
    function be() { return window.TFConn && TFConn.get(); }
    function msgNode() { if (!OPS.msg) return null; var n = mk('div', 'ac-note ' + OPS.msg.k, OPS.msg.t); return n; }
    function auditCard() {
      var l = mk('div', 'ac-list');
      if (!OPS.log.length) l.appendChild(mk('div', 'ac-li', 'No admin actions taken yet this session.'));
      OPS.log.slice(0, 12).forEach(function (a) { var r = mk('div', 'ac-li'); add(r, mk('span', 'ac-dot ' + (a.res === 'Success' ? '' : 'bad')), mk('b', null, a.what), mk('span', null, a.target || ''), mk('span', 'sub', a.at.toLocaleTimeString() + ' · ' + a.res)); l.appendChild(r); });
      var c = card('Admin actions this session (audit trail)', l, 'wide'); c.style.marginTop = '12px'; return c;
    }
    function tabs(list, cur, onPick) {
      var t = mk('div', 'ac-tabs');
      list.forEach(function (x) { var b = mk('button', 'ac-tab' + (cur === x[0] ? ' on' : ''), x[1]); b.type = 'button'; b.addEventListener('click', function () { onPick(x[0]); OPS.q = ''; OPS.f = 'All'; OPS.sel = null; OPS.msg = null; render(); }); t.appendChild(b); });
      return t;
    }
    function listView(cfg) {
      var f = document.createDocumentFragment(), holder = mk('div'), count = mk('div', 'ac-axis');
      var bar = mk('div', 'ac-toolbar'), q = mk('input', 'ac-search'); q.type = 'search'; q.placeholder = cfg.placeholder; q.value = OPS.q; q.setAttribute('aria-label', cfg.placeholder);
      var sel = mk('select', 'ac-select'); cfg.filters.forEach(function (x) { var o = mk('option', null, x[0]); o.value = x[0]; sel.appendChild(o); }); sel.value = OPS.f;
      add(bar, q, sel, btn('Refresh', '', cfg.reload)); f.appendChild(bar); f.appendChild(count); f.appendChild(holder);
      function fill() {
        holder.textContent = '';
        var fl = cfg.filters.filter(function (x) { return x[0] === OPS.f; })[0], needle = (OPS.q || '').toLowerCase();
        var rows = cfg.rows.filter(function (r) { return (!fl || fl[1](r)) && (!needle || cfg.text(r).toLowerCase().indexOf(needle) > -1); });
        count.textContent = num(rows.length) + ' of ' + num(cfg.rows.length) + (rows.length > (cfg.max || 300) ? ' · showing first ' + (cfg.max || 300) : '');
        if (!rows.length) { holder.appendChild(mk('div', 'ac-empty', 'Nothing matches.')); return; }
        holder.appendChild(table(cfg.cols.map(function (c) { return c[0]; }).concat(['']), rows.slice(0, cfg.max || 300).map(function (r) {
          var ac = mk('div', 'ac-acts'); cfg.actions(r).forEach(function (a) { if (a) ac.appendChild(a); });
          return row(cfg.cols.map(function (c) { return c[1](r); }).concat([ac]));
        })));
      }
      q.addEventListener('input', function () { OPS.q = q.value; fill(); }); sel.addEventListener('change', function () { OPS.f = sel.value; fill(); });
      fill(); return f;
    }
    function kv(pairs) {
      var g = mk('div', 'ac-kv'); pairs.forEach(function (p) { if (p == null) return; add(g, mk('div', 'k', p[0]), (function () { var v = mk('div', 'v'); if (p[1] && p[1].nodeType) v.appendChild(p[1]); else v.textContent = p[1] == null || p[1] === '' ? '—' : String(p[1]); return v; })()); });
      return g;
    }
    function rawCard(o) { var pre = mk('pre', 'ac-raw', JSON.stringify(o, null, 2)); return card('Raw API record', pre, 'wide'); }
    function backTo(label) { var b = btn('← ' + label, 'ac-back', function () { OPS.sel = null; OPS.msg = null; render(); }); return b; }
    function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

    /* ---- Jobs & Subscriptions ---- */
    function jobCancel(j) { return jobActive(j) ? confirmBtn('Cancel job', '', function () { act('Cancel job', j.title || j.id, function () { return be().cancelJob(j.id); }, ['jobs']); }) : null; }
    function jobDetail(j) {
      var f = document.createDocumentFragment(), h = head('Job: ' + (j.title || j.id), (j.type || 'Background job') + ' · ' + j.id); h.appendChild(backTo('Jobs')); f.appendChild(h);
      var m = msgNode(); if (m) f.appendChild(m);
      f.appendChild(kv([['Status', chip(j.status, jobKind(j.status))], ['Type', j.type], ['Title', j.title], ['Subtitle', j.subtitle], ['Priority', j.priority], ['Created', dt(j.createdAt)], ['Started', dt(j.startedAt)], ['Ended', dt(j.endedAt)], ['Duration', dur(j.startedAt || j.createdAt, j.endedAt || new Date().toISOString())], ['Job ID', j.id]]));
      var a = mk('div', 'ac-acts'); var c = jobCancel(j); if (c) a.appendChild(c); else a.appendChild(mk('span', 'ac-axis', 'Only pending or in-progress jobs can be cancelled.')); f.appendChild(a);
      f.appendChild(rawCard(j.raw)); f.appendChild(auditCard()); return f;
    }
    function subDetail(x) {
      var f = document.createDocumentFragment(), h = head('Subscription: ' + (x.subject || x.id), x.contentType + ' · ' + x.contentName); h.appendChild(backTo('Subscriptions')); f.appendChild(h);
      var m = msgNode(); if (m) f.appendChild(m);
      f.appendChild(kv([['Owner', x.userName], ['Email', x.userEmail], ['Content', x.contentType + ': ' + x.contentName], ['Schedule', x.scheduleName], ['Delivery', [x.attachImage ? 'Image' : '', x.attachPdf ? 'PDF' : ''].filter(Boolean).join(', ') || 'Link only'], ['Status', chip(x.suspended ? 'Suspended' : 'Active', x.suspended ? 'warn' : 'ok')], ['Message', x.message], ['Subscription ID', x.id]]));
      var ed = mk('div', 'ac-edit'), subj = mk('input', 'ac-search'); subj.value = x.subject; subj.setAttribute('aria-label', 'Subject');
      add(ed, mk('label', null, 'Subject'), subj, btn('Save subject', 'primary', function () { var v = subj.value.trim(); if (!v || v === x.subject) return; act('Update subscription subject', x.subject, function () { return be().updateSubscription(x.id, { subject: v }); }, ['subs']); }));
      f.appendChild(ed);
      var a = mk('div', 'ac-acts');
      a.appendChild(btn(x.suspended ? 'Resume' : 'Suspend', '', function () { act((x.suspended ? 'Resume' : 'Suspend') + ' subscription', x.subject, function () { return be().updateSubscription(x.id, { suspended: x.suspended ? 'false' : 'true' }); }, ['subs']); }));
      a.appendChild(confirmBtn('Delete', '', function () { act('Delete subscription', x.subject, function () { return be().deleteSubscription(x.id); }, ['subs']).then(function () { OPS.sel = null; render(); }); }));
      f.appendChild(a); f.appendChild(rawCard(x.raw)); f.appendChild(auditCard()); return f;
    }
    function vJobs() {
      var f = document.createDocumentFragment();
      f.appendChild(head('Jobs & subscriptions', 'Every background job and subscription on the site. Click a row to audit it.'));
      need('jobs', 'subs');
      f.appendChild(tabs([['jobs', 'Jobs'], ['subs', 'Subscriptions']], OPS.tab, function (t) { OPS.tab = t; }));
      var nr = notReady(OPS.tab); if (nr) { f.appendChild(nr); return f; }
      if (OPS.sel) {
        var it = find(OPS.d[OPS.tab].data, OPS.sel);
        if (it) return OPS.tab === 'jobs' ? jobDetail(it) : subDetail(it);
        OPS.sel = null;
      }
      var m = msgNode(); if (m) f.appendChild(m);
      if (OPS.tab === 'jobs') {
        f.appendChild(listView({ placeholder: 'Search jobs', rows: OPS.d.jobs.data, reload: function () { opsLoad('jobs', true); render(); }, text: function (j) { return [j.title, j.type, j.status, j.subtitle].join(' '); },
          filters: [['All', function () { return true; }], ['Active', jobActive], ['Failed', function (j) { return jobKind(j.status) === 'bad'; }], ['Succeeded', function (j) { return jobKind(j.status) === 'ok'; }], ['Cancelled', function (j) { return /cancel/i.test(j.status); }]],
          cols: [['Status', function (j) { return chip(j.status, jobKind(j.status)); }], ['Title', function (j) { return link(j.title || j.id, function () { OPS.sel = j.id; OPS.msg = null; render(); }); }], ['Type', function (j) { return j.type; }],
            ['Priority', function (j) { return j.priority == null ? '—' : String(j.priority); }], ['Created', function (j) { return dt(j.createdAt); }], ['Duration', function (j) { return j.startedAt ? dur(j.startedAt, j.endedAt || new Date().toISOString()) : '—'; }]],
          actions: function (j) { return [jobCancel(j)]; } }));
      } else {
        f.appendChild(listView({ placeholder: 'Search subscriptions', rows: OPS.d.subs.data, reload: function () { opsLoad('subs', true); render(); }, text: function (x) { return [x.subject, x.contentName, x.userName, x.userEmail, x.scheduleName].join(' '); },
          filters: [['All', function () { return true; }], ['Active', function (x) { return !x.suspended; }], ['Suspended', function (x) { return x.suspended; }]],
          cols: [['Subject', function (x) { return link(x.subject || x.id, function () { OPS.sel = x.id; OPS.msg = null; render(); }); }], ['Content', function (x) { return x.contentType + ': ' + x.contentName; }],
            ['Owner', function (x) { var d = mk('div'); add(d, mk('div', null, x.userName), mk('div', 'ac-axis', x.userEmail)); return d; }], ['Schedule', function (x) { return x.scheduleName; }],
            ['Status', function (x) { return chip(x.suspended ? 'Suspended' : 'Active', x.suspended ? 'warn' : 'ok'); }]],
          actions: function (x) { return [btn(x.suspended ? 'Resume' : 'Suspend', '', function () { act((x.suspended ? 'Resume' : 'Suspend') + ' subscription', x.subject, function () { return be().updateSubscription(x.id, { suspended: x.suspended ? 'false' : 'true' }); }, ['subs']); }),
            confirmBtn('Delete', '', function () { act('Delete subscription', x.subject, function () { return be().deleteSubscription(x.id); }, ['subs']); })]; } }));
      }
      f.appendChild(auditCard()); return f;
    }

    /* ---- Extracts ---- */
    function isExtractJob(j) { return /extract|refresh/i.test(j.type || ''); }
    function lastRun(t) {
      var jobs = OPS.d.jobs.s === 'ok' ? OPS.d.jobs.data.filter(function (j) { return isExtractJob(j) && j.title === t.targetName && !jobActive(j); }) : [];
      return jobs[0] || null; // jobs arrive newest first
    }
    function taskDetail(t) {
      var f = document.createDocumentFragment(), h = head('Extract refresh: ' + t.targetName, (t.kind === 'workbook' ? 'Workbook' : 'Data source') + ' · ' + t.scheduleName); h.appendChild(backTo('Schedules')); f.appendChild(h);
      var m = msgNode(); if (m) f.appendChild(m);
      var lr = lastRun(t);
      f.appendChild(kv([['Target', (t.kind === 'workbook' ? 'Workbook: ' : 'Data source: ') + t.targetName], ['Refresh type', t.refreshType], ['Schedule', t.scheduleName], ['Frequency', t.frequency], ['Schedule state', t.state], ['Next run', dt(t.nextRunAt)],
        ['Priority', t.priority], ['Consecutive failures', chip(String(t.failures), t.failures ? 'bad' : 'ok')], ['Last run', lr ? chip(lr.status, jobKind(lr.status)) : '—'], ['Task ID', t.id]]));
      var ed = mk('div', 'ac-edit'), pr = mk('input', 'ac-search'); pr.type = 'number'; pr.min = 1; pr.max = 100; pr.value = t.priority || 50; pr.setAttribute('aria-label', 'Priority');
      add(ed, mk('label', null, 'Priority (1–100)'), pr, btn('Save priority', 'primary', function () { var v = Number(pr.value); if (!(v >= 1 && v <= 100)) { OPS.msg = { t: 'Priority must be 1–100', k: 'bad' }; render(); return; } act('Update extract priority', t.targetName, function () { return be().updateExtractTask(t.id, { priority: String(v) }); }, ['tasks']); }));
      f.appendChild(ed);
      var a = mk('div', 'ac-acts');
      a.appendChild(btn('Run now', 'primary', function () { act('Run extract refresh now', t.targetName, function () { return be().runExtractNow(t.id); }, ['jobs']); }));
      a.appendChild(confirmBtn('Delete schedule', '', function () { act('Delete extract refresh schedule', t.targetName, function () { return be().deleteExtractTask(t.id); }, ['tasks']).then(function () { OPS.sel = null; render(); }); }));
      f.appendChild(a);
      var hist = OPS.d.jobs.s === 'ok' ? OPS.d.jobs.data.filter(function (j) { return isExtractJob(j) && j.title === t.targetName; }).slice(0, 10) : [];
      var hl = mk('div', 'ac-list'); if (!hist.length) hl.appendChild(mk('div', 'ac-li', 'No recent runs found.'));
      hist.forEach(function (j) { var r = mk('div', 'ac-li'); add(r, chip(j.status, jobKind(j.status)), mk('span', null, dt(j.startedAt || j.createdAt)), mk('span', 'sub', dur(j.startedAt, j.endedAt))); hl.appendChild(r); });
      var c = card('Recent history', hl, 'wide'); c.style.marginTop = '12px'; f.appendChild(c);
      f.appendChild(rawCard(t.raw)); f.appendChild(auditCard()); return f;
    }
    function vExtracts() {
      var f = document.createDocumentFragment();
      f.appendChild(head('Extracts', 'Scheduled extract refreshes and their run history.'));
      need('tasks', 'jobs');
      f.appendChild(tabs([['sched', 'Scheduled refreshes'], ['hist', 'Run history']], OPS.xtab, function (t) { OPS.xtab = t; }));
      var nr = notReady('tasks', 'jobs'); if (nr) { f.appendChild(nr); return f; }
      if (OPS.sel) {
        var it = OPS.xtab === 'sched' ? find(OPS.d.tasks.data, OPS.sel) : find(OPS.d.jobs.data, OPS.sel);
        if (it) return OPS.xtab === 'sched' ? taskDetail(it) : jobDetail(it);
        OPS.sel = null;
      }
      var m = msgNode(); if (m) f.appendChild(m);
      if (OPS.xtab === 'sched') {
        var tasks = OPS.d.tasks.data;
        f.appendChild(listView({ placeholder: 'Search extract schedules', rows: tasks, reload: function () { opsLoad('tasks', true); opsLoad('jobs', true); render(); }, text: function (t) { return [t.targetName, t.scheduleName, t.refreshType].join(' '); },
          filters: [['All', function () { return true; }], ['Failing', function (t) { return t.failures > 0; }], ['Workbooks', function (t) { return t.kind === 'workbook'; }], ['Data sources', function (t) { return t.kind === 'datasource'; }]],
          cols: [['Target', function (t) { return link(t.targetName || t.id, function () { OPS.sel = t.id; OPS.msg = null; render(); }); }], ['Type', function (t) { return t.kind === 'workbook' ? 'Workbook' : 'Data source'; }], ['Refresh', function (t) { return t.refreshType; }],
            ['Schedule', function (t) { return t.scheduleName; }], ['Next run', function (t) { return dt(t.nextRunAt); }], ['Last run', function (t) { var l = lastRun(t); return l ? chip(l.status, jobKind(l.status)) : '—'; }],
            ['Failures', function (t) { return chip(String(t.failures), t.failures ? 'bad' : 'ok'); }]],
          actions: function (t) { return [btn('Run now', '', function () { act('Run extract refresh now', t.targetName, function () { return be().runExtractNow(t.id); }, ['jobs']); }), confirmBtn('Delete', '', function () { act('Delete extract refresh schedule', t.targetName, function () { return be().deleteExtractTask(t.id); }, ['tasks']); })]; } }));
      } else {
        var jobs = OPS.d.jobs.data.filter(isExtractJob);
        f.appendChild(listView({ placeholder: 'Search extract runs', rows: jobs, reload: function () { opsLoad('jobs', true); render(); }, text: function (j) { return [j.title, j.status, j.type].join(' '); },
          filters: [['All', function () { return true; }], ['Running / queued', jobActive], ['Failed', function (j) { return jobKind(j.status) === 'bad'; }], ['Succeeded', function (j) { return jobKind(j.status) === 'ok'; }]],
          cols: [['Status', function (j) { return chip(j.status, jobKind(j.status)); }], ['Target', function (j) { return link(j.title || j.id, function () { OPS.sel = j.id; OPS.msg = null; render(); }); }], ['Started', function (j) { return dt(j.startedAt || j.createdAt); }], ['Duration', function (j) { return j.startedAt ? dur(j.startedAt, j.endedAt || new Date().toISOString()) : '—'; }]],
          actions: function (j) { return [jobCancel(j)]; } }));
      }
      f.appendChild(auditCard()); return f;
    }

    /* ---- Logs ---- */
    function logKind(e) { return e.source === 'Job' ? jobKind(e.status) : e.source === 'Sign-in' ? 'ok' : ''; }
    function vLogs() {
      var f = document.createDocumentFragment();
      f.appendChild(head('Logs', 'Real site activity: content changes, sign-ins and background jobs, plus Admin Insights events when available.'));
      f.appendChild(tabs([['activity', 'Site activity'], ['insights', 'Admin Insights events'], ['session', 'This session']], OPS.ltab, function (t) { OPS.ltab = t; }));
      var m = msgNode(); if (m) f.appendChild(m);
      if (OPS.ltab === 'session') {
        var l = OPS.log;
        if (!l.length) { f.appendChild(mk('div', 'ac-empty', 'No admin actions taken yet this session.')); return f; }
        f.appendChild(table(['Time', 'Action', 'Target', 'Result'], l.map(function (a) { return row([a.at.toLocaleTimeString(), a.what, a.target || '', chip(a.res === 'Success' ? 'Success' : a.res, a.res === 'Success' ? 'ok' : 'bad')]); })));
        return f;
      }
      if (OPS.ltab === 'insights') {
        need('insights'); var nr = notReady('insights'); if (nr) { f.appendChild(nr); return f; }
        var d = OPS.d.insights.data, isDate = function (v) { return typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v); };
        function has(c) { return d.rows.some(function (r) { return r[c] != null && r[c] !== '' && r[c] !== 'Null'; }); }
        if (!d.cols) {
          var PRI = [/^event date/i, /^event name$/i, /^event type/i, /actor.*user.*name|^actor name/i, /actor.*email/i, /^item name$/i, /^historical item name/i, /^item type$/i, /item owner.*name/i, /item owner.*email/i, /project/i, /fail|status|result|success/i, /actor site role/i, /actor license/i], pk = [];
          PRI.forEach(function (re, i) { d.fields.forEach(function (c) { if (re.test(c) && pk.indexOf(c) < 0 && (i < 2 || has(c))) pk.push(c); }); });
          d.cols = pk.length ? pk.slice(0, 10) : d.fields.slice(0, 8);
        }
        f.appendChild(mk('div', 'ac-axis', 'Source: ' + d.source + ' (via VizQL Data Service) · ' + d.fields.length + ' fields available'));
        var pick = document.createElement('details'); pick.className = 'ac-raw'; pick.style.padding = '8px 12px'; pick.style.margin = '8px 0';
        pick.appendChild(mk('summary', null, 'Columns (' + d.cols.length + ' shown)'));
        var grid = mk('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 12px;margin-top:8px';
        d.fields.forEach(function (c) { var l = mk('label'); l.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:12px'; var cb = mk('input'); cb.type = 'checkbox'; cb.checked = d.cols.indexOf(c) > -1;
          cb.addEventListener('change', function () { d.cols = d.fields.filter(function (x) { return x === c ? cb.checked : d.cols.indexOf(x) > -1; }); OPS.keepOpen = true; render(); }); add(l, cb, mk('span', null, c + (has(c) ? '' : ' (empty)'))); grid.appendChild(l); });
        pick.appendChild(grid); if (OPS.keepOpen) { pick.open = true; OPS.keepOpen = false; } f.appendChild(pick);
        f.appendChild(listView({ placeholder: 'Search events', max: 1000, rows: d.rows, reload: function () { opsLoad('insights', true); render(); }, text: function (r) { return d.fields.map(function (c) { return r[c]; }).join(' '); },
          filters: [['All', function () { return true; }]],
          cols: d.cols.map(function (c) { return [c, function (r) { var v = r[c]; return isDate(v) ? dt(v) : v == null || v === '' ? '—' : String(v); }]; }), actions: function () { return []; } }));
        return f;
      }
      need('logs'); var nr2 = notReady('logs'); if (nr2) { f.appendChild(nr2); return f; }
      var ev = OPS.d.logs.data;
      f.appendChild(listView({ placeholder: 'Search activity by user, item or action', rows: ev, reload: function () { opsLoad('logs', true); render(); }, text: function (e) { return [e.actor, e.action, e.target, e.detail, e.source].join(' '); },
        filters: [['All', function () { return true; }], ['Content', function (e) { return e.source === 'Content'; }], ['Sign-ins', function (e) { return e.source === 'Sign-in'; }], ['Jobs', function (e) { return e.source === 'Job'; }], ['Failed jobs', function (e) { return e.source === 'Job' && jobKind(e.status) === 'bad'; }]],
        cols: [['Time', function (e) { return dt(e.at); }], ['Type', function (e) { return chip(e.source, logKind(e)); }], ['Actor', function (e) { return e.actor; }], ['Action', function (e) { return e.action; }], ['Target', function (e) { var d = mk('div'); add(d, mk('div', null, e.target), mk('div', 'ac-axis', e.detail || '')); return d; }]],
        actions: function () { return []; } }));
      return f;
    }

    /* ---- Users & Groups ---- */
    var ROLES = ['Creator', 'Explorer', 'ExplorerCanPublish', 'Viewer', 'SiteAdministratorCreator', 'SiteAdministratorExplorer', 'Unlicensed'];
    function uname(u) { return u.fullName || u.name || u.id; }
    function roleKind(r) { return /^SiteAdmin|ServerAdmin/.test(r) ? 'warn' : r === 'Unlicensed' ? 'bad' : 'ok'; }
    function cached(key, fn) { // lazy per-record fetch; returns the cache slot ({s, data, err})
      var c = OPS.cache[key]; if (c) return c;
      c = OPS.cache[key] = { s: 'loading' };
      var be0 = be();
      fn(be0).then(function (x) { c.s = 'ok'; c.data = x; }, function (e) { c.s = 'error'; c.err = e && e.message || 'failed'; }).then(function () { if (isOps()) render(); });
      return c;
    }
    function select(opts, val) { var s = mk('select', 'ac-select'); opts.forEach(function (o) { var arr = Array.isArray(o) ? o : [o, o]; var e = mk('option', null, arr[1]); e.value = arr[0]; s.appendChild(e); }); s.value = val; return s; }
    function userDetail(u) {
      var f = document.createDocumentFragment(), h = head(uname(u), (u.email || u.name) + ' · ' + u.role); h.appendChild(backTo('Users')); f.appendChild(h);
      var m = msgNode(); if (m) f.appendChild(m);
      f.appendChild(kv([['Name', u.fullName || '—'], ['Username', u.name], ['Email', u.email], ['Site role', chip(u.role, roleKind(u.role))], ['Authentication', u.authSetting], ['Last sign-in', u.lastLogin ? dt(u.lastLogin) + ' (' + ago(u.lastLogin) + ')' : 'Never'], ['User ID', u.id]]));
      var ed = mk('div', 'ac-edit'), fn = mk('input', 'ac-search'), em = mk('input', 'ac-search'), rs = select(ROLES, u.role);
      fn.value = u.fullName; fn.placeholder = 'Full name'; fn.setAttribute('aria-label', 'Full name'); em.value = u.email; em.placeholder = 'Email'; em.setAttribute('aria-label', 'Email');
      if (ROLES.indexOf(u.role) < 0) { var o = mk('option', null, u.role); o.value = u.role; rs.appendChild(o); rs.value = u.role; }
      add(ed, fn, em, rs, btn('Save changes', 'primary', function () {
        var ch = {}; if (fn.value.trim() !== u.fullName) ch.fullName = fn.value.trim(); if (em.value.trim() !== u.email) ch.email = em.value.trim(); if (rs.value !== u.role) ch.siteRole = rs.value;
        if (!Object.keys(ch).length) { OPS.msg = { t: 'No changes to save', k: '' }; render(); return; }
        act('Update user (' + Object.keys(ch).join(', ') + ')', uname(u), function () { return be().updateUser(u.id, ch); }, ['users']);
      }));
      f.appendChild(ed);
      var a = mk('div', 'ac-acts'); a.appendChild(confirmBtn('Remove from site', '', function () { act('Remove user from site', uname(u), function () { return be().removeUser(u.id); }, ['users', 'groups']).then(function () { OPS.sel = null; render(); }); })); f.appendChild(a);
      // group membership
      var ug = cached('ug:' + u.id, function (b) { return b.userGroups(u.id); }), gl = mk('div', 'ac-list');
      if (ug.s === 'loading') gl.appendChild(mk('div', 'ac-li', 'Loading groups…'));
      else if (ug.s === 'error') gl.appendChild(mk('div', 'ac-li', 'Couldn’t load groups: ' + ug.err));
      else {
        if (!ug.data.length) gl.appendChild(mk('div', 'ac-li', 'Not a member of any group.'));
        ug.data.forEach(function (g) { var r = mk('div', 'ac-li'); add(r, mk('b', null, g.name)); var rm = btn('Remove', '', function () { act('Remove from group', uname(u) + ' ← ' + g.name, function () { return be().removeFromGroup(g.id, u.id); }); }); rm.style.marginLeft = 'auto'; r.appendChild(rm); gl.appendChild(r); });
        var other = (OPS.d.groups.data || []).filter(function (g) { return !ug.data.some(function (x) { return x.id === g.id; }); });
        if (other.length) { var ad = mk('div', 'ac-edit'), gs = select(other.map(function (g) { return [g.id, g.name]; }), other[0].id); add(ad, gs, btn('Add to group', '', function () { var g = other.filter(function (x) { return x.id === gs.value; })[0]; act('Add to group', uname(u) + ' → ' + g.name, function () { return be().addToGroup(g.id, u.id); }); })); ad.style.marginTop = '8px'; gl.appendChild(ad); }
      }
      var gc = card('Group membership', gl, 'wide'); gc.style.marginTop = '12px'; f.appendChild(gc);
      f.appendChild(rawCard(u.raw)); f.appendChild(auditCard()); return f;
    }
    function groupDetail(g) {
      var f = document.createDocumentFragment(), h = head('Group: ' + g.name, g.domain + (g.minRole ? ' · min role ' + g.minRole : '')); h.appendChild(backTo('Groups')); f.appendChild(h);
      var m = msgNode(); if (m) f.appendChild(m);
      f.appendChild(kv([['Name', g.name], ['Domain', g.domain], ['Minimum site role', g.minRole], ['Group ID', g.id]]));
      var ed = mk('div', 'ac-edit'), nm = mk('input', 'ac-search'); nm.value = g.name; nm.setAttribute('aria-label', 'Group name');
      add(ed, mk('label', null, 'Name'), nm, btn('Rename', 'primary', function () { var v = nm.value.trim(); if (!v || v === g.name) return; act('Rename group', g.name + ' → ' + v, function () { return be().updateGroup(g.id, { name: v }); }, ['groups']); }));
      f.appendChild(ed);
      var a = mk('div', 'ac-acts'); a.appendChild(confirmBtn('Delete group', '', function () { act('Delete group', g.name, function () { return be().deleteGroup(g.id); }, ['groups']).then(function () { OPS.sel = null; render(); }); })); f.appendChild(a);
      var mem = cached('gm:' + g.id, function (b) { return b.groupMembers(g.id); }), ml = mk('div', 'ac-list');
      if (mem.s === 'loading') ml.appendChild(mk('div', 'ac-li', 'Loading members…'));
      else if (mem.s === 'error') ml.appendChild(mk('div', 'ac-li', 'Couldn’t load members: ' + mem.err));
      else {
        if (!mem.data.length) ml.appendChild(mk('div', 'ac-li', 'No members.'));
        mem.data.forEach(function (u) { var r = mk('div', 'ac-li'); add(r, mk('b', null, u.name), mk('span', 'sub', u.email)); var rm = btn('Remove', '', function () { act('Remove from group', u.name + ' ← ' + g.name, function () { return be().removeFromGroup(g.id, u.id); }); }); r.appendChild(rm); ml.appendChild(r); });
        var other = (OPS.d.users.data || []).filter(function (u) { return !mem.data.some(function (x) { return x.id === u.id; }); });
        if (other.length) { var ad = mk('div', 'ac-edit'), us = select(other.map(function (u) { return [u.id, uname(u) + (u.email ? ' (' + u.email + ')' : '')]; }), other[0].id); add(ad, us, btn('Add member', '', function () { var u = other.filter(function (x) { return x.id === us.value; })[0]; act('Add to group', uname(u) + ' → ' + g.name, function () { return be().addToGroup(g.id, u.id); }); })); ad.style.marginTop = '8px'; ml.appendChild(ad); }
      }
      var mc = card('Members (' + (mem.s === 'ok' ? mem.data.length : '…') + ')', ml, 'wide'); mc.style.marginTop = '12px'; f.appendChild(mc);
      f.appendChild(rawCard(g.raw)); f.appendChild(auditCard()); return f;
    }
    function vUsers() {
      var f = document.createDocumentFragment();
      f.appendChild(head('Users & groups', 'Everyone on the site and the groups they belong to. Click a row to audit or manage.'));
      need('users', 'groups');
      f.appendChild(tabs([['users', 'Users'], ['groups', 'Groups']], OPS.utab, function (t) { OPS.utab = t; }));
      var nr = notReady('users', 'groups'); if (nr) { f.appendChild(nr); return f; }
      if (OPS.sel) {
        var it = find(OPS.d[OPS.utab].data, OPS.sel);
        if (it) return OPS.utab === 'users' ? userDetail(it) : groupDetail(it);
        OPS.sel = null;
      }
      var m = msgNode(); if (m) f.appendChild(m);
      if (OPS.utab === 'users') {
        var add1 = mk('div', 'ac-edit'), nu = mk('input', 'ac-search'), nr2 = select(ROLES, 'Viewer'); nu.placeholder = 'Username or email to add'; nu.setAttribute('aria-label', 'New user');
        add(add1, nu, nr2, btn('Add user', 'primary', function () { var v = nu.value.trim(); if (!v) return; act('Add user', v + ' (' + nr2.value + ')', function () { return be().addUser(v, nr2.value); }, ['users']); }));
        f.appendChild(add1);
        var now = Date.now();
        f.appendChild(listView({ placeholder: 'Search users by name or email', rows: OPS.d.users.data, reload: function () { opsLoad('users', true); opsLoad('groups', true); render(); }, text: function (u) { return [u.fullName, u.name, u.email, u.role].join(' '); },
          filters: [['All', function () { return true; }], ['Active (30d)', function (u) { var t = Date.parse(u.lastLogin); return !isNaN(t) && now - t <= 30 * 864e5; }], ['Inactive 90d+', function (u) { var t = Date.parse(u.lastLogin); return isNaN(t) || now - t > 90 * 864e5; }], ['Admins', function (u) { return /Admin/.test(u.role); }], ['Unlicensed', function (u) { return u.role === 'Unlicensed'; }]],
          cols: [['Name', function (u) { return link(uname(u), function () { OPS.sel = u.id; OPS.msg = null; render(); }); }], ['Email', function (u) { return u.email || '—'; }], ['Site role', function (u) { return chip(u.role, roleKind(u.role)); }], ['Last sign-in', function (u) { return u.lastLogin ? ago(u.lastLogin) : 'Never'; }]],
          actions: function (u) { return [confirmBtn('Remove', '', function () { act('Remove user from site', uname(u), function () { return be().removeUser(u.id); }, ['users', 'groups']); })]; } }));
      } else {
        var add2 = mk('div', 'ac-edit'), ng = mk('input', 'ac-search'); ng.placeholder = 'New group name'; ng.setAttribute('aria-label', 'New group name');
        add(add2, ng, btn('Create group', 'primary', function () { var v = ng.value.trim(); if (!v) return; act('Create group', v, function () { return be().createGroup(v); }, ['groups']); }));
        f.appendChild(add2);
        f.appendChild(listView({ placeholder: 'Search groups', rows: OPS.d.groups.data, reload: function () { opsLoad('groups', true); render(); }, text: function (g) { return [g.name, g.domain].join(' '); },
          filters: [['All', function () { return true; }], ['Local', function (g) { return g.domain === 'local'; }], ['Imported', function (g) { return g.domain !== 'local'; }]],
          cols: [['Group', function (g) { return link(g.name, function () { OPS.sel = g.id; OPS.msg = null; render(); }); }], ['Domain', function (g) { return g.domain; }], ['Minimum role', function (g) { return g.minRole || '—'; }]],
          actions: function (g) { return [confirmBtn('Delete', '', function () { act('Delete group', g.name, function () { return be().deleteGroup(g.id); }, ['groups']); })]; } }));
      }
      f.appendChild(auditCard()); return f;
    }
    var VIEWS = { jobs: vJobs, extracts: vExtracts, overview: vOverview, approvals: vApprovals, users: vUsers, content: vContent, logs: vLogs, settings: vSettings };
    function render() { renderNav(); main.textContent = ''; main.appendChild(VIEWS[S.view]()); syncBadge(); }
    render(); load();
    var unsub = window.TFConn ? TFConn.subscribe(function () { resetOps(); load(); if (isOps()) render(); }) : null;

    parent.appendChild(win);
    var mgr = WinMgr.manage(win, { bar: bar, w: 960, h: 600, minW: 560, minH: 380, dx: 36, dy: 24, onMaxChange: syncMax });
    bMax.addEventListener('click', function () { mgr.toggleMax(); });
    return { el: win, raise: mgr.raise, destroy: function () { if (unsub) unsub(); mgr.destroy(); win.remove(); } };
  }
  window.AdminCenter = { create: create };
})();
