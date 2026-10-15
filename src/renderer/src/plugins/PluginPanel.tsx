// A plugin panel: the plugin's HTML in a sandboxed iframe on its own origin (flp-plugin://). Inside,
// `flp.postMessage(data)` sends to the plugin and `flp.onMessage(cb)` receives; the app's colours
// arrive as CSS variables after load.
import { useEffect, useRef } from 'react'
import type { PluginPanel as Panel } from '@shared/plugins'

function themeCss(): string {
  const cs = getComputedStyle(document.documentElement)
  const vars = ['--accent', '--accent-contrast', '--accent-dim', '--bg-panel', '--bg-raised', '--bg-well', '--text', '--text-dim', '--text-faint', '--border', '--radius', '--font']
  return `:root{${vars.map((v) => `${v}:${cs.getPropertyValue(v)}`).join(';')}}
body{margin:0;padding:4px 2px;font:13px var(--font);color:var(--text-dim);background:transparent}
button{font:inherit;background:var(--bg-raised);color:var(--text);border:0;border-radius:var(--radius);padding:6px 12px;cursor:pointer}
button.primary{background:var(--accent);color:var(--accent-contrast)}
input,select{font:inherit;background:var(--bg-well);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:6px 8px}`
}

export function PluginPanel({ panel }: { panel: Panel }) {
  const frame = useRef<HTMLIFrameElement>(null)
  // Reload when the plugin changes its HTML (e.g. after hot reload).
  const scheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  const src = `flp-plugin://panel/${panel.pluginId}/${panel.id}?v=${panel.html.length}&scheme=${scheme}`
  const sendTheme = () => frame.current?.contentWindow?.postMessage({ __flpTheme: themeCss() }, '*')

  useEffect(() => {
    const fromFrame = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__flpPanel) return
      window.flp.plugins.panelMessage(panel.pluginId, panel.id, e.data.data)
    }
    window.addEventListener('message', fromFrame)
    const off = window.flp.plugins.onPanelMessage((pluginId, panelId, data) => {
      if (pluginId === panel.pluginId && panelId === panel.id) frame.current?.contentWindow?.postMessage({ __flpToPanel: true, data }, '*')
    })
    return () => {
      window.removeEventListener('message', fromFrame)
      off()
    }
  }, [panel.pluginId, panel.id])

  // Separate origin + sandbox: plugin HTML can't reach the app's internals, only the message bridge.
  return <iframe ref={frame} className="flp-pluginpanel" title={panel.title} sandbox="allow-scripts allow-forms" src={src} onLoad={sendTheme} />
}
