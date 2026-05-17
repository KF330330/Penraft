import { useEffect, useState } from 'react';
import { scheduleChecks, snooze, applyUpdate, type PendingUpdate } from '../lib/updater';

type Phase = 'idle' | 'downloading' | 'error';

export default function UpdateNotice() {
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const cancel = scheduleChecks((p) => {
      if (p) setPending(p);
    });
    return cancel;
  }, []);

  if (!pending) return null;

  const onLater = () => {
    snooze();
    setPending(null);
  };

  const onUpdate = async () => {
    setPhase('downloading');
    setErrMsg(null);
    try {
      await applyUpdate(pending, (downloaded, total) => {
        setProgress({ downloaded, total });
      });
    } catch (e) {
      setPhase('error');
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const pct = progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  return (
    <div
      role="alertdialog"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 9999,
        minWidth: 280,
        maxWidth: 360,
        background: 'rgba(28,30,36,0.96)',
        color: '#e6e7eb',
        borderRadius: 12,
        padding: '14px 16px',
        boxShadow: '0 10px 32px rgba(0,0,0,0.32)',
        font: '13px -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Penraft {pending.version} 可用</div>
      {pending.notes ? (
        <div style={{ color: '#a8acb5', fontSize: 12, marginBottom: 10, whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'auto' }}>
          {pending.notes}
        </div>
      ) : null}

      {phase === 'downloading' ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: '#a8acb5', fontSize: 12, marginBottom: 6 }}>
            正在下载… {pct != null ? `${pct}%` : ''}
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: pct != null ? `${pct}%` : '40%', height: '100%', background: '#5b8cff', transition: 'width .2s' }} />
          </div>
        </div>
      ) : null}

      {phase === 'error' && errMsg ? (
        <div style={{ color: '#ffb547', fontSize: 12, marginBottom: 10, wordBreak: 'break-all' }}>
          更新失败：{errMsg}
        </div>
      ) : null}

      {phase === 'idle' || phase === 'error' ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onLater}
            style={{ background: 'transparent', color: '#a8acb5', border: '1px solid rgba(255,255,255,0.14)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          >
            稍后
          </button>
          <button
            onClick={onUpdate}
            style={{ background: '#5b8cff', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {phase === 'error' ? '重试' : '立即更新'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
