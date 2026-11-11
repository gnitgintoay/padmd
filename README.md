# PadMD

PadMD is a local-first Markdown editor designed for Android tablets and iPad.
It can also be installed as a free PWA from Safari.

## Current features

- Single-column editing and original/draft comparison mode
- Explicit **Save copy** export; imported source files are never overwritten
- Recovery drafts stored in the current browser every 20 seconds while needed
- Multiple-file and folder import for Markdown on the PWA
- Document search, rename, duplicate and safe local deletion
- Touch formatting toolbar, find/replace, undo/redo and document statistics
- Bluetooth keyboard shortcuts on iPad and Android (`⌘` or `Ctrl`)

Folder import is a one-time copy into PadMD. The PWA cannot keep continuous
write access to an iPad Files folder, so edited documents must be exported with
**Save copy**. Export important documents regularly because clearing Safari
website data also clears the local library and recovery drafts.

## Run locally

Flutter is installed at `E:\dev\flutter`. Run:

```powershell
flutter pub get
flutter run
```

Build the free PWA with `flutter build web --release`. Serve the generated
`build/web` folder over HTTPS, open it in iPad Safari, then choose Share > Add
to Home Screen.

Public PWA: https://gnitgintoay.github.io/padmd/
