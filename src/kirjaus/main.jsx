import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import KirjausApp from './KirjausApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <KirjausApp />
  </StrictMode>,
)
