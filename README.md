# Penraft

Penraft 是一个极简的本地 Markdown 笔记应用：只有一行 Tab 条和一个编辑器，输入即自动保存。

## 功能

- 多 Tab 单页面 Markdown 编辑（启动自动新建一个空文档）
- Tab 双击重命名、拖拽排序、× 关闭只藏不删
- Tab 顺序与打开状态跨会话恢复（`.penraft/tabs.json`）
- 全局搜索（Tab 条左侧 🔍）
- 实时渲染 / 源码双模式（Milkdown + CodeMirror 6）
- 自动保存（500 ms debounce）写入 `~/Documents/PenraftVault/Notes/`
- 快捷键：⌘+N 新建 · ⌘+/ 切渲染/源码 · ⌘+S 立即保存

## 环境要求

- Node.js 20+
- Rust toolchain
- Tauri 2 prerequisites for your OS

## 开发

```bash
npm install
npm run tauri:dev
```

## 打包

```bash
npm run tauri:build
```

## 默认 Vault

首次启动会在以下位置初始化：

```text
~/Documents/PenraftVault/
  Notes/                # 所有 .md 文件
  .penraft/tabs.json    # Tab 顺序与激活状态
```

不需要外部配置——所有参数硬编码为合理默认值。

## 匿名使用统计

Penraft 会向自建后端上报极少量匿名信息，以便我们了解使用情况、决定后续开发优先级：

- 一次性 **首装事件**：匿名 UUID（仅你这台设备生成、不可关联个人身份）、操作系统、版本号、语言
- 每日一次 **心跳**：上面的 UUID + 当前 app 版本

不会上报：你的笔记内容、文件名、IP、邮箱、任何账号信息。

UUID 与心跳时间戳保存在 `~/Documents/PenraftVault/.penraft/device.json` 和 `heartbeat.json`。删除该目录即可重新生成。后端地址在 `src-tauri/src/telemetry.rs` 中可改，发版时通过环境变量 `PENRAFT_BACKEND_URL` 注入。

## macOS 首次安装提示

由于本期未做 Apple Developer ID 代码签名 / 公证，macOS 会提示 **"无法打开 Penraft，因为无法验证开发者"**。请：

1. 在 `Finder` 中右键 `Penraft.app` → 选择 **"打开"** → 在弹窗里再次点击 **"打开"**；或
2. 系统设置 → **隐私与安全性** → 翻到底部，看到「已阻止 Penraft」 → 点击 **"仍要打开"**。

放行一次后再启动就不会再提示。后续如果接入 Apple Developer ID 公证流程，可消除此警告。

## 自动更新

Penraft 每天检查一次 GitHub Releases。发现新版本时会在右下角弹一次提醒；如果你点了「稍后」，**7 天后会再提一次**；之后不再骚扰，直到下一次发新版本。

点「立即更新」会自动下载并重启安装。更新包用 ed25519 公钥校验签名，确保未被中间人篡改（与 Apple 公证是两回事，与 macOS 系统层面的代码签名独立）。

## 上线 / 发版 checklist

新发一版前**逐项检查**，否则可能埋点丢失或更新无法触发：

- [ ] `website/script.js` 顶部的 `TRACK_ENDPOINT` 已改为生产域名（或注入 `window.PENRAFT_TRACK`）
- [ ] 构建 app 时设置环境变量 `PENRAFT_BACKEND_URL=https://your-domain` 注入到 telemetry.rs（`option_env!` 在编译期读取）
- [ ] 在生产环境的 `backend/.env` 里把 `CORS_ORIGIN` 加上官网真实域名、`DASHBOARD_PASS` 改成强密码
- [ ] 首次发版前一次性生成 ed25519 签名密钥：`npm run tauri signer generate -- -w ~/.tauri/penraft.key`，公钥粘到 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`
- [ ] 私钥与密码作为 GitHub Actions secret：`TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- [ ] CI（建议用 `tauri-apps/tauri-action`）产物里包含 `latest.json` 上传为 release asset，让 `https://github.com/KF330330/Penraft/releases/latest/download/latest.json` 可达
- [ ] 本地用 `cargo run` + `docker-compose up` 至少跑通一次 install / heartbeat / updater banner 的端到端冒烟测试

