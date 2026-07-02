import { db } from '../db/index.js';
import { nowMs, toMs, UNINSTALL_THRESHOLD_MS, MAU_WINDOW_MS, granularityBucket } from '../utils/time.js';

export default async function dashboardStatsRoutes(fastify) {
  fastify.get('/api/dashboard/stats', async (request, reply) => {
    const q = request.query || {};
    const granularity = q.granularity === 'hour' ? 'hour' : 'day';
    const now = nowMs();
    const toT = toMs(q.to) ?? now;
    const fromT = toMs(q.from) ?? (toT - 7 * 24 * 60 * 60 * 1000);
    if (fromT > toT) {
      reply.code(400).send({ error: 'from > to' });
      return;
    }
    const bucket = granularityBucket(granularity);

    const viewsSeries = db.prepare(`
      SELECT ${bucket} AS t, COUNT(*) AS n
        FROM web_events
       WHERE event_type='view' AND created_at BETWEEN ? AND ?
       GROUP BY t ORDER BY t
    `).all(fromT, toT);

    const clicksSeries = db.prepare(`
      SELECT ${bucket} AS t, COUNT(*) AS n
        FROM web_events
       WHERE event_type='click' AND created_at BETWEEN ? AND ?
       GROUP BY t ORDER BY t
    `).all(fromT, toT);

    const clicksByName = db.prepare(`
      SELECT event_name, COUNT(*) AS n
        FROM web_events
       WHERE event_type='click' AND created_at BETWEEN ? AND ?
       GROUP BY event_name ORDER BY n DESC LIMIT 10
    `).all(fromT, toT);

    // 独立访客（vid 存在 meta_json 里）与会话数
    const uv = db.prepare(`
      SELECT COUNT(DISTINCT json_extract(meta_json, '$.vid')) AS n
        FROM web_events
       WHERE created_at BETWEEN ? AND ? AND json_extract(meta_json, '$.vid') IS NOT NULL
    `).get(fromT, toT).n;

    const sessions = db.prepare(`
      SELECT COUNT(DISTINCT session_id) AS n
        FROM web_events
       WHERE created_at BETWEEN ? AND ? AND session_id IS NOT NULL
    `).get(fromT, toT).n;

    const uvSeries = db.prepare(`
      SELECT ${bucket} AS t, COUNT(DISTINCT json_extract(meta_json, '$.vid')) AS n
        FROM web_events
       WHERE created_at BETWEEN ? AND ? AND json_extract(meta_json, '$.vid') IS NOT NULL
       GROUP BY t ORDER BY t
    `).all(fromT, toT);

    // UTM 来源分布（按 page_view 计）
    const utmSources = db.prepare(`
      SELECT COALESCE(json_extract(meta_json, '$.utm_source'), '(direct)') AS source,
             COUNT(*) AS n
        FROM web_events
       WHERE event_name='page_view' AND created_at BETWEEN ? AND ?
       GROUP BY source ORDER BY n DESC LIMIT 10
    `).all(fromT, toT);

    // download_click 聚合：总数 + 按位置 + 按平台/架构
    const downloadsTotal = db.prepare(`
      SELECT COUNT(*) AS n
        FROM web_events
       WHERE event_name='download_click' AND created_at BETWEEN ? AND ?
    `).get(fromT, toT).n;

    const downloadsByPosition = db.prepare(`
      SELECT COALESCE(json_extract(meta_json, '$.position'), 'unknown') AS position,
             COUNT(*) AS n
        FROM web_events
       WHERE event_name='download_click' AND created_at BETWEEN ? AND ?
       GROUP BY position ORDER BY n DESC
    `).all(fromT, toT);

    const downloadsByPlatformArch = db.prepare(`
      SELECT COALESCE(json_extract(meta_json, '$.platform'), 'unknown') AS platform,
             COALESCE(json_extract(meta_json, '$.arch'),     'unknown') AS arch,
             COUNT(*) AS n
        FROM web_events
       WHERE event_name='download_click' AND created_at BETWEEN ? AND ?
       GROUP BY platform, arch ORDER BY n DESC
    `).all(fromT, toT);

    const cutoff = now - UNINSTALL_THRESHOLD_MS;
    const totalDevices = db.prepare(`SELECT COUNT(*) AS n FROM devices`).get().n;
    const activeDevices = db.prepare(`SELECT COUNT(*) AS n FROM devices WHERE last_seen_at >= ?`).get(cutoff).n;
    const uninstalledDevices = totalDevices - activeDevices;
    const mauDevices = db.prepare(`SELECT COUNT(*) AS n FROM devices WHERE last_seen_at >= ?`).get(now - MAU_WINDOW_MS).n;

    const installsSeries = db.prepare(`
      SELECT ${bucket} AS t, COUNT(*) AS n
        FROM device_pings
       WHERE kind='install' AND created_at BETWEEN ? AND ?
       GROUP BY t ORDER BY t
    `).all(fromT, toT);

    const dauSeries = db.prepare(`
      SELECT ${bucket} AS t, COUNT(DISTINCT device_id) AS n
        FROM device_pings
       WHERE created_at BETWEEN ? AND ?
       GROUP BY t ORDER BY t
    `).all(fromT, toT);

    const versionDistribution = db.prepare(`
      SELECT app_version, COUNT(*) AS n
        FROM devices
       WHERE last_seen_at >= ?
       GROUP BY app_version ORDER BY n DESC
    `).all(cutoff);

    // 平台 / OS 分布（活跃设备，与版本分布同口径）
    const platformDistribution = db.prepare(`
      SELECT platform, COALESCE(os_version, 'unknown') AS os_version, COUNT(*) AS n
        FROM devices
       WHERE last_seen_at >= ?
       GROUP BY platform, os_version ORDER BY n DESC
    `).all(cutoff);

    const iso = (ms) => new Date(ms).toISOString();
    reply.send({
      range: { from: iso(fromT), to: iso(toT), granularity },
      web: {
        views_series: viewsSeries,
        clicks_series: clicksSeries,
        clicks_by_name: clicksByName,
        uv,
        sessions,
        uv_series: uvSeries,
        utm_sources: utmSources,
        downloads: {
          total: downloadsTotal,
          by_position: downloadsByPosition,
          by_platform_arch: downloadsByPlatformArch,
        },
      },
      app: {
        total_devices: totalDevices,
        active_devices: activeDevices,
        uninstalled_devices: uninstalledDevices,
        mau_devices: mauDevices,
        new_installs_series: installsSeries,
        dau_series: dauSeries,
        version_distribution: versionDistribution,
        platform_distribution: platformDistribution,
      },
    });
  });
}
