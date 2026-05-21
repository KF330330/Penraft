import { Plugin, PluginKey } from "@milkdown/prose/state";
import { createMermaidNodeView } from "./mermaid-nodeview";

const key = new PluginKey("penraft-mermaid");

export const mermaidProseMirrorPlugin = new Plugin({
  key,
  props: {
    nodeViews: {
      code_block: (node, view, getPos) => {
        const lang = String(node.attrs.language || "").toLowerCase();
        if (lang !== "mermaid") return null as unknown as ReturnType<typeof createMermaidNodeView>;
        return createMermaidNodeView(node, view, getPos as () => number | undefined);
      },
    },
  },
});
