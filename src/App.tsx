import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo } from "@tauri-apps/api/event";
import type { EditorView } from "@codemirror/view";
import { EditorPane } from "./components/EditorPane";
import { FindBar } from "./components/FindBar";
import type { Theme } from "./components/MarkdownEditor";
import { SearchPanel } from "./components/SearchPanel";
import { TabBar, type TabBarHandle } from "./components/TabBar";
import { ThemePicker } from "./components/ThemePicker";
import UpdateNotice from "./components/UpdateNotice";
import {
  createNote,
  deleteNote,
  exportNote,
  findWindowWithPath,
  listPenraftWindows,
  loadTabs,
  readNote,
  renameNote,
  revealInFinder,
  saveNote,
  saveTabs,
  setWindowPaths,
  takePendingOpenFiles,
} from "./lib/tauri";
import type { NoteDocument, TabsState, WindowGeom } from "./lib/types";
import { EVENTS, type MergeTabPayload } from "./lib/events";
import { useTauriListen } from "./lib/use-tauri-listen";
import { diag, setDiagWindow } from "./lib/diaglog";

const MAIN_WINDOW_LABEL = "main";

// tab-bar 高度从 CSS 变量 --tab-bar-height 读取（src/styles/global.css）。
// 40 仅作为变量缺失时的兜底。
function readTabBarHeightCss(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--tab-bar-height")
    .trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

function isInTabBarZone(
  w: WindowGeom,
  screenX: number,
  screenY: number,
  tabBarHeightCss: number,
): boolean {
  const topZonePhys = w.inner_y + tabBarHeightCss * w.scale_factor;
  return (
    screenX >= w.inner_x &&
    screenX <= w.inner_x + w.inner_width &&
    screenY >= w.inner_y &&
    screenY <= topZonePhys
  );
}

const AUTOSAVE_DELAY_MS = 500;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_DEFAULT = 1.0;
const THEME_KEY = "penraft.theme";
const THEMES: Theme[] = ["paper", "light", "dark"];

function loadInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY) as Theme | null;
  return saved && THEMES.includes(saved) ? saved : "paper";
}

function clampZoom(value: number) {
  if (!Number.isFinite(value)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

type SavingStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface OpenDoc {
  document: NoteDocument;
  content: string;
  lastSavedContent: string;
  savingStatus: SavingStatus;
  // 最近一次保存失败时的内容快照：同样内容不再自动重试，防 error→dirty 死循环狂弹 toast
  lastFailedContent?: string;
}

function makeOpenDoc(doc: NoteDocument): OpenDoc {
  return {
    document: doc,
    content: doc.content,
    lastSavedContent: doc.content,
    savingStatus: "idle",
  };
}

function getWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return MAIN_WINDOW_LABEL;
  }
}

function getInitialPathFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("path");
  } catch {
    return null;
  }
}

const WINDOW_LABEL = getWindowLabel();
const INITIAL_PATH = getInitialPathFromUrl();

// 让诊断日志每一行都带上本窗口标识（main / torn-*）。
setDiagWindow(WINDOW_LABEL);

