(function () {
  'use strict';

  const state = {
    from: null,
    to: null,
    granularity: 'day',
    preset: '7d',
    tab: 'web',          // 'web' | 'app'
    lastData: null,
  };

  const charts = {};

  function isoNow() { return new Date().toISOString(); }
  function isoDaysAgo(d) { return new Date(Date.now() - d * 86400000).toISOString(); }
  function startOfToday() {
    const d = new Date(); d.setHours(0,0,0,0); return d.toISOString();
  }

  function applyPreset(preset) {
    state.preset = preset;
    if (preset === 'today')      { state.from = startOfToday(); state.to = isoNow(); }
    else if (preset === '7d')    { state.from = isoDaysAgo(7);  state.to = isoNow(); }
    else if (preset === '30d')   { state.from = isoDaysAgo(30); state.to = isoNow(); state.granularity = 'day'; }
    syncUI(); writeHash(); fetchAndRender();
  }

  function setTab(tab) {
    if (tab !== 'web' && tab !== 'app') return;
    state.tab = tab;
    document.querySelectorAll('.tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
    writeHash();
  }

  function syncUI() {
    document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', b.dataset.preset === state.preset));
    document.querySelectorAll('[data-granularity]').forEach(b => b.classList.toggle('active', b.dataset.granularity === state.granularity));
    document.querySelector('.custom-range').classList.toggle('hidden', state.preset !== 'custom');
  }

  function writeHash() {
    const h = new URLSearchParams({ tab: state.tab, from: state.from, to: state.to, g: state.granularity, p: state.preset });
    history.replaceState(null, '', '#' + h.toString());
  }

  function readHash() {
    if (!location.hash || location.hash.length < 2) return false;
    const h = new URLSearchParams(location.hash.slice(1));
    const from = h.get('from'), to = h.get('to'), g = h.get('g'), p = h.get('p'), t = h.get('tab');
    state.tab = t === 'app' ? 'app' : 'web';
    if (!from || !to) return false;
    state.from = from; state.to = to;
    state.granularity = g === 'hour' ? 'hour' : 'day';
    state.preset = p || 'custom';
    return true;
  }

  // 把 preset 重新折算成 [from, to]。custom 不动；today/7d/30d 的 to 永远是 now，
  // 这样 auto-refresh 能看到最新事件，不会被锁在加载页面那一刻。
  function refreshTimeWindow() {
    if (state.preset === 'today')      { state.from = startOfToday(); state.to = isoNow(); }
    else if (state.preset === '7d')    { state.from = isoDaysAgo(7);  state.to = isoNow(); }
    else if (state.preset === '30d')   { state.from = isoDaysAgo(30); state.to = isoNow(); }
    // custom: 用户手工选的固定范围，不动
  }

  async function fetchAndRender() {
    refreshTimeWindow();
    setStatus('加载中…');
    try {
      const q = new URLSearchParams({ from: state.from, to: state.to, granularity: state.granularity });
      const res = await fetch('/api/dashboard/stats?' + q.toString(), { credentials: 'include' });
      if (res.status === 401) {
        location.replace('/dashboard/login.html');
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      state.lastData = data;
      render(data);
      setStatus('更新于 ' + new Date().toLocaleTimeString());
    } catch (err) {
      setStatus('加载失败：' + err.message);
    }
  }

  function setStatus(msg) { document.getElementById('status').textContent = msg; }

  function makeOrUpdate(id, cfg) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) {
      charts[id].data = cfg.data;
      charts[id].options = cfg.options;
      charts[id].update();
    } else {
      charts[id] = new Chart(ctx, cfg);
    }
  }

  const TEXT_COLOR = '#e6e7eb';
  const GRID_COLOR = 'rgba(255,255,255,0.06)';
  const baseAxis = {
    ticks: { color: TEXT_COLOR, font: { size: 11 } },
    grid: { color: GRID_COLOR },
  };
  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: TEXT_COLOR } } },
    scales: { x: baseAxis, y: { ...baseAxis, beginAtZero: true } },
  };

  function sumSeries(series) {
    if (!series || series.length === 0) return 0;
    let s = 0;
    for (const p of series) s += Number(p.n) || 0;
    return s;
  }
  function fmt(n) { return Number(n).toLocaleString(); }
  function pct(num, denom) {
    if (!denom) return '—';
    return ((num / denom) * 100).toFixed(1) + '%';
  }

  function render(d) {
    // ============ 官网 tab ============
    const totalViews = sumSeries(d.web.views_series);
    const totalClicks = sumSeries(d.web.clicks_series);
    document.getElementById('web-uv').textContent = fmt(d.web.uv || 0);
    document.getElementById('web-sessions').textContent = fmt(d.web.sessions || 0);
    document.getElementById('web-total-views').textContent = fmt(totalViews);
    document.getElementById('web-total-clicks').textContent = fmt(totalClicks);
    document.getElementById('web-ctr').textContent = pct(totalClicks, totalViews);

    const uvSeries = d.web.uv_series || [];
    const labels = d.web.views_series.map(p => p.t);
    const clickLabels = d.web.clicks_series.map(p => p.t);
    const uvLabels = uvSeries.map(p => p.t);
    const allLabels = Array.from(new Set([...labels, ...clickLabels, ...uvLabels])).sort();
    const viewMap = Object.fromEntries(d.web.views_series.map(p => [p.t, p.n]));
    const clickMap = Object.fromEntries(d.web.clicks_series.map(p => [p.t, p.n]));
    const uvMap = Object.fromEntries(uvSeries.map(p => [p.t, p.n]));
    makeOrUpdate('chart-web-trend', {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          { label: '曝光 view', data: allLabels.map(t => viewMap[t] || 0), borderColor: '#5b8cff', backgroundColor: 'rgba(91,140,255,0.18)', fill: true, tension: 0.25, pointRadius: 2.5 },
          { label: '点击 click', data: allLabels.map(t => clickMap[t] || 0), borderColor: '#ff7a59', backgroundColor: 'rgba(255,122,89,0.10)', fill: false, tension: 0.25, pointRadius: 2.5 },
          { label: '访客 UV', data: allLabels.map(t => uvMap[t] || 0), borderColor: '#5cd97a', backgroundColor: 'rgba(92,217,122,0.10)', fill: false, tension: 0.25, pointRadius: 2.5 },
        ],
      },
      options: baseOpts,
    });

    makeOrUpdate('chart-web-clicks-by-name', {
      type: 'bar',
      data: {
        labels: d.web.clicks_by_name.map(x => x.event_name),
        datasets: [{ label: '点击次数', data: d.web.clicks_by_name.map(x => x.n), backgroundColor: '#5b8cff', borderRadius: 4 }],
      },
      options: { ...baseOpts, indexAxis: 'y' },
    });

    // ============ 下载点击 ============
    const dl = d.web.downloads || { total: 0, by_position: [], by_platform_arch: [] };
    document.getElementById('web-downloads-total').textContent = fmt(dl.total);
    makeOrUpdate('chart-web-downloads-by-position', {
      type: 'bar',
      data: {
        labels: dl.by_position.map(x => x.position),
        datasets: [{ label: '点击次数', data: dl.by_position.map(x => x.n), backgroundColor: '#5cd97a', borderRadius: 4 }],
      },
      options: { ...baseOpts, indexAxis: 'y' },
    });
    makeOrUpdate('chart-web-downloads-by-platform', {
      type: 'bar',
      data: {
        labels: dl.by_platform_arch.map(x => `${x.platform}/${x.arch}`),
        datasets: [{ label: '点击次数', data: dl.by_platform_arch.map(x => x.n), backgroundColor: '#ffb547', borderRadius: 4 }],
      },
      options: { ...baseOpts, indexAxis: 'y' },
    });

    // ============ 来源 UTM ============
    const utm = d.web.utm_sources || [];
    makeOrUpdate('chart-web-utm-sources', {
      type: 'bar',
      data: {
        labels: utm.map(x => x.source),
        datasets: [{ label: 'page_view 次数', data: utm.map(x => x.n), backgroundColor: '#a98cff', borderRadius: 4 }],
      },
      options: { ...baseOpts, indexAxis: 'y' },
    });

    // ============ App tab ============
    document.getElementById('app-active').textContent = fmt(d.app.active_devices);
    document.getElementById('app-mau').textContent = fmt(d.app.mau_devices || 0);
    document.getElementById('app-uninstalled').textContent = fmt(d.app.uninstalled_devices);
    document.getElementById('app-total').textContent = fmt(d.app.total_devices);
    makeOrUpdate('chart-app-ratio', {
      type: 'doughnut',
      data: {
        labels: ['活跃', '沉寂'],
        datasets: [{ data: [d.app.active_devices, d.app.uninstalled_devices], backgroundColor: ['#5b8cff', '#3b3f49'], borderColor: 'transparent' }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: TEXT_COLOR, font: { size: 11 } } } } },
    });

    makeOrUpdate('chart-app-dau', {
      type: 'line',
      data: {
        labels: d.app.dau_series.map(p => p.t),
        datasets: [
          { label: 'DAU', data: d.app.dau_series.map(p => p.n), borderColor: '#ffb547', backgroundColor: 'rgba(255,181,71,0.18)', fill: true, tension: 0.25, pointRadius: 2.5 },
          { label: '新装', data: d.app.new_installs_series.map(p => p.n), borderColor: '#5cd97a', backgroundColor: 'rgba(92,217,122,0.10)', fill: false, tension: 0.25, pointRadius: 2.5 },
        ],
      },
      options: baseOpts,
    });

    makeOrUpdate('chart-app-version', {
      type: 'doughnut',
      data: {
        labels: d.app.version_distribution.map(v => v.app_version),
        datasets: [{ data: d.app.version_distribution.map(v => v.n), backgroundColor: ['#5b8cff', '#ff7a59', '#ffb547', '#5cd97a', '#a98cff', '#3b3f49'], borderColor: 'transparent' }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '50%', plugins: { legend: { position: 'right', labels: { color: TEXT_COLOR, font: { size: 11 } } } } },
    });

    const pf = d.app.platform_distribution || [];
    makeOrUpdate('chart-app-platform', {
      type: 'bar',
      data: {
        labels: pf.map(x => `${x.platform} / ${x.os_version}`),
        datasets: [{ label: '设备数', data: pf.map(x => x.n), backgroundColor: '#5cd97a', borderRadius: 4 }],
      },
      options: { ...baseOpts, indexAxis: 'y' },
    });
  }

  async function fetchMe() {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (res.status === 401) { location.replace('/dashboard/login.html'); return; }
      const data = await res.json();
      if (data && data.user) {
        document.getElementById('user-name').textContent = data.user;
      }
    } catch { /* ignore */ }
  }

  async function logout() {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    location.replace('/dashboard/login.html');
  }

  // 事件绑定
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.preset === 'custom') {
        state.preset = 'custom'; syncUI();
      } else {
        applyPreset(btn.dataset.preset);
      }
    });
  });
  document.querySelectorAll('[data-granularity]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.granularity = btn.dataset.granularity;
      syncUI(); writeHash(); fetchAndRender();
    });
  });
  document.getElementById('apply-range').addEventListener('click', () => {
    const f = document.getElementById('from-date').value;
    const t = document.getElementById('to-date').value;
    if (!f || !t) return;
    // 本地时区解析（与"今天"预设的本地零点口径一致，后端按 UTC+8 分桶）
    state.from = new Date(f + 'T00:00:00').toISOString();
    state.to = new Date(t + 'T23:59:59.999').toISOString();
    state.preset = 'custom'; syncUI(); writeHash(); fetchAndRender();
  });
  document.getElementById('logout-btn').addEventListener('click', logout);

  // 启动
  fetchMe();
  if (readHash()) { syncUI(); setTab(state.tab); fetchAndRender(); }
  else { applyPreset('7d'); setTab('web'); }

  // 自动刷新：每 15s 拉一次最新数据；标签隐藏时暂停以省电
  let autoRefreshTimer = null;
  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchAndRender();
    }, 15000);
  }
  function stopAutoRefresh() {
    if (autoRefreshTimer !== null) { window.clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { fetchAndRender(); startAutoRefresh(); }
    else stopAutoRefresh();
  });
  startAutoRefresh();
})();
