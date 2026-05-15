export interface NoteSummary {
  id: string;
  title: string;
  path: string;
  updated_at: string;
  created_at: string;
  preview: string;
}

export interface NoteDocument {
  summary: NoteSummary;
  content: string;
}

export interface TabsState {
  paths: string[];
  active: string | null;
}
