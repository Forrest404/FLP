# Writing FLP plugins

A plugin is a folder with two files. Drop it in the plugins folder (Settings → Extensions → **Open plugins folder**), or let FLP make one for you with **Create a plugin**.

```
my-plugin/
  plugin.json   ← name and permissions
  main.js       ← your code
  panel.html    ← optional: a tab in the effects sidebar
```

## plugin.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What it does, in one sentence.",
  "permissions": []
}
```

`id` uses lowercase letters, numbers and dashes. Permissions are shown to the user:

| Permission | Allows |
| --- | --- |
| `network` | `flp.fetch(...)` |
| `library` | Reading the media library |
| `files` | Reading and writing files (say so if your plugin saves anything) |

## main.js

```js
/** @param {import('./plugin-api').FLP} flp */
export function activate(flp) {
  flp.commands.register({
    id: 'half-speed',
    title: 'Half speed',
    icon: 'speed',
    keys: ['Mod+Shift+H'],
    run: () => flp.player.set('speed', 0.5)
  })
  flp.ui.addControlButton('half-speed')
}
```

That's a complete plugin. The command appears in the menu bar's Plugins menu, the right-click menu, the ⌘K palette, Keyboard Shortcuts (where users can rebind it) and Customize Player. With `addControlButton` it also appears on the control bar.

**Save the file and FLP reloads the plugin immediately.** Errors appear under Settings → Extensions → your plugin.

## What you can do

The full typed API is in `plugin-api.d.ts` (copied into new plugins, so your editor autocompletes it). In short:

- **Player:** `play`, `pause`, `toggle`, `seek`, `next`, `previous`, `open(paths)`, `state()`. You also get every mpv property and command through `get`/`set`/`command`, and events through `on('time' | 'pause' | 'file-loaded' | 'ended' | 'state', cb)`.
- **Commands:** `register({ id, title, icon, keys, run })`, and `run('player.snapshot')` to trigger any built-in action.
- **UI:**
  - `notify(text, { action })` shows a message at the bottom of the window, optionally with a button.
  - `osd(text)` shows a short message in the corner.
  - `addControlButton(id)` puts one of your commands on the control bar.
  - `addContextMenuItem({ label, command })` adds an entry to the right-click menu.
  - `addPanel({ id, title, file })` adds your own HTML as a tab in the effects sidebar.
- **Settings:** `define([...])` declares settings; FLP builds their page for you. Read them with `get(key)`, write with `set(key, value)`, and react with `onChange(cb)`.
- **Storage:** `get(key, fallback)` / `set(key, value)` give each plugin its own JSON store.
- **Library:** `search`, `recent`, `playlists`, `createPlaylist`.
- **Network:** `fetch(url)`, with the `network` permission.

### Panels

`addPanel({ id: 'main', title: 'Timer', file: 'panel.html' })` shows your HTML in a sandboxed frame. Inside it:

```html
<button class="primary" onclick="flp.postMessage({ start: 30 })">30 min</button>
<script>flp.onMessage((data) => document.title = data.left)</script>
```

In `main.js`, `const panel = flp.ui.addPanel(...)`, then `panel.onMessage(cb)` and `panel.postMessage(data)`. The app's colours are available as CSS variables (`--accent`, `--text`, `--bg-panel` …), so panels match the theme automatically.

## Good to know

- Plugins run in their own process. If one crashes, playback keeps going and FLP restarts the plugins.
- When a plugin is turned off or reloaded, everything it registered (commands, buttons, panels, listeners) is removed for you. Export `deactivate()` only for your own timers and connections.
- Plugins run with full Node.js access, like VS Code extensions. Only install plugins you trust; FLP shows each plugin's declared permissions before you enable it.
- mpv's own Lua/JS scripts also work. Put them in the `mpv-scripts` folder next to `plugins`.

## Examples

FLP ships four plugins you can read and copy (Settings → Extensions → open one → **Open folder**):

- **Sleep Timer:** commands, a panel, settings and a control-bar button.
- **Skip Intro:** storage, playback events, and notifications with an action button.
- **Subtitle Downloader:** network access and writing files.
- **Listening Log:** the smallest useful plugin, built on events and storage.
