import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";

// Typora 风格：在 paragraph 里输入 ``` （可带可选语言名），按 Enter 时把整段转成 code_block。
// Milkdown 自带的 inputRule 只在空白字符触发（regex 末尾是 [\s\n]$），按 Enter 不会进入 input
// 规则的判定路径，所以这里挂一个 handleKeyDown 钩子拦截 Enter。
//
// 匹配规则：
//   ^```(?<language>[a-zA-Z0-9_+-]*)\s*$    （三反引号 + 可选语言 + 末尾允许有空格）
//
// 仅在 selection.empty 且光标父节点是 paragraph 时才动；否则透传给后续处理。

const key = new PluginKey("penraft-codeblock-enter");

const FENCE_RE = /^```([a-zA-Z0-9_+-]*)\s*$/;

export const codeBlockEnterPlugin = new Plugin({
  key,
  props: {
    handleKeyDown(view, event) {
      if (event.key !== "Enter") return false;
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
      const { state } = view;
      if (!state.selection.empty) return false;
      const { $from } = state.selection;
      const parent = $from.parent;
      if (parent.type.name !== "paragraph") return false;
      const match = FENCE_RE.exec(parent.textContent);
      if (!match) return false;
      const codeBlockType = state.schema.nodes.code_block;
      if (!codeBlockType) return false;
      const language = match[1] || "";
      const blockStart = $from.before();
      const blockEnd = $from.after();
      const tr = state.tr.replaceRangeWith(
        blockStart,
        blockEnd,
        codeBlockType.create({ language }),
      );
      tr.setSelection(TextSelection.create(tr.doc, blockStart + 1));
      view.dispatch(tr.scrollIntoView());
      return true;
    },
  },
});
