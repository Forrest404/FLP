// Figma "Add Subtitles to Playlist/Folder": pick subtitle files, FLP pairs them with the videos in
// a folder (by episode number, else by order); drag to fix any pairing, pick languages, Save.
import { useEffect, useMemo, useState } from 'react'
import { Button, Select } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { Icon } from '@/components/Icon'
import { usePlayer } from '@/state/player'
import { showToast, ui, useUi } from '@/state/ui'

const SUB_EXT = /\.(srt|ass|ssa|vtt|sub|idx|sup|smi|txt)$/i
const LANGS = [
  ['', 'No language'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['nl', 'Dutch'], ['ru', 'Russian'], ['ar', 'Arabic'], ['tr', 'Turkish'], ['pl', 'Polish'], ['sv', 'Swedish'], ['ja', 'Japanese'],
  ['ko', 'Korean'], ['zh', 'Chinese'], ['hi', 'Hindi']
].map(([value, label]) => ({ value, label }))

const name = (p: string) => p.split('/').pop() ?? p

/** "S01E04", "1x04", "E04" or a trailing number → a comparable key. */
function episodeKey(path: string): string | null {
  const n = name(path)
  const se = n.match(/s(\d{1,2})[ ._-]*e(\d{1,3})/i) ?? n.match(/(\d{1,2})x(\d{1,3})/i)
  if (se) return `${Number(se[1])}-${Number(se[2])}`
  const e = n.match(/(?:ep?|episode)[ ._-]*(\d{1,3})/i) ?? n.match(/(\d{1,3})(?=\D*\.[a-z0-9]+$)/i)
  return e ? `x-${Number(e[1])}` : null
}

function guessLang(path: string): string {
  const m = name(path).toLowerCase().match(/[._ -](en|eng|english|es|spa|fr|fre|fra|de|ger|deu|it|ita|pt|por|nl|ru|rus|ar|ara|tr|pl|sv|ja|jpn|ko|kor|zh|chi|hi)(?=[._ -]|\.[a-z]+$)/)
  if (!m) return ''
  const map: Record<string, string> = { eng: 'en', english: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', rus: 'ru', ara: 'ar', jpn: 'ja', kor: 'ko', chi: 'zh' }
  return map[m[1]] ?? m[1]
}

export function AddSubtitlesDialog() {
  const arg = useUi((s) => s.dialogArg) as { folder?: string } | null
  const playing = usePlayer((s) => s.path)
  const [folder, setFolder] = useState<string | null>(arg?.folder ?? (playing && !/^[a-z]+:\/\//i.test(playing) ? playing.replace(/\/[^/]+$/, '') : null))
  const [videos, setVideos] = useState<string[]>([])
  const [subs, setSubs] = useState<string[]>([])
  const [pairs, setPairs] = useState<Record<string, { sub: string; lang: string }>>({})
  const [dragSub, setDragSub] = useState<string | null>(null)

  useEffect(() => {
    if (folder) window.flp.subs.listVideos(folder).then(setVideos)
  }, [folder])

  // Auto-pair whenever the inputs change.
  useEffect(() => {
    const next: Record<string, { sub: string; lang: string }> = {}
    const byKey = new Map(subs.map((s) => [episodeKey(s), s]))
    const unused = [...subs]
    for (const v of videos) {
      const k = episodeKey(v)
      const s = (k && byKey.get(k)) || undefined
      if (s) {
        next[v] = { sub: s, lang: guessLang(s) }
        unused.splice(unused.indexOf(s), 1)
      }
    }
    // Leftovers pair in order with videos that have none.
    for (const v of videos) if (!next[v] && unused.length) {
      const s = unused.shift()!
      next[v] = { sub: s, lang: guessLang(s) }
    }
    setPairs(next)
  }, [subs, videos])

  const crumbs = useMemo(() => (folder ? folder.split('/').filter(Boolean).slice(-4).join(' / ') : 'Choose a folder'), [folder])

  const addSubs = async () => {
    const files = (await window.flp.dialog.openFiles({ title: 'Choose subtitle files' })).filter((f) => SUB_EXT.test(f))
    setSubs((cur) => [...cur, ...files.filter((f) => !cur.includes(f))])
  }

  const save = async (overwrite = false) => {
    const list = Object.entries(pairs).map(([video, p]) => ({ video, sub: p.sub, lang: p.lang }))
    const res = await window.flp.subs.install(list, overwrite)
    const clashes = res.filter((r) => r.error === 'exists')
    const failed = res.filter((r) => !r.ok && r.error !== 'exists')
    if (clashes.length && !overwrite) {
      showToast(`${clashes.length} video${clashes.length === 1 ? ' already has' : 's already have'} a subtitle with that name.`, { label: 'Replace them', run: () => void save(true) }, 10000)
    } else if (failed.length) {
      showToast(`Couldn't add ${failed.length} subtitle${failed.length === 1 ? '' : 's'}: ${failed[0].error}`)
    } else {
      showToast(`Added ${res.filter((r) => r.ok).length} subtitle file${res.length === 1 ? '' : 's'}. They load automatically from now on.`)
    }
    if (playing && pairs[playing]) {
      const target = res.find((r) => r.video === playing && r.ok)?.target
      if (target) await window.flp.player.command('sub-add', target, 'select')
    }
    if (!clashes.length || overwrite) ui.closeDialog()
  }

  return (
    <Dialog
      title="Add Subtitles"
      width={1048}
      height={800}
      onClose={ui.closeDialog}
      footer={
        <>
          <Button variant="ghost" onClick={ui.closeDialog}>Cancel</Button>
          <Button variant="primary" disabled={!Object.keys(pairs).length} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <div className="flp-addsubs">
        <div className="flp-addsubs__bar">
          <Button onClick={addSubs}><Icon name="file" size={16} /> From Computer</Button>
          <button type="button" className="flp-addsubs__crumb" onClick={async () => {
            const [dir] = await window.flp.dialog.openFiles({ folders: true, multiple: false, title: 'Choose the folder with the videos' })
            if (dir) setFolder(dir)
          }}>
            <Icon name="folder" size={18} /> {crumbs}
          </button>
        </div>
        <div className="flp-addsubs__cols">
          <div className="flp-addsubs__col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const dropped = [...e.dataTransfer.files].map((f) => window.flp.pathForFile(f)).filter((f) => SUB_EXT.test(f))
              setSubs((cur) => [...cur, ...dropped.filter((f) => !cur.includes(f))])
            }}>
            <div className="flp-addsubs__head">Subtitle files</div>
            {subs.length ? subs.map((s) => (
              <div key={s} className="flp-addsubs__sub" draggable onDragStart={() => setDragSub(s)} onDragEnd={() => setDragSub(null)}
                data-used={Object.values(pairs).some((p) => p.sub === s)}>
                <Icon name="subtitles" size={16} />
                <span>{name(s)}</span>
                <button type="button" aria-label="Remove" onClick={() => setSubs(subs.filter((x) => x !== s))}><Icon name="close" size={14} /></button>
              </div>
            )) : (
              <div className="flp-addsubs__empty" onClick={addSubs}>Drop subtitle files here, or click “From Computer”.</div>
            )}
          </div>
          <div className="flp-addsubs__col flp-addsubs__col--videos">
            <div className="flp-addsubs__head">Videos</div>
            {videos.map((v) => (
              <div key={v} className="flp-addsubs__video" data-target={!!dragSub}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragSub && setPairs({ ...pairs, [v]: { sub: dragSub, lang: guessLang(dragSub) } })}>
                <div className="flp-addsubs__vname"><Icon name="video" size={16} /><span>{name(v)}</span></div>
                {pairs[v] ? (
                  <div className="flp-addsubs__pair">
                    <span className="flp-addsubs__chip"><Icon name="subtitles" size={14} />{name(pairs[v].sub)}</span>
                    <Select<string> label="Language" value={pairs[v].lang} options={LANGS} onChange={(lang) => setPairs({ ...pairs, [v]: { ...pairs[v], lang } })} />
                    <button type="button" aria-label="Unpair" onClick={() => {
                      const { [v]: _, ...rest } = pairs
                      setPairs(rest)
                    }}><Icon name="close" size={14} /></button>
                  </div>
                ) : (
                  <span className="flp-muted">Drag a subtitle here</span>
                )}
              </div>
            ))}
            {!videos.length && <div className="flp-addsubs__empty">No videos in this folder.</div>}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
