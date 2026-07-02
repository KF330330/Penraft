import crypto from 'node:crypto';
import { config } from '../config.js';

function dailySalt() {
  const day = new Date().toISOString().slice(0, 10);
  return crypto
    .createHash('sha256')
    .update(day + ':' + config.dailySaltSeed)
    .digest('hex');
}

export function hashIp(rawIp) {
  if (!rawIp) return null;
  return crypto.createHash('sha256').update(rawIp + ':' + dailySalt()).digest('hex').slice(0, 24);
}

export function clientIp(req) {
  // 直接用 Fastify 经 trustProxy:1 解析出的可信 req.ip（Nginx 追加的真实客户端）。
  // 不再手动取 X-Forwarded-For 最左值——那是客户端可伪造的，会污染 ip_hash。
  return req.ip;
}
