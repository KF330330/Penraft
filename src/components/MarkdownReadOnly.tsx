import { useEffect } from "react";
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx, editorViewCtx, prosePluginsCtx } from "@milkdown/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import {
  cleanMarkdown,
  frontmatterToYamlFence,
  installAnchorClickHandler,
} from "./markdown-utils";
import { mermaidProseMirrorPlugin } from "./mermaid-plugin";

interface Props {
  value: string;
}

function Inner({ value }: Props) {
  const { get } = useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, frontmatterToYamlFence(cleanMarkdown(value)));
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          editable: () => false,
        }));
        ctx.update(prosePluginsCtx, (prev) => [...prev, mermaidProseMirrorPlugin]);
      })
      .use(commonmark)
      .use(gfm)
  , [value]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
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
        cleanup = installAnchorClickHandler(view.dom as HTMLElement);
      });
    };
    install();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [get]);

  return <Milkdown />;
}

export default function MarkdownReadOnly({ value }: Props) {
  return (
    <div className="markdown-readonly">
      <MilkdownProvider>
        <Inner value={value} />
      </MilkdownProvider>
    </div>
  );
}
