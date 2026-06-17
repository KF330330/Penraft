// 前端诊断日志格式化器。把结构化埋点拼成一行文本，fire-and-forget 写到磁盘
// （Rust debug_log 命令），同时镜像到 console.debug 方便 live 接 Safari Web Inspector。
//
// 纪律：
// - 只记状态元数据（尺寸 / 布尔 / 元素 tag·class·id / selection 类型），绝不记笔记正文。
// - 绝不在这里抛错：JSON.stringify 包 try/catch，它在 fire-and-forget 的 catch 之前执行，
//   一旦抛错会打断调用它的聚焦逻辑。
// - 默认开启；localStorage 'penraft_debug' === 'off' 可关闭（读一次缓存）。
import { debugLog } from "./tauri";

// 当前窗口标识（main / torn-*），由 App 启动时通过 setDiagWindow 注入，
// 让交错写入的多窗口日志能归属到具体窗口。
let WIN = "main";
export function setDiagWindow(label: string): void {
  WIN = label;
}

// 单调递增序号：同一毫秒内多条日志靠它还原先后顺序（配对 switch ↔ focus-effect、
// 判断 setSelection 与整体 replace 谁先谁后）。
let seq = 0;

// opt-out 开关，读一次缓存。默认（未设置）= 开。
const ENABLED = (() => {
  try {
    return localStorage.getItem("penraft_debug") !== "off";
  } catch {
    return true;
  }
})();

export function diag(tag: string, fields: Record<string, unknown>): void {
  if (!ENABLED) return;
  let payload = "";
  try {
    payload = JSON.stringify(fields, (_k, v) =>
      typeof v === "string" && v.length > 120 ? `${v.slice(0, 120)}…` : v,
    );
  } catch {
    payload = '{"_stringifyError":true}';
  }
  const line = `${new Date().toISOString()} [${WIN}] #${seq++} ${tag} ${payload}`;
  try {
    console.debug(line);
  } catch {
    /* ignore */
  }
  void debugLog(line);
}
