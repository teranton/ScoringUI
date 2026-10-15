import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'

// Uuden julkaisun jälkeen vanhan version näkymäpalat puuttuvat palvelimelta. Ladataan sivu
// kerran uudelleen, jolloin selain saa uuden version. Aikaleima estää latauskierteen.
window.addEventListener('vite:preloadError', (event) => {
  const avain = 'scoringui-palan-uudelleenlataus'
  try {
    const edellinen = Number(sessionStorage.getItem(avain) || 0)
    if (Date.now() - edellinen < 60_000) return
    sessionStorage.setItem(avain, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
