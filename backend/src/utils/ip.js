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
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip;
}
