use crate::models::{NoteDocument, NoteSummary, TabsState};
use chrono::{DateTime, Local, Utc};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;
use walkdir::WalkDir;

pub type CommandResult<T> = Result<T, String>;

pub fn list_notes() -> CommandResult<Vec<NoteSummary>> {
    ensure_vault_dirs()?;
    list_notes_internal()
}

pub fn create_note() -> CommandResult<NoteDocument> {
    ensure_vault_dirs()?;
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let file_name = format!("{}.md", timestamp);
    let path = unique_path(notes_dir().join(file_name));
    atomic_write(&path, b"")?;
    read_note_internal(&path)
}

pub fn read_note(path: String) -> CommandResult<NoteDocument> {
    let path_buf = PathBuf::from(path);
    read_note_internal(&path_buf)
}

pub fn save_note(path: String, content: String) -> CommandResult<NoteDocument> {
    let path_buf = PathBuf::from(path);
    if !is_markdown_path(&path_buf) {
        return Err("只能保存 .md 或 .markdown 文件".to_string());
    }
    atomic_write(&path_buf, content.as_bytes())?;
    read_note_internal(&path_buf)
}

pub fn export_note(target_path: String, content: String) -> CommandResult<()> {
    let path_buf = PathBuf::from(target_path);
    atomic_write(&path_buf, content.as_bytes())
}

pub fn rename_note(old_path: String, new_stem: String) -> CommandResult<NoteSummary> {
    let src = PathBuf::from(&old_path);
    if !src.exists() {
        return Err("原文件不存在".to_string());
    }
    if !is_markdown_path(&src) {
        return Err("只能重命名 .md 或 .markdown 文件".to_string());
    }
    let safe = sanitize_stem(&new_stem)?;
    let parent = src
        .parent()
        .ok_or_else(|| "无效路径".to_string())?
        .to_path_buf();
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("md")
        .to_string();
    let candidate = parent.join(format!("{}.{}", safe, ext));
    let dst = if candidate == src {
        return note_summary_for_path(&src);
    } else {
        unique_path(candidate)
    };
    fs::rename(&src, &dst).map_err(to_err)?;
    note_summary_for_path(&dst)
}

pub fn delete_note(path: String) -> CommandResult<()> {
    let target = PathBuf::from(&path);
    if !is_markdown_path(&target) {
        return Err("只能删除 .md 或 .markdown 文件".to_string());
    }
    if !target.exists() {
        return Err("文件不存在".to_string());
    }
    let target_canonical = target.canonicalize().map_err(to_err)?;
    let notes_root = notes_dir().canonicalize().map_err(to_err)?;
    if !target_canonical.starts_with(&notes_root) {
        return Err("只能删除 Vault 内的文件".to_string());
    }
    fs::remove_file(&target_canonical).map_err(to_err)?;
    Ok(())
}

pub fn search_notes(query: String) -> CommandResult<Vec<NoteSummary>> {
    let query = query.trim().to_lowercase();
    let all = list_notes_internal()?;
    if query.is_empty() {
        return Ok(all);
    }
    let mut matched = Vec::new();
    for note in all {
        let mut haystack = format!("{} {} {}", note.title, note.preview, note.path).to_lowercase();
        if let Ok(raw) = fs::read_to_string(&note.path) {
            haystack.push_str(&raw.to_lowercase());
        }
        if haystack.contains(&query) {
            matched.push(note);
        }
    }
    Ok(matched)
}

pub fn load_tabs() -> CommandResult<TabsState> {
    let path = tabs_path();
    let mut state: TabsState = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(to_err)?;
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        TabsState::default()
    };
    state.paths.retain(|p| {
        let pb = PathBuf::from(p);
        pb.exists() && is_markdown_path(&pb)
    });
    if let Some(active) = &state.active {
        if !state.paths.contains(active) {
            state.active = state.paths.first().cloned();
        }
    } else if !state.paths.is_empty() {
        state.active = state.paths.first().cloned();
    }
    Ok(state)
}

pub fn save_tabs(state: TabsState) -> CommandResult<()> {
    ensure_vault_dirs()?;
    let path = tabs_path();
    let json = serde_json::to_string_pretty(&state).map_err(to_err)?;
    atomic_write(&path, json.as_bytes())
}

fn list_notes_internal() -> CommandResult<Vec<NoteSummary>> {
    ensure_vault_dirs()?;
    let mut notes = Vec::new();

    for entry in WalkDir::new(notes_dir())
        .max_depth(4)
        .into_iter()
        .filter_map(Result::ok)
    {
        if entry.file_type().is_file() && is_markdown_path(entry.path()) {
            if let Ok(summary) = note_summary_for_path(entry.path()) {
                notes.push(summary);
            }
        }
    }

    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(notes)
}

