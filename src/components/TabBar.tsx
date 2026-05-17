import { Code2, Eye, Plus, Search, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import type { Theme } from "./MarkdownEditor";
import { ThemePicker } from "./ThemePicker";
import {
  TEAR_OUT_OUTSIDE_MARGIN_PHYS,
  TEAR_OUT_VERTICAL_THRESHOLD_CSS,
} from "../lib/drag-constants";

export interface TabItem {
  path: string;
  label: string;
  dirty: boolean;
}

export interface TabBarHandle {
  // 给定窗口内 CSS X 坐标，返回该位置应插入的 tab 索引（含末位 = tabs.length）。
  getInsertIndexForClientX(clientX: number): number;
}

interface TabBarProps {
  tabs: TabItem[];
  activePath: string | null;
  mode: "render" | "source";
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onCreate: () => void;
  onReorder: (from: number, to: number) => void;
  onRename: (path: string, newStem: string) => void;
  onDelete: (path: string) => void;
  onSaveAs: (path: string) => void;
  onRevealInFinder: (path: string) => void;
  onTearOut: (path: string, screenX: number, screenY: number) => void;
  onOpenSearch: () => void;
  onToggleMode: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

interface ContextMenuState {
  path: string;
  x: number;
  y: number;
}

export const TabBar = forwardRef<TabBarHandle, TabBarProps>(function TabBar({
  tabs,
  activePath,
  mode,
  onSelect,
  onClose,
  onCreate,
  onReorder,
  onRename,
  onDelete,
  onSaveAs,
  onRevealInFinder,
  onTearOut,
  onOpenSearch,
  onToggleMode,
  theme,
  onThemeChange,
}, ref) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement | null>(null);
  const didReorderRef = useRef(false);

  const computeInsertIndex = (clientX: number): number => {
    const container = tabsContainerRef.current;
    if (!container) return tabs.length;
    const items = container.querySelectorAll<HTMLElement>(":scope > .tab-item");
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return items.length;
  };

  useImperativeHandle(ref, () => ({ getInsertIndexForClientX: computeInsertIndex }));

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  useEffect(() => {
    if (editingPath && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingPath]);

  const beginRename = (tab: TabItem) => {
    setEditingPath(tab.path);
    setEditingValue(tab.label);
  };

  const commitRename = () => {
    if (editingPath == null) return;
    const target = tabs.find((t) => t.path === editingPath);
    const next = editingValue.trim();
    if (target && next && next !== target.label) {
      onRename(editingPath, next);
    }
    setEditingPath(null);
    setEditingValue("");
  };

  const cancelRename = () => {
    setEditingPath(null);
    setEditingValue("");
  };

  return (
    <div
      className="tab-bar"
      onDragOver={(e) => {
        if (dragIndex === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const idx = computeInsertIndex(e.clientX);
        // 折叠到同一位置（左右半边都指向 dragIndex 自己）则不高亮
        const next = idx === dragIndex || idx === dragIndex + 1 ? null : idx;
        if (next !== dropIndex) setDropIndex(next);
      }}
      onDrop={(e) => {
        if (dragIndex === null) return;
        e.preventDefault();
        const insertIdx = computeInsertIndex(e.clientX);
        if (insertIdx !== dragIndex && insertIdx !== dragIndex + 1) {
          const targetIdx = insertIdx > dragIndex ? insertIdx - 1 : insertIdx;
          onReorder(dragIndex, targetIdx);
          didReorderRef.current = true;
        }
        setDragIndex(null);
        setDropIndex(null);
      }}
    >
      <button className="tab-bar-icon" onClick={onOpenSearch} title="搜索文档">
        <Search size={16} />
      </button>

      <div className="tab-bar-tabs" ref={tabsContainerRef}>
        {tabs.map((tab, idx) => {
          const isActive = tab.path === activePath;
          const isDragOver = dropIndex === idx && dragIndex !== null && dragIndex !== idx;
          const isEditing = editingPath === tab.path;
          return (
            <div
              key={tab.path}
              className={`tab-item${isActive ? " active" : ""}${isDragOver ? " drop-target" : ""}`}
              draggable={!isEditing}
              onDragStart={(e) => {
                didReorderRef.current = false;
                setDragIndex(idx);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={async (e) => {
                const draggedPath = tab.path;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setDragIndex(null);
                setDropIndex(null);
                if (didReorderRef.current) {
                  didReorderRef.current = false;
                  return;
                }
                try {
                  const win = getCurrentWindow();
                  const [cursor, outerPos, size, innerPos, scale] = await Promise.all([
                    cursorPosition(),
                    win.outerPosition(),
                    win.outerSize(),
                    win.innerPosition(),
                    win.scaleFactor(),
                  ]);
                  // 完全跑到窗口外 → 撕扯
                  const margin = TEAR_OUT_OUTSIDE_MARGIN_PHYS;
                  const outside =
                    cursor.x < outerPos.x - margin ||
                    cursor.x > outerPos.x + size.width + margin ||
                    cursor.y < outerPos.y - margin ||
                    cursor.y > outerPos.y + size.height + margin;
                  // 在窗口内但纵向离开 Tab 栏 > 阈值 → 也撕扯（Chrome 风格）
                  const tabBottomPhys = innerPos.y + rect.bottom * scale;
                  const tabTopPhys = innerPos.y + rect.top * scale;
                  const verticalDropPhys =
                    cursor.y > tabBottomPhys
                      ? cursor.y - tabBottomPhys
                      : cursor.y < tabTopPhys
                      ? tabTopPhys - cursor.y
                      : 0;
                  const draggedFar = verticalDropPhys > TEAR_OUT_VERTICAL_THRESHOLD_CSS * scale;
                  if (outside || draggedFar) onTearOut(draggedPath, cursor.x, cursor.y);
                } catch (err) {
                  console.error("[tearout] detection error:", err);
                }
              }}
              onClick={() => {
                if (!isEditing) onSelect(tab.path);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                beginRename(tab);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isEditing) return;
                setMenu({ path: tab.path, x: e.clientX, y: e.clientY });
              }}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="tab-rename-input"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                />
              ) : (
                <>
                  <span className="tab-label">{tab.label}</span>
                  {tab.dirty ? <span className="tab-dirty" /> : null}
                  <button
                    className="tab-close"
                    title="关闭"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(tab.path);
                    }}
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {dropIndex === tabs.length && dragIndex !== null ? (
          <div className="tab-drop-end" aria-hidden />
        ) : null}
        <button className="tab-bar-icon tab-bar-add" onClick={onCreate} title="新建文档 (⌘+N)">
          <Plus size={16} />
        </button>
      </div>

      <button className="tab-bar-icon" onClick={onToggleMode} title={mode === "render" ? "切到源码 (⌘+/)" : "切到渲染 (⌘+/)"}>
        {mode === "render" ? <Code2 size={16} /> : <Eye size={16} />}
      </button>

      <ThemePicker theme={theme} onChange={onThemeChange} />

      {menu ? (
        <div
          className="tab-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="tab-context-menu-item"
            onClick={() => {
              const path = menu.path;
              const target = tabs.find((t) => t.path === path);
              setMenu(null);
              if (target) beginRename(target);
            }}
          >
            重命名
          </button>
          <button
            className="tab-context-menu-item"
            onClick={() => {
              const path = menu.path;
              setMenu(null);
              onSaveAs(path);
            }}
          >
            另存为…
          </button>
          <button
            className="tab-context-menu-item"
            onClick={() => {
              const path = menu.path;
              setMenu(null);
              onRevealInFinder(path);
            }}
          >
            在 Finder 中显示
          </button>
          <button
            className="tab-context-menu-item danger"
            onClick={() => {
              const path = menu.path;
              setMenu(null);
              onDelete(path);
            }}
          >
            删除文件
          </button>
        </div>
      ) : null}
    </div>
  );
});
