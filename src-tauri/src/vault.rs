use crate::config::{self, AppConfig};
use crate::models::{NoteDocument, NoteSummary, RenameResult, TabsState};
use chrono::{DateTime, Local, Utc};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
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
    // 写入范围：Vault 的 Notes 目录内，或用户经合法入口（「打开方式」/命令行/tabs 恢复）
    // 打开的外部文件精确路径。其余路径拒绝，防渲染层被注入后经此命令越界写任意文件。
    if !is_registered_external(&path_buf) {
        ensure_within_notes_dir(&path_buf)?;
    }
    atomic_write(&path_buf, content.as_bytes())?;
    read_note_internal(&path_buf)
}

pub fn export_note(target_path: String, content: String) -> CommandResult<()> {
    let path_buf = PathBuf::from(target_path);
    // 「另存为」目标由原生保存对话框返回，用户本就可存到 Vault 外任意位置，故不限目录；
    // 但强制 .md/.markdown 扩展名（对齐 save_note），避免经此命令写出可执行/配置类文件。
    if !is_markdown_path(&path_buf) {
        return Err("只能导出 .md 或 .markdown 文件".to_string());
    }
    atomic_write(&path_buf, content.as_bytes())
}

pub fn rename_note(old_path: String, new_stem: String) -> CommandResult<RenameResult> {
    let src = PathBuf::from(&old_path);
    if !src.exists() {
        return Err("原文件不存在".to_string());
    }
    if !is_markdown_path(&src) {
        return Err("只能重命名 .md 或 .markdown 文件".to_string());
    }
    let (safe, sanitized) = sanitize_stem(&new_stem)?;
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
        return note_summary_for_path(&src).map(|summary| RenameResult { summary, sanitized });
    } else {
        unique_path(candidate)
    };
    fs::rename(&src, &dst).map_err(to_err)?;
    note_summary_for_path(&dst).map(|summary| RenameResult { summary, sanitized })
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

pub fn reveal_in_finder(path: String) -> CommandResult<()> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err("文件不存在".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg("-R").arg(&target).status().map_err(to_err)?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg("/select,").arg(&target).status().map_err(to_err)?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = target.parent().ok_or_else(|| "无法定位父目录".to_string())?;
        Command::new("xdg-open").arg(parent).status().map_err(to_err)?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("当前平台不支持".to_string())
}

pub fn open_notes_folder() -> CommandResult<()> {
    ensure_vault_dirs()?;
    let target = notes_dir();
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(&target).status().map_err(to_err)?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg(&target).status().map_err(to_err)?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(&target).status().map_err(to_err)?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("当前平台不支持".to_string())
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

pub fn load_tabs(label: String) -> CommandResult<TabsState> {
    ensure_vault_dirs()?;
    let path = tabs_path(&label);
    // 一次性迁移：旧 tabs.json → tabs-main.json
    if label == "main" && !path.exists() {
        let legacy = penraft_dir().join("tabs.json");
        if legacy.exists() {
            let _ = fs::rename(&legacy, &path);
        }
    }
    let mut state: TabsState = match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => TabsState::default(),
        // 读取失败（如 TCC 权限拒绝的 EPERM）不能当"文件不存在"静默返回空状态：
        // 前端会以空 tab 启动，且下次保存会用空状态覆盖掉磁盘上完好的旧清单。
        Err(e) => return Err(format!("无法读取标签状态文件: {}", e)),
    };
    state.paths.retain(|p| {
        let pb = PathBuf::from(p);
        pb.exists() && is_markdown_path(&pb)
    });
    // 恢复的 tab 是用户上次合法打开的文件，其中 Vault 外的路径登记放行写回
    for p in &state.paths {
        register_external_path(Path::new(p));
    }
    if let Some(active) = &state.active {
        if !state.paths.contains(active) {
            state.active = state.paths.first().cloned();
        }
    } else if !state.paths.is_empty() {
        state.active = state.paths.first().cloned();
    }
    Ok(state)
}

pub fn save_tabs(label: String, state: TabsState) -> CommandResult<()> {
    ensure_vault_dirs()?;
    let path = tabs_path(&label);
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
    if let Some(custom) = config::read_app_config().vault_path {
        let pb = PathBuf::from(custom);
        if pb.is_absolute() {
            return pb;
        }
    }
    default_vault_path().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn get_vault_path() -> CommandResult<String> {
    vault_root()
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "路径包含非 UTF-8 字符".to_string())
}

