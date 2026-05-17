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

访问 `http://localhost:8787/dashboard/`，用 `DASHBOARD_USER` / `DASHBOARD_PASS` 登录。

## 接口

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/event`           | 官网批量上报曝光/点击 (`{ events: [...] }`) |
| POST | `/api/app/install`     | app 首次安装 |
| POST | `/api/app/heartbeat`   | app 心跳（建议每次启动 + 间隔 24h） |
| GET  | `/api/dashboard/stats` | 仪表盘聚合数据（Basic Auth） |
| GET  | `/health`              | 健康检查 |

时间戳一律 ISO8601；服务端落库 epoch ms。`active_devices = devices.last_seen_at >= now-7d`。

## 数据备份

```bash
docker exec penraft-backend /app/scripts/backup.sh
```

宿主 cron 每日凌晨执行。SQLite 在 WAL 下不能直接 `cp`，必须用 `.backup`。
