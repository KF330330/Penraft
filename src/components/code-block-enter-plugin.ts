import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";

// 两件事都靠"在 paragraph / code_block 里拦截 Enter"实现：
//
// 入口（paragraph → code_block，Typora 风格）：
//   在 paragraph 里输入 ``` （可带可选语言名），按 Enter 时把整段转成 code_block。
//   Milkdown 自带的 inputRule 只在空白字符触发（regex 末尾是 [\s\n]$），按 Enter
//   不会进入 input 规则的判定路径，所以这里挂一个 handleKeyDown 钩子拦截 Enter。
//
//   匹配规则：^```(?<language>[a-zA-Z0-9_+-]*)\s*$
//
// 出口（code_block → paragraph，也是 Typora 风格）：
//   光标停在 code_block 末尾、且末尾确实是空行（textContent 以 \n 结尾）时按 Enter，
//   抹掉末尾 \n、在 code_block 后插一个空 paragraph、光标跳到新段落。
//   如果整个 code_block 只有一个 \n（刚 ```+Enter 创建完立刻想退出的情形），
//   直接把整个块替换成空 paragraph，不留下空 code_block。
//
// 仅在 selection.empty 时介入；其它情况一律透传给后续 handler。

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

      // ===== 入口：paragraph 里输入 ``` + Enter → code_block =====
      if (parent.type.name === "paragraph") {
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
      }

      // ===== 出口：code_block 末尾空行再按 Enter → 跳出到下方新段落 =====
      if (parent.type.name === "code_block") {
        // 必须在 code_block 末尾
        if ($from.pos !== $from.end()) return false;
        const text = parent.textContent;
        if (!text.endsWith("\n")) return false;

        const paragraphType = state.schema.nodes.paragraph;
        if (!paragraphType) return false;

        const tr = state.tr;
        if (text === "\n") {
          // 整个 code_block 只有一个空换行 —— 整块替换成空 paragraph
          const blockStart = $from.before();
          const blockEnd = $from.after();
          tr.replaceRangeWith(blockStart, blockEnd, paragraphType.create());
          tr.setSelection(TextSelection.create(tr.doc, blockStart + 1));
        } else {
          // 抹掉末尾 \n，在 code_block 之后塞一个空 paragraph
          const blockEnd = $from.end();
          const afterPos = $from.after();
          tr.delete(blockEnd - 1, blockEnd);
          // 删除 1 字符后 afterPos 整体往前位移 1
          const newAfterPos = afterPos - 1;
          tr.insert(newAfterPos, paragraphType.create());
          // paragraph 内部第一个有效光标位 = newAfterPos + 1
          tr.setSelection(TextSelection.create(tr.doc, newAfterPos + 1));
        }
        view.dispatch(tr.scrollIntoView());
        return true;
      }

      return false;
    },
  },
});
