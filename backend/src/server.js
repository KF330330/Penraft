import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { startRetentionJob } from './db/retention.js';
import sessionCookiePlugin from './plugins/sessionCookie.js';
import webEventRoutes from './routes/webEvent.js';
import appInstallRoutes from './routes/appInstall.js';
import appHeartbeatRoutes from './routes/appHeartbeat.js';
import dashboardStatsRoutes from './routes/dashboardStats.js';
import authRoutes from './routes/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function build() {
  migrate();

  const fastify = Fastify({
    logger: { level: config.nodeEnv === 'production' ? 'info' : 'debug' },
    // 只信任 Nginx 这一跳：req.ip 取 Nginx 追加的真实客户端 IP，客户端自带的伪造
    // X-Forwarded-For 被忽略。设 true 会信任整条链，攻击者可伪造 XFF 绕过限流/污染 ip_hash。
    trustProxy: 1,
    bodyLimit: 64 * 1024,
  });

  // CORS：对 /api/* 生效（dashboard 同源不需要跨域）
  await fastify.register(fastifyCors, {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (config.corsOrigin.length === 0) return cb(null, true);
      if (config.corsOrigin.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['POST', 'GET', 'OPTIONS'],
    credentials: false,
  });

  await fastify.register(fastifyRateLimit, {
    max: config.rateLimitPerMin,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    allowList: () => false,
  });

  // 会话 Cookie + 全局 onRequest 鉴权 hook（替代旧的 Basic Auth）
  await fastify.register(sessionCookiePlugin);

  // 静态文件
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
    decorateReply: false,
  });

  // 健康检查
  fastify.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  // 路由
  await fastify.register(authRoutes);
  await fastify.register(webEventRoutes);
  await fastify.register(appInstallRoutes);
  await fastify.register(appHeartbeatRoutes);
  await fastify.register(dashboardStatsRoutes);

  // 埋点表定期清理：防 web_events / device_pings 只增不删撑爆磁盘。
  startRetentionJob(fastify.log);

  return fastify;
}

build()
  .then((app) => app.listen({ port: config.port, host: config.host }))
  .then((addr) => {
    console.log(`[penraft-backend] listening on ${addr}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
