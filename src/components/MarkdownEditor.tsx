import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { findHighlightField } from "../lib/find-state";

export type Theme = "paper" | "light" | "dark";

const PALETTE: Record<Theme, { text: string; heading: string }> = {
  paper: { text: "#24292e", heading: "#b45309" },
  light: { text: "#24292e", heading: "#24292e" },
  dark: { text: "#e9e2d4", heading: "#d8a464" },
};

function buildHighlight(theme: Theme) {
  const { text, heading } = PALETTE[theme];
  return HighlightStyle.define([
    { tag: t.heading, fontWeight: "600", color: heading },
    { tag: t.heading1, fontWeight: "600", color: heading },
    { tag: t.heading2, fontWeight: "600", color: heading },
    { tag: t.heading3, fontWeight: "600", color: heading },
    { tag: t.heading4, fontWeight: "600", color: heading },
    { tag: t.heading5, fontWeight: "600", color: heading },
    { tag: t.heading6, fontWeight: "600", color: heading },
    { tag: t.strong, fontWeight: "600", color: text },
    { tag: t.emphasis, fontStyle: "italic", color: text },
    { tag: t.link, color: text, textDecoration: "underline" },
    { tag: t.url, color: text },
    { tag: t.monospace, color: text },
    { tag: t.meta, color: text },
    { tag: t.processingInstruction, color: heading },
    { tag: t.content, color: text },
  ]);
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  theme: Theme;
  // 把 CodeMirror EditorView 交还给上层，方便外部触发 openSearchPanel
  onReady?: (view: EditorView) => void;
  // per-tab 滚动位置存取（App 层持有 Map），切 tab 后恢复阅读位置用。
  // 真正的滚动元素是 CM 的 view.scrollDOM（.cm-scroller），不是 .source-column。
  path?: string;
  onSaveScroll?: (path: string, mode: "render" | "source", top: number) => void;
  onReadScroll?: (path: string, mode: "render" | "source") => number | undefined;
}

export function MarkdownEditor({
  value,
  onChange,
  theme,
  onReady,
  path,
  onSaveScroll,
  onReadScroll,
}: MarkdownEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const onSaveScrollRef = useRef(onSaveScroll);
  onSaveScrollRef.current = onSaveScroll;
  const onReadScrollRef = useRef(onReadScroll);
  onReadScrollRef.current = onReadScroll;

  // 切 tab（path 变化）后恢复滚动位置。只依赖 path——typing 也会改 value，
  // 不能在每次输入后都写 scrollTop。CM 子组件的受控 value effect 先于本 effect
  // 执行，rAF 再推一帧确保布局完成。没有记录的 tab 归位到顶部。
  useEffect(() => {
    const view = viewRef.current;
    if (!view || path === undefined) return;
    const saved = onReadScrollRef.current?.(path, "source") ?? 0;
    requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = saved;
    });
  }, [path]);

  const extensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(buildHighlight(theme)),
      // FindBar 通过 setFindHighlights effect 往这个字段塞装饰，统一两种模式的查找 UI
      findHighlightField,
    ],
    [theme],
  );

  return (
    <CodeMirror
      key={theme}
      value={value}
      height="100%"
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        // 关掉自带 ⌘F 绑定，统一由 App 层的 FindBar 调度
        searchKeymap: false,
        // 一并关掉 CM 自带的"按下后高亮选中相同串"装饰，避免和 FindBar 高亮抢色
        highlightSelectionMatches: false,
      }}
      onChange={(next) => onChange(next)}
      onCreateEditor={(view) => {
        viewRef.current = view;
        // 持续记录滚动位置（按当前 path 写入 App 层 Map），切 tab 时无需抢救。
        // CM 销毁时 scrollDOM 一并移除，无需手动解绑。
        view.scrollDOM.addEventListener(
          "scroll",
          () => {
            if (pathRef.current !== undefined) {
              onSaveScrollRef.current?.(pathRef.current, "source", view.scrollDOM.scrollTop);
            }
          },
          { passive: true },
        );
        onReady?.(view);
      }}
    />
  );
}
