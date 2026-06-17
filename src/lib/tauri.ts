import { invoke } from "@tauri-apps/api/core";
import type { NoteDocument, NoteSummary, RenameResult, TabsState, WindowGeom } from "./types";

export async function listNotes(): Promise<NoteSummary[]> {
  return invoke("list_notes");
}

export async function createNote(): Promise<NoteDocument> {
  return invoke("create_note");
}

export async function readNote(path: string): Promise<NoteDocument> {
  return invoke("read_note", { path });
}

export async function saveNote(path: string, content: string): Promise<NoteDocument> {
  return invoke("save_note", { path, content });
}

export async function exportNote(targetPath: string, content: string): Promise<void> {
  return invoke("export_note", { targetPath, content });
}

export async function renameNote(oldPath: string, newStem: string): Promise<RenameResult> {
  return invoke("rename_note", { oldPath, newStem });
}

export async function deleteNote(path: string): Promise<void> {
  return invoke("delete_note", { path });
}

export async function revealInFinder(path: string): Promise<void> {
  return invoke("reveal_in_finder", { path });
}

export async function openNotesFolder(): Promise<void> {
  return invoke("open_notes_folder");
}

export async function searchNotes(query: string): Promise<NoteSummary[]> {
  return invoke("search_notes", { query });
}

export async function loadTabs(label: string): Promise<TabsState> {
  return invoke("load_tabs", { label });
}

export async function saveTabs(label: string, state: TabsState): Promise<void> {
  return invoke("save_tabs", { label, state });
}

export async function takePendingOpenFiles(): Promise<string[]> {
  return invoke("take_pending_open_files");
}

export async function getVaultPath(): Promise<string> {
  return invoke("get_vault_path");
}

export async function setVaultPath(newPath: string, moveFiles: boolean): Promise<void> {
  return invoke("set_vault_path", { newPath, moveFiles });
}

export async function listPenraftWindows(selfLabel: string): Promise<WindowGeom[]> {
  return invoke("list_penraft_windows", { selfLabel });
}

// 诊断日志：尽力而为追加一行，任何失败都吞掉，绝不影响调用方。
export async function debugLog(line: string): Promise<void> {
  try {
    await invoke("debug_log", { line });
  } catch {
    /* best-effort */
  }
}

export async function debugLogPath(): Promise<string> {
  return invoke("debug_log_path");
}
