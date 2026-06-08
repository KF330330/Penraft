import type { Node as ProseNode } from "@milkdown/prose/model";
import { NodeSelection } from "@milkdown/prose/state";
import type { EditorView, NodeView } from "@milkdown/prose/view";

interface ImageAttrs {
  src: string;
  alt: string;
  title: string;
}

function readAttrs(node: ProseNode): ImageAttrs {
  return {
    src: String(node.attrs.src ?? ""),
    alt: String(node.attrs.alt ?? ""),
    title: String(node.attrs.title ?? ""),
  };
}

// attrs → markdown 源码文本 `![alt](src "title")`
function buildSource(attrs: ImageAttrs): string {
  return `![${attrs.alt}](${attrs.src}${attrs.title ? ` "${attrs.title}"` : ""})`;
}

// markdown 源码文本 → attrs；解析失败返回 null
function parseSource(text: string): ImageAttrs | null {
  const m = text
    .trim()
    .match(/^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)$/);
  if (!m) return null;
  return { alt: m[1] ?? "", src: m[2] ?? "", title: m[3] ?? "" };
}

export function createImageNodeView(
  node: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  const editable = view.editable;

  const dom = document.createElement("span");
  dom.className = "penraft-image";
  dom.dataset.expanded = "false";

  const img = document.createElement("img");
  dom.appendChild(img);

  const sourcePre = document.createElement("pre");
  sourcePre.className = "penraft-image-source";
  const sourceCode = document.createElement("code");
  sourceCode.contentEditable = editable ? "true" : "false";
  sourceCode.spellcheck = false;
  sourcePre.appendChild(sourceCode);
  dom.appendChild(sourcePre);

  let attrs = readAttrs(node);

  const syncImg = () => {
    img.setAttribute("src", attrs.src);
    img.setAttribute("alt", attrs.alt);
    if (attrs.title) img.setAttribute("title", attrs.title);
    else img.removeAttribute("title");
  };
  const syncSource = () => {
    sourceCode.textContent = buildSource(attrs);
  };
  syncImg();
  syncSource();

  const setExpanded = (next: boolean) => {
    const desired = editable ? next : false;
    if (dom.dataset.expanded === String(desired)) return;
    dom.dataset.expanded = String(desired);
  };

  const focusSource = () => {
    sourceCode.focus();
    const range = document.createRange();
    range.selectNodeContents(sourceCode);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  // 提交：解析源码框文本，成功且有变化则写回节点 attrs；失败则还原文本
  const commit = () => {
    if (!editable) return;
    const parsed = parseSource(sourceCode.textContent ?? "");
    if (!parsed) {
      syncSource();
      return;
    }
    if (
      parsed.src === attrs.src &&
      parsed.alt === attrs.alt &&
      parsed.title === attrs.title
    ) {
      return;
    }
    const pos = getPos();
    if (pos == null) {
      syncSource();
      return;
    }
    try {
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, parsed));
    } catch {
      syncSource();
    }
  };

  // 点击图片：选中本节点（→ selectNode 展开）
  const onImgMouseDown = (e: MouseEvent) => {
    if (!editable) return;
    e.preventDefault();
    const pos = getPos();
    if (pos == null) return;
    try {
      view.dispatch(
        view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)),
      );
    } catch {
      /* 位置在快速更新中越界：忽略 */
    }
    setExpanded(true);
    focusSource();
  };
  img.addEventListener("mousedown", onImgMouseDown);

  const onSourceKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      setExpanded(false);
      view.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      syncSource();
      setExpanded(false);
      view.focus();
    }
  };
  sourceCode.addEventListener("keydown", onSourceKeyDown);

  const onSourceBlur = () => {
    commit();
  };
  sourceCode.addEventListener("blur", onSourceBlur);

  // 点击 dom 之外：提交并收起（与 mermaid onDocMouseDown 同构）
  const onDocMouseDown = (e: MouseEvent) => {
    if (!editable) return;
    const target = e.target as Node | null;
    if (target && dom.contains(target)) return;
    if (dom.dataset.expanded !== "true") return;
    commit();
    setExpanded(false);
  };
  if (editable) document.addEventListener("mousedown", onDocMouseDown, true);

  return {
    dom,
    update(newNode) {
      if (newNode.type !== node.type) return false;
      node = newNode;
      attrs = readAttrs(newNode);
      syncImg();
      // 编辑中（源码框聚焦）不要覆盖用户正在输入的文本
      if (document.activeElement !== sourceCode) syncSource();
      return true;
    },
    selectNode() {
      dom.classList.add("penraft-image--selected");
      setExpanded(true);
      focusSource();
    },
    deselectNode() {
      dom.classList.remove("penraft-image--selected");
    },
    // 无 contentDOM：源码框内的事件交给浏览器，PM 不抢键鼠
    stopEvent(e) {
      const target = e.target as Node | null;
      return !!target && sourceCode.contains(target);
    },
    ignoreMutation() {
      return true;
    },
    destroy() {
      img.removeEventListener("mousedown", onImgMouseDown);
      sourceCode.removeEventListener("keydown", onSourceKeyDown);
      sourceCode.removeEventListener("blur", onSourceBlur);
      if (editable) document.removeEventListener("mousedown", onDocMouseDown, true);
    },
  };
}
