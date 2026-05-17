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
  dashboardPass: process.env.DASHBOARD_PASS || 'change-me-please',
  corsOrigin: parseList(process.env.CORS_ORIGIN || ''),
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN || 60),
  dailySaltSeed: process.env.DAILY_SALT_SEED || 'penraft-default-salt-seed',
  nodeEnv: process.env.NODE_ENV || 'development',
};
