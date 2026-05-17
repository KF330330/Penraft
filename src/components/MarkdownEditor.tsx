import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

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
}

export function MarkdownEditor({ value, onChange, theme }: MarkdownEditorProps) {
  const extensions = useMemo(
    () => [markdown(), syntaxHighlighting(buildHighlight(theme))],
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
        searchKeymap: true,
      }}
      onChange={(next) => onChange(next)}
    />
  );
}
