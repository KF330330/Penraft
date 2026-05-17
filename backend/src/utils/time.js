export function toMs(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function nowMs() {
  return Date.now();
}

// 7 天卸载阈值（毫秒）
export const UNINSTALL_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

// 按粒度生成 SQLite strftime 分桶字符串
export function granularityBucket(granularity) {
  if (granularity === 'hour') return "strftime('%Y-%m-%dT%H:00:00Z', created_at/1000, 'unixepoch')";
  return "strftime('%Y-%m-%d', created_at/1000, 'unixepoch')";
}
