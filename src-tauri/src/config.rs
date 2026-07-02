use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::vault::CommandResult;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub vault_path: Option<String>,
}

pub fn config_path() -> PathBuf {
    dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Penraft")
        .join("config.json")
}

pub fn read_app_config() -> AppConfig {
    let p = config_path();
    std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn write_app_config(cfg: &AppConfig) -> CommandResult<()> {
    let p = config_path();
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    // 原子写：防写盘途中进程被杀导致 config.json 截断 → read_app_config 静默回退默认，
    // 自定义 vault_path 丢失、App 切回 ~/Documents/PenraftVault，用户误以为"笔记没了"。
    crate::vault::atomic_write(&p, json.as_bytes())
}
