import { db } from '../db/index.js';
import { nowMs } from '../utils/time.js';

const updateDevice = db.prepare(`
  UPDATE devices
     SET last_seen_at = ?, app_version = ?, ping_count = ping_count + 1
   WHERE device_id = ?
`);
const insertPing = db.prepare(`
  INSERT INTO device_pings (device_id, kind, app_version, created_at)
  VALUES (?, 'heartbeat', ?, ?)
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
      // 未注册设备不再 fallback 建 unknown 脏数据；让 client 重新走 install。
      request.log.warn({ deviceId }, 'heartbeat from unknown device, rejected');
      reply.code(409).send({ error: 'device not installed' });
      return;
    }
    insertPing.run(deviceId, appVersion, now);
    reply.code(204).send();
  });
}
