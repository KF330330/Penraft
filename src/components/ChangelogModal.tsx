import MarkdownReadOnly from "./MarkdownReadOnly";

type Phase = "idle" | "downloading" | "installed" | "error";

interface PromptProps {
  mode: "prompt";
  version: string;
  notes?: string;
  phase: Phase;
  progress: { downloaded: number; total: number | null };
  errMsg: string | null;
  onLater: () => void;
  onUpdate: () => void;
  onDismiss: () => void;
  onClose: () => void;
  onRestartNow: () => void;
}

interface PostUpdateProps {
  mode: "postUpdate";
  version: string;
  notes?: string;
  onAck: () => void;
}

type Props = PromptProps | PostUpdateProps;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChangelogModal(props: Props) {
  const isInstalled = props.mode === "prompt" && props.phase === "installed";
  const eyebrow =
    props.mode === "prompt"
      ? isInstalled
        ? "更新已就绪"
        : "更新可用"
      : "已完成更新";
  const ariaTitle =
    props.mode === "prompt"
      ? isInstalled
        ? `Penraft ${props.version} 已就绪`
        : `Penraft ${props.version} 可用`
      : `已更新到 Penraft ${props.version}`;

  const notes = (props.notes ?? "").trim();

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal changelog-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="changelog-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="changelog-modal-head">
          <span className="changelog-modal-eyebrow">{eyebrow}</span>
          <div className="changelog-modal-title-row">
            <h3 id="changelog-modal-title" className="changelog-modal-title">
              Penraft
            </h3>
            <span className="changelog-modal-version" aria-label={ariaTitle}>
              {props.version}
            </span>
          </div>
        </div>

        <hr className="changelog-modal-hairline" />

        <div className="changelog-modal-body">
          {isInstalled ? (
            <>
              <p className="changelog-modal-installed-text">
                新版已下载完成，<strong>下次启动时将自动应用</strong>，当前不会中断你的工作。
              </p>
              <p className="changelog-modal-installed-meta">
                你可以继续使用现在这个版本。Cmd+Q 关闭后再打开 Penraft，即升级到 {props.version}。
              </p>
            </>
          ) : notes ? (
            <MarkdownReadOnly value={notes} />
          ) : (
            <div className="changelog-modal-empty">本次更新无说明。</div>
          )}
        </div>

        {props.mode === "prompt" && props.phase === "downloading" ? (
          <div className="changelog-modal-progress">
            {(() => {
              const { downloaded, total } = props.progress;
              const pct = total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
              return (
                <>
                  <div>
                    正在下载…{" "}
                    {pct != null
                      ? `${pct}%（${formatBytes(downloaded)} / ${formatBytes(total!)}）`
                      : formatBytes(downloaded)}
                  </div>
                  <div className="changelog-modal-progress-bar">
                    <span style={{ width: pct != null ? `${pct}%` : "40%" }} />
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}

        {props.mode === "prompt" && props.phase === "error" && props.errMsg ? (
          <div className="changelog-modal-error">更新失败：{props.errMsg}</div>
        ) : null}

        <div className="changelog-modal-footer">
          {props.mode === "prompt" ? (
            props.phase === "downloading" ? null : isInstalled ? (
              <>
                <button className="changelog-modal-btn subtle" onClick={props.onRestartNow}>
                  立即重启使用新版本
                </button>
                <div className="changelog-modal-footer-right">
                  <button className="changelog-modal-btn primary" onClick={props.onClose}>
                    好的
                  </button>
                </div>
              </>
            ) : (
              <>
                <button className="changelog-modal-btn subtle" onClick={props.onDismiss}>
                  跳过本次更新
                </button>
                <div className="changelog-modal-footer-right">
                  <button className="changelog-modal-btn" onClick={props.onLater}>
                    稍后
                  </button>
                  <button className="changelog-modal-btn primary" onClick={props.onUpdate}>
                    {props.phase === "error" ? "重试" : "立即更新"}
                  </button>
                </div>
              </>
            )
          ) : (
            <div className="changelog-modal-footer-right">
              <button className="changelog-modal-btn primary" onClick={props.onAck}>
                知道了
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
