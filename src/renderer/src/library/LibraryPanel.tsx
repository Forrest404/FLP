import { useUi } from '@/state/ui'
import { BrowseSection, HomeSection, MusicSection, NetworkSection, PlaylistsSection, RecentSection } from './Sections'

/** The current library section; `compact` is the narrow version used in the player sidebar. */
export function LibraryPanel({ compact }: { compact?: boolean }) {
  const section = useUi((s) => s.section)
  switch (section) {
    case 'home':
      return <HomeSection compact={compact} />
    case 'videos':
      return <BrowseSection kind="video" compact={compact} />
    case 'music':
      return <MusicSection compact={compact} />
    case 'playlists':
      return <PlaylistsSection compact={compact} />
    case 'recent':
      return <RecentSection compact={compact} />
    case 'network':
      return <NetworkSection compact={compact} />
  }
}

/** Opens a folder picker and adds the folder to the library. */
export async function addLibraryFolder() {
  const [dir] = await window.flp.dialog.openFiles({ folders: true, multiple: false, title: 'Add a media folder' })
  if (dir) await window.flp.library.addRoot(dir)
}
window.addEventListener('flp:add-library-folder', () => void addLibraryFolder())
