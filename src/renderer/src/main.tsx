import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/design/tokens.css'
import '@/components/ui.css'
import '@/player/player.css'
import '@/library/library.css'
import './state/settings'
import { App } from './App'
import { Gallery } from './screens/Gallery'
import { MenuHost } from './components/Menu'

const gallery = new URLSearchParams(location.search).has('gallery')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {gallery ? <Gallery /> : <App />}
    <MenuHost />
  </StrictMode>
)