fn ensure_vault_dirs() -> CommandResult<()> {
    fs::create_dir_all(notes_dir()).map_err(to_err)?;
    fs::create_dir_all(penraft_dir()).map_err(to_err)?;
    Ok(())
}

fn vault_root() -> PathBuf {
    default_vault_path().unwrap_or_else(|_| PathBuf::from("."))
}

fn notes_dir() -> PathBuf {
    vault_root().join("Notes")
}

fn penraft_dir() -> PathBuf {
    vault_root().join(".penraft")
}

fn tabs_path() -> PathBuf {
    penraft_dir().join("tabs.json")
}

fn default_vault_path() -> CommandResult<PathBuf> {
    if let Some(documents) = dirs::document_dir() {
        return Ok(documents.join("PenraftVault"));
    }
    if let Some(home) = dirs::home_dir() {
        return Ok(home.join("Documents").join("PenraftVault"));
    }
    Err("无法找到用户主目录".to_string())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> CommandResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_err)?;
        let mut tmp = NamedTempFile::new_in(parent).map_err(to_err)?;
        tmp.write_all(bytes).map_err(to_err)?;
        tmp.flush().map_err(to_err)?;
        tmp.persist(path).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("无效路径".to_string())
    }
}

fn note_summary_for_path(path: &Path) -> CommandResult<NoteSummary> {
    let mut file = fs::File::open(path).map_err(to_err)?;
    let mut raw = String::new();
    file.read_to_string(&mut raw).map_err(to_err)?;
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let preview = extract_preview(&raw);
    let metadata = fs::metadata(path).map_err(to_err)?;
    let updated_at = metadata
        .modified()
        .ok()
        .map(system_time_to_string)
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let created_at = metadata
        .created()
        .ok()
        .map(system_time_to_string)
        .unwrap_or_else(|| updated_at.clone());
    let path_str = path.to_string_lossy().to_string();
    Ok(NoteSummary {
        id: path_id(path),
        title,
        path: path_str,
        updated_at,
        created_at,
        preview,
    })
}

fn read_note_internal(path: &Path) -> CommandResult<NoteDocument> {
    let raw = fs::read_to_string(path).map_err(to_err)?;
    let summary = note_summary_for_path(path)?;
    Ok(NoteDocument {
        summary,
        content: raw,
    })
}

fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("note");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("md");
    for i in 1..10_000 {
        let candidate = parent.join(format!("{}-{}.{}", stem, i, ext));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{}-{}.{}", stem, Local::now().timestamp_millis(), ext))
}

fn sanitize_stem(input: &str) -> CommandResult<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("名称不能为空".to_string());
    }
    if trimmed.chars().count() > 120 {
        return Err("名称过长".to_string());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("非法名称".to_string());
    }
    if trimmed.starts_with('.') {
        return Err("名称不能以 . 开头".to_string());
    }
    let mut out = String::new();
    for ch in trimmed.chars() {
        match ch {
            '/' | '\\' | '\0' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => {
                return Err("名称包含非法字符".to_string());
            }
            _ => out.push(ch),
        }
    }
    Ok(out)
}

fn extract_preview(raw: &str) -> String {
    let mut out = String::new();
    let mut in_frontmatter = false;
    for (idx, line) in raw.lines().enumerate() {
        if idx == 0 && line.trim() == "---" {
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter {
            if line.trim() == "---" {
                in_frontmatter = false;
            }
            continue;
        }
        let clean = strip_markdown(line);
        if !clean.trim().is_empty() {
            if !out.is_empty() {
                out.push(' ');
            }
            out.push_str(clean.trim());
        }
        if out.chars().count() >= 120 {
            break;
        }
    }
    out.chars().take(140).collect()
}

fn strip_markdown(line: &str) -> String {
    let mut s = line.trim().to_string();
    for prefix in ["#", "##", "###", "####", "#####", "######", "-", "*", ">"] {
        if s.starts_with(prefix) {
            s = s.trim_start_matches(prefix).trim().to_string();
        }
    }
    s.replace("**", "")
        .replace("__", "")
        .replace('`', "")
        .replace("![", "[")
}

fn path_id(path: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    hex::encode(&hasher.finalize()[..8])
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|ext| matches!(ext.to_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

fn system_time_to_string(time: std::time::SystemTime) -> String {
    let dt: DateTime<Utc> = time.into();
    dt.to_rfc3339()
}

fn to_err<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}
