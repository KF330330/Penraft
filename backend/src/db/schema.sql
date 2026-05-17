-- 时间戳一律 epoch ms (INTEGER) 入库；对外 API 用 ISO8601，服务端在 utils/time.js 转换。

CREATE TABLE IF NOT EXISTS web_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type   TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  page         TEXT,
  referrer     TEXT,
  session_id   TEXT,
  ip_hash      TEXT,
  ua           TEXT,
  country      TEXT,
  meta_json    TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_events_created  ON web_events(created_at);
CREATE INDEX IF NOT EXISTS idx_web_events_type_ts  ON web_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_web_events_name_ts  ON web_events(event_name, created_at);

CREATE TABLE IF NOT EXISTS devices (
  device_id     TEXT PRIMARY KEY,
  platform      TEXT NOT NULL,
  os_version    TEXT,
  app_version   TEXT NOT NULL,
  locale        TEXT,
  installed_at  INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  ping_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_devices_installed ON devices(installed_at);

CREATE TABLE IF NOT EXISTS device_pings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id    TEXT NOT NULL,
  kind         TEXT NOT NULL,
  app_version  TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pings_device_ts ON device_pings(device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pings_created   ON device_pings(created_at);
