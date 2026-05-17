import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const TEXT = "#24292e";
const HEADING = "#b45309";

const quietMarkdownHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "600", color: HEADING },
  { tag: t.heading1, fontWeight: "600", color: HEADING },
  { tag: t.heading2, fontWeight: "600", color: HEADING },
  { tag: t.heading3, fontWeight: "600", color: HEADING },
  { tag: t.heading4, fontWeight: "600", color: HEADING },
  { tag: t.heading5, fontWeight: "600", color: HEADING },
  { tag: t.heading6, fontWeight: "600", color: HEADING },
  { tag: t.strong, fontWeight: "600", color: TEXT },
  { tag: t.emphasis, fontStyle: "italic", color: TEXT },
  { tag: t.link, color: TEXT, textDecoration: "underline" },
  { tag: t.url, color: TEXT },
  { tag: t.monospace, color: TEXT },
  { tag: t.meta, color: TEXT },
  { tag: t.processingInstruction, color: HEADING },
  { tag: t.content, color: TEXT },
]);

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  return (
    <CodeMirror
      value={value}
      height="100%"
      extensions={[markdown(), syntaxHighlighting(quietMarkdownHighlight)]}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        searchKeymap: true,
      }}
      onChange={(next) => onChange(next)}
    />
  );
}
