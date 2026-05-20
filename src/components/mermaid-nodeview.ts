import type { Node as ProseNode } from "@milkdown/prose/model";
import { TextSelection } from "@milkdown/prose/state";
import type { EditorView, NodeView } from "@milkdown/prose/view";

type MermaidModule = typeof import("mermaid")["default"];

let mermaidPromise: Promise<MermaidModule> | null = null;
let renderCounter = 0;

function detectTheme(): "default" | "dark" {
  const t = document.documentElement.dataset.theme;
  return t === "dark" ? "dark" : "default";
}

async function getMermaid(): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: detectTheme(),
        flowchart: { useMaxWidth: true },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

export function createMermaidNodeView(
  node: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  const editable = view.editable;

  const dom = document.createElement("div");
  dom.className = "penraft-mermaid";
  dom.dataset.expanded = "false";

  const langLabel = document.createElement("div");
  langLabel.className = "penraft-mermaid-lang";
  langLabel.textContent = "mermaid";
  langLabel.contentEditable = "false";
  dom.appendChild(langLabel);

  const sourcePre = document.createElement("pre");
  sourcePre.className = "penraft-mermaid-source";
  const sourceCode = document.createElement("code");
  if (!editable) sourceCode.contentEditable = "false";
  sourcePre.appendChild(sourceCode);
  dom.appendChild(sourcePre);

  const svgWrap = document.createElement("div");
  svgWrap.className = "penraft-mermaid-svg";
  svgWrap.contentEditable = "false";
  dom.appendChild(svgWrap);

  let currentCode = node.textContent;
  let renderToken = 0;

  const showError = (code: string, err: unknown) => {
    const msg = document.createElement("div");
    msg.className = "penraft-mermaid-error-msg";
    msg.textContent = `Mermaid 渲染失败：${err instanceof Error ? err.message : String(err)}`;
    const pre = document.createElement("pre");
    pre.className = "penraft-mermaid-error-source";
    pre.textContent = code;
    svgWrap.innerHTML = "";
    svgWrap.appendChild(msg);
    svgWrap.appendChild(pre);
  };

  const render = async (code: string) => {
    const token = ++renderToken;
    const trimmed = code.trim();
    if (!trimmed) {
      svgWrap.textContent = "";
      return;
    }
    try {
      const mermaid = await getMermaid();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: detectTheme(),
        flowchart: { useMaxWidth: true },
      });
      const id = `penraft-mermaid-${++renderCounter}`;
      const { svg } = await mermaid.render(id, trimmed);
      if (token !== renderToken) return;
      svgWrap.innerHTML = svg;
    } catch (err) {
      if (token !== renderToken) return;
      showError(trimmed, err);
    }
  };

  void render(currentCode);

  const setExpanded = (next: boolean) => {
    const desired = editable ? next : false;
    if (dom.dataset.expanded === String(desired)) return;
    dom.dataset.expanded = String(desired);
  };

  const onSvgMouseDown = (e: MouseEvent) => {
    if (!editable) return;
    e.preventDefault();
    setExpanded(true);
    const pos = getPos();
    if (pos == null) {
      view.focus();
      return;
    }
    const endInside = pos + node.nodeSize - 1;
    try {
      const tr = view.state.tr.setSelection(
        TextSelection.create(view.state.doc, endInside),
      );
      view.dispatch(tr);
    } catch {
      /* selection out of range during rapid updates: ignore */
    }
    view.focus();
  };
  svgWrap.addEventListener("mousedown", onSvgMouseDown);

  const onDocMouseDown = (e: MouseEvent) => {
    if (!editable) return;
    const target = e.target as Node | null;
    if (target && dom.contains(target)) return;
    setExpanded(false);
  };
  if (editable) document.addEventListener("mousedown", onDocMouseDown, true);

  const themeObserver = new MutationObserver(() => {
    void render(currentCode);
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return {
    dom,
    contentDOM: sourceCode,
    update(newNode) {
      if (newNode.type !== node.type) return false;
      const lang = String(newNode.attrs.language || "").toLowerCase();
      if (lang !== "mermaid") return false;
      node = newNode;
      const newCode = newNode.textContent;
      if (newCode !== currentCode) {
        currentCode = newCode;
        void render(newCode);
      }
      return true;
    },
    selectNode() {
      dom.classList.add("penraft-mermaid--selected");
      setExpanded(true);
    },
    deselectNode() {
      dom.classList.remove("penraft-mermaid--selected");
    },
    ignoreMutation(mutation) {
      const target = mutation.target as Node;
      return !sourceCode.contains(target);
    },
    stopEvent() {
      return false;
    },
    destroy() {
      themeObserver.disconnect();
      svgWrap.removeEventListener("mousedown", onSvgMouseDown);
      if (editable) document.removeEventListener("mousedown", onDocMouseDown, true);
      renderToken++;
    },
  };
}
