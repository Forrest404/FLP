// Icons use the Figma icon names. Until the Figma SVGs are exported into design/icons, each name
// maps to the closest lucide glyph; swapping in the real SVGs only changes this file.
import {
  Accessibility, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Bookmark, BookmarkPlus, Check,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDot, Clapperboard, Disc3, Download, Ellipsis,
  ExternalLink, Folder, FolderOpen, FolderPlus, Gauge, Grid2x2, Heart, Home, Info, Keyboard, Library,
  Link, List, ListMusic, ListOrdered, ListVideo, LogOut, Maximize, Maximize2, Minimize2, Minus, Move,
  Music, Music2, Paintbrush, Pause, PictureInPicture2, Play, Plug, Plus, Radio, RefreshCw, Repeat,
  Repeat1, RotateCcw, RotateCw, Save, ScanSearch, Search, Settings, Settings2, Shield, Shuffle,
  SkipBack, SkipForward, SlidersHorizontal, SlidersVertical, Camera, Square, Subtitles, Tags, TextCursor,
  Trash2, Tv, Upload, User, UserRound, Video, Volume, Volume1, Volume2, VolumeX, Webcam, Wrench, X,
  ZoomIn, PanelLeft, PanelLeftClose, PanelLeftOpen, PanelRight, ArrowDownUp, Rows3, LayoutList,
  FileVideo, File, Activity, BarChart3, ArrowLeftRight, Sun, Clock, CircleStop, Layers, Hd, Monitor,
  type LucideIcon
} from 'lucide-react'
import type { CSSProperties } from 'react'

const ICONS = {
  accessibility: Accessibility,
  add: Plus,
  album: Disc3,
  'arrow-down': ArrowDown,
  'arrow-up': ArrowUp,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  artist: UserRound,
  audio: AudioLines,
  'backward-10-sec': RotateCcw,
  'backward-15-sec': RotateCcw,
  bookmark: BookmarkPlus,
  bookmarks: Bookmark,
  'capture-device': Webcam,
  chapters: ListOrdered,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  close: X,
  'collapse-sidebar': PanelLeftClose,
  'expand-sidebar': PanelLeftOpen,
  disc: Disc3,
  divider: Minus,
  edit: Paintbrush,
  eq: SlidersVertical,
  favorite: Heart,
  file: File,
  'file-video': FileVideo,
  folder: Folder,
  'folder-open': FolderOpen,
  'forward-10-sec': RotateCw,
  'forward-15-sec': RotateCw,
  fullscreen: Maximize,
  genre: Tags,
  grid: Grid2x2,
  hdr: Hd,
  home: Home,
  hotkeys: Keyboard,
  info: Info,
  interface: TextCursor,
  link: Link,
  list: LayoutList,
  lists: Rows3,
  maximize: Maximize2,
  minimize: Minimize2,
  more: Ellipsis,
  move: Move,
  music: Music2,
  'new-folder': FolderPlus,
  next: SkipForward,
  open: ExternalLink,
  paint: Paintbrush,
  pause: Pause,
  pip: PictureInPicture2,
  play: Play,
  'playback-settings': Settings2,
  playback: Clapperboard,
  playlist: ListVideo,
  plugins: Plug,
  preferences: SlidersHorizontal,
  previous: SkipBack,
  privacy: Shield,
  profile: User,
  queue: ListMusic,
  quit: LogOut,
  recent: Clock,
  record: CircleDot,
  refresh: RefreshCw,
  remove: Trash2,
  repeat: Repeat,
  'repeat-one': Repeat1,
  replay: RotateCcw,
  save: Save,
  scope: ScanSearch,
  search: Search,
  settings: Settings,
  shuffle: Shuffle,
  'sidebar-left': PanelLeft,
  'sidebar-right': PanelRight,
  snapshot: Camera,
  songs: Music,
  sort: ArrowDownUp,
  spectrometer: Activity,
  spectrum: BarChart3,
  speed: Gauge,
  stop: Square,
  'stop-circle': CircleStop,
  streaming: Radio,
  subtitles: Subtitles,
  swap: ArrowLeftRight,
  thumbnail: Layers,
  tv: Tv,
  ui: Monitor,
  upload: Upload,
  download: Download,
  video: Video,
  videos: Clapperboard,
  view: Sun,
  vlc: Play,
  'volume-0': VolumeX,
  'volume-low': Volume,
  'volume-mid': Volume1,
  'volume-high': Volume2,
  waveform: AudioLines,
  window: Monitor,
  wrench: Wrench,
  zoom: ZoomIn,
  library: Library
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export interface IconProps {
  name: IconName
  size?: number
  /** 'active' and 'two-tone' render in the accent colour, as in the Figma icon states. */
  state?: 'default' | 'active' | 'two-tone'
  className?: string
  style?: CSSProperties
  filled?: boolean
}

export function Icon({ name, size = 20, state = 'default', className, style, filled }: IconProps) {
  const Glyph = ICONS[name]
  const color = state === 'default' ? 'currentColor' : 'var(--accent)'
  return (
    <Glyph
      size={size}
      strokeWidth={1.5}
      color={color}
      fill={filled ? color : 'none'}
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden
    />
  )
}

export const iconNames = Object.keys(ICONS) as IconName[]
