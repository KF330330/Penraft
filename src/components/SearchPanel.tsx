import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDate } from "../lib/format";
import { listNotes, searchNotes } from "../lib/tauri";
import type { NoteSummary } from "../lib/types";

interface SearchPanelProps {
  onClose: () => void;
  onPick: (path: string) => void;
}

export function SearchPanel({ onClose, onPick }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSummary[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const trimmed = query.trim();
    const run = async () => {
      const list = trimmed ? await searchNotes(trimmed) : await listNotes();
      if (!cancelled) setResults(list);
    };
    const handle = window.setTimeout(() => {
      run().catch(() => {});
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-header">
          <Search size={16} />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="搜索全部文档…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && results.length > 0) {
                onPick(results[0].path);
              }
            }}
          />
          <button className="icon-button" onClick={onClose} title="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-empty">没有匹配的文档</div>
          ) : (
            results.map((note) => (
              <div
                key={note.path}
                className="search-item"
                onClick={() => onPick(note.path)}
              >
                <div className="search-item-title">{note.title}</div>
                <div className="search-item-meta">
                  <span>{formatDate(note.updated_at)}</span>
                </div>
                {note.preview ? (
                  <div className="search-item-preview">{note.preview}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
