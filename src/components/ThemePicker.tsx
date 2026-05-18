import { Settings, RefreshCw, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { Theme } from "./MarkdownEditor";
import { manualCheckForUpdate } from "../lib/updater";

interface ThemePickerProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

type CheckPhase = "idle" | "checking" | "latest" | "error";

const OPTIONS: { value: Theme; label: string; swatch: string }[] = [
  { value: "paper", label: "Paper · 米色", swatch: "#f1ede5" },
  { value: "light", label: "Light · 白色", swatch: "#ffffff" },
  { value: "dark", label: "Dark · 暗色", swatch: "#2c2a26" },
];

export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [version, setVersion] = useState<string>("");
  const [checkPhase, setCheckPhase] = useState<CheckPhase>("idle");
  const [checkErr, setCheckErr] = useState<string>("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((v) => { if (!cancelled) setVersion(v); })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    if (!open) {
      setCheckPhase("idle");
      setCheckErr("");
    }
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

  const onCheckClick = async () => {
    if (checkPhase === "checking") return;
    setCheckPhase("checking");
    setCheckErr("");
    try {
      const result = await manualCheckForUpdate();
      if (result) {
        window.dispatchEvent(
          new CustomEvent("penraft:show-update-modal", { detail: result }),
        );
        setOpen(false);
        setCheckPhase("idle");
      } else {
        setCheckPhase("latest");
      }
    } catch (e) {
      setCheckPhase("error");
      setCheckErr(e instanceof Error ? e.message : String(e));
    }
  };

  const checkLabel = (() => {
    switch (checkPhase) {
      case "checking": return "检查中…";
      case "latest": return "已是最新版本";
      case "error": return "检查失败，点击重试";
      default: return "检查更新";
    }
  })();

  return (
    <>
      <button
        ref={btnRef}
        className="tab-bar-icon"
        title="设置"
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
          <div className="theme-menu-section">
            <div className="theme-menu-section-label">主题</div>
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
          <div className="theme-menu-divider" />
          <div className="theme-menu-section">
            <div className="theme-menu-section-label">更新</div>
            <button
              className="theme-menu-item"
              onClick={onCheckClick}
              disabled={checkPhase === "checking"}
              title={checkPhase === "error" ? checkErr : undefined}
            >
              {checkPhase === "latest" ? (
                <Check size={14} className="theme-menu-icon" />
              ) : (
                <RefreshCw
                  size={14}
                  className={`theme-menu-icon${checkPhase === "checking" ? " spinning" : ""}`}
                />
              )}
              <span>{checkLabel}</span>
            </button>
            {version ? (
              <div className="theme-menu-version">v{version}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
