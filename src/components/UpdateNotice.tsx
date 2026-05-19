import { useEffect, useState } from "react";
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

type Phase = "idle" | "downloading" | "installed" | "error";

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
    setErrMsg(null);
    try {
      await applyUpdate(
        pending,
        (downloaded, total) => {
          setProgress({ downloaded, total });
        },
        () => {
          // 下载安装完成：切到"更新已就绪"提示态，不自动重启
          setPhase("installed");
        },
      );
    } catch (e) {
      setPhase("error");
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  };

  // installed 态下用户点"好的"：仅关闭弹窗，App 继续运行。
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

  return (
    <ChangelogModal
      mode="prompt"
      version={pending.version}
      notes={pending.notes}
      phase={phase}
      progress={progress}
      errMsg={errMsg}
      onLater={onLater}
      onUpdate={onUpdate}
      onDismiss={onDismiss}
      onClose={onClose}
      onRestartNow={onRestartNow}
    />
  );
}
