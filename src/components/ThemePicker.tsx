import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Theme } from "./MarkdownEditor";

interface ThemePickerProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

const OPTIONS: { value: Theme; label: string; swatch: string }[] = [
  { value: "paper", label: "Paper · 米色", swatch: "#f1ede5" },
  { value: "light", label: "Light · 白色", swatch: "#ffffff" },
  { value: "dark", label: "Dark · 暗色", swatch: "#2c2a26" },
];

export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onBlur = () => setOpen(false);
    window.addEventListener("mousedown", handler);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onBlur);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onBlur);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        className="tab-bar-icon"
        title="主题设置"
        onClick={toggle}
      >
        <Settings size={16} />
      </button>
      {open && menuPos ? (
        <div
          ref={menuRef}
          className="theme-menu"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
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
    </>
  );
}
