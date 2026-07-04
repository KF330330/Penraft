mod config;
mod diaglog;
mod models;
mod telemetry;
mod vault;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use models::{NoteDocument, NoteSummary, RenameResult, TabsState, WindowGeom};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use vault::CommandResult;

const OPEN_FILE_EVENT: &str = "penraft://open-file";
const MAIN_WINDOW: &str = "main";
const TORN_PREFIX: &str = "torn-";

#[derive(Default)]
struct PendingOpenFiles(Mutex<Vec<String>>);

/// 每个窗口当前打开的文件路径集合（label → paths）。用于"打开已在其他窗口打开的文件时，
/// 聚焦那个窗口而非在本窗口开副本"，避免同文件多窗口各自自动保存互相覆盖（丢失更新）。
#[derive(Default)]
struct OpenPaths(Mutex<HashMap<String, Vec<String>>>);

/// 维护最近一次 focus 的窗口顺序。末尾 = 最近 focus = z-order 顶。
#[derive(Default)]
struct FocusOrder(Mutex<Vec<String>>);

impl FocusOrder {
    fn touch(&self, label: &str) {
        if let Ok(mut v) = self.0.lock() {
            v.retain(|x| x != label);
            v.push(label.to_string());
        }
    }

    /// 返回 label 在 focus 历史中的排名（越大越靠前 = z-order 越上）。
    /// 未记录过的窗口返回 0。
    fn rank(&self, label: &str) -> usize {
        match self.0.lock() {
            Ok(v) => v.iter().position(|x| x == label).map(|i| i + 1).unwrap_or(0),
            Err(_) => 0,
        }
    }
}

fn is_mergeable_label(label: &str) -> bool {
    label == MAIN_WINDOW || label.starts_with(TORN_PREFIX)
}

#[tauri::command]
fn list_notes() -> CommandResult<Vec<NoteSummary>> {
    vault::list_notes()
}

#[tauri::command]
fn create_note() -> CommandResult<NoteDocument> {
    vault::create_note()
}

#[tauri::command]
fn read_note(path: String) -> CommandResult<NoteDocument> {
    vault::read_note(path)
}

#[tauri::command]
fn save_note(path: String, content: String) -> CommandResult<NoteDocument> {
    vault::save_note(path, content)
}

#[tauri::command]
fn export_note(target_path: String, content: String) -> CommandResult<()> {
    vault::export_note(target_path, content)
}

#[tauri::command]
fn rename_note(old_path: String, new_stem: String) -> CommandResult<RenameResult> {
    vault::rename_note(old_path, new_stem)
}

#[tauri::command]
fn get_vault_path() -> CommandResult<String> {
    vault::get_vault_path()
}

#[tauri::command]
fn set_vault_path(new_path: String, move_files: bool) -> CommandResult<()> {
    vault::set_vault_path(new_path, move_files)
}

#[tauri::command]
fn delete_note(path: String) -> CommandResult<()> {
    vault::delete_note(path)
}

#[tauri::command]
fn reveal_in_finder(path: String) -> CommandResult<()> {
    vault::reveal_in_finder(path)
}

#[tauri::command]
fn open_notes_folder() -> CommandResult<()> {
    vault::open_notes_folder()
}

#[tauri::command]
fn search_notes(query: String) -> CommandResult<Vec<NoteSummary>> {
    vault::search_notes(query)
}

#[tauri::command]
fn load_tabs(label: String) -> CommandResult<TabsState> {
    vault::load_tabs(label)
}

#[tauri::command]
fn save_tabs(label: String, state: TabsState) -> CommandResult<()> {
    vault::save_tabs(label, state)
}

#[tauri::command]
fn list_penraft_windows(app: AppHandle, self_label: String) -> Vec<WindowGeom> {
    let focus_order = app.state::<FocusOrder>();
    let mut out = Vec::new();
    for (label, win) in app.webview_windows() {
        if label == self_label {
            continue;
        }
        if !is_mergeable_label(&label) {
            continue;
        }
        if !win.is_visible().unwrap_or(false) {
            continue;
        }
        let Ok(pos) = win.inner_position() else { continue };
        let Ok(size) = win.inner_size() else { continue };
        let Ok(scale) = win.scale_factor() else { continue };
        let is_focused = win.is_focused().unwrap_or(false);
        out.push(WindowGeom {
            label,
            inner_x: pos.x,
            inner_y: pos.y,
            inner_width: size.width,
            inner_height: size.height,
            scale_factor: scale,
            is_focused,
        });
    }
    // 按 focus 历史排序：最近 focus 的（z-order 顶）排前面。
    // 未在历史里出现的窗口（rank=0）排最后。
    out.sort_by(|a, b| focus_order.rank(&b.label).cmp(&focus_order.rank(&a.label)));
    out
}

