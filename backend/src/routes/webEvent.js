import { db } from '../db/index.js';
import { hashIp, clientIp } from '../utils/ip.js';
import { nowMs } from '../utils/time.js';

const insertStmt = db.prepare(`
  INSERT INTO web_events (event_type, event_name, page, referrer, session_id, ip_hash, ua, country, meta_json, created_at)
  VALUES (@event_type, @event_name, @page, @referrer, @session_id, @ip_hash, @ua, @country, @meta_json, @created_at)
`);

const insertMany = db.transaction((rows) => {
  for (const r of rows) insertStmt.run(r);
});

const ALLOWED_TYPES = new Set(['view', 'click']);

function sanitize(s, max) {
  if (s == null) return null;
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

export default async function webEventRoutes(fastify) {
  fastify.post('/api/event', async (request, reply) => {
    const body = request.body || {};
    const events = Array.isArray(body.events) ? body.events : null;
    if (!events || events.length === 0 || events.length > 50) {
      reply.code(400).send({ error: 'events must be a non-empty array (max 50)' });
      return;
    }
    const ip = clientIp(request);
    const ipH = hashIp(ip);
    const ua = sanitize(request.headers['user-agent'], 512);
    const now = nowMs();
    const rows = [];
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      if (!ALLOWED_TYPES.has(ev.event_type)) continue;
      const name = sanitize(ev.event_name, 64);
      if (!name) continue;
      let metaJson = null;
      if (ev.meta && typeof ev.meta === 'object') {
        try { metaJson = JSON.stringify(ev.meta).slice(0, 2048); } catch { metaJson = null; }
      }
      rows.push({
        event_type: ev.event_type,
        event_name: name,
        page: sanitize(ev.page, 256),
        referrer: sanitize(ev.referrer, 512),
        session_id: sanitize(ev.session_id, 64),
        ip_hash: ipH,
        ua,
        country: null,
        meta_json: metaJson,
        created_at: now,
      });
    }
    if (rows.length === 0) {
      reply.code(400).send({ error: 'no valid events' });
      return;
    }
    insertMany(rows);
    reply.code(204).send();
  });
}