export default function App() {
  const [docs, setDocs] = useState<OpenDoc[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [mode, setMode] = useState<"render" | "source">("render");
  const [searchOpen, setSearchOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findInitialQuery, setFindInitialQuery] = useState<string>("");
  const [toast, setToast] = useState("");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [theme, setTheme] = useState<Theme>(loadInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const saveTimer = useRef<number | null>(null);
  const tabsSaveTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const docsRef = useRef<OpenDoc[]>([]);
  const activePathRef = useRef<string | null>(null);
  const handleCreateRef = useRef<(() => Promise<void>) | null>(null);
  const tabBarRef = useRef<TabBarHandle | null>(null);
  const cmViewRef = useRef<EditorView | null>(null);
  // 内存级 per-tab 滚动位置（render/source 各存一份），不持久化；关 tab 时清理
  const scrollPosRef = useRef(new Map<string, { render?: number; source?: number }>());

  useEffect(() => { docsRef.current = docs; }, [docs]);
  useEffect(() => { activePathRef.current = activePath; }, [activePath]);

  // 诊断：记录活动 tab 的切换（from→to）。与上方 activePathRef 同步 effect 各持一份
  // prev，互不干扰；用于和 MilkdownEditor 的 focus-effect 配对，判断「切了 tab 但聚焦没跟上」。
  const prevDiagPathRef = useRef<string | null>(null);
  useEffect(() => {
    diag("switch", { from: prevDiagPathRef.current, to: activePath, mode });
    prevDiagPathRef.current = activePath;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    // 复用单一定时器：连续 toast 时取消旧的清除定时器，避免多个定时器错峰清空导致闪烁
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  const activeDoc = useMemo(
    () => docs.find((d) => d.document.summary.path === activePath) ?? null,
    [docs, activePath],
  );

  const saveScroll = useCallback((path: string, mode: "render" | "source", top: number) => {
    const entry = scrollPosRef.current.get(path) ?? {};
    entry[mode] = top;
    scrollPosRef.current.set(path, entry);
  }, []);

  const readScroll = useCallback((path: string, mode: "render" | "source") => {
    return scrollPosRef.current.get(path)?.[mode];
  }, []);

  const updateDoc = useCallback((path: string, updater: (doc: OpenDoc) => OpenDoc) => {
    setDocs((current) => current.map((d) => (d.document.summary.path === path ? updater(d) : d)));
  }, []);

  // 返回是否"数据已安全落盘"：无改动/文档不存在视为成功，仅在 saveNote 抛错时返回 false。
  // 调用方可据此决定是否继续会丢数据的后续动作（如撕出/合并移动 tab）。
  const persistDoc = useCallback(async (path: string): Promise<boolean> => {
    const target = docsRef.current.find((d) => d.document.summary.path === path);
    if (!target) return true;
    if (target.content === target.lastSavedContent) return true;
    const contentSnapshot = target.content;
    updateDoc(path, (d) => ({ ...d, savingStatus: "saving" }));
    try {
      const next = await saveNote(path, contentSnapshot);
      updateDoc(path, (d) =>
        d.content === contentSnapshot
          ? {
              ...d,
              document: next,
              lastSavedContent: contentSnapshot,
              savingStatus: "saved",
              lastFailedContent: undefined,
            }
          : { ...d, document: next },
      );
      return true;
    } catch (err) {
      updateDoc(path, (d) => ({ ...d, savingStatus: "error", lastFailedContent: contentSnapshot }));
      showToast(`保存失败：${String(err)}`);
      return false;
    }
  }, [showToast, updateDoc]);

  const flushActive = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const path = activePathRef.current;
    if (path) await persistDoc(path);
  }, [persistDoc]);

  // Bootstrap
  useEffect(() => {
    (async () => {
      try {
        const tabsState = await loadTabs(WINDOW_LABEL);
        let paths = tabsState.paths;
        // 撕出窗口首次打开：URL 带 path 且本地还没 tabs-{label}.json
        if (paths.length === 0 && INITIAL_PATH) {
          paths = [INITIAL_PATH];
        }
        if (paths.length === 0) {
          const doc = await createNote();
          setDocs([makeOpenDoc(doc)]);
          setActivePath(doc.summary.path);
        } else {
          const loaded: OpenDoc[] = [];
          for (const p of paths) {
            try {
              const d = await readNote(p);
              loaded.push(makeOpenDoc(d));
            } catch {
              // skip unreadable file
            }
          }
          if (loaded.length === 0) {
            const doc = await createNote();
            loaded.push(makeOpenDoc(doc));
          }
          setDocs(loaded);
          const active = tabsState.active && loaded.some((d) => d.document.summary.path === tabsState.active)
            ? tabsState.active
            : loaded[0].document.summary.path;
          setActivePath(active);
        }
      } catch (err) {
        showToast(`初始化失败：${String(err)}`);
      } finally {
        setBootstrapped(true);
      }
    })();
  }, [showToast]);

  // Persist tabs.json when docs ordering / activePath changes
  useEffect(() => {
    if (!bootstrapped) return;
    if (tabsSaveTimer.current) window.clearTimeout(tabsSaveTimer.current);
    tabsSaveTimer.current = window.setTimeout(() => {
      const state: TabsState = {
        paths: docsRef.current.map((d) => d.document.summary.path),
        active: activePathRef.current,
      };
      saveTabs(WINDOW_LABEL, state).catch((err) => showToast(`Tab 状态保存失败：${String(err)}`));
    }, 180);
    return () => {
      if (tabsSaveTimer.current) window.clearTimeout(tabsSaveTimer.current);
    };
  }, [docs, activePath, bootstrapped, showToast]);

  // 把本窗口打开的文件集合同步到 Rust 注册表：供 openPath 判断"该文件是否已在别的窗口打开"。
  // 只在打开的路径集合变化时上报（openPathsKey 变化），避免每次敲键都调用。
  const openPathsKey = useMemo(
    () => docs.map((d) => d.document.summary.path).join("\n"),
    [docs],
  );
  useEffect(() => {
    if (!bootstrapped) return;
    setWindowPaths(WINDOW_LABEL, docsRef.current.map((d) => d.document.summary.path)).catch(() => {});
  }, [openPathsKey, bootstrapped]);

  // Auto-save on active doc content change (debounced)
  useEffect(() => {
    if (!activeDoc) return;
    if (activeDoc.content === activeDoc.lastSavedContent) return;
    // 这份内容刚保存失败过：不自动重试（否则 error→dirty 每 500ms 循环一次、toast 反复闪），
    // 等用户继续编辑（内容变化）或切 tab 触发 flush 时再试
    if (activeDoc.savingStatus === "error" && activeDoc.content === activeDoc.lastFailedContent) return;
    if (activeDoc.savingStatus !== "dirty") {
      updateDoc(activeDoc.document.summary.path, (d) => ({ ...d, savingStatus: "dirty" }));
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const path = activeDoc.document.summary.path;
    saveTimer.current = window.setTimeout(() => {
      persistDoc(path).catch((err) => showToast(`保存失败：${String(err)}`));
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [activeDoc, persistDoc, showToast, updateDoc]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setMode((m) => (m === "render" ? "source" : "render"));
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        flushActive().catch(() => {});
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n" && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        handleCreateRef.current?.().catch(() => {});
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "0") {
        event.preventDefault();
        setZoom(ZOOM_DEFAULT);
      }
      // ⌃⌘F：macOS 惯例的全屏切换。系统层不处理该组合键时由这里兜底；
      // 需先于下面的 ⌘F 查找分支判断（查找分支同时排除了 ⌘+⌃ 组合）。
      if (
        event.metaKey &&
        event.ctrlKey &&
        event.key.toLowerCase() === "f" &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const w = getCurrentWindow();
        w.isFullscreen()
          .then((v) => w.setFullscreen(!v))
          .catch(() => {});
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !(event.metaKey && event.ctrlKey) &&
        event.key.toLowerCase() === "f" &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        // 拿当前文档里已有的选中文本作为初始 query（VS Code 行为）
        const sel = window.getSelection()?.toString() ?? "";
        const seed = sel && sel.length < 200 ? sel : "";
        setFindInitialQuery(seed);
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flushActive]);

  // 关窗/退出前 flush 未保存编辑：拦下默认关闭 → 保存所有 dirty doc → 再销毁窗口。
  // 覆盖 Cmd+W 与红灯关窗；防 500ms 自动保存防抖窗口内的编辑随 webview 销毁而丢失。
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let closing = false;
    const appWindow = getCurrentWindow();
    (async () => {
      try {
        unlisten = await appWindow.onCloseRequested(async (event) => {
          if (closing) return;
          event.preventDefault();
          closing = true;
          if (saveTimer.current) {
            window.clearTimeout(saveTimer.current);
            saveTimer.current = null;
          }
          try {
            const dirty = docsRef.current.filter((d) => d.content !== d.lastSavedContent);
            await Promise.all(dirty.map((d) => persistDoc(d.document.summary.path)));
          } catch {
            // 保存失败也放行关闭，避免用户卡在无法退出的窗口
          }
          try {
            await appWindow.destroy();
          } catch {
            // ignore
          }
        });
      } catch {
        // onCloseRequested 挂载失败不阻塞运行
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [persistDoc]);

  // Trackpad pinch-to-zoom: macOS reports trackpad pinch as wheel events with ctrlKey=true.
  useEffect(() => {
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((current) => clampZoom(current * Math.exp(-event.deltaY * 0.01)));
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, []);

  // Apply zoom to the document root so layout (including viewport units) reflows correctly.
  useEffect(() => {
    const prev = document.documentElement.style.zoom;
    document.documentElement.style.zoom = String(zoom);
    return () => {
      document.documentElement.style.zoom = prev;
    };
  }, [zoom]);

  const handleContentChange = useCallback((value: string) => {
    const path = activePathRef.current;
    if (!path) return;
    updateDoc(path, (d) => ({ ...d, content: value }));
  }, [updateDoc]);

  const handleSelect = useCallback(async (path: string) => {
    if (path === activePathRef.current) return;
    await flushActive();
    setActivePath(path);
  }, [flushActive]);

  const handleCreate = useCallback(async () => {
    try {
      await flushActive();
      const doc = await createNote();
      const prevActivePath = activePathRef.current;
      const prevContentLen = docsRef.current.find(
        (d) => d.document.summary.path === prevActivePath,
      )?.content.length;
      diag("create", {
        newPath: doc.summary.path,
        prevActivePath,
        prevContentLen,
        mode,
        docsCount: docsRef.current.length,
      });
      setDocs((current) => [...current, makeOpenDoc(doc)]);
      setActivePath(doc.summary.path);
    } catch (err) {
      showToast(`新建失败：${String(err)}`);
    }
  }, [flushActive, showToast, mode]);

  useEffect(() => {
    handleCreateRef.current = handleCreate;
  }, [handleCreate]);

  // 唯一抽象：从本窗口移除一个 tab，并按窗口身份处理"空状态"。
  // 调用契约：调用方负责本地 IO（save / delete / spawn window 等），
  //          本函数只负责本地状态 + 窗口生命周期。
  // - 本地 remaining 数组同步可知长度，不依赖 docsRef 异步同步。
  // - main 窗口被掏空 → 新建一个空 note（保留"主窗口必有内容"语义）
  // - torn 窗口被掏空 → 关闭自己
  const closeTabAndCleanup = useCallback(async (path: string) => {
    const current = docsRef.current;
    const idx = current.findIndex((d) => d.document.summary.path === path);
    if (idx === -1) return;
    const remaining = current.filter((_, i) => i !== idx);
    setDocs(remaining);
    scrollPosRef.current.delete(path);
    if (activePathRef.current === path) {
      const fallback = remaining[idx] ?? remaining[idx - 1] ?? remaining[0];
      setActivePath(fallback ? fallback.document.summary.path : null);
    }
    if (remaining.length > 0) return;
    if (WINDOW_LABEL === MAIN_WINDOW_LABEL) {
      await handleCreate();
    } else {
      // 关 torn 窗口前先取消 tabs.json 写盘定时器，避免留下孤儿 tabs-torn-*.json
      // （setDocs([]) 已经触发了 180ms 防抖；不取消的话写盘可能跑赢关窗）
      if (tabsSaveTimer.current) {
        window.clearTimeout(tabsSaveTimer.current);
        tabsSaveTimer.current = null;
      }
      try {
        await getCurrentWindow().close();
      } catch (err) {
        console.error("[close-torn] failed:", err);
      }
    }
  }, [handleCreate]);

  const handleClose = useCallback(async (path: string) => {
    await persistDoc(path);
    await closeTabAndCleanup(path);
  }, [persistDoc, closeTabAndCleanup]);

  const handleDelete = useCallback(async (path: string) => {
    const target = docsRef.current.find((d) => d.document.summary.path === path);
    const label = target?.document.summary.title ?? path;
    if (!window.confirm(`确认删除文件 "${label}"？该操作不可撤销。`)) return;
    try {
      await deleteNote(path);
      await closeTabAndCleanup(path);
      showToast(`已删除 ${label}`);
    } catch (err) {
      showToast(`删除失败：${String(err)}`);
    }
  }, [closeTabAndCleanup, showToast]);

  const handleRevealInFinder = useCallback(async (path: string) => {
    try {
      await revealInFinder(path);
    } catch (err) {
      showToast(`打开 Finder 失败：${String(err)}`);
    }
  }, [showToast]);

  const handleTearOut = useCallback(async (path: string, screenX: number, screenY: number) => {
    // 保存失败则中止：不移动 tab，避免目标窗口从磁盘读到旧内容而静默丢失未保存编辑。
    const saved = await persistDoc(path);
    if (!saved) {
      showToast("保存失败，已取消移动该标签页");
      return;
    }

    // 1) 检测光标是否落在某个其他窗口的 tab bar 区
    let hit: WindowGeom | null = null;
    try {
      const tabBarHeightCss = readTabBarHeightCss();
      const others = await listPenraftWindows(WINDOW_LABEL);
      hit = others.find((w) => isInTabBarZone(w, screenX, screenY, tabBarHeightCss)) ?? null;
    } catch (err) {
      console.error("[merge] detection error:", err);
    }

    // 2) 命中 → 合并到目标，自己移除并自清理
    if (hit) {
      const payload: MergeTabPayload = { path, screenX };
      await emitTo(hit.label, EVENTS.MERGE_TAB, payload);
      await closeTabAndCleanup(path);
      return;
    }

    // 3) 未命中 → 撕出新窗口，自己移除并自清理
    const label = `torn-${Date.now()}`;
    const url = `index.html?path=${encodeURIComponent(path)}`;
    const dpr = window.devicePixelRatio || 1;
    try {
      new WebviewWindow(label, {
        url,
        title: "Penraft",
        width: 1280,
        height: 820,
        x: Math.round(screenX / dpr - 100),
        y: Math.round(screenY / dpr - 20),
      });
    } catch (err) {
      showToast(`新建窗口失败：${String(err)}`);
      return;
    }
    await closeTabAndCleanup(path);
  }, [persistDoc, closeTabAndCleanup, showToast]);

  const handleSaveAs = useCallback(async (path: string) => {
    const target = docsRef.current.find((d) => d.document.summary.path === path);
    if (!target) return;
    const label = target.document.summary.title || "untitled";
    try {
      const targetPath = await saveDialog({
        defaultPath: `${label}.md`,
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
      if (!targetPath) return;
      await exportNote(targetPath, target.content);
      showToast(`已另存为 ${targetPath}`);
    } catch (err) {
      showToast(`另存为失败：${String(err)}`);
    }
  }, [showToast]);

  const handleReorder = useCallback((from: number, to: number) => {
    setDocs((current) => {
      if (from < 0 || from >= current.length || to < 0 || to >= current.length || from === to) {
        return current;
      }
      const next = current.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleRename = useCallback(async (path: string, newStem: string) => {
    try {
      await persistDoc(path);
      const { summary: newSummary, sanitized } = await renameNote(path, newStem);
      const newPath = newSummary.path;
      setDocs((current) =>
        current.map((d) =>
          d.document.summary.path === path
            ? {
                ...d,
                document: { ...d.document, summary: newSummary },
              }
            : d,
        ),
      );
      if (activePathRef.current === path) {
        setActivePath(newPath);
      }
      if (sanitized) {
        showToast(`非法字符已替换为 -，新名称：${newSummary.title}`);
      }
    } catch (err) {
      showToast(`重命名失败：${String(err)}`);
    }
  }, [persistDoc, showToast]);

  // 单一入口：打开（或聚焦）一个 path。
  // - insertAt 缺省 → 末尾追加；提供数字 → 插入到该索引。
  // - moveIfExists：path 已在本窗口时，是否把已存在的 tab 移动到 insertAt 位置
  //   （仅当 insertAt 也提供时生效）。默认 false，保持"打开已存在 tab 时不重排"语义。
  const openPath = useCallback(async (
    path: string,
    opts?: { insertAt?: number; moveIfExists?: boolean; skipCrossWindow?: boolean },
  ) => {
    const insertAt = opts?.insertAt;
    const moveIfExists = opts?.moveIfExists ?? false;
    await flushActive();
    const existing = docsRef.current.find((d) => d.document.summary.path === path);
    if (existing) {
      if (moveIfExists && insertAt !== undefined) {
        setDocs((current) => {
          const fromIdx = current.findIndex((d) => d.document.summary.path === path);
          if (fromIdx === -1) return current;
          const next = current.slice();
          const [moved] = next.splice(fromIdx, 1);
          const targetIdx = fromIdx < insertAt ? insertAt - 1 : insertAt;
          next.splice(Math.max(0, Math.min(targetIdx, next.length)), 0, moved);
          return next;
        });
      }
      setActivePath(path);
      return;
    }
    // 该文件若已在别的窗口打开 → 聚焦那个窗口而非在本窗口开副本，
    // 防同文件多窗口各自自动保存互相覆盖（丢失更新）。
    // 跨窗口拖拽合并（MERGE_TAB）是显式移动，跳过此检查，否则 tab 会被弹回源窗口。
    if (!opts?.skipCrossWindow) {
      try {
        const other = await findWindowWithPath(path, WINDOW_LABEL);
        if (other) {
          await emitTo(other, EVENTS.OPEN_FILE, path);
          return;
        }
      } catch {
        // 查询失败就退回到在本窗口打开
      }
    }
    try {
      const doc = await readNote(path);
      setDocs((current) => {
        if (current.some((d) => d.document.summary.path === doc.summary.path)) return current;
        const next = current.slice();
        const at = insertAt === undefined ? next.length : Math.max(0, Math.min(insertAt, next.length));
        next.splice(at, 0, makeOpenDoc(doc));
        return next;
      });
      setActivePath(doc.summary.path);
    } catch (err) {
      showToast(`打开失败：${String(err)}`);
    }
  }, [flushActive, showToast]);

  const handleOpenFromSearch = useCallback(async (path: string) => {
    setSearchOpen(false);
    await openPath(path);
  }, [openPath]);

  // 后端派发 "用 Penraft 打开"（macOS RunEvent::Opened / Win+Linux single-instance）
  useTauriListen<string>(EVENTS.OPEN_FILE, (event) => {
    if (typeof event.payload !== "string" || event.payload.length === 0) return;
    void (async () => {
      await openPath(event.payload);
      try {
        await getCurrentWindow().setFocus();
      } catch {
        // ignore
      }
    })();
  }, bootstrapped);

  // 跨窗口拖拽合并
  useTauriListen<MergeTabPayload>(EVENTS.MERGE_TAB, (event) => {
    const payload = event.payload;
    if (!payload || typeof payload.path !== "string" || payload.path.length === 0) return;
    void (async () => {
      // 把屏幕 X 换算到本窗口 CSS X，再让 TabBar 计算插入位置
      let insertIndex = docsRef.current.length;
      try {
        const win = getCurrentWindow();
        const [innerPos, scale] = await Promise.all([win.innerPosition(), win.scaleFactor()]);
        const cssX = (payload.screenX - innerPos.x) / scale;
        insertIndex = tabBarRef.current?.getInsertIndexForClientX(cssX) ?? insertIndex;
      } catch {
        // fallback: 追加到末尾
      }
      // 合并是显式移动：跳过"聚焦已有窗口"重定向，否则 tab 会被弹回源窗口。
      await openPath(payload.path, { insertAt: insertIndex, moveIfExists: true, skipCrossWindow: true });
      try {
        await getCurrentWindow().setFocus();
      } catch {
        // ignore
      }
    })();
  }, bootstrapped);

  // 启动时排空 pending 队列（OPEN_FILE listener 挂载前可能已有事件入队）
  useEffect(() => {
    if (!bootstrapped) return;
    let cancelled = false;
    (async () => {
      try {
        const pending = await takePendingOpenFiles();
        if (cancelled) return;
        for (const p of pending) {
          await openPath(p);
        }
        if (pending.length > 0) {
          try {
            await getCurrentWindow().setFocus();
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore — drain failure shouldn't block runtime listening
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapped, openPath]);

  const tabs = useMemo(
    () =>
      docs.map((d) => ({
        path: d.document.summary.path,
        label: d.document.summary.title,
        dirty: d.savingStatus === "dirty" || d.savingStatus === "saving",
      })),
    [docs],
  );

  return (
    <>
      <div className="app-shell">
        <TabBar
          ref={tabBarRef}
          tabs={tabs}
          activePath={activePath}
          mode={mode}
          onSelect={(p) => handleSelect(p).catch(() => {})}
          onClose={(p) => handleClose(p).catch(() => {})}
          onCreate={() => handleCreate().catch(() => {})}
          onReorder={handleReorder}
          onRename={(p, n) => handleRename(p, n).catch(() => {})}
          onDelete={(p) => handleDelete(p).catch(() => {})}
          onSaveAs={(p) => handleSaveAs(p).catch(() => {})}
          onRevealInFinder={(p) => handleRevealInFinder(p).catch(() => {})}
          onTearOut={(p, x, y) => handleTearOut(p, x, y).catch(() => {})}
          onOpenSearch={() => setSearchOpen(true)}
          onToggleMode={() => setMode((m) => (m === "render" ? "source" : "render"))}
          theme={theme}
          onThemeChange={setTheme}
        />
        <EditorPane
          document={activeDoc?.document ?? null}
          content={activeDoc?.content ?? ""}
          mode={mode}
          theme={theme}
          onContentChange={handleContentChange}
          onCodeMirrorReady={(view) => {
            cmViewRef.current = view;
          }}
          onSaveScroll={saveScroll}
          onReadScroll={readScroll}
        />
        {findOpen ? (
          <FindBar
            mode={mode}
            cmView={cmViewRef.current}
            documentKey={activePath}
            initialQuery={findInitialQuery}
            onClose={() => setFindOpen(false)}
          />
        ) : null}
      </div>

      {searchOpen ? (
        <SearchPanel onClose={() => setSearchOpen(false)} onPick={(p) => handleOpenFromSearch(p).catch(() => {})} />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
      <UpdateNotice />
    </>
  );
}
