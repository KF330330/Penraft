import { db } from '../db/index.js';
import { nowMs } from '../utils/time.js';

const updateDevice = db.prepare(`
  UPDATE devices
     SET last_seen_at = ?, app_version = ?, ping_count = ping_count + 1
   WHERE device_id = ?
`);
const insertDeviceFallback = db.prepare(`
  INSERT INTO devices (device_id, platform, os_version, app_version, locale, installed_at, last_seen_at, ping_count)
  VALUES (?, 'unknown', NULL, ?, NULL, ?, ?, 0)
  ON CONFLICT(device_id) DO NOTHING
`);
const insertPing = db.prepare(`
  INSERT INTO device_pings (device_id, kind, app_version, created_at)
  VALUES (?, ?, ?, ?)
`);

function sanitize(s, max) {
  if (s == null) return null;
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

export default async function appHeartbeatRoutes(fastify) {
  fastify.post('/api/app/heartbeat', async (request, reply) => {
    const body = request.body || {};
    const deviceId = sanitize(body.device_id, 64);
    const appVersion = sanitize(body.app_version, 32);
    if (!deviceId || !appVersion) {
      reply.code(400).send({ error: 'device_id, app_version required' });
      return;
    }
    const now = nowMs();
    const result = updateDevice.run(now, appVersion, deviceId);
    if (result.changes === 0) {
      // 容错：缺 install 时自动补一条（platform=unknown），并记录 install ping
      insertDeviceFallback.run(deviceId, appVersion, now, now);
      insertPing.run(deviceId, 'install', appVersion, now);
    }
    insertPing.run(deviceId, 'heartbeat', appVersion, now);
    reply.code(204).send();
  });
}
