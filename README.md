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
