import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

// 源码模式下，FindBar 把所有匹配/当前匹配作为装饰下发给 CodeMirror。
// 注册 setFindHighlights 这个 StateEffect 用于推送装饰集，findHighlightField
// 把装饰挂到视图层。FindBar 只需要 dispatch effect，编辑器组件无须感知 query。

export const setFindHighlights = StateEffect.define<DecorationSet>();

export const findHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setFindHighlights)) return e.value;
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const findMatchMark = Decoration.mark({ class: "cm-find-match" });
export const findCurrentMark = Decoration.mark({ class: "cm-find-match-current" });
