// Penraft 跨窗口事件名与 payload 类型。
// 注意：Rust 端有镜像常量（src-tauri/src/lib.rs::OPEN_FILE_EVENT），需手工同步。
export const EVENTS = {
  OPEN_FILE: "penraft://open-file",
  MERGE_TAB: "penraft://merge-tab",
} as const;

export type OpenFilePayload = string;

export interface MergeTabPayload {
  path: string;
  screenX: number;
}
