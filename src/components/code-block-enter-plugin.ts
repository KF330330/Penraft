import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";

// 一个插件三件事，全部围绕"让代码框易进易出"：
//
// 入口（paragraph → code_block，Typora 风格）：
//   在 paragraph 里输入 ``` （可带可选语言名），按 Enter 时把整段转成 code_block。
//   Milkdown 自带的 inputRule 只在空白字符触发（regex 末尾是 [\s\n]$），按 Enter
//   不会进入 input 规则的判定路径，所以这里挂一个 handleKeyDown 钩子拦截 Enter。
//
//   匹配规则：^```(?<language>[a-zA-Z0-9_+-]*)\s*$
//
//   注意：Enter 在 code_block 内永远只换行，不出框。出框只靠下面两条路径。
//
// 出口 B（鼠标点击代码框/任意末块的下方空白）：
//   PM 默认在空白处点击会把光标吸到最近的合法位置，对 code_block 来说就是"末尾还在
//   框内"——用户想跳出去就只能反复按 ↓。这里在 mousedown 捕获用户点在最后一块
//   bounding-rect 下方的情况，按需追加一段空 paragraph 并把光标放过去。不永久性
//   追加 trailing paragraph，避免污染序列化。
//
// 出口 C（↓ 在文档末块内容末尾兜底）：
//   PM 默认 ↓ 在"最末块就是 code_block / heading / list、且后面没有任何节点"时
//   会让光标卡在末块末尾不动。这里拦截这一边界条件：cursor 停在 doc.lastChild 的
//   末尾、且该块不是 paragraph 时，追加一个空 paragraph 并把光标跳过去。
//   其它 ↓ 行为（中间 ↓ 换行、末块下方已有别的块时 ↓ 跳过去）一律不掺和。
//
// 入口的 Enter 分支与出口 C 的 ↓ 分支都只在 selection.empty 时介入。

const key = new PluginKey("penraft-codeblock-enter");

const FENCE_RE = /^```([a-zA-Z0-9_+-]*)\s*$/;

export const codeBlockEnterPlugin = new Plugin({
  key,
  props: {
    handleKeyDown(view, event) {
      // 修饰键一律不接：Shift/Cmd/Ctrl/Alt + Enter 或 + ArrowDown 留给系统
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
      const { state } = view;
      if (!state.selection.empty) return false;
      const { $from } = state.selection;
      const parent = $from.parent;

      // ===== 入口：paragraph 里输入 ``` + Enter → code_block =====
      if (event.key === "Enter" && parent.type.name === "paragraph") {
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

      // ===== 出口 C：↓ 在文档末块内容末尾时按需追加 paragraph 跳出去 =====
      if (event.key === "ArrowDown") {
        if (state.doc.lastChild !== parent) return false;
        if ($from.pos !== $from.end()) return false;
        if (parent.type.name === "paragraph") return false;

        const paragraphType = state.schema.nodes.paragraph;
        if (!paragraphType) return false;

        const endPos = state.doc.content.size;
        const tr = state.tr
          .insert(endPos, paragraphType.create())
          .setSelection(TextSelection.create(state.tr.doc, endPos + 1));
        view.dispatch(tr.scrollIntoView());
        event.preventDefault();
        return true;
      }

      return false;
    },

    handleDOMEvents: {
      mousedown(view, event) {
        // 只处理主键单击，避免右键/中键
        if (event.button !== 0) return false;

        const editorEl = view.dom;
        const lastChild = editorEl.lastElementChild as HTMLElement | null;
        if (!lastChild) return false;

        const rect = lastChild.getBoundingClientRect();
        if (event.clientY <= rect.bottom) return false; // 没点到最末块下方空白

        const paragraphType = view.state.schema.nodes.paragraph;
        if (!paragraphType) return false;

        const docLast = view.state.doc.lastChild;
        const endPos = view.state.doc.content.size;
        const tr = view.state.tr;

        if (docLast && docLast.type === paragraphType && docLast.content.size === 0) {
          // 末块已经是空段落 —— 复用，把光标移过去
          tr.setSelection(TextSelection.near(tr.doc.resolve(endPos), -1));
        } else {
          tr.insert(endPos, paragraphType.create());
          tr.setSelection(TextSelection.create(tr.doc, endPos + 1));
        }

        view.dispatch(tr.scrollIntoView());
        event.preventDefault();
        return true;
      },
    },
  },
});
