# Penraft Backend

埋点采集 + 后台 dashboard。Node 20 + Fastify + better-sqlite3（WAL）。

## 启动

```bash
cp .env.example .env
# 改 DASHBOARD_PASS / CORS_ORIGIN

# Docker（推荐）
docker compose up -d --build
docker compose logs -f penraft-backend

# 或本地 node
npm install
npm start
```

访问 `http://localhost:8787/dashboard/`，首次会重定向到 `/dashboard/login.html`，用 `DASHBOARD_USER` / `DASHBOARD_PASS` 登录。会话用签名 cookie 维持 7 天，每次请求自动续期；右上角「退出」按钮可主动登出。

## 接口

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/event`           | 官网批量上报曝光/点击 (`{ events: [...] }`) |
| POST | `/api/app/install`     | app 首次安装 |
| POST | `/api/app/heartbeat`   | app 心跳（建议每次启动 + 间隔 24h） |
| POST | `/api/login`           | 登录（`{username, password}` → Set-Cookie） |
| POST | `/api/logout`          | 登出（清 Cookie） |
| GET  | `/api/me`              | 当前登录用户名 |
| GET  | `/api/dashboard/stats` | 仪表盘聚合数据（需 cookie） |
| GET  | `/health`              | 健康检查 |

时间戳一律 ISO8601；服务端落库 epoch ms。`active_devices = devices.last_seen_at >= now-7d`。

## 数据备份

```bash
docker exec penraft-backend /app/scripts/backup.sh
```

宿主 cron 每日凌晨执行。SQLite 在 WAL 下不能直接 `cp`，必须用 `.backup`。
