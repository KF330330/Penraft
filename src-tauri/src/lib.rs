mod models;
mod vault;

use models::{NoteDocument, NoteSummary, TabsState};
use vault::CommandResult;

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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Penraft");
}
