# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库本质

**这是一个含 4 个 sub-project 的单仓库**，不是单一前端项目：

| 路径 | 是什么 | 部署目标 |
|---|---|---|
| `src/` + `src-tauri/` | **Penraft 桌面 App**（Tauri 2，主产品） | 用户机器（macOS/Windows/Linux），通过 GitHub Releases 分发 |
| `website/` | 官网静态站（HTML/CSS/JS） | `penraft.com`（生产服务器详情见 `CLAUDE.local.md`） |
| `backend/` | 埋点 + dashboard 后端（Fastify + better-sqlite3，独立 Node 项目） | `api.penraft.com`（docker 容器 `penraft-backend`） |
| `docs/` | 架构 / 部署 / SOP 文档 | — |

**这三块是耦合的**：App 和官网都把数据上报到 backend；backend 的接口契约同时绑定这两个客户端。改 backend 的字段或路径前先确认另两边怎么用。

## 常用命令

### 桌面 App（仓库根目录）
```bash
npm install
npm run tauri:dev      # 开发（Vite + Rust + Tauri 一起起）
npm run tauri:build    # 打包 .dmg / .msi / .AppImage
npm run dev            # 只起 Vite（127.0.0.1:5173），少用——Tauri command 调不通
npm run build          # tsc + vite build，给 tauri:build 用
```
没有测试套件。验证靠 `npm run tauri:dev` 实际跑。

### 后端
```bash
cd backend
docker compose up -d --build       # 推荐方式，端口 8787
docker compose logs -f penraft-backend
# 或 npm install && npm start
```
本地访问 `http://localhost:8787/dashboard/`，凭据走 `.env` 的 `DASHBOARD_USER` / `DASHBOARD_PASS`。

### 官网
纯静态，没构建步骤。直接编辑 `website/{index.html,script.js,styles.css}`，部署走 `docs/DEPLOY_SOP.md`（rsync 到服务器）。

## 架构关键

**详细架构看 `docs/ARCHITECTURE.md`**（不重复列），只补几条 reading code 时不容易看出来的事：

### Tauri 命令分布
所有 Rust → JS 暴露的命令都在 `src-tauri/src/lib.rs` 用 `#[tauri::command]` 注册，实现委托给 `vault.rs`（笔记 IO）和 `telemetry.rs`（遥测）。前端通过 `src/lib/tauri.ts` 的薄封装调用，不要直接 `invoke`。

### 多窗口与 tab 跨窗口拖拽
`src-tauri/src/lib.rs` 里有 `FocusOrder`（z-order 历史）和 `TORN_PREFIX = "torn-"`（撕出去的窗口 label 前缀）。tab 在窗口间拖拽合并的实现核心在这两处。修改窗口 / tab 行为前先看这里的状态机。

### Vault 路径硬编码
所有路径锚点在 `src-tauri/src/vault.rs` 的 `penraft_dir()` / `vault_dir()`，**`~/Documents/PenraftVault/` 是写死的**，没有设置面板。改 vault 位置 = 改这两个函数 + 顺带处理 `tabs.json` / `device.json` / `heartbeat.json` 的迁移。

### 自动保存机制
`App.tsx` 内 500ms debounce 触发 `save_note`（Rust 端用 temp file + rename 原子写）。切 tab 会**同步 flush** 当前文档再切——所以"丢了几秒数据"基本不可能，除非进程被强杀。

### 遥测 endpoint 注入
- **App 端**：`src-tauri/src/telemetry.rs:18` 的 `backend_url()` 用 `option_env!("PENRAFT_BACKEND_URL")` 在**编译期**读环境变量，缺省 `http://localhost:8787`。**发版必须 `PENRAFT_BACKEND_URL=https://api.penraft.com cargo build`**（或在 CI 注入），否则用户机器埋点全打到 localhost 丢失。
- **官网端**：`website/script.js:517` 用 `window.PENRAFT_TRACK || 'http://localhost:8787'`。生产版本需要在部署时往 HTML 注入 `<script>window.PENRAFT_TRACK='https://api.penraft.com'</script>`，或者干脆硬编码后再 rsync。
- **服务端写法**：埋点接口（`/api/event`、`/api/app/install`、`/api/app/heartbeat`）只在 `api.penraft.com` 上开放，主域 `penraft.com` 上故意 404（防滥用）。Dashboard（`/dashboard/`、`/api/{login,logout,me,dashboard/*}`）则两个域都反代，主域 `penraft.com/dashboard/` 是管理员日常入口。

### 自动更新
`src-tauri/tauri.conf.json` 的 `plugins.updater`：从 `https://github.com/KF330330/Penraft/releases/latest/download/latest.json` 拉清单，ed25519 公钥验签。发版必须把 `latest.json` 作为 release asset 上传，否则 updater 静默失败。

### Backend 数据契约
backend 的三张表（`web_events` / `devices` / `device_pings`）schema 在 `backend/src/db/schema.sql`。改字段要同时改：
1. `backend/src/routes/{webEvent,appInstall,appHeartbeat}.js` 的入参解析
2. `website/script.js` 上报的 payload 形状
3. `src-tauri/src/telemetry.rs` 的 `Install` / `Heartbeat` payload

时间戳约定：**对外 API ISO8601，落库 epoch ms**（`backend/src/utils/time.js` 负责转换）。

## 发版前必做

详见 `README.md` 末尾的 "上线 / 发版 checklist"。**最容易踩的坑**：忘记注入 `PENRAFT_BACKEND_URL` 或忘记改 `website/script.js` 的 endpoint —— 这两件事不做，新版上线后 dashboard 看到的就是死寂。

## 生产基础设施

服务器、DNS、SSL 证书、监控、备份等运维细节不入此公开文件。具体地址、凭据、外部文档路径见本地 `CLAUDE.local.md`（已 gitignore）。改服务器相关的东西前先读那份。

## 用户工作规则（来自项目根全局规则）

- 改代码只动被要求的范围，**不要顺手清理**周边代码逻辑
- 单文件 > 2000 行时拆 `_INDEX.md + _SUMMARY.md + 分块`
- 修 bug / 部署 / 改服务器前，先翻失败案例库（位置见全局 `~/.claude/CLAUDE.md` 第 12 条）
