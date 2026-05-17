mod models;
mod vault;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use models::{NoteDocument, NoteSummary, TabsState};
use tauri::{AppHandle, Emitter, Manager};
use vault::CommandResult;

const OPEN_FILE_EVENT: &str = "penraft://open-file";

#[derive(Default)]
struct PendingOpenFiles(Mutex<Vec<String>>);

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
fn rename_note(old_path: String, new_stem: String) -> CommandResult<NoteSummary> {
    vault::rename_note(old_path, new_stem)
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
    // Always push to the queue so the frontend can drain it on bootstrap,
    // even if no listener has been attached yet.
    if let Some(state) = app.try_state::<PendingOpenFiles>() {
        if let Ok(mut queue) = state.0.lock() {
            queue.extend(paths.clone());
        }
    }
    if let Some(window) = app.get_webview_window("main") {
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

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = collect_md_paths(argv);
            dispatch_open_files(app, paths);
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpenFiles(Mutex::new(initial_paths)))
        .invoke_handler(tauri::generate_handler![
            list_notes,
            create_note,
            read_note,
            save_note,
            export_note,
            rename_note,
            delete_note,
            reveal_in_finder,
            search_notes,
            load_tabs,
            save_tabs,
            take_pending_open_files,
        ])
        .build(tauri::generate_context!())
        .expect("error while running Penraft");

    app.run(|app_handle, event| {
        on_run_event(app_handle, &event);
    });
}
