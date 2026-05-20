import type { Node as ProseNode } from "@milkdown/prose/model";
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
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

export function createMermaidNodeView(
  node: ProseNode,
  _view: EditorView,
  _getPos: () => number | undefined,
): NodeView {
  const dom = document.createElement("div");
  dom.className = "penraft-mermaid";
  dom.setAttribute("contenteditable", "false");

  const svgWrap = document.createElement("div");
  svgWrap.className = "penraft-mermaid-svg";
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

  const themeObserver = new MutationObserver(() => {
    void render(currentCode);
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return {
    dom,
    update(newNode) {
      if (newNode.type !== node.type) return false;
      const newCode = newNode.textContent;
      if (newCode !== currentCode) {
        currentCode = newCode;
        void render(newCode);
      }
      return true;
    },
    selectNode() {
      dom.classList.add("penraft-mermaid--selected");
    },
    deselectNode() {
      dom.classList.remove("penraft-mermaid--selected");
    },
    ignoreMutation() {
      return true;
    },
    stopEvent() {
      return false;
    },
    destroy() {
      themeObserver.disconnect();
      renderToken++;
    },
  };
}
