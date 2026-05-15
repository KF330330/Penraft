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
