import { useEffect, useRef } from "react";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, parserCtx, prosePluginsCtx } from "@milkdown/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { Slice } from "@milkdown/prose/model";
import { TextSelection } from "@milkdown/prose/state";
import { keymap as createKeymap } from "@milkdown/prose/keymap";
import {
  cleanMarkdown,
  frontmatterToYamlFence,
  yamlFenceToFrontmatter,
  installAnchorClickHandler,
  installScopedSelectAll,
} from "./markdown-utils";
import { mermaidProseMirrorPlugin } from "./mermaid-plugin";
import { codeBlockEnterPlugin } from "./code-block-enter-plugin";

// ↓ 兜底出框：光标停在文档末块（非 paragraph）的视觉末行时按 ↓，追加一段空 paragraph 让用户跳出去。
// 用一个独立的 PM keymap 插件而不是走 Milkdown KeymapManager —— 前者直接放进 prosePluginsCtx
// 最前面，someProp("handleKeyDown") 第一个就命中我们；后者注册时机依赖 keymapCtx 已被 keymap 插件
// 注入，config 回调阶段拿到的可能是 createSlice 时的默认占位实例，注册无效。
const arrowDownExitKeymap = createKeymap({
  ArrowDown: (state, dispatch) => {
    if (!state.selection.empty) return false;
    const { $from } = state.selection;
    // 只在顶层块内介入（list_item 嵌套等场景让出）
    if ($from.depth !== 1) return false;
    // 必须是文档最末块；用位置数字判定，不依赖节点引用相等
    if ($from.after(1) !== state.doc.content.size) return false;
    // paragraph 不掺和，让 PM 默认 ↓ 自然处理
    if ($from.parent.type.name === "paragraph") return false;
    // 视觉末行判定：光标到末块末尾之间没有再隔 \n（多行 code_block 非末行时让出）
    const text = $from.parent.textContent;
    if (text.slice($from.parentOffset).includes("\n")) return false;
    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return false;
    if (dispatch) {
      const endPos = state.doc.content.size;
      const tr = state.tr.insert(endPos, paragraphType.create());
      // 必须用 tr.doc（新 doc）而不是 state.tr.doc（getter，会返回旧 doc 的全新 tr）
      tr.setSelection(TextSelection.create(tr.doc, endPos + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  },
});

interface MilkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

// 仅含一个 NBSP 的行作为「视觉空段」占位符。CommonMark 不把 NBSP 视为空白，
// Milkdown 会把这种行当作非空段落保留，从而在 WYSIWYG 撑开行高。
const BLANK_PLACEHOLDER = " ";
const BLANK_PLACEHOLDER_LINE = /^[ \t]* [ \t]*$/;

// 出 Milkdown：把占位段还原为纯空行，让磁盘 .md 保留用户原始空行数。
function collapsePlaceholders(md: string): string {
  const lines = md.split("\n");
  let inFence = false;
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence && BLANK_PLACEHOLDER_LINE.test(line)) continue;
    out.push(line);
  }
  return out.join("\n");
}

// 入 Milkdown 前：把 K≥2 个连续空行展开为「1 个真空行 + (K-1) 个占位段，每个占
// 位段后跟一空行」，让渲染模式撑出 K 行视觉间距（Typora 行为）。跳过代码围栏。
function expandBlankRuns(md: string): string {
  const lines = md.split("\n");
  let inFence = false;
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
      inFence = !inFence;
      out.push(line);
      i++;
      continue;
    }
    if (inFence || trimmed !== "") {
      out.push(line);
      i++;
      continue;
    }
    let runEnd = i;
    while (runEnd + 1 < lines.length && lines[runEnd + 1].trim() === "") {
      runEnd++;
    }
    const K = runEnd - i + 1;
    out.push("");
    for (let j = 0; j < K - 1; j++) {
      out.push(BLANK_PLACEHOLDER);
      out.push("");
    }
    i = runEnd + 1;
  }
  return out.join("\n");
}

// 入 Milkdown 前：先做通用清洗，再把段落内的"软换行"改成硬换行让 WYSIWYG 保留
// 视觉换行。跳过 heading / list / blockquote / table / 代码块 等已经有块级语
// 义的行。
function applyHardBreaks(md: string): string {
  const lines = md.split("\n");
  let inFence = false;
  return lines
    .map((line, i) => {
      const trimmed = line.trim();
      if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (BLANK_PLACEHOLDER_LINE.test(line)) return line;
      const next = lines[i + 1] ?? "";
      const lineBlank = trimmed === "";
      const nextBlank = next.trim() === "";
      const isLast = i === lines.length - 1;
      if (lineBlank || nextBlank || isLast) return line;
      if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\||---+\s*$|===+\s*$)/.test(trimmed)) {
        return line;
      }
      if (/ {2}$/.test(line) || /\\$/.test(line)) return line;
      return line + "  ";
    })
    .join("\n");
}

const toMilkdown = (md: string) =>
  applyHardBreaks(expandBlankRuns(frontmatterToYamlFence(cleanMarkdown(md))));
const fromMilkdown = (md: string) =>
  yamlFenceToFrontmatter(cleanMarkdown(collapsePlaceholders(md)));

function MilkdownInner({ value, onChange }: MilkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialCleaned = cleanMarkdown(value);
  const lastInternalRef = useRef<string>(initialCleaned);
  const suppressEmitRef = useRef(true);

  useEffect(() => {
    if (initialCleaned !== value) {
      onChangeRef.current(initialCleaned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { get } = useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, toMilkdown(value));
        ctx.update(prosePluginsCtx, (prev) => [
          // 放最前面，someProp("handleKeyDown") 第一个就命中
          arrowDownExitKeymap,
          ...prev,
          mermaidProseMirrorPlugin,
          codeBlockEnterPlugin,
        ]);
        ctx.get(listenerCtx).markdownUpdated((_c, markdown) => {
          if (suppressEmitRef.current) {
            suppressEmitRef.current = false;
            return;
          }
          const cleaned = fromMilkdown(markdown);
          if (cleaned === lastInternalRef.current) return;
          lastInternalRef.current = cleaned;
          onChangeRef.current(cleaned);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener),
  );

  useEffect(() => {
    if (value === lastInternalRef.current) return;
    const editor = get();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const parser = ctx.get(parserCtx);
      const doc = parser(toMilkdown(value));
      if (!doc) return;
      suppressEmitRef.current = true;
      const state = view.state;
      view.dispatch(
        state.tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0)),
      );
      lastInternalRef.current = value;
    });
  }, [value, get]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    let cancelled = false;
    const install = () => {
      if (cancelled) return;
      const editor = get();
      if (!editor) {
        requestAnimationFrame(install);
        return;
      }
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        cleanups.push(installAnchorClickHandler(view.dom as HTMLElement));
        cleanups.push(installScopedSelectAll(view));
      });
    };
    install();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [get]);

  return <Milkdown />;
}

export function MilkdownEditor(props: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownInner {...props} />
    </MilkdownProvider>
  );
}
