# Penraft 设置菜单重设计 — Agent Brief

## 你要做什么

为 Penraft（一款 macOS/Win/Linux 桌面 Markdown 笔记 app，Tauri 2 + React）的**设置菜单**做一版 UI 设计稿（单个自包含 HTML 文件）。

你只需要专注**这一个菜单的视觉与排版**——交互流程、Rust 后端、Tauri 命令都已实现好，不归你管。

## 当前菜单覆盖三件事（必须都呈现）

1. **主题切换**
   - 三个选项：`Paper · 米色`、`Light · 白色`、`Dark · 暗色`
   - 每个选项左侧有一个小色块（swatch）：paper=#f1ede5、light=#ffffff、dark=#2c2a26
   - 当前激活项要有视觉强调（高亮 / 勾选 / 边框等任选）
   - 真实数据：当前激活 = Paper

2. **存储路径**
   - 一个 「更改位置…」按钮（默认带 folder 图标）
   - 下方/旁边显示当前完整路径：`/Users/rl/Documents/PenraftVault`
   - 路径可能很长，要考虑截断、换行或 hover 显示完整

3. **检查更新**
   - 一个「检查更新」按钮（带刷新图标 RefreshCw）
   - 旁边/下方显示版本号 `v0.3.5`
   - 点击后的状态有：`检查中…`（旋转图标）/ `已是最新版本`（√ 图标）/ `检查失败，点击重试`
   - 你的 mockup 默认呈现 idle 状态即可，但可以加一个小提示说明这是动态的

## 形态自由

- 现在是「右上角 ⚙ 点击下拉」的 dropdown。你可以保留，也可以换成：popover 带箭头 / 居中 modal / 右侧 sheet / 卡片浮层 / 全屏面板等任何形态。
- **但必须保留「点击右上角 ⚙ 触发」的交互**——HTML 里 mock 一个 ⚙ 按钮在右上角，点击展开你的设计。

## 三主题适配（硬性要求）

HTML 顶部要加一个**主题切换 toggle**（三个小按钮：Paper / Light / Dark），点击切 `data-theme` 属性，整个菜单跟着变色。**复用以下 CSS 变量**（直接复制到你的 `<style>` 里）：

```css
:root,
[data-theme="paper"] {
  --bg: #f5f3ef;
  --panel: #fbfaf8;
  --panel-strong: #ffffff;
  --line: rgba(36, 30, 21, 0.12);
  --line-strong: rgba(36, 30, 21, 0.18);
  --text: #24201a;
  --muted: #7c746a;
  --muted-2: #a49b90;
  --accent: #111827;
  --accent-soft: rgba(17, 24, 39, 0.08);
  --top-bar-bg: #f1ede5;
  --heading-accent: #b45309;
  --backdrop: rgba(25, 21, 17, 0.36);
  --shadow: 0 18px 50px rgba(28, 22, 16, 0.12);
  --radius: 16px;
  --font: "PingFang SC", "Helvetica Neue", "Microsoft YaHei", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif;
  --mono: "SFMono-Regular", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace;
}

[data-theme="light"] {
  --bg: #ffffff;
  --panel: #fafafa;
  --panel-strong: #ffffff;
  --line: rgba(36, 30, 21, 0.10);
  --line-strong: rgba(36, 30, 21, 0.16);
  --text: #24292e;
  --muted: #7c746a;
  --top-bar-bg: #f6f6f5;
  --heading-accent: #24292e;
  --backdrop: rgba(0, 0, 0, 0.32);
  --accent: #111827;
  --accent-soft: rgba(17, 24, 39, 0.08);
}

[data-theme="dark"] {
  --bg: #1f1d1a;
  --panel: #28251f;
  --panel-strong: #3a342a;
  --line: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.14);
  --text: #ffffff;
  --muted: #9b938a;
  --muted-2: #6a6258;
  --accent: #d8a464;
  --accent-soft: rgba(216, 164, 100, 0.12);
  --top-bar-bg: #2c2a26;
  --heading-accent: #d8a464;
  --backdrop: rgba(0, 0, 0, 0.5);
}
```

**所有颜色必须用 `var(--xxx)` 引用**，不能硬编码 #xxxxxx（否则切主题会断）。除非你的设计方向明确需要的装饰色（比如方向 6 「现代终端」的霓虹绿）——这种情况要为三主题分别定义。

## 视觉参考：app 背景模拟

mockup 的 `<body>` 背景用 `--bg`（不是白色），模拟 app 内的场景。在 body 右上角放一个 ⚙ 按钮（用纯 CSS / svg / unicode 都行），点击 toggle 你的菜单显示/隐藏，让我能感受真实的"app 内弹出"效果。

## 图标

直接用 inline SVG（lucide-react 风格的线条 icon）或者 unicode（⚙ 🌗 📁 ↻ ✓）都可以。你可以用 lucide 官方 SVG 源码（`stroke="currentColor" fill="none"`），它们都开源。

## 输出约束

- 单个 HTML 文件，**完全自包含**（CSS 内联在 `<style>`，JS 内联或纯 CSS 实现）
- 文件路径已经在你的任务 prompt 中指定，写到那里
- 不引用任何外部 CDN（避免离线打不开）
- 真实数据填充：路径 `/Users/rl/Documents/PenraftVault`、版本 `v0.3.5`、当前主题=Paper

## 你的方向种子

由 prompt 给你（每个 agent 一个独特方向）。按种子定调，但具体细节自由发挥。

## 验收清单

- [ ] 三个 section（主题 / 存储路径 / 更新）齐全
- [ ] 主题 toggle 切换正常，三个主题下都看得清
- [ ] 默认呈现 paper 主题
- [ ] 路径 `/Users/rl/Documents/PenraftVault` 真实呈现（不要 `<path>` 占位）
- [ ] 版本号 `v0.3.5` 真实呈现
- [ ] 右上角有 ⚙ 按钮可点击 toggle 菜单
- [ ] 用 `var(--xxx)` 引用色彩变量
- [ ] 整个文件不引用 CDN

## 当前实现长这样（仅供你了解现状，**不是模仿对象**——你的设计应该明显比这好看）

```tsx
{/* ThemePicker.tsx 的菜单结构 */}
<div className="theme-menu">
  <div className="theme-menu-section">
    <div className="theme-menu-section-label">主题</div>
    {/* 3 个 button，每个里面是 swatch + label */}
  </div>
  <div className="theme-menu-divider" />
  <div className="theme-menu-section">
    <div className="theme-menu-section-label">存储路径</div>
    <button>更改位置…</button>
    <div className="theme-menu-path">/Users/rl/Documents/PenraftVault</div>
  </div>
  <div className="theme-menu-divider" />
  <div className="theme-menu-section">
    <div className="theme-menu-section-label">更新</div>
    <button>检查更新</button>
    <div className="theme-menu-version">v0.3.5</div>
  </div>
</div>
```

—— 现状是无脑垂直堆叠，section-label 小写字母全大写灰色，每个 button 一行带 icon。**用户觉得丑，所以让你重做。**
