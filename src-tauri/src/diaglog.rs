// 诊断日志：把前端埋点（新建 / 切 tab / 聚焦生命周期 / 定时自检）追加写到磁盘，
// 用来定位「新建笔记后光标偶发点不进」这类 macOS WKWebView 偶发、无法稳定复现的 bug。
//
// 设计要点：
// - 尽力而为、永不报错（沿用 telemetry.rs 的 `let _ =` 吞错风格），日志失败绝不影响前端。
// - 只追加（OpenOptions::append），不用 vault::atomic_write —— 后者是全量重写，语义不对。
// - 文件落在 penraft_dir()（即 ~/Documents/PenraftVault/.penraft/），与 device.json 等内部
//   状态同目录，不污染用户笔记区；通过设置里「在 Finder 中显示」配合 reveal_in_finder 取回。
// - App 是单进程多窗口（main + torn-*），一个进程级 Mutex 足以串行化所有窗口的写入。

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::vault::penraft_dir;

// 进程级写锁：覆盖 main 与所有 torn 窗口的并发追加。
static LOG_LOCK: Mutex<()> = Mutex::new(());

// 单文件上限；超过就轮转一代，磁盘占用封顶 ~2x。
const MAX_BYTES: u64 = 512 * 1024;
const LOG_FILE: &str = "penraft-debug.log";
const ROTATED_FILE: &str = "penraft-debug.log.1";

fn log_path() -> PathBuf {
    penraft_dir().join(LOG_FILE)
}

/// 追加一行诊断日志。尽力而为，任何 IO 错误都吞掉，绝不向前端报错。
#[tauri::command]
pub fn debug_log(line: String) {
    // 锁中毒（某次写时 panic 过）也照常拿来用——我们不关心被保护数据的一致性。
    let _guard = LOG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    // 写前轮转：超限就把当前文件改名为 .1（覆盖上一代），主文件重新开始。
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > MAX_BYTES {
            if let Some(parent) = path.parent() {
                let rotated = parent.join(ROTATED_FILE);
                let _ = fs::remove_file(&rotated);
                let _ = fs::rename(&path, &rotated);
            }
        }
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line.as_bytes());
        let _ = f.write_all(b"\n");
        // 追加 + drop 时 flush 足够；不做 per-line fsync，避免每行一次磁盘 stall。
    }
}

/// 返回日志绝对路径，供前端「在 Finder 中显示调试日志」配合 reveal_in_finder 使用。
#[tauri::command]
pub fn debug_log_path() -> String {
    log_path().to_string_lossy().to_string()
}
