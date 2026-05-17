use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub path: String,
    pub updated_at: String,
    pub created_at: String,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteDocument {
    pub summary: NoteSummary,
    pub content: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TabsState {
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub active: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WindowGeom {
    pub label: String,
    pub inner_x: i32,
    pub inner_y: i32,
    pub inner_width: u32,
    pub inner_height: u32,
    pub scale_factor: f64,
}
