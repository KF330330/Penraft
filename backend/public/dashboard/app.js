(function () {
  'use strict';

  const state = {
    from: null,           // ISO8601
    to: null,
    granularity: 'day',
    preset: '7d',
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

  function syncUI() {
    document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', b.dataset.preset === state.preset));
    document.querySelectorAll('[data-granularity]').forEach(b => b.classList.toggle('active', b.dataset.granularity === state.granularity));
    document.querySelector('.custom-range').classList.toggle('hidden', state.preset !== 'custom');
  }

  function writeHash() {
    const h = new URLSearchParams({ from: state.from, to: state.to, g: state.granularity, p: state.preset });
    history.replaceState(null, '', '#' + h.toString());
  }

  function readHash() {
    if (!location.hash || location.hash.length < 2) return false;
    const h = new URLSearchParams(location.hash.slice(1));
    const from = h.get('from'), to = h.get('to'), g = h.get('g'), p = h.get('p');
    if (!from || !to) return false;
    state.from = from; state.to = to;
    state.granularity = g === 'hour' ? 'hour' : 'day';
    state.preset = p || 'custom';
    return true;
  }

  async function fetchAndRender() {
    setStatus('加载中…');
    try {
      const q = new URLSearchParams({ from: state.from, to: state.to, granularity: state.granularity });
      const res = await fetch('/api/dashboard/stats?' + q.toString(), { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      render(data);
      setStatus('更新于 ' + new Date().toLocaleTimeString());
    } catch (err) {
      setStatus('加载失败: ' + err.message);
    }
  }

  function setStatus(msg) { document.getElementById('status').textContent = msg; }

  function makeOrUpdate(id, cfg) {
    const ctx = document.getElementById(id);
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

  function render(d) {
    // ① 曝光折线 + 点击折线
    const labels = d.web.views_series.map(p => p.t);
    const clickLabels = d.web.clicks_series.map(p => p.t);
    const allLabels = Array.from(new Set([...labels, ...clickLabels])).sort();
    const viewMap = Object.fromEntries(d.web.views_series.map(p => [p.t, p.n]));
    const clickMap = Object.fromEntries(d.web.clicks_series.map(p => [p.t, p.n]));
    makeOrUpdate('chart-views', {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          { label: '曝光 view', data: allLabels.map(t => viewMap[t] || 0), borderColor: '#5b8cff', backgroundColor: 'rgba(91,140,255,0.15)', fill: true, tension: 0.25 },
          { label: '点击 click', data: allLabels.map(t => clickMap[t] || 0), borderColor: '#ff7a59', backgroundColor: 'rgba(255,122,89,0.10)', fill: false, tension: 0.25 },
        ],
      },
      options: baseOpts,
    });

    // ② 点击 TOP10 柱状
    makeOrUpdate('chart-clicks-by-name', {
      type: 'bar',
      data: {
        labels: d.web.clicks_by_name.map(x => x.event_name),
        datasets: [{ label: '点击次数', data: d.web.clicks_by_name.map(x => x.n), backgroundColor: '#5b8cff' }],
      },
      options: { ...baseOpts, indexAxis: 'y' },
    });

    // ③ 设备总览
    document.getElementById('num-active').textContent = d.app.active_devices.toLocaleString();
    document.getElementById('num-uninstalled').textContent = d.app.uninstalled_devices.toLocaleString();
    document.getElementById('num-total').textContent = d.app.total_devices.toLocaleString();
    makeOrUpdate('chart-device-ratio', {
      type: 'doughnut',
      data: {
        labels: ['活跃', '已卸载'],
        datasets: [{ data: [d.app.active_devices, d.app.uninstalled_devices], backgroundColor: ['#5b8cff', '#3b3f49'] }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: TEXT_COLOR } } } },
    });

    // ④ DAU 折线
    makeOrUpdate('chart-dau', {
      type: 'line',
      data: {
        labels: d.app.dau_series.map(p => p.t),
        datasets: [
          { label: 'DAU (心跳唯一设备)', data: d.app.dau_series.map(p => p.n), borderColor: '#ffb547', backgroundColor: 'rgba(255,181,71,0.15)', fill: true, tension: 0.25 },
          { label: '新装', data: d.app.new_installs_series.map(p => p.n), borderColor: '#5cd97a', backgroundColor: 'rgba(92,217,122,0.10)', fill: false, tension: 0.25 },
        ],
      },
      options: baseOpts,
    });

    // 版本分布 pie
    makeOrUpdate('chart-version', {
      type: 'pie',
      data: {
        labels: d.app.version_distribution.map(v => v.app_version),
        datasets: [{ data: d.app.version_distribution.map(v => v.n), backgroundColor: ['#5b8cff', '#ff7a59', '#ffb547', '#5cd97a', '#a98cff', '#3b3f49'] }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: TEXT_COLOR } } } },
    });
  }

  // 事件绑定
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
    state.from = new Date(f + 'T00:00:00Z').toISOString();
    state.to = new Date(t + 'T23:59:59Z').toISOString();
    state.preset = 'custom'; syncUI(); writeHash(); fetchAndRender();
  });

  if (readHash()) { syncUI(); fetchAndRender(); } else { applyPreset('7d'); }
})();
