import { Settings, RefreshCw, Folder, Palette, ChevronRight, ScrollText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open as openDialog, ask, confirm } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Theme } from "./MarkdownEditor";
import { manualCheckForUpdate } from "../lib/updater";
import { debugLogPath, getVaultPath, revealInFinder, setVaultPath } from "../lib/tauri";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "paper", label: "Paper · 米色" },
  { value: "light", label: "Light · 白色" },
  { value: "dark", label: "Dark · 暗色" },
];

function renderTieredPath(raw: string) {
  if (!raw) return null;
  // 把 /Users/<user>/... 或 /home/<user>/... 缩为 ~
  const m = raw.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
  const rest = m && m[1] ? m[1].replace(/^\//, "") : raw.replace(/^\//, "");
  const segs = rest.split("/").filter(Boolean);
  if (segs.length === 0) {
    return <span className="path-home">~</span>;
  }
  const tail = segs[segs.length - 1];
  const mid = segs.slice(0, -1);
  return (
    <>
      <span className="path-home">~</span>
      {mid.map((seg, i) => (
        <span key={`mid-${i}`}>
          <span className="path-sep">/</span>
          <span className="path-mid">{seg}</span>
        </span>
      ))}
      <span className="path-sep">/</span>
      <span className="path-tail">{tail}</span>
    </>
  );
}

interface ThemePickerProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

type CheckPhase = "idle" | "checking" | "latest" | "error";

export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [version, setVersion] = useState<string>("");
  const [checkPhase, setCheckPhase] = useState<CheckPhase>("idle");
  const [checkErr, setCheckErr] = useState<string>("");
  const [vaultPath, setVaultPathState] = useState<string>("");
  const [vaultPhase, setVaultPhase] = useState<"idle" | "busy" | "error">("idle");
  const [vaultErr, setVaultErr] = useState<string>("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((v) => { if (!cancelled) setVersion(v); })
      .catch(() => { /* silent */ });
    getVaultPath()
      .then((p) => { if (!cancelled) setVaultPathState(p); })
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

  const onChangeVaultClick = async () => {
    if (vaultPhase === "busy") return;
    setVaultErr("");
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择 Vault 位置",
        defaultPath: vaultPath || undefined,
      });
      if (!selected || typeof selected !== "string") return;
      const moveFiles = await ask(
        `是否将现有笔记移动到 ${selected} ？`,
        { title: "移动现有笔记", okLabel: "移动", cancelLabel: "不移动" },
      );
      const proceed = await confirm(
        `切换 Vault 后 Penraft 将立即重启。\n新位置：${selected}\n${moveFiles ? "现有笔记将被移动过去。" : "现有笔记保持原地不动。"}`,
        { title: "切换 Vault 并重启", okLabel: "重启", cancelLabel: "取消" },
      );
      if (!proceed) return;
      setVaultPhase("busy");
      await setVaultPath(selected, moveFiles);
      await relaunch();
    } catch (e) {
      setVaultPhase("error");
      setVaultErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onRevealLogClick = async () => {
    try {
      const p = await debugLogPath();
      await revealInFinder(p);
    } catch {
      /* 日志可能还没写出来；忽略 */
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

  const updateRowClass = `row${checkPhase === "checking" ? " checking" : ""}${checkPhase === "latest" ? " up-to-date" : ""}`;

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
          {/* ----- Section 1: 外观 ----- */}
          <div className="group-label">外观</div>
          <div className="group">
            <div className="row no-hover">
              <div className="row-icon theme">
                <Palette size={14} />
              </div>
              <div className="row-label">主题</div>
              <div className="swatch-list" role="radiogroup" aria-label="主题颜色">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`swatch ${opt.value}${opt.value === theme ? " active" : ""}`}
                    title={opt.label}
                    aria-label={opt.label}
                    aria-checked={opt.value === theme}
                    role="radio"
                    onClick={() => {
                      onChange(opt.value);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ----- Section 2: 存储 ----- */}
          <div className="group-label">存储</div>
          <div className="group">
            <button
              type="button"
              className="row row-path"
              onClick={onChangeVaultClick}
              disabled={vaultPhase === "busy"}
              title={vaultPhase === "error" ? vaultErr : vaultPath || undefined}
            >
              <div className="row-path-top">
                <div className="row-icon vault">
                  <Folder size={14} />
                </div>
                <div className="row-label">
                  {vaultPhase === "busy" ? "切换中…" : "Vault 位置"}
                </div>
                <div className="row-tail">
                  <ChevronRight size={14} className="chevron" />
                </div>
              </div>
              <div className="row-path-bottom">
                <span className="path-value" title={vaultPath}>
                  {renderTieredPath(vaultPath)}
                </span>
              </div>
            </button>
            <button
              type="button"
              className="row"
              onClick={onRevealLogClick}
              title="排查「新建后光标点不进」等偶发问题：在 Finder 中显示调试日志文件"
            >
              <div className="row-icon">
                <ScrollText size={14} />
              </div>
              <div className="row-label">在 Finder 中显示调试日志</div>
              <div className="row-tail">
                <ChevronRight size={14} className="chevron" />
              </div>
            </button>
          </div>

          {/* ----- Section 3: 关于 ----- */}
          <div className="group-label">关于</div>
          <div className="group">
            <button
              type="button"
              className={updateRowClass}
              onClick={onCheckClick}
              disabled={checkPhase === "checking"}
              title={checkPhase === "error" ? checkErr : undefined}
            >
              <div className="row-icon update">
                <RefreshCw size={14} className="update-icon" />
              </div>
              <div className="row-label">{checkLabel}</div>
              <div className="row-tail">
                {version ? <span className="row-version">v{version}</span> : null}
              </div>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
