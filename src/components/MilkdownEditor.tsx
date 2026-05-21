import { useEffect, useRef } from "react";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, parserCtx, prosePluginsCtx } from "@milkdown/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { Slice } from "@milkdown/prose/model";
import {
  cleanMarkdown,
  frontmatterToYamlFence,
  yamlFenceToFrontmatter,
  installAnchorClickHandler,
  installScopedSelectAll,
} from "./markdown-utils";
import { mermaidProseMirrorPlugin } from "./mermaid-plugin";

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
        ctx.update(prosePluginsCtx, (prev) => [...prev, mermaidProseMirrorPlugin]);
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
