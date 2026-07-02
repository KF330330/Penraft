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

// 30 天活跃窗口（毫秒），MAU 口径
export const MAU_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// 按粒度生成 SQLite strftime 分桶字符串
// 显式 '+8 hours'（东八区，无夏令时）：不用 'localtime'，避免依赖容器 TZ 设置
export function granularityBucket(granularity) {
  if (granularity === 'hour') return "strftime('%Y-%m-%dT%H:00', created_at/1000, 'unixepoch', '+8 hours')";
  return "strftime('%Y-%m-%d', created_at/1000, 'unixepoch', '+8 hours')";
}
