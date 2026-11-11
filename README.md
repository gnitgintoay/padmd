# PadMD

PadMD is a minimal local-first Markdown reader and editor designed for Android
tablets and iPad. It can also be installed as a free PWA from Safari.

## MVP features

- Import local `.md` and `.markdown` documents
- Edit Markdown with live preview
- Responsive tablet split view and compact edit/preview tabs
- Automatic local save
- Export the current document as a Markdown download
- Recent document library and dark mode

On the web, documents are copied into browser-local storage. Export important
documents regularly because clearing Safari website data also clears the local
library.

## Run locally

Flutter is installed at `E:\dev\flutter`. Run:

```powershell
flutter pub get
flutter run
```

Build the free PWA with `flutter build web --release`. Serve the generated
`build/web` folder over HTTPS, open it in iPad Safari, then choose Share > Add
to Home Screen.
