import { Check, Download, X } from "lucide-react";

export type UpdateProgressPhase = "downloading" | "done" | "error";

interface Props {
  phase: UpdateProgressPhase;
  downloaded: number;
  total: number | null;
  errMsg?: string | null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const RING_RADIUS = 11;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

export default function UpdateProgressIndicator({
  phase,
  downloaded,
  total,
  errMsg,
}: Props) {
  const pct =
    phase === "done"
      ? 100
      : total && total > 0
        ? Math.min(100, Math.max(0, (downloaded / total) * 100))
        : 0;
  const dashOffset = RING_CIRC * (1 - pct / 100);

  let tooltipTitle = "";
  let tooltipMeta = "";
  let centerIcon = <Download size={11} />;
  if (phase === "downloading") {
    tooltipTitle = "正在下载更新…";
    tooltipMeta =
      total && total > 0
        ? `${formatBytes(downloaded)} / ${formatBytes(total)}（${Math.round(pct)}%）`
        : formatBytes(downloaded);
    centerIcon = <Download size={11} />;
  } else if (phase === "done") {
    tooltipTitle = "下载完成";
    tooltipMeta = "即将提示重启";
    centerIcon = <Check size={13} strokeWidth={2.4} />;
  } else {
    tooltipTitle = "下载失败";
    tooltipMeta = errMsg || "请稍后重试";
    centerIcon = <X size={12} strokeWidth={2.4} />;
  }

  return (
    <button
      className="update-progress"
      data-phase={phase}
      aria-label={tooltipTitle}
      tabIndex={-1}
    >
      <svg className="update-progress__ring" viewBox="0 0 26 26" aria-hidden="true">
        <circle
          className="update-progress__ring-bg"
          cx="13"
          cy="13"
          r={RING_RADIUS}
        />
        <circle
          className="update-progress__ring-fg"
          cx="13"
          cy="13"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRC.toFixed(3)}
          strokeDashoffset={dashOffset.toFixed(3)}
        />
      </svg>
      <span className="update-progress__icon" aria-hidden="true">
        {centerIcon}
      </span>
      <div className="update-progress__tooltip" role="tooltip">
        <p className="update-progress__tooltip-title">{tooltipTitle}</p>
        <p className="update-progress__tooltip-meta">{tooltipMeta}</p>
      </div>
    </button>
  );
}
