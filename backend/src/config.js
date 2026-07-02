import 'dotenv/config';
import path from 'node:path';

const root = path.resolve(process.cwd());

function parseList(s) {
  return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  dbPath: path.isAbsolute(process.env.DB_PATH || '')
    ? process.env.DB_PATH
    : path.join(root, process.env.DB_PATH || './data/penraft.db'),
  dashboardUser: process.env.DASHBOARD_USER || 'admin',
  // 不设默认口令：缺失时留空，由 authRoutes 在启动时校验并拒绝启动，
  // 避免 .env 漏配时带弱口令 'change-me-please' 静默上线。
  dashboardPass: process.env.DASHBOARD_PASS || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  corsOrigin: parseList(process.env.CORS_ORIGIN || ''),
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN || 60),
  // 埋点表保留天数：超期的 web_events / device_pings 行会被定期清理。0 或负数关闭清理。
  retentionDays: Number(process.env.RETENTION_DAYS || 180),
  dailySaltSeed: process.env.DAILY_SALT_SEED || 'penraft-default-salt-seed',
  nodeEnv: process.env.NODE_ENV || 'development',
};
