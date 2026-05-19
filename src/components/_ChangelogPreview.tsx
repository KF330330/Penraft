// TEMP 预览组件 — 用于设计稿落地验证，确认后整文件删除。
// 用法：在 dev 窗口地址栏加 hash：
//   #preview-update     → 显示更新可用弹窗
//   #preview-postupdate → 显示更新完成弹窗
//   去掉 hash 刷新即可关闭。
import { useEffect, useState } from "react";
import ChangelogModal from "./ChangelogModal";

const MOCK_NOTES = [
  "- 修复多窗口拖拽 tab 偶发崩溃",
  "- 新增 ⌘+Click 跳转到标题/链接",
  "- 导出 PDF 支持自定义页边距",
].join("\n");

type Mode = "prompt" | "postUpdate" | null;

function modeFromHash(): Mode {
  if (typeof window === "undefined") return null;
  const h = window.location.hash;
  if (h === "#preview-update") return "prompt";
  if (h === "#preview-postupdate") return "postUpdate";
  return null;
}

export default function ChangelogPreview() {
  const [mode, setMode] = useState<Mode>(modeFromHash());

  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (mode === "prompt") {
    return (
      <ChangelogModal
        mode="prompt"
        version="0.4.2"
        notes={MOCK_NOTES}
        phase="idle"
        progress={{ downloaded: 0, total: null }}
        errMsg={null}
        onLater={() => (window.location.hash = "")}
        onUpdate={() => (window.location.hash = "")}
        onDismiss={() => (window.location.hash = "")}
      />
    );
  }
  if (mode === "postUpdate") {
    return (
      <ChangelogModal
        mode="postUpdate"
        version="0.4.2"
        notes={MOCK_NOTES}
        onAck={() => (window.location.hash = "")}
      />
    );
  }
  return null;
}
