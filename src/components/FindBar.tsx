import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// 文档内查找浮条（仅渲染模式使用；源码模式由 App 直接调用 CodeMirror 的 openSearchPanel）。
// 高亮走 CSS Custom Highlight API（Chromium 105+/WebKit 17.2+ 均支持），避免改动 ProseMirror 文档结构。

interface FindBarProps {
  onClose: () => void;
  // 文档 key（path）；切 tab 或换文档时重建高亮
  documentKey: string | null;
  initialQuery?: string;
}

const HIGHLIGHT_ALL = "penraft-find";
const HIGHLIGHT_CURRENT = "penraft-find-current";

function hasCustomHighlight(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof (CSS as unknown as { highlights?: Map<string, unknown> }).highlights !== "undefined" &&
    typeof (globalThis as unknown as { Highlight?: unknown }).Highlight !== "undefined"
  );
}

function clearHighlights() {
  if (!hasCustomHighlight()) return;
  CSS.highlights.delete(HIGHLIGHT_ALL);
  CSS.highlights.delete(HIGHLIGHT_CURRENT);
}

function findEditorRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".wysiwyg-column .ProseMirror");
}

function collectMatches(root: HTMLElement, query: string): Range[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    const text = current.nodeValue ?? "";
    if (text.length > 0) {
      const lower = text.toLowerCase();
      let from = 0;
      while (from <= lower.length - needle.length) {
        const idx = lower.indexOf(needle, from);
        if (idx === -1) break;
        try {
          const range = new Range();
          range.setStart(current, idx);
          range.setEnd(current, idx + query.length);
          ranges.push(range);
        } catch {
          // Range 构造失败时跳过该位置
        }
        from = idx + Math.max(1, needle.length);
      }
    }
    current = walker.nextNode();
  }
  return ranges;
}

export function FindBar({ onClose, documentKey, initialQuery }: FindBarProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [matches, setMatches] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    return () => clearHighlights();
  }, []);

  useEffect(() => {
    if (!hasCustomHighlight()) {
      setMatches([]);
      return;
    }
    if (!query) {
      clearHighlights();
      setMatches([]);
      setIndex(0);
      return;
    }
    const root = findEditorRoot();
    if (!root) {
      clearHighlights();
      setMatches([]);
      setIndex(0);
      return;
    }
    const ranges = collectMatches(root, query);
    setMatches(ranges);
    setIndex(0);
  }, [query, documentKey]);

  useEffect(() => {
    if (!hasCustomHighlight()) return;
    if (matches.length === 0) {
      clearHighlights();
      return;
    }
    CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...matches));
    const current = matches[Math.min(index, matches.length - 1)];
    if (current) {
      CSS.highlights.set(HIGHLIGHT_CURRENT, new Highlight(current));
      const container =
        current.startContainer.nodeType === Node.ELEMENT_NODE
          ? (current.startContainer as HTMLElement)
          : current.startContainer.parentElement;
      container?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [matches, index]);

  const total = matches.length;
  const supported = hasCustomHighlight();

  const goNext = () => {
    if (total === 0) return;
    setIndex((i) => (i + 1) % total);
  };
  const goPrev = () => {
    if (total === 0) return;
    setIndex((i) => (i - 1 + total) % total);
  };

  return (
    <div className="find-bar" onMouseDown={(e) => e.stopPropagation()}>
      <Search size={14} />
      <input
        ref={inputRef}
        className="find-bar-input"
        placeholder="在当前文档查找…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) goPrev();
            else goNext();
          }
        }}
      />
      <span className="find-bar-counter">
        {!supported
          ? "浏览器不支持"
          : total === 0
            ? query
              ? "0 / 0"
              : ""
            : `${index + 1} / ${total}`}
      </span>
      <button
        className="icon-button"
        onClick={goPrev}
        title="上一个 (Shift+Enter)"
        disabled={total === 0}
      >
        <ChevronUp size={14} />
      </button>
      <button
        className="icon-button"
        onClick={goNext}
        title="下一个 (Enter)"
        disabled={total === 0}
      >
        <ChevronDown size={14} />
      </button>
      <button className="icon-button" onClick={onClose} title="关闭 (Esc)">
        <X size={14} />
      </button>
    </div>
  );
}