pub fn set_vault_path(new_path: String, move_files: bool) -> CommandResult<()> {
    let new_pb = PathBuf::from(&new_path);
    if !new_pb.is_absolute() {
        return Err("必须是绝对路径".to_string());
    }
    let old_root = vault_root();
    let canonical_new = new_pb
        .canonicalize()
        .or_else(|_| {
            fs::create_dir_all(&new_pb).map_err(to_err)?;
            new_pb.canonicalize().map_err(to_err)
        })?;
    let canonical_old = old_root.canonicalize().ok();
    if Some(&canonical_new) == canonical_old.as_ref() {
        return Ok(());
    }

    if move_files && old_root.exists() {
        let old_notes = old_root.join("Notes");
        let old_penraft = old_root.join(".penraft");
        if old_notes.exists() {
            move_dir_merge(&old_notes, &canonical_new.join("Notes"))?;
        }
        if old_penraft.exists() {
            move_dir_merge(&old_penraft, &canonical_new.join(".penraft"))?;
        }
        let _ = fs::remove_dir(&old_root);
    }

    let path_str = canonical_new
        .to_str()
        .ok_or_else(|| "路径包含非 UTF-8 字符".to_string())?
        .to_string();
    config::write_app_config(&AppConfig {
        vault_path: Some(path_str),
    })?;
    ensure_vault_dirs()
}

fn move_dir_merge(src: &Path, dst: &Path) -> CommandResult<()> {
    fs::create_dir_all(dst).map_err(to_err)?;
    for entry in fs::read_dir(src).map_err(to_err)? {
        let entry = entry.map_err(to_err)?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let ft = entry.file_type().map_err(to_err)?;
        if ft.is_dir() {
            move_dir_merge(&from, &to)?;
            let _ = fs::remove_dir(&from);
        } else {
            if to.exists() {
                let _ = fs::remove_file(&to);
            }
            if fs::rename(&from, &to).is_err() {
                fs::copy(&from, &to).map_err(to_err)?;
                fs::remove_file(&from).map_err(to_err)?;
            }
        }
    }
    Ok(())
}

fn notes_dir() -> PathBuf {
    vault_root().join("Notes")
}

pub(crate) fn penraft_dir() -> PathBuf {
    vault_root().join(".penraft")
}

fn tabs_path(label: &str) -> PathBuf {
    penraft_dir().join(format!("tabs-{}.json", label))
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

pub fn atomic_write(path: &Path, bytes: &[u8]) -> CommandResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_err)?;
        let mut tmp = NamedTempFile::new_in(parent).map_err(to_err)?;
        tmp.write_all(bytes).map_err(to_err)?;
        // fsync 临时文件：确保 rename 生效时数据块已落盘，
        // 防掉电/内核崩溃时元数据先落盘而数据未落盘 → 笔记变 0 字节或截断。
        tmp.as_file().sync_all().map_err(to_err)?;
        tmp.persist(path).map_err(|e| e.to_string())?;
        // fsync 父目录：确保 rename 这条目录项变更本身落盘（Unix；Windows 打开目录会失败，跳过）。
        if let Ok(dir) = fs::File::open(parent) {
            let _ = dir.sync_all();
        }
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

fn sanitize_stem(input: &str) -> CommandResult<(String, bool)> {
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
    let mut sanitized = false;
    for ch in trimmed.chars() {
        match ch {
            '/' | '\\' | '\0' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => {
                out.push('-');
                sanitized = true;
            }
            _ => out.push(ch),
        }
    }
    Ok((out, sanitized))
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

/// 用户经合法入口（macOS「打开方式」/ 命令行参数 / tabs 恢复）打开的 Vault 外文件集合。
/// save_note 仅对这些精确路径（canonicalize 后比对）放行写回；渲染层自身无法把新路径
/// 加进来（read_note 不登记），保持防越界写的安全边界。
fn external_open_paths() -> &'static Mutex<HashSet<PathBuf>> {
    static PATHS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    PATHS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn register_external_path(path: &Path) {
    if let Ok(canonical) = path.canonicalize() {
        if let Ok(mut set) = external_open_paths().lock() {
            set.insert(canonical);
        }
    }
}

fn is_registered_external(path: &Path) -> bool {
    let Ok(canonical) = path.canonicalize() else {
        return false;
    };
    external_open_paths()
        .lock()
        .map(|set| set.contains(&canonical))
        .unwrap_or(false)
}

/// 校验写入目标位于当前 Vault 的 Notes 目录内（含子目录），防越界写。
/// 校验父目录（写入时目标文件可能尚不存在），canonicalize 解析符号链接后再比对，
/// 与 delete_note 的白名单策略保持一致。
fn ensure_within_notes_dir(path: &Path) -> CommandResult<()> {
    let parent = path.parent().ok_or_else(|| "无效路径".to_string())?;
    let parent_canonical = parent.canonicalize().map_err(to_err)?;
    let notes_root = notes_dir().canonicalize().map_err(to_err)?;
    if !parent_canonical.starts_with(&notes_root) {
        return Err("只能写入 Vault 内的文件".to_string());
    }
    Ok(())
}

fn system_time_to_string(time: std::time::SystemTime) -> String {
    let dt: DateTime<Utc> = time.into();
    dt.to_rfc3339()
}

fn to_err<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}
