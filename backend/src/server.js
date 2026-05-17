import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyBasicAuth from '@fastify/basic-auth';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import webEventRoutes from './routes/webEvent.js';
import appInstallRoutes from './routes/appInstall.js';
import appHeartbeatRoutes from './routes/appHeartbeat.js';
import dashboardStatsRoutes from './routes/dashboardStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function build() {
  migrate();

  const fastify = Fastify({
    logger: { level: config.nodeEnv === 'production' ? 'info' : 'debug' },
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  // CORS：只对 /api/* 生效；dashboard 不需要跨域
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

  await fastify.register(fastifyBasicAuth, {
    validate: async (username, password) => {
      if (username !== config.dashboardUser || password !== config.dashboardPass) {
        return new Error('invalid credentials');
      }
    },
    authenticate: { realm: 'Penraft Dashboard' },
  });

  // 静态文件：/dashboard 前缀，需 Basic Auth
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
    decorateReply: false,
  });

  // 给 /dashboard 路径加 Basic Auth gate（basicAuth 是 (req, reply, done) 回调签名）
  fastify.addHook('onRequest', (req, reply, done) => {
    const url = req.raw.url || '';
    if (url.startsWith('/dashboard')) {
      fastify.basicAuth(req, reply, done);
    } else {
      done();
    }
  });

  // 健康检查
  fastify.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  // 路由：事件上报 (web)、app 上报、dashboard API
  await fastify.register(webEventRoutes);
  await fastify.register(appInstallRoutes);
  await fastify.register(appHeartbeatRoutes);
  await fastify.register(dashboardStatsRoutes);

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
