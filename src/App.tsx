import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { EditorPane } from "./components/EditorPane";
import type { Theme } from "./components/MarkdownEditor";
import { SearchPanel } from "./components/SearchPanel";
import { TabBar } from "./components/TabBar";
import { ThemePicker } from "./components/ThemePicker";
import {
  createNote,
  deleteNote,
  exportNote,
  loadTabs,
  readNote,
  renameNote,
  revealInFinder,
  saveNote,
  saveTabs,
} from "./lib/tauri";
import type { NoteDocument, TabsState } from "./lib/types";

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
    return "main";
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

export default function App() {
  const [docs, setDocs] = useState<OpenDoc[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [mode, setMode] = useState<"render" | "source">("render");
  const [searchOpen, setSearchOpen] = useState(false);
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
  const docsRef = useRef<OpenDoc[]>([]);
  const activePathRef = useRef<string | null>(null);
  const handleCreateRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => { docsRef.current = docs; }, [docs]);
  useEffect(() => { activePathRef.current = activePath; }, [activePath]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const activeDoc = useMemo(
    () => docs.find((d) => d.document.summary.path === activePath) ?? null,
    [docs, activePath],
  );

  const updateDoc = useCallback((path: string, updater: (doc: OpenDoc) => OpenDoc) => {
    setDocs((current) => current.map((d) => (d.document.summary.path === path ? updater(d) : d)));
  }, []);

  const persistDoc = useCallback(async (path: string) => {
    const target = docsRef.current.find((d) => d.document.summary.path === path);
    if (!target) return;
    if (target.content === target.lastSavedContent) return;
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
            }
          : { ...d, document: next },
      );
    } catch (err) {
      updateDoc(path, (d) => ({ ...d, savingStatus: "error" }));
      showToast(`保存失败：${String(err)}`);
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

  // Auto-save on active doc content change (debounced)
  useEffect(() => {
    if (!activeDoc) return;
    if (activeDoc.content === activeDoc.lastSavedContent) return;
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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flushActive]);

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
      setDocs((current) => [...current, makeOpenDoc(doc)]);
      setActivePath(doc.summary.path);
    } catch (err) {
      showToast(`新建失败：${String(err)}`);
    }
  }, [flushActive, showToast]);

  useEffect(() => {
    handleCreateRef.current = handleCreate;
  }, [handleCreate]);

  const handleClose = useCallback(async (path: string) => {
    await persistDoc(path);
    const current = docsRef.current;
    const idx = current.findIndex((d) => d.document.summary.path === path);
    if (idx === -1) return;
    const remaining = current.filter((_, i) => i !== idx);
    setDocs(remaining);
    if (activePathRef.current === path) {
      const fallback = remaining[idx] ?? remaining[idx - 1] ?? remaining[0];
      if (fallback) {
        setActivePath(fallback.document.summary.path);
      } else {
        setActivePath(null);
        await handleCreate();
      }
    }
  }, [persistDoc, handleCreate]);

  const handleDelete = useCallback(async (path: string) => {
    const target = docsRef.current.find((d) => d.document.summary.path === path);
    const label = target?.document.summary.title ?? path;
    if (!window.confirm(`确认删除文件 "${label}"？该操作不可撤销。`)) return;
    try {
      await deleteNote(path);
      const current = docsRef.current;
      const idx = current.findIndex((d) => d.document.summary.path === path);
      const remaining = idx === -1 ? current : current.filter((_, i) => i !== idx);
      setDocs(remaining);
      if (activePathRef.current === path) {
        const fallback = remaining[idx] ?? remaining[idx - 1] ?? remaining[0];
        if (fallback) {
          setActivePath(fallback.document.summary.path);
        } else {
          setActivePath(null);
          await handleCreate();
        }
      }
      showToast(`已删除 ${label}`);
    } catch (err) {
      showToast(`删除失败：${String(err)}`);
    }
  }, [handleCreate, showToast]);

  const handleRevealInFinder = useCallback(async (path: string) => {
    try {
      await revealInFinder(path);
    } catch (err) {
      showToast(`打开 Finder 失败：${String(err)}`);
    }
  }, [showToast]);

  const handleTearOut = useCallback(async (path: string, screenX: number, screenY: number) => {
    try {
      await persistDoc(path);
    } catch {
      // ignore save errors; still tear out
    }
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
    await handleClose(path);
  }, [persistDoc, handleClose, showToast]);

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
      const newSummary = await renameNote(path, newStem);
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
    } catch (err) {
      showToast(`重命名失败：${String(err)}`);
    }
  }, [persistDoc, showToast]);

  const handleOpenFromSearch = useCallback(async (path: string) => {
    setSearchOpen(false);
    const existing = docsRef.current.find((d) => d.document.summary.path === path);
    if (existing) {
      await flushActive();
      setActivePath(path);
      return;
    }
    try {
      await flushActive();
      const doc = await readNote(path);
      setDocs((current) => [...current, makeOpenDoc(doc)]);
      setActivePath(path);
    } catch (err) {
      showToast(`打开失败：${String(err)}`);
    }
  }, [flushActive, showToast]);

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
        <div className="title-strip" data-tauri-drag-region>
          <span className="title-strip-text">Penraft</span>
        </div>
        <TabBar
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
        />
      </div>

      {searchOpen ? (
        <SearchPanel onClose={() => setSearchOpen(false)} onPick={(p) => handleOpenFromSearch(p).catch(() => {})} />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
