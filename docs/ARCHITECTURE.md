# Penraft Architecture

Penraft is a Tauri 2 desktop application with a minimal multi-tab Markdown editor UI.

## Frontend

- React + TypeScript
- Tab bar + single editor pane (no sidebar, no file tree)
- Milkdown 7 for WYSIWYG rendering; CodeMirror 6 for source mode
- State managed entirely with React hooks (no global store)

## Backend

Rust commands exposed through Tauri `invoke`:

- `list_notes`
- `create_note`
- `read_note`
- `save_note`
- `rename_note`
- `search_notes`
- `load_tabs`
- `save_tabs`

## Vault layout

```text
~/Documents/PenraftVault/
  Notes/                # all .md files, flat
  .penraft/tabs.json    # { paths: string[], active: string | null }
```

The vault path is fixed; there is no settings panel.

## Auto-save flow

1. User types in the active tab.
2. `App.tsx` marks the doc dirty and resets a 500 ms debounce timer.
3. On timer fire, `save_note` writes the file atomically via a temp file + rename.
4. Switching tabs flushes the current doc synchronously before the switch.

## Tab persistence

Tab order, open list and active path live in `tabs.json`. On launch the frontend reads `load_tabs`, filters out paths whose files no longer exist, and renders the surviving tabs. If the list is empty (first launch or cleared vault), the app creates a new empty `.md` automatically.
