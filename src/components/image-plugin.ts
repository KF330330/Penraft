import { Plugin, PluginKey } from "@milkdown/prose/state";
import { createImageNodeView } from "./image-nodeview";

const key = new PluginKey("penraft-image");

export const imageProseMirrorPlugin = new Plugin({
  key,
  props: {
    nodeViews: {
      image: (node, view, getPos) =>
        createImageNodeView(node, view, getPos as () => number | undefined),
    },
  },
});
