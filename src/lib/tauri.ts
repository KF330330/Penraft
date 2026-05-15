import { invoke } from "@tauri-apps/api/core";
import type { NoteDocument, NoteSummary, TabsState } from "./types";

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

export async function renameNote(oldPath: string, newStem: string): Promise<NoteSummary> {
  return invoke("rename_note", { oldPath, newStem });
}

export async function deleteNote(path: string): Promise<void> {
  return invoke("delete_note", { path });
}

export async function revealInFinder(path: string): Promise<void> {
  return invoke("reveal_in_finder", { path });
}

export async function searchNotes(query: string): Promise<NoteSummary[]> {
  return invoke("search_notes", { query });
}

export async function loadTabs(): Promise<TabsState> {
  return invoke("load_tabs");
}

export async function saveTabs(state: TabsState): Promise<void> {
  return invoke("save_tabs", { state });
}
