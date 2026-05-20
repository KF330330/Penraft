/**
 * dev-only 浮动调试面板：一键触发更新流程各阶段。
 * production build 时由 import.meta.env.DEV 守护，整段被 tree-shake。
 */
import { useState } from "react";

const MOCK_NOTES = `# 新增

- 更新弹窗 Minimal Refined 风格
- Rust strip 减小二进制体积

# 修复

- 切窗口时偶发的 tab 顺序错乱`;

type DevAction =
  | { action: "show-prompt-real-flow" }
  | { action: "jump-downloading"; downloaded: number; total: number }
  | { action: "jump-done" }
  | { action: "jump-installed" }
  | { action: "jump-error"; errMsg: string }
  | { action: "reset" };

function dispatch(detail: DevAction) {
  window.dispatchEvent(new CustomEvent("penraft:dev:update", { detail }));
}

export default function UpdateDebugPanel() {
  if (!import.meta.env.DEV) return null;
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        className="update-debug-panel-tab"
        onClick={() => setCollapsed(false)}
        title="展开更新调试面板"
      >
        🔧
      </button>
    );
  }

  return (
    <div className="update-debug-panel">
      <div className="update-debug-panel__head">
        <span>🔧 Update Debug (dev)</span>
        <button
          className="update-debug-panel__close"
          onClick={() => setCollapsed(true)}
          aria-label="收起"
        >
          ×
        </button>
      </div>
      <div className="update-debug-panel__body">
        <button onClick={() => dispatch({ action: "show-prompt-real-flow" })}>
          ① 真实流程：弹"更新可用"
        </button>
        <p className="update-debug-panel__hint">
          ↑ 点完后再点卡片里"立即更新"，会跑 mock 下载（约 5s）→ done → installed
        </p>
        <hr />
        <p className="update-debug-panel__label">跳到具体 phase：</p>
        <button
          onClick={() =>
            dispatch({
              action: "jump-downloading",
              downloaded: 3.2 * 1024 * 1024,
              total: 12 * 1024 * 1024,
            })
          }
        >
          ② downloading（27%）
        </button>
        <button onClick={() => dispatch({ action: "jump-done" })}>
          ③ done（绿勾）
        </button>
        <button onClick={() => dispatch({ action: "jump-installed" })}>
          ④ installed（已就绪卡片）
        </button>
        <button
          onClick={() =>
            dispatch({ action: "jump-error", errMsg: "连接超时" })
          }
        >
          ⚠ error（失败卡片）
        </button>
        <hr />
        <button onClick={() => dispatch({ action: "reset" })}>↻ 重置</button>
      </div>
    </div>
  );
}
