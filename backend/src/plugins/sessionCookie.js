import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import { config } from '../config.js';

const COOKIE_NAME = 'penraft_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * cookie value 形如 "<username>.<exp_ms>"，再由 @fastify/cookie 签名追加 ".<sig>"。
 * 服务端 decode 后校验 exp > now，过期或被篡改 → 视为未登录。
 */
function buildValue(username) {
  const exp = Date.now() + SESSION_TTL_MS;
  return `${encodeURIComponent(username)}.${exp}`;
}

function parseValue(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return null;
  const u = decodeURIComponent(raw.slice(0, dot));
  const exp = Number(raw.slice(dot + 1));
  if (!u || !Number.isFinite(exp)) return null;
  if (exp <= Date.now()) return null;
  return { username: u, exp };
}

function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    signed: true,
  };
}

const PUBLIC_PATHS = [
  '/health',
  '/api/login',
  '/api/logout',
  '/api/event',
  '/api/app/install',
  '/api/app/heartbeat',
  '/dashboard/login.html',
  '/dashboard/login.js',
  '/dashboard/login.css',
  '/dashboard/styles.css',
];

function isPublic(url) {
  if (!url) return false;
  for (const p of PUBLIC_PATHS) if (url === p || url.startsWith(p + '?')) return true;
  return false;
}

function isDashboardHtmlPath(url) {
  // /dashboard/、/dashboard、/dashboard/index.html、/dashboard/ 任何子路径都视为页面
  return url === '/dashboard' || url === '/dashboard/' || url.startsWith('/dashboard/index') || (url.startsWith('/dashboard/') && !url.startsWith('/dashboard/login'));
}

function isDashboardApiPath(url) {
  return url.startsWith('/api/dashboard/');
}

async function sessionCookiePlugin(fastify) {
  if (!config.sessionSecret || config.sessionSecret.length < 16) {
    throw new Error('SESSION_SECRET missing or too short (need >= 16 chars). Set it in .env');
  }

  await fastify.register(fastifyCookie, { secret: config.sessionSecret });

  // 工具函数：发签名 cookie
  fastify.decorate('issueSessionCookie', function issue(reply, username) {
    reply.setCookie(COOKIE_NAME, buildValue(username), cookieOptions());
  });
  fastify.decorate('clearSessionCookie', function clear(reply) {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
  });

  // 校验当前请求的 cookie，返回 username 或 null
  fastify.decorate('readSessionUser', function read(request) {
    const raw = request.cookies && request.cookies[COOKIE_NAME];
    if (!raw) return null;
    const unsigned = fastify.unsignCookie(raw);
    if (!unsigned || !unsigned.valid) return null;
    const parsed = parseValue(unsigned.value);
    return parsed ? parsed.username : null;
  });

  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.raw.url || '';

    if (isPublic(url)) return;

    const user = fastify.readSessionUser(request);

    if (isDashboardHtmlPath(url)) {
      if (!user) {
        reply.redirect('/dashboard/login.html');
        return reply;
      }
      // 滑动续期
      fastify.issueSessionCookie(reply, user);
      return;
    }

    if (isDashboardApiPath(url)) {
      if (!user) {
        reply.code(401).send({ error: '未登录或会话已过期' });
        return reply;
      }
      fastify.issueSessionCookie(reply, user);
      return;
    }

    // 其它路径默认放行（如 /api/event 等已在 PUBLIC 中）
  });
}

export default fp(sessionCookiePlugin, { name: 'penraft-session-cookie' });
