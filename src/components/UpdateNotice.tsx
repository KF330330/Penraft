import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  scheduleChecks,
  snooze,
  dismissVersion,
  applyUpdate,
  restartNow,
  consumePendingChangelogForCurrentVersion,
  type PendingUpdate,
  type PendingChangelog,
} from "../lib/updater";
import ChangelogModal from "./ChangelogModal";
import UpdateProgressIndicator from "./UpdateProgressIndicator";

type Phase = "idle" | "downloading" | "done" | "installed" | "error";

const DONE_FLASH_MS = 700;
const MOCK_DOWNLOAD_MS = 2400;

export default function UpdateNotice() {
  // 触发点 B：装完后首次启动时，pendingChangelog 命中即弹（优先级最高）
  const [postUpdate, setPostUpdate] = useState<PendingChangelog | null>(null);

  // 触发点 A：发现新版本可用
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null }>({
    downloaded: 0,
    total: null,
  });
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 飞行动画状态：
  //   null      —— 无动画
  //   "prep"    —— modal 已渲染、隐藏占位已挂入 slot；本帧测量 + 写 CSS 变量
  //   "flying"  —— is-flying class 已加，CSS transition 进行中
  const [flight, setFlight] = useState<null | "prep" | "flying">(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // dev-only：是否走 mock 下载路径（绕过真实 applyUpdate，只为验证 UI 动效）
  const [mockMode, setMockMode] = useState(false);

  // 启动期：尝试取出 pendingChangelog（装完后首启动）
  useEffect(() => {
    let cancelled = false;
    consumePendingChangelogForCurrentVersion()
      .then((c) => {
        if (!cancelled && c) setPostUpdate(c);
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 启动期 + 周期性：检查 manifest 是否有新版本
  useEffect(() => {
    const cancel = scheduleChecks((p) => {
      if (p) setPending(p);
    });
    return cancel;
  }, []);

  // 设置菜单里「检查更新」走旁路触发：通过 window event 注入 pending，
  // 复用同一套 ChangelogModal + 下载/安装流程
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PendingUpdate>).detail;
      if (detail) {
        setPending(detail);
        setPhase("idle");
        setProgress({ downloaded: 0, total: null });
        setErrMsg(null);
      }
    };
    window.addEventListener("penraft:show-update-modal", handler);
    return () => window.removeEventListener("penraft:show-update-modal", handler);
  }, []);

  // phase 离开 downloading/done 时清掉残留的 flight 状态（防止下次更新被卡）
  useEffect(() => {
    if (phase !== "downloading" && phase !== "done" && flight !== null) {
      setFlight(null);
    }
  }, [phase, flight]);

  // flight === "prep": modal 和 slot 占位都已挂上；测量两者位置写 CSS 变量，
  // 再 RAF 一帧切到 "flying" 触发 transition。
  useLayoutEffect(() => {
    if (flight !== "prep") return;
    const modalEl = modalRef.current;
    const slotEl =
      typeof document !== "undefined"
        ? document.getElementById("update-progress-slot")
        : null;
    if (!modalEl || !slotEl) {
      setFlight(null);
      return;
    }
    const modalRect = modalEl.getBoundingClientRect();
    const slotRect = slotEl.getBoundingClientRect();
    if (slotRect.width === 0 || slotRect.height === 0) {
      setFlight(null);
      return;
    }
    const dx = Math.round(
      slotRect.left + slotRect.width / 2 - (modalRect.left + modalRect.width / 2),
    );
    const dy = Math.round(
      slotRect.top + slotRect.height / 2 - (modalRect.top + modalRect.height / 2),
    );
    modalEl.style.setProperty("--target-dx", `${dx}px`);
    modalEl.style.setProperty("--target-dy", `${dy}px`);
    const rafId = requestAnimationFrame(() => {
      setFlight("flying");
    });
    return () => cancelAnimationFrame(rafId);
  }, [flight]);

  // dev-only：浮动按钮触发 mock 更新弹窗（Tauri dev 内可视化验证飞行动画）
  // 生产构建 import.meta.env.DEV === false，整段为 null
  const devTrigger = import.meta.env.DEV
    ? createPortal(
        <button
          type="button"
          onClick={() => {
            // 构造一个 fake PendingUpdate；mockMode 让 onUpdate 跳过真实 applyUpdate
            const mock = {
              version: "0.99.0-dev",
              notes:
                "**调试预览**\n\n- 弹窗收向右上角下载按钮的飞行动画\n- 图标在圆环中的居中\n- pop-in 入场",
              date: undefined,
              update: {} as never,
            } as unknown as PendingUpdate;
            setMockMode(true);
            setPending(mock);
            setPhase("idle");
            setProgress({ downloaded: 0, total: null });
            setErrMsg(null);
            setFlight(null);
          }}
          style={{
            position: "fixed",
            right: 12,
            bottom: 12,
            zIndex: 1000,
            padding: "6px 10px",
            fontSize: 11,
            border: "1px dashed rgba(180,83,9,0.45)",
            borderRadius: 8,
            background: "rgba(255, 245, 235, 0.95)",
            color: "#92400e",
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
          title="dev-only：弹出 mock 更新弹窗，验证飞行动画"
        >
          🐛 测试更新动画
        </button>,
        document.body,
      )
    : null;

  // mockMode 在 phase 回到 idle/installed 且 pending 已清掉时自动重置
  useEffect(() => {
    if (!pending && mockMode) setMockMode(false);
  }, [pending, mockMode]);

  // 触发点 B 优先：先看完旧的，再提示新的
  if (postUpdate) {
    return (
      <>
        {devTrigger}
        <ChangelogModal
          mode="postUpdate"
          version={postUpdate.version}
          notes={postUpdate.notes}
          onAck={() => setPostUpdate(null)}
        />
      </>
    );
  }

  if (!pending) return devTrigger;

  const onLater = () => {
    snooze();
    setPending(null);
  };

  const onDismiss = () => {
    dismissVersion(pending.version);
    setPending(null);
  };

  const onUpdate = async () => {
    // 立刻进入 downloading（让 slot 内的隐藏占位 mount，撑出尺寸），
    // 并触发飞行动画 prep 阶段。下载在后台同步开始。
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setPhase("downloading");
    setProgress({ downloaded: 0, total: null });
    setErrMsg(null);
    if (!prefersReducedMotion) {
      setFlight("prep");
    }

    // dev-only：mock 路径不调真实 updater，只跑 UI 动效
    if (mockMode) {
      const TOTAL = 12 * 1024 * 1024;
      const t0 = performance.now();
      const step = () => {
        const elapsed = performance.now() - t0;
        const t = Math.min(1, elapsed / MOCK_DOWNLOAD_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        setProgress({ downloaded: Math.round(TOTAL * eased), total: TOTAL });
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          setPhase("done");
          setTimeout(() => setPhase("installed"), DONE_FLASH_MS);
        }
      };
      requestAnimationFrame(step);
      return;
    }

    try {
      await applyUpdate(
        pending,
        (downloaded, total) => {
          setProgress({ downloaded, total });
        },
        () => {
          // 下载安装完成：先短暂展示绿勾，然后再弹"更新已就绪"中央卡片
          setPhase("done");
          setTimeout(() => {
            setPhase("installed");
          }, DONE_FLASH_MS);
        },
      );
    } catch (e) {
      setPhase("error");
      setErrMsg(e instanceof Error ? e.message : String(e));
      setFlight(null);
    }
  };

  const onFlightEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (flight !== "flying") return;
    if (e.target !== modalRef.current) return;
    if (e.propertyName !== "transform") return;
    setFlight(null);
  };

  // installed 态下用户点"稍后"：仅关闭弹窗，App 继续运行。
  // 不调 dismissVersion —— 因为新版 bundle 已替换到磁盘，下次启动自动应用；
  // 而下次启动时 checkForUpdate 会因 appVersion === manifest.version 而 clearState。
  const onClose = () => {
    setPending(null);
  };

  const onRestartNow = async () => {
    try {
      await restartNow();
    } catch {
      /* silent */
    }
  };

  // downloading / done 阶段：把圆环 portal 到 TabBar 的 slot
  // 飞行期间额外渲染 modal —— 让弹窗收缩飞向 slot，飞行结束后圆环 pop-in 出场
  if (phase === "downloading" || phase === "done") {
    const slot = typeof document !== "undefined"
      ? document.getElementById("update-progress-slot")
      : null;
    if (!slot) return null;
    const flying = flight !== null;
    const progressPortal = createPortal(
      <UpdateProgressIndicator
        phase={phase}
        downloaded={progress.downloaded}
        total={progress.total}
        className={flying ? "is-prep" : "pop-in"}
      />,
      slot,
    );
    if (flying) {
      return (
        <>
          {devTrigger}
          <ChangelogModal
            mode="prompt"
            version={pending.version}
            notes={pending.notes}
            phase="idle"
            errMsg={null}
            onLater={onLater}
            onUpdate={() => {
              /* 飞行中不响应 */
            }}
            onDismiss={onDismiss}
            onClose={onClose}
            onRestartNow={onRestartNow}
            backdropClassName={flight === "flying" ? "is-flying" : undefined}
            modalRef={modalRef}
            onModalTransitionEnd={onFlightEnd}
          />
          {progressPortal}
        </>
      );
    }
    return (
      <>
        {devTrigger}
        {progressPortal}
      </>
    );
  }

  // idle / installed / error 阶段：渲染中央 ChangelogModal
  return (
    <>
      {devTrigger}
      <ChangelogModal
        mode="prompt"
        version={pending.version}
        notes={pending.notes}
        phase={phase}
        errMsg={errMsg}
        onLater={onLater}
        onUpdate={onUpdate}
        onDismiss={onDismiss}
        onClose={onClose}
        onRestartNow={onRestartNow}
      />
    </>
  );
}
