import { useEffect, useState } from "react";
import {
  scheduleChecks,
  snooze,
  dismissVersion,
  applyUpdate,
  consumePendingChangelogForCurrentVersion,
  type PendingUpdate,
  type PendingChangelog,
} from "../lib/updater";
import ChangelogModal from "./ChangelogModal";

type Phase = "idle" | "downloading" | "error";

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
      await applyUpdate(pending, (downloaded, total) => {
        setProgress({ downloaded, total });
      });
    } catch (e) {
      setPhase("error");
      setErrMsg(e instanceof Error ? e.message : String(e));
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
    />
  );
}
