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

export interface WindowGeom {
  label: string;
  inner_x: number;
  inner_y: number;
  inner_width: number;
  inner_height: number;
  scale_factor: number;
}
