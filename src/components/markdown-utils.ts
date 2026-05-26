// 通用清洗：剥掉历史 round-trip 留下的 <br />、HTML 注释以及 CommonMark 硬换行
// 标记，让源码与磁盘里的 Markdown 维持干净。不折叠连续空行——用户写几行就保留几行。
export function cleanMarkdown(md: string): string {
  return md
    .replace(/ {2}\n/g, "\n")
    .replace(/\\\n/g, "\n")
    .replace(/^[ \t]*<br\s*\/?>[ \t]*$/gim, "")
    .replace(/<!--\s*([\s\S]*?)\s*-->/g, "$1")
    .replace(/^\n+/, "");
}

// 把文件最前端的 YAML frontmatter (`---\n...\n---\n`) 替换为 ```yaml 代码围栏，
// 这样 Milkdown / CommonMark 会用 code_block 节点渲染（等宽 + 灰底），视觉对齐
// Typora 的元数据盒子。仅匹配文档最开头，不会影响正文里的 `---` 水平线。
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const YAML_FENCE_RE = /^```yaml\r?\n([\s\S]*?)\r?\n```\r?\n?/;

export function frontmatterToYamlFence(md: string): string {
  const m = md.match(FRONTMATTER_RE);
  if (!m) return md;
  const yaml = m[1];
  const rest = md.slice(m[0].length);
  return "```yaml\n" + yaml + "\n```\n" + rest;
}

// 出 Milkdown：若首块是 ```yaml...``` 代码块，还原为 `---...---` frontmatter，
// 保证写回磁盘的格式与读入时一致。
export function yamlFenceToFrontmatter(md: string): string {
  const m = md.match(YAML_FENCE_RE);
  if (!m) return md;
  const yaml = m[1];
  const rest = md.slice(m[0].length);
  return "---\n" + yaml + "\n---\n" + rest;
}

// GitHub-Slugger 风格：小写、空格转 `-`、保留 Unicode 字母/数字与 `-`、其余字符去除。
// 已核对用户 TOC（如 `#experience-模块由来`、`#pv-uv-与访次定义`）符合此规则。
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "");
}

// ⌘A 限定到 frontmatter 框：光标在 code_block 内首次按 ⌘A，只选中该块内容；
// 已经处于「整块选中」时不拦截，让 ProseMirror 默认 selectAll 展到全文（VS Code /
// Typora 行为）。光标不在 code_block 时也不拦截。返回 cleanup。
//
// 注意：必须用 stopImmediatePropagation 而不是 stopPropagation —— ProseMirror 的
// keydown 监听器和我们的 handler 挂在同一个 view.dom 上，stopPropagation 只会阻
// 断到其他元素的传播，不会阻断同元素上的其他监听器。如果只用 stopPropagation，
// PM 的 baseKeymap 里的 selectAll 命令仍然会在我们 dispatch 之后把选区扩到全文。
import { TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

export function installScopedSelectAll(view: EditorView): () => void {
  const handler = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.shiftKey || e.altKey) return;
    if (e.key !== "a" && e.key !== "A") return;

    const { state } = view;
    const { $from } = state.selection;

    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type.name !== "code_block") depth--;
    if (depth === 0 || $from.node(depth).type.name !== "code_block") return;

    const blockStart = $from.start(depth);
    const blockEnd = $from.end(depth);

    const sel = state.selection;
    if (sel.from === blockStart && sel.to === blockEnd) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    view.dispatch(
      state.tr.setSelection(TextSelection.create(state.doc, blockStart, blockEnd)),
    );
  };
  view.dom.addEventListener("keydown", handler, true);
  return () => view.dom.removeEventListener("keydown", handler, true);
}

// 给容器内的锚点链接装上 ⌘/Ctrl+Click 跳转：按住修饰键点 `<a href="#...">` 时，
// 阻止 ProseMirror 的默认选区行为，按 slug 匹配容器内的标题并平滑滚动过去。
// 返回 cleanup 函数；在 useEffect 中调用并在 unmount 时执行。
export function installAnchorClickHandler(root: HTMLElement): () => void {
  const handler = (e: MouseEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const anchor = target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("#")) return;
    e.preventDefault();
    e.stopPropagation();
    const targetSlug = decodeURIComponent(href.slice(1));
    const headings = root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
    const seen = new Map<string, number>();
    for (const h of Array.from(headings)) {
      const base = slugify(h.textContent ?? "");
      const count = seen.get(base) ?? 0;
      const slug = count === 0 ? base : `${base}-${count}`;
      seen.set(base, count + 1);
      if (slug === targetSlug) {
        h.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  };
  root.addEventListener("click", handler, true);
  return () => root.removeEventListener("click", handler, true);
}
