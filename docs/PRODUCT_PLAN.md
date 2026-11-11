# PadMD product plan

## Product direction

PadMD is a local-first Markdown workspace for Android tablets and iPad. It is
optimized for touch, stylus-adjacent workflows, external keyboards, portrait
reading, and landscape split-screen editing.

## Version 0.1 — working MVP

- Local Markdown import
- Recent-document library
- Markdown source editing and GFM preview
- Adaptive split view at 800 logical pixels
- Debounced automatic save into the app document directory
- Light and dark themes

## Version 0.2 — practical file workflow

- Rename, duplicate, delete, export, and Save As
- Open and export whole folders
- Relative local image resolution
- Document outline, full-text search, and recent positions
- Undo/redo toolbar and hardware keyboard shortcuts
- Recovery snapshots and conflict handling

## Version 0.3 — Typora-like editing

- Block-based Markdown editor
- Inline rendering for headings, emphasis, links, and code
- Tables, task lists, footnotes, and math
- Drag/drop and paste image handling
- Theme and typography customization
- Optional HTML reading

## Platform notes

- Android uses the system document picker; no broad storage permission is
  required.
- iPad uses the system document picker and the app's sandboxed Documents area.
- iOS release builds must be produced and signed on macOS with Xcode.
- Imported files are copied into the app library in 0.1. Export/Save As is
  planned for 0.2 so edits can be sent back to Files or cloud providers.
