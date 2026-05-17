import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Theme } from "./MarkdownEditor";

interface ThemePickerProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

const OPTIONS: { value: Theme; label: string; swatch: string }[] = [
  { value: "paper", label: "Paper · 米色", swatch: "#f1ede5" },
  { value: "light", label: "Light · 白色", swatch: "#f6f6f5" },
  { value: "dark", label: "Dark · 暗色", swatch: "#2c2a26" },
];

export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("blur", () => setOpen(false));
    return () => {
      window.removeEventListener("mousedown", handler);
    };
  }, [open]);

  return (
    <div className="title-strip-actions" ref={rootRef}>
      <button
        className="title-strip-btn"
        title="主题设置"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Settings size={14} />
      </button>
      {open ? (
        <div className="theme-menu">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`theme-menu-item${opt.value === theme ? " active" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span className="theme-swatch" style={{ background: opt.swatch }} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
