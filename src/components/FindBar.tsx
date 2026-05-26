import { SearchCursor } from "@codemirror/search";
import { EditorSelection } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findCurrentMark, findMatchMark, setFindHighlights } from "../lib/find-state";

// 文档内查找浮条，渲染模式和源码模式共用同一套 UI。
// - 渲染模式：用 CSS Custom Highlight API 给 ProseMirror DOM 上色。
// - 源码模式：通过 setFindHighlights effect 给 CodeMirror 下发 Decoration，
//   同时 dispatch selection + scrollIntoView 让当前命中可见。

interface FindBarProps {
  mode: "render" | "source";
  cmView: EditorView | null;
  onClose: () => void;
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

function clearDomHighlights() {
  if (!hasCustomHighlight()) return;
  CSS.highlights.delete(HIGHLIGHT_ALL);
  CSS.highlights.delete(HIGHLIGHT_CURRENT);
}

function clearCmHighlights(view: EditorView | null) {
  if (!view) return;
  view.dispatch({ effects: setFindHighlights.of(Decoration.none) });
}

function findEditorRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".wysiwyg-column .ProseMirror");
}

function collectRenderMatches(root: HTMLElement, query: string): Range[] {
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
          // 极少出现的 Range 创建失败，跳过
        }
        from = idx + Math.max(1, needle.length);
      }
    }
    current = walker.nextNode();
  }
  return ranges;
}

function collectCmMatches(view: EditorView, query: string): Array<{ from: number; to: number }> {
  if (!query) return [];
  const matches: Array<{ from: number; to: number }> = [];
  const cursor = new SearchCursor(
    view.state.doc,
    query,
    0,
    view.state.doc.length,
    (s) => s.toLowerCase(),
  );
  while (!cursor.next().done) {
    matches.push({ from: cursor.value.from, to: cursor.value.to });
  }
  return matches;
}

export function FindBar({ mode, cmView, onClose, documentKey, initialQuery }: FindBarProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [domMatches, setDomMatches] = useState<Range[]>([]);
  const [cmMatches, setCmMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // 关闭时清两套高亮（互不干扰）
  useEffect(() => {
    return () => {
      clearDomHighlights();
      clearCmHighlights(cmView);
    };
  }, [cmView]);

  // 切模式时清掉另一侧的高亮，避免残留
  useEffect(() => {
    if (mode === "render") clearCmHighlights(cmView);
    else clearDomHighlights();
  }, [mode, cmView]);

  // 查询/文档变化时重新算匹配
  useEffect(() => {
    if (!query) {
      setDomMatches([]);
      setCmMatches([]);
      setIndex(0);
      clearDomHighlights();
      clearCmHighlights(cmView);
      return;
    }
    if (mode === "render") {
      const root = findEditorRoot();
      if (!root) {
        setDomMatches([]);
        setIndex(0);
        return;
      }
      setDomMatches(collectRenderMatches(root, query));
      setCmMatches([]);
      setIndex(0);
    } else {
      if (!cmView) {
        setCmMatches([]);
        setIndex(0);
        return;
      }
      setCmMatches(collectCmMatches(cmView, query));
      setDomMatches([]);
      setIndex(0);
    }
  }, [query, documentKey, mode, cmView]);

  // 渲染模式：把 DOM Range 推给 CSS Custom Highlight API
  useEffect(() => {
    if (mode !== "render") return;
    if (!hasCustomHighlight()) return;
    if (domMatches.length === 0) {
      clearDomHighlights();
      return;
    }
    CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...domMatches));
    const current = domMatches[Math.min(index, domMatches.length - 1)];
    if (current) {
      CSS.highlights.set(HIGHLIGHT_CURRENT, new Highlight(current));
      const container =
        current.startContainer.nodeType === Node.ELEMENT_NODE
          ? (current.startContainer as HTMLElement)
          : current.startContainer.parentElement;
      container?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [mode, domMatches, index]);

  // 源码模式：把匹配作为 Decoration 下发，并把当前命中选中 + 滚到中部
  useEffect(() => {
    if (mode !== "source" || !cmView) return;
    if (cmMatches.length === 0) {
      cmView.dispatch({ effects: setFindHighlights.of(Decoration.none) });
      return;
    }
    const currentIdx = Math.min(index, cmMatches.length - 1);
    const decos = cmMatches.map((m, i) =>
      i === currentIdx ? findCurrentMark.range(m.from, m.to) : findMatchMark.range(m.from, m.to),
    );
    const set = Decoration.set(decos, true);
    const current = cmMatches[currentIdx];
    cmView.dispatch({
      effects: [
        setFindHighlights.of(set),
        EditorView.scrollIntoView(EditorSelection.range(current.from, current.to), {
          y: "center",
        }),
      ],
      selection: EditorSelection.single(current.from, current.to),
    });
  }, [mode, cmMatches, index, cmView]);

  const total = mode === "render" ? domMatches.length : cmMatches.length;

  const goNext = () => {
    if (total === 0) return;
    setIndex((i) => (i + 1) % total);
  };
  const goPrev = () => {
    if (total === 0) return;
    setIndex((i) => (i - 1 + total) % total);
  };

  const supported = mode === "source" ? cmView !== null : hasCustomHighlight();

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
          ? "暂不可用"
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
