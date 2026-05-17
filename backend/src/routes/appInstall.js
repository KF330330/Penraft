import { db } from '../db/index.js';
import { nowMs } from '../utils/time.js';

const insertDevice = db.prepare(`
  INSERT INTO devices (device_id, platform, os_version, app_version, locale, installed_at, last_seen_at, ping_count)
  VALUES (@device_id, @platform, @os_version, @app_version, @locale, @installed_at, @last_seen_at, 0)
  ON CONFLICT(device_id) DO NOTHING
`);
const insertPing = db.prepare(`
  INSERT INTO device_pings (device_id, kind, app_version, created_at)
  VALUES (?, 'install', ?, ?)
`);

const ALLOWED_PLATFORMS = new Set(['macos', 'windows', 'linux']);

function sanitize(s, max) {
  if (s == null) return null;
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

export default async function appInstallRoutes(fastify) {
  fastify.post('/api/app/install', async (request, reply) => {
    const body = request.body || {};
    const deviceId = sanitize(body.device_id, 64);
    const platform = sanitize(body.platform, 16);
    const appVersion = sanitize(body.app_version, 32);
    if (!deviceId || !platform || !appVersion) {
      reply.code(400).send({ error: 'device_id, platform, app_version required' });
      return;
    }
    if (!ALLOWED_PLATFORMS.has(platform)) {
      reply.code(400).send({ error: 'unknown platform' });
      return;
    }
    const now = nowMs();
    insertDevice.run({
      device_id: deviceId,
      platform,
      os_version: sanitize(body.os_version, 64),
      app_version: appVersion,
      locale: sanitize(body.locale, 16),
      installed_at: now,
      last_seen_at: now,
    });
    insertPing.run(deviceId, appVersion, now);
    reply.code(204).send();
  });
}
