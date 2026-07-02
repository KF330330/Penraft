import { db } from './index.js';
import { config } from '../config.js';
import { nowMs } from '../utils/time.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// 只清理"只增不删"的追加型表；devices 是设备注册表（每设备一行），不清理。
const purgeWebEvents = db.prepare('DELETE FROM web_events WHERE created_at < ?');
const purgePings = db.prepare('DELETE FROM device_pings WHERE created_at < ?');

// 删除超过保留期的埋点行。返回删除计数；retentionDays <= 0 时跳过（关闭清理）。
export function purgeOldTelemetry() {
  const days = config.retentionDays;
  if (!days || days <= 0) return { skipped: true };
  const cutoff = nowMs() - days * DAY_MS;
  const webEvents = purgeWebEvents.run(cutoff).changes;
  const devicePings = purgePings.run(cutoff).changes;
  return { cutoff, days, webEvents, devicePings };
}

// 启动时清一次，之后每 24h 清一次。定时器 unref，避免阻止进程正常退出。
export function startRetentionJob(logger) {
  const run = () => {
    try {
      const r = purgeOldTelemetry();
      if (logger && !r.skipped) logger.info({ retention: r }, 'telemetry retention purge done');
    } catch (err) {
      if (logger) logger.error({ err }, 'telemetry retention purge failed');
    }
  };
  run();
  const timer = setInterval(run, DAY_MS);
  if (timer.unref) timer.unref();
  return timer;
}
