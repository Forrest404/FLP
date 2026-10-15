# FLP — Forrest Labs Play

A media player for macOS that plays almost anything (video, music, images, discs, streams), keeps every tool one click or one search away, and is easy to extend with plugins.

Built with Electron + React on top of [mpv](https://mpv.io) / FFmpeg.

## Download

**[FLP 0.1.0 for Mac (Apple Silicon, macOS 26 or later)](https://github.com/Forrest404/FLP/releases/download/v0.1.0/FLP-0.1.0-arm64.dmg)** — 208 MB. Other versions are on the [Releases](https://github.com/Forrest404/FLP/releases) page.

1. Open the `.dmg` and drag FLP into Applications.
2. The first time, right-click FLP and choose **Open**, then **Open** again. FLP isn't notarized by Apple, so macOS asks once. If it says FLP "is damaged", run `xattr -dr com.apple.quarantine /Applications/FLP.app` in Terminal.

## What it does

- Plays video, music and images in almost any format, plus folders, discs, network streams, online video (yt-dlp), internet radio, podcasts and UPnP/DLNA servers.
- A library with Home, Videos, Music, Playlists and Recent, with thumbnails and resume.
- Video, audio and subtitle effects in a sidebar: colour, crop, zoom, equalizer, compressor, subtitle delay and style.
- Convert and record, stream out, picture-in-picture, a web remote, profiles, and keyboard shortcuts you can change.
- Light and dark themes with an accent colour, and a control bar you can rearrange.

## Build from source

Needs macOS on Apple Silicon, Node 22+, Xcode command line tools and Homebrew.

```sh
brew install mpv ffmpeg yt-dlp dylibbundler
npm install
npm run native     # builds the mpv addon (native/mpv-view)
npm run dev        # starts FLP with hot reload
```

`npm run dist` builds `dist/FLP-<version>-arm64.dmg`. The app inside carries its own libmpv, FFmpeg and yt-dlp, so it runs without Homebrew. It is ad-hoc signed. Without an Apple Developer account it isn't notarized, so the first launch needs right-click → Open.

## Finding things

- **⌘K** finds any action or setting by name.
- **Right-click** the video for playback, video, audio and subtitle options.
- The **effects sidebar** (the sliders button on the control bar) has the Video, Audio, Subtitles and Playback panels.
- **Settings (⌘,)** is searchable. Rarely used options sit behind *Advanced Options* on each page.
- **Customize Player** (in the "…" menu) lets you drag any action onto the title or control bar.

## Plugins

A plugin is a folder with `plugin.json` and `main.js`. See [docs/PLUGINS.md](docs/PLUGINS.md) for the guide, and [plugins-examples/](plugins-examples) for four working plugins. Settings → Extensions → **Create a plugin** makes a starter plugin. Saving a plugin's file reloads it instantly.

## Layout

```
native/mpv-view/   Objective-C++ addon: libmpv rendered in an NSView under the web UI
src/main/          window, mpv bridge, settings, library (SQLite), plugins, convert/stream,
                   UPnP/DLNA, radio & podcasts, web remote
src/plugin-host/   separate process that runs plugins
src/renderer/      React UI (player, library, panels, dialogs, settings)
src/shared/        types and logic shared by all processes (settings schema, effects…)
design/            Figma reference: screenshots, node metadata, extraction scripts
scripts/           macOS bundling and packaging
test/unit/         unit tests (npm test)
```

## Known limits

- DVD and Blu-ray **menus** aren't supported (mpv has no menu support), so titles play directly.
- Icons are close stand-ins for the Figma icon set until its SVGs are exported into `design/icons`.
- Casting uses DLNA/UPnP (most smart TVs and speakers). Chromecast and AirPlay aren't supported.
- Plugins run with full access to your Mac; the permissions in `plugin.json` are shown but not enforced. Only install plugins you trust.
- Set a password before turning on the web remote (Settings → Controls), since anyone on your network can reach it.

## Licence

GPL-3.0-or-later (see [LICENSE](LICENSE)). FLP bundles mpv and FFmpeg, which are GPL.
