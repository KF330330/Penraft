import { config } from '../config.js';

export default async function authRoutes(fastify) {
  // 与 SESSION_SECRET 同款硬校验：缺失或过弱即拒启动，杜绝弱口令静默上线。
  if (!config.dashboardPass || config.dashboardPass.length < 12) {
    throw new Error('DASHBOARD_PASS missing or too short (need >= 12 chars). Set a strong password in .env');
  }

  fastify.post('/api/login', async (request, reply) => {
    const body = request.body || {};
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) {
      reply.code(400).send({ error: '用户名和密码不能为空' });
      return;
    }
    if (username !== config.dashboardUser || password !== config.dashboardPass) {
      // 故意慢响应避免被穷举（简单做法：固定 sleep 300ms）
      await new Promise((r) => setTimeout(r, 300));
      reply.code(401).send({ error: '用户名或密码错误' });
      return;
    }
    fastify.issueSessionCookie(reply, username);
    return { ok: true, user: username };
  });

  fastify.post('/api/logout', async (_request, reply) => {
    fastify.clearSessionCookie(reply);
    reply.code(204).send();
  });

  // 给前端探测当前是否已登录（dashboard 顶部 hover 提示登录用户名时用）
  fastify.get('/api/me', async (request, reply) => {
    const user = fastify.readSessionUser(request);
    if (!user) {
      reply.code(401).send({ error: 'not logged in' });
      return;
    }
    return { user };
  });
}
