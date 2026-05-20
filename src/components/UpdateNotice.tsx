import { useEffect, useState } from "react";
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

  // dev-only 调试事件：由 UpdateDebugPanel 触发，让开发者一键跳到任意 phase。
  // production build 中 import.meta.env.DEV === false，整个 effect 短路。
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        action: string;
        downloaded?: number;
        total?: number;
        errMsg?: string;
      }>).detail;
      if (!detail) return;

      if (detail.action === "show-prompt-real-flow") {
        // 注入一个 mock PendingUpdate，downloadAndInstall 模拟 5 秒下载
        const mockPending: PendingUpdate = {
          version: "0.3.2",
          notes: "# 新增\n\n- 更新弹窗 Minimal Refined 风格\n- Rust strip 减小二进制体积\n\n# 修复\n\n- 切窗口时偶发的 tab 顺序错乱",
          date: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          update: {
            available: true,
            version: "0.3.2",
            downloadAndInstall: async (cb: (event: { event: string; data: unknown }) => void) => {
              const total = 12 * 1024 * 1024;
              const chunks = 25;
              const chunkSize = total / chunks;
              cb({ event: "Started", data: { contentLength: total } });
              for (let i = 0; i < chunks; i++) {
                await new Promise((r) => setTimeout(r, 200));
                cb({ event: "Progress", data: { chunkLength: chunkSize } });
              }
              cb({ event: "Finished", data: {} });
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        };
        setPending(mockPending);
        setPhase("idle");
        setProgress({ downloaded: 0, total: null });
        setErrMsg(null);
        return;
      }

      // 其他 jump-* 操作需要一个 pending 才能让 ChangelogModal 渲染
      if (!pending) {
        const mockPending: PendingUpdate = {
          version: "0.3.2",
          notes: "# 新增\n\n- 更新弹窗 Minimal Refined 风格\n- Rust strip 减小二进制体积\n\n# 修复\n\n- 切窗口时偶发的 tab 顺序错乱",
          date: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          update: {} as any,
        };
        setPending(mockPending);
      }

      if (detail.action === "jump-downloading") {
        setPhase("downloading");
        setProgress({
          downloaded: detail.downloaded ?? 0,
          total: detail.total ?? null,
        });
        setErrMsg(null);
      } else if (detail.action === "jump-done") {
        setPhase("done");
        setProgress({ downloaded: 100, total: 100 });
        setErrMsg(null);
      } else if (detail.action === "jump-installed") {
        setPhase("installed");
        setErrMsg(null);
      } else if (detail.action === "jump-error") {
        setPhase("error");
        setErrMsg(detail.errMsg ?? "未知错误");
      } else if (detail.action === "reset") {
        setPending(null);
        setPhase("idle");
        setProgress({ downloaded: 0, total: null });
        setErrMsg(null);
      }
    };
    window.addEventListener("penraft:dev:update", handler);
    return () => window.removeEventListener("penraft:dev:update", handler);
  }, [pending]);

  // 触发点 B 优先：先看完旧的，再提示新的
  if (postUpdate) {
    return (
      <ChangelogModal
        mode="postUpdate"
        version={postUpdate.version}
        notes={postUpdate.notes}
        onAck={() => setPostUpdate(null)}
      />
    );
  }

  if (!pending) return null;

  const onLater = () => {
    snooze();
    setPending(null);
  };

  const onDismiss = () => {
    dismissVersion(pending.version);
    setPending(null);
  };

  const onUpdate = async () => {
    setPhase("downloading");
    setProgress({ downloaded: 0, total: null });
    setErrMsg(null);
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
    }
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

  // downloading / done 阶段：不渲染中央 modal，把圆环 portal 到 TabBar 的 slot
  if (phase === "downloading" || phase === "done") {
    const slot = typeof document !== "undefined"
      ? document.getElementById("update-progress-slot")
      : null;
    if (!slot) return null;
    return createPortal(
      <UpdateProgressIndicator
        phase={phase}
        downloaded={progress.downloaded}
        total={progress.total}
      />,
      slot,
    );
  }

  // idle / installed / error 阶段：渲染中央 ChangelogModal
  return (
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
  );
}
