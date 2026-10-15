// UPnP / DLNA: discover media servers (browse & play their files) and renderers (TVs and
// speakers to cast to). Small SSDP + SOAP client, no dependencies.
import { createSocket } from 'node:dgram'

export interface UpnpDevice {
  id: string
  name: string
  kind: 'server' | 'renderer'
  location: string
  controlUrl: string
  icon?: string
}

export interface UpnpEntry {
  id: string
  title: string
  kind: 'folder' | 'video' | 'audio' | 'image' | 'other'
  url?: string
  duration?: number
  childCount?: number
}

const SERVICE = {
  server: 'urn:schemas-upnp-org:service:ContentDirectory:1',
  renderer: 'urn:schemas-upnp-org:service:AVTransport:1'
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&')
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i'))?.[1]?.trim()

/** Sends an SSDP M-SEARCH and collects device description URLs for `timeoutMs`. */
function ssdpSearch(target: string, timeoutMs = 2500): Promise<string[]> {
  return new Promise((resolve) => {
    const found = new Set<string>()
    const sock = createSocket({ type: 'udp4', reuseAddr: true })
    const msg = Buffer.from(['M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"', 'MX: 2', `ST: ${target}`, '', ''].join('\r\n'))
    sock.on('message', (m) => {
      const loc = String(m).match(/^location:\s*(.+)$/im)?.[1]?.trim()
      if (loc) found.add(loc)
    })
    sock.on('error', () => undefined)
    sock.bind(0, () => {
      try {
        sock.send(msg, 1900, '239.255.255.250')
        setTimeout(() => sock.send(msg, 1900, '239.255.255.250'), 600)
      } catch {
        /* offline */
      }
    })
    setTimeout(() => {
      try {
        sock.close()
      } catch {
        /* already closed */
      }
      resolve([...found])
    }, timeoutMs)
  })
}

export async function discover(kind: 'server' | 'renderer'): Promise<UpnpDevice[]> {
  const locations = await ssdpSearch(SERVICE[kind])
  const devices = await Promise.all(
    locations.map(async (location): Promise<UpnpDevice | null> => {
      try {
        const xml = await (await fetch(location, { signal: AbortSignal.timeout(3000) })).text()
        const service = [...xml.matchAll(/<service>([\s\S]*?)<\/service>/gi)].map((m) => m[1]).find((s) => tag(s, 'serviceType')?.startsWith(SERVICE[kind].slice(0, -2)))
        const control = service && tag(service, 'controlURL')
        if (!control) return null
        const base = tag(xml, 'URLBase') || location
        const iconUrl = tag(xml, 'url')
        return {
          id: tag(xml, 'UDN') ?? location,
          name: decode(tag(xml, 'friendlyName') ?? 'Media device'),
          kind,
          location,
          controlUrl: new URL(control, base).href,
          icon: iconUrl ? new URL(iconUrl, base).href : undefined
        }
      } catch {
        return null
      }
    })
  )
  const unique = new Map<string, UpnpDevice>()
  for (const d of devices) if (d) unique.set(d.id, d)
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function soap(controlUrl: string, service: string, action: string, body: string): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${service}">${body}</u:${action}></s:Body></s:Envelope>`
  const res = await fetch(controlUrl, {
    method: 'POST',
    headers: { 'content-type': 'text/xml; charset="utf-8"', soapaction: `"${service}#${action}"` },
    body: envelope,
    signal: AbortSignal.timeout(8000)
  })
  const text = await res.text()
  if (!res.ok) throw new Error(tag(text, 'errorDescription') ?? `${action} failed (${res.status})`)
  return text
}

const durationSecs = (d?: string) => (d ? d.split(':').reduce((a, b) => a * 60 + Number(b), 0) : undefined)

/** Lists a folder on a media server ("0" is the root). */
export async function browse(device: UpnpDevice, objectId = '0'): Promise<UpnpEntry[]> {
  const xml = await soap(device.controlUrl, SERVICE.server, 'Browse',
    `<ObjectID>${escape(objectId)}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>500</RequestedCount><SortCriteria></SortCriteria>`)
  const didl = decode(tag(xml, 'Result') ?? '')
  const out: UpnpEntry[] = []
  for (const m of didl.matchAll(/<container([^>]*)>([\s\S]*?)<\/container>/g)) {
    out.push({ id: decode(m[1].match(/id="([^"]*)"/)?.[1] ?? ''), title: decode(tag(m[2], 'title') ?? 'Folder'), kind: 'folder', childCount: Number(m[1].match(/childCount="(\d+)"/)?.[1] ?? 0) })
  }
  for (const m of didl.matchAll(/<item([^>]*)>([\s\S]*?)<\/item>/g)) {
    const cls = tag(m[2], 'class') ?? ''
    const res = m[2].match(/<res([^>]*)>([^<]*)<\/res>/)
    out.push({
      id: decode(m[1].match(/id="([^"]*)"/)?.[1] ?? ''),
      title: decode(tag(m[2], 'title') ?? 'Item'),
      kind: cls.includes('videoItem') ? 'video' : cls.includes('audioItem') ? 'audio' : cls.includes('imageItem') ? 'image' : 'other',
      url: res ? decode(res[2]).trim() : undefined,
      duration: durationSecs(res?.[1].match(/duration="([^"]*)"/)?.[1])
    })
  }
  return out
}

/** Tells a TV / speaker to play `url`. */
export async function castTo(device: UpnpDevice, url: string, title: string, mime = 'video/mp4'): Promise<void> {
  const cls = mime.startsWith('audio') ? 'object.item.audioItem.musicTrack' : mime.startsWith('image') ? 'object.item.imageItem.photo' : 'object.item.videoItem'
  const meta = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>${escape(title)}</dc:title><upnp:class>${cls}</upnp:class><res protocolInfo="http-get:*:${mime}:*">${escape(url)}</res></item></DIDL-Lite>`
  await soap(device.controlUrl, SERVICE.renderer, 'SetAVTransportURI', `<InstanceID>0</InstanceID><CurrentURI>${escape(url)}</CurrentURI><CurrentURIMetaData>${escape(meta)}</CurrentURIMetaData>`)
  await soap(device.controlUrl, SERVICE.renderer, 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>')
}

export async function castControl(device: UpnpDevice, action: 'Pause' | 'Play' | 'Stop'): Promise<void> {
  await soap(device.controlUrl, SERVICE.renderer, action, `<InstanceID>0</InstanceID>${action === 'Play' ? '<Speed>1</Speed>' : ''}`)
}

/** Jumps the renderer to `seconds` (many TVs only accept this once playing). */
export async function castSeek(device: UpnpDevice, seconds: number): Promise<void> {
  const t = new Date(Math.max(0, seconds) * 1000).toISOString().slice(11, 19)
  await soap(device.controlUrl, SERVICE.renderer, 'Seek', `<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>${t}</Target>`)
}