/// 前端在打开的文件集合变化时上报本窗口的当前路径列表。
#[tauri::command]
fn set_window_paths(state: tauri::State<'_, OpenPaths>, label: String, paths: Vec<String>) {
    if let Ok(mut map) = state.0.lock() {
        map.insert(label, paths);
    }
}

/// 查询"除本窗口外，是否有别的（仍存在的）窗口已打开该文件"，返回那个窗口的 label。
/// 顺带清理已关闭窗口的陈旧条目，防注册表无界增长。
#[tauri::command]
fn find_window_with_path(app: AppHandle, path: String, self_label: String) -> Option<String> {
    let state = app.state::<OpenPaths>();
    let mut map = state.0.lock().ok()?;
    // 清掉窗口已不存在的陈旧条目（撕出窗口用系统红叉关闭时不会主动反注册）。
    map.retain(|label, _| app.get_webview_window(label).is_some());
    for (label, paths) in map.iter() {
        if label == &self_label || !is_mergeable_label(label) {
            continue;
        }
        if paths.iter().any(|p| p == &path) {
            return Some(label.clone());
        }
    }
    None
}

#[tauri::command]
fn take_pending_open_files(state: tauri::State<'_, PendingOpenFiles>) -> Vec<String> {
    let mut queue = state.0.lock().unwrap();
    std::mem::take(&mut *queue)
}

fn is_markdown_arg(s: &str) -> bool {
    Path::new(s)
        .extension()
        .and_then(|e| e.to_str())
        .map(|ext| matches!(ext.to_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

fn normalize_md_path(raw: &str) -> Option<String> {
    if !is_markdown_arg(raw) {
        return None;
    }
    let p = PathBuf::from(raw);
    let resolved = p
        .canonicalize()
        .map(|c| c.to_string_lossy().to_string())
        .unwrap_or_else(|_| p.to_string_lossy().to_string());
    Some(resolved)
}

fn collect_md_paths<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter_map(|s| normalize_md_path(&s))
        .collect()
}

fn dispatch_open_files(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    // 用户经系统入口打开的文件（可能在 Vault 外）：登记后 save_note 才放行写回原路径
    for p in &paths {
        vault::register_external_path(Path::new(p));
    }
    // Always push to the queue so the frontend can drain it on bootstrap,
    // even if no listener has been attached yet.
    if let Some(state) = app.try_state::<PendingOpenFiles>() {
        if let Ok(mut queue) = state.0.lock() {
            queue.extend(paths.clone());
        }
    }
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        for p in &paths {
            let _ = window.emit(OPEN_FILE_EVENT, p);
        }
    }
}

#[cfg(target_os = "macos")]
fn on_run_event(app_handle: &AppHandle, event: &tauri::RunEvent) {
    if let tauri::RunEvent::Opened { urls } = event {
        let paths: Vec<String> = urls
            .iter()
            .filter_map(|u| u.to_file_path().ok())
            .filter_map(|p| normalize_md_path(p.to_string_lossy().as_ref()))
            .collect();
        dispatch_open_files(app_handle, paths);
    }
}

#[cfg(not(target_os = "macos"))]
fn on_run_event(_app_handle: &AppHandle, _event: &tauri::RunEvent) {}

pub fn run() {
    let initial_paths = collect_md_paths(std::env::args());
    // 首次启动经命令行参数打开的文件同样登记，与 dispatch_open_files 一致
    for p in &initial_paths {
        vault::register_external_path(Path::new(p));
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = collect_md_paths(argv);
            dispatch_open_files(app, paths);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|_app| {
            telemetry::spawn();
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(true) = event {
                if let Some(state) = window.app_handle().try_state::<FocusOrder>() {
                    state.touch(window.label());
                }
            }
        })
        .manage(PendingOpenFiles(Mutex::new(initial_paths)))
        .manage(FocusOrder::default())
        .manage(OpenPaths::default())
        .invoke_handler(tauri::generate_handler![
            list_notes,
            create_note,
            read_note,
            save_note,
            export_note,
            rename_note,
            delete_note,
            reveal_in_finder,
            open_notes_folder,
            search_notes,
            load_tabs,
            save_tabs,
            list_penraft_windows,
            set_window_paths,
            find_window_with_path,
            take_pending_open_files,
            get_vault_path,
            set_vault_path,
            diaglog::debug_log,
            diaglog::debug_log_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while running Penraft");

    app.run(|app_handle, event| {
        on_run_event(app_handle, &event);
    });
}
