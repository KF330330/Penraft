import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from "@milkdown/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";

interface Props {
  value: string;
}

function cleanMarkdown(md: string): string {
  return md
    .replace(/ {2}\n/g, "\n")
    .replace(/\\\n/g, "\n")
    .replace(/^[ \t]*<br\s*\/?>[ \t]*$/gim, "")
    .replace(/<!--\s*([\s\S]*?)\s*-->/g, "$1")
    .replace(/^\n+/, "");
}

function Inner({ value }: Props) {
  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, cleanMarkdown(value));
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          editable: () => false,
        }));
      })
      .use(commonmark)
      .use(gfm)
  , [value]);

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
