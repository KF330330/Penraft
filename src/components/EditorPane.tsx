import type { NoteDocument } from "../lib/types";
import { MarkdownEditor } from "./MarkdownEditor";
import { MilkdownEditor } from "./MilkdownEditor";

interface EditorPaneProps {
  document: NoteDocument | null;
  content: string;
  mode: "render" | "source";
  onContentChange: (value: string) => void;
}

export function EditorPane({
  document,
  content,
  mode,
  onContentChange,
}: EditorPaneProps) {
  if (!document) {
    return (
      <main className="editor-pane">
        <div className="editor-empty">
          <div className="empty-card">
            <h2>欢迎使用 Penraft</h2>
            <p>点击右上角 + 新建文档；输入内容会自动保存，⌘ + / 可以在实时渲染和源码模式之间切换。</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="editor-pane">
      <div className="editor-body">
        {mode === "render" ? (
          <div className="wysiwyg-column">
            <MilkdownEditor value={content} onChange={onContentChange} />
          </div>
        ) : (
          <div className="source-column">
            <MarkdownEditor value={content} onChange={onContentChange} />
          </div>
        )}
      </div>
    </main>
  );
}
