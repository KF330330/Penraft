use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::vault::penraft_dir;

const HEARTBEAT_INTERVAL_HOURS: i64 = 24;
const TICK_INTERVAL_SECS: u64 = 6 * 60 * 60; // 每 6h 检查一次

/// 后端地址三层兜底：编译期 env > 运行时 backend.json > 默认 production。
/// 默认改成 production URL，避免发版时忘注入 PENRAFT_BACKEND_URL 导致用户机器
/// 的埋点全打到自己 localhost 丢失。本地开发显式注入 env 或写 backend.json 覆盖。
fn backend_url() -> String {
    if let Some(url) = option_env!("PENRAFT_BACKEND_URL") {
        if !url.is_empty() {
            return url.to_string();
        }
    }
    let cfg_path = penraft_dir().join("backend.json");
    if let Ok(bytes) = fs::read(&cfg_path) {
        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            if let Some(url) = v.get("url").and_then(|x| x.as_str()) {
                if !url.is_empty() {
                    return url.to_string();
                }
            }
        }
    }
    "https://api.penraft.com".to_string()
}

fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn platform_str() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macos",
        "windows" => "windows",
        "linux" => "linux",
        _ => "unknown",
    }
}

fn device_file_path() -> PathBuf {
    penraft_dir().join("device.json")
}

fn heartbeat_file_path() -> PathBuf {
    penraft_dir().join("heartbeat.json")
}

#[derive(Debug, Serialize, Deserialize)]
struct DeviceFile {
    #[serde(rename = "deviceId")]
    device_id: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "firstVersion")]
    first_version: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct HeartbeatFile {
    #[serde(rename = "lastHeartbeatAt")]
    last_heartbeat_at: Option<String>,
}

/// 返回 (device_id, is_fresh)。is_fresh==true 表示是本次启动新生成的设备记录（用于触发 install 事件）。
fn load_or_create_device() -> (String, bool) {
    let path = device_file_path();
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(d) = serde_json::from_slice::<DeviceFile>(&bytes) {
            return (d.device_id, false);
        }
    }
    let id = Uuid::new_v4().to_string();
    let dev = DeviceFile {
        device_id: id.clone(),
        created_at: Utc::now().to_rfc3339(),
        first_version: app_version(),
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_vec_pretty(&dev) {
        let _ = fs::write(&path, json);
    }
    (id, true)
}

fn read_heartbeat() -> HeartbeatFile {
    let path = heartbeat_file_path();
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(d) = serde_json::from_slice::<HeartbeatFile>(&bytes) {
            return d;
        }
    }
    HeartbeatFile::default()
}

fn write_heartbeat(now: &str) {
    let path = heartbeat_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let h = HeartbeatFile {
        last_heartbeat_at: Some(now.to_string()),
    };
    if let Ok(json) = serde_json::to_vec_pretty(&h) {
        let _ = fs::write(&path, json);
    }
}

fn should_heartbeat() -> bool {
    let h = read_heartbeat();
    let Some(last) = h.last_heartbeat_at else { return true };
    let Ok(last_dt) = chrono::DateTime::parse_from_rfc3339(&last) else { return true };
    let now = Utc::now();
    (now.signed_duration_since(last_dt.with_timezone(&Utc))).num_hours() >= HEARTBEAT_INTERVAL_HOURS
}

async fn post_install(client: &reqwest::Client, device_id: &str) {
    let info = os_info::get();
    let body = json!({
        "device_id": device_id,
        "platform": platform_str(),
        "os_version": info.version().to_string(),
        "app_version": app_version(),
        "locale": sys_locale::get_locale().unwrap_or_default(),
    });
    let url = format!("{}/api/app/install", backend_url());
    let _ = client.post(url).json(&body).send().await;
}

enum HeartbeatResult {
    Ok,
    DeviceMissing,
    NetworkError,
}

async fn post_heartbeat(client: &reqwest::Client, device_id: &str) -> HeartbeatResult {
    let body = json!({
        "device_id": device_id,
        "app_version": app_version(),
    });
    let url = format!("{}/api/app/heartbeat", backend_url());
    match client.post(url).json(&body).send().await {
        Ok(r) if r.status().is_success() => HeartbeatResult::Ok,
        Ok(r) if r.status().as_u16() == 409 => HeartbeatResult::DeviceMissing,
        _ => HeartbeatResult::NetworkError,
    }
}

/// 在 Tauri setup 钩子里调用。用 tauri 的 async_runtime spawn 任务；所有 IO 静默吞错；不影响 app 启动。
pub fn spawn() {
    tauri::async_runtime::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
        {
            Ok(c) => c,
            Err(_) => return,
        };

        let (device_id, is_fresh) = load_or_create_device();

        if is_fresh {
            post_install(&client, &device_id).await;
        }

        // 启动时先尝试一次心跳（若距上次 >= 24h）
        loop {
            if should_heartbeat() {
                match post_heartbeat(&client, &device_id).await {
                    HeartbeatResult::Ok => {
                        write_heartbeat(&Utc::now().to_rfc3339());
                    }
                    HeartbeatResult::DeviceMissing => {
                        // 后端没有这台设备的记录（DB 重置 / 历史 install 失败 / fallback 路径已移除），
                        // 自愈：补一次 install，不写 heartbeat 时间戳，下次 tick 再重试 heartbeat。
                        post_install(&client, &device_id).await;
                    }
                    HeartbeatResult::NetworkError => {
                        // 静默，下次 tick 重试
                    }
                }
            }
            tokio::time::sleep(Duration::from_secs(TICK_INTERVAL_SECS)).await;
        }
    });
}
